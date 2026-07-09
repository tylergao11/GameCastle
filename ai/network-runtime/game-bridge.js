// GameCastle Game-Network Bridge (v3)
// Bridge OWNS the game tick and network lifecycle. GDevelop is an executor.
// Tick order: capture -> send -> wait remote -> inject -> step -> endFrame
//
// Lifecycle:
//   bridge.attach(game)                          — wire up GDevelop adapter
//   bridge.start()                               — begin local game loop
//   bridge.host()  or  bridge.join(roomId)        — transition to network mode
//
// codegen.js MUST NOT register transport.on() handlers — the bridge owns them all.

var INPUT_SYNC_CHANNEL = "gc:input";

if (typeof require !== "undefined" && typeof GameCastleFrameSyncSession === "undefined") {
  var GameCastleFrameSyncSession = require("./frame-sync").GameCastleFrameSyncSession;
}

function expandSlotInputs(inputs, slots) {
  var result = [];
  var seen = {};
  function push(name) {
    if (!seen[name]) {
      seen[name] = true;
      result.push(name);
    }
  }
  inputs = inputs || [];
  slots = slots || ["p1", "p2"];
  for (var i = 0; i < inputs.length; i++) {
    for (var s = 0; s < slots.length; s++) push(slots[s] + "_" + inputs[i]);
  }
  return result;
}

function GameCastleNetworkBridge(config) {
  config = config || {};
  this._captureInputs = config.captureInputs || config.inputs || [];
  this._declaredInputs = config.replayInputs || expandSlotInputs(this._captureInputs, config.playerSlots);
  this._tickRate = config.tickRate || 20;
  this._sync = config.sync || "local";
  this._transport = config.transport || null;
  this._adapter = null;
  this._game = null;
  this._inputManager = null;
  this._tick = 0;
  this._readyTick = 0;
  this._running = false;
  this._peerId = null;
  this._inputDelay = config.inputDelay !== undefined ? config.inputDelay : 2;
  this._historySize = config.historySize !== undefined ? config.historySize : 120;
  this._redundancy = config.redundancy !== undefined ? config.redundancy : 5;
  this._autoHost = config.autoHost || false;
  this._configRoomId = config.roomId || null;
  this._localSlot = config.localSlot || "p1";
  this._remoteSlot = config.remoteSlot || "p2";
  this._session = new GameCastleFrameSyncSession({
    inputDelay: this._inputDelay,
    historySize: this._historySize,
    redundancy: this._redundancy,
    localSlot: this._localSlot,
    remoteSlot: this._remoteSlot,
  });
  this._listeners = {};
  this._handlersSetup = false;
}

// ── Event bus ──────────────────────────────────────────────────────────────

GameCastleNetworkBridge.prototype.on = function(event, handler) {
  if (!this._listeners[event]) this._listeners[event] = [];
  this._listeners[event].push(handler);
};
GameCastleNetworkBridge.prototype._emit = function(event) {
  var args = Array.prototype.slice.call(arguments, 1);
  var h = this._listeners[event];
  if (h) for (var i = 0; i < h.length; i++) h[i].apply(null, args);
};

// ── Attach GDevelop game ───────────────────────────────────────────────────

GameCastleNetworkBridge.prototype.attach = function(game) {
  this._game = game;
  this._adapter = new GameCastleRuntimeAdapter(game);
  this._adapter.init({ inputs: this._declaredInputs, captureInputs: this._captureInputs, tickRate: this._tickRate });
  this._inputManager = game.getInputManager();
};

// ── Start (local loop) ─────────────────────────────────────────────────────
// Always starts a local game loop. If autoHost is set, immediately calls
// host() to transition to network mode (fire-and-forget).

GameCastleNetworkBridge.prototype.start = function() {
  var sd = this._game.getSceneAndExtensionsData();
  var name = sd ? sd.sceneData.name : null;
  if (name) this._game.getSceneStack().replace({ sceneName: name, clear: true });

  // Always begin in local loop — host()/join() transitions to network later.
  this._startLocalLoop();

  // Auto-host: connect and create room immediately (backward-compatible default).
  if (this._sync !== "local" && this._autoHost) {
    this.host().catch(function(err) {
      console.warn("[GC:Bridge] autoHost failed, staying in local mode:", err.message);
    });
  }
};

// ── Local loop ─────────────────────────────────────────────────────────────

GameCastleNetworkBridge.prototype._startLocalLoop = function() {
  if (this._running) return;
  this._running = true;
  var self = this;
  this._adapter.startLoop(function(dt, tick) {
    self._adapter.stepSimulation(dt);
    self._adapter.endFrame();
    self._emit("tick", tick, self._adapter.captureInputs());
    self._tick = tick;
  });
};

// ── Host / Join ───────────────────────────────────────────────────────────
// These are the ONLY entry points for network mode. They connect the
// transport, register event handlers (once), and transition to the
// network game loop on successful room entry.

GameCastleNetworkBridge.prototype.host = function() {
  if (!this._transport) return Promise.reject(new Error("No transport configured"));
  var self = this;
  return this._transport.connect().then(function() {
    self._setupTransportHandlers();
    return new Promise(function(resolve, reject) {
      self._transport.on("room_created", function(rid) {
        self._transport.joinRoom(rid);
      });
      self._transport.on("joined", function(roomId, playerId) {
        self._localSlot = "p1";
        self._remoteSlot = "p2";
        self._session.setLocalPlayer(playerId, self._localSlot);
        self._switchToNetworkLoop();
        resolve({ roomId: roomId, playerId: playerId });
      });
      self._transport.on("error", function(err) {
        reject(new Error(err));
      });
      self._transport.createRoom({
        tickRate: self._tickRate,
        inputDelay: self._inputDelay
      });
    });
  }).catch(function(err) {
    console.warn("[GC:Bridge] host() failed, staying in local mode:", err.message);
    throw err;
  });
};

GameCastleNetworkBridge.prototype.join = function(roomId) {
  if (!this._transport) return Promise.reject(new Error("No transport configured"));
  if (!roomId) return Promise.reject(new Error("roomId is required"));
  var self = this;
  return this._transport.connect().then(function() {
    self._setupTransportHandlers();
    return new Promise(function(resolve, reject) {
      self._transport.on("joined", function(rid, playerId) {
        self._localSlot = "p2";
        self._remoteSlot = "p1";
        self._session.setLocalPlayer(playerId, self._localSlot);
        self._switchToNetworkLoop();
        resolve({ roomId: rid, playerId: playerId });
      });
      self._transport.on("error", function(err) {
        reject(new Error(err));
      });
      self._transport.joinRoom(roomId);
    });
  }).catch(function(err) {
    console.warn("[GC:Bridge] join() failed, staying in local mode:", err.message);
    throw err;
  });
};

// ── Transport event handlers ───────────────────────────────────────────────
// Registered ONCE, idempotent. This is the ONLY place transport.on() is called.
// codegen.js must NOT add its own handlers.

GameCastleNetworkBridge.prototype._setupTransportHandlers = function() {
  if (this._handlersSetup) return;
  this._handlersSetup = true;
  var self = this;

  // Lockstep: direct peer-to-peer input relay
  self._transport.on("game_input", function(from, tick, inputs) {
    self._session.receiveRemoteFrame(from, tick, inputs);
    self._tryAdvanceLockstep();
  });

  // Server-authoritative: server-ordered inputs
  self._transport.on("game_state", function(tick, ordered) {
    self._session.receiveOrderedFrame(tick, ordered);
    self._tryAdvanceAuthority();
  });

  // Lockstep: sync-channel input relay with redundancy
  self._transport.on("sync", function(from, ch, data) {
    if (ch === INPUT_SYNC_CHANNEL && data) {
      self._session.receiveRemoteFrame(from, data);
      self._tryAdvanceLockstep();
    }
  });

  // Track peer presence
  self._transport.on("player_joined", function(pid) {
    if (pid !== self._transport.getPlayerId()) {
      self._peerId = pid;
      self._session.setPeerPlayer(pid, self._remoteSlot);
      self._emit("peer_joined", pid);
    }
  });
  self._transport.on("player_left", function(pid) {
    if (pid === self._peerId) {
      self._peerId = null;
      self._session.removePeerPlayer(pid);
      self._emit("peer_left", pid);
    }
  });
  self._transport.on("disconnected", function() {
    self._session.setConnected(false);
    self._emit("disconnected");
  });
};

// ── Switch from local to network loop ─────────────────────────────────────

GameCastleNetworkBridge.prototype._switchToNetworkLoop = function() {
  // Stop the local adapter loop
  if (this._adapter) this._adapter.stopLoop();
  this._running = false;
  // Reset tick state for network mode
  this._tick = 0;
  this._readyTick = 0;
  this._session.reset({
    localPlayerId: this._transport ? this._transport.getPlayerId() : null,
    localSlot: this._localSlot,
    tick: 0,
    readyTick: 0,
  });
  if (this._transport && this._transport.getPlayers) {
    var myId = this._transport.getPlayerId();
    var self = this;
    this._transport.getPlayers().forEach(function(pid) {
      if (pid !== myId) {
        self._peerId = pid;
        self._session.setPeerPlayer(pid, self._remoteSlot);
      }
    });
  }
  this._session.setConnected(true);
  // Start network loop
  this._startNetworkLoop();
};

// ── Network game loop ─────────────────────────────────────────────────────

GameCastleNetworkBridge.prototype._startNetworkLoop = function() {
  if (this._running) return;
  this._running = true;
  var self = this;
  this._adapter.startLoop(function(dt, tick) { return self._onNetworkTick(dt, tick); });
};

GameCastleNetworkBridge.prototype._onNetworkTick = function(dt, tick) {
  switch (this._sync) {
    case "lockstep": case "lockstep-input": return this._tickLockstep(dt, tick);
    case "server-authoritative": return this._tickAuthority(dt, tick);
    default: this._adapter.stepSimulation(dt); this._adapter.endFrame(); return true;
  }
};

// ── Lockstep tick ─────────────────────────────────────────────────────────
// 1. Capture local keyboard state snapshot
// 2. Send to peer (with redundancy: last 5 ticks)
// 3. Increment local tick counter
// 4. Try to advance ready ticks (when both local + remote inputs available)

GameCastleNetworkBridge.prototype._tickLockstep = function(dt, adapterTick) {
  var packet = this._session.captureLocalFrame(this._adapter.captureInputs());
  if (this._peerId) {
    this._transport.sync(INPUT_SYNC_CHANNEL, packet);
  }
  this._tick = this._session.getTick();
  this._tryAdvanceLockstep();
  return true;
};

// ── Lockstep advance ──────────────────────────────────────────────────────
// Advances ready ticks where both local AND remote inputs are available.
// CRITICAL: merges local + remote inputs into one combined frame and injects
// them all programmatically — does NOT depend on live keyboard state for
// deterministic replay across peers.

GameCastleNetworkBridge.prototype._tryAdvanceLockstep = function() {
  var frames = this._session.nextLockstepFrames();
  for (var i = 0; i < frames.length && this._running; i++) {
    var frame = frames[i];
    this._adapter.injectInputs(frame.inputs, false);
    this._adapter.stepSimulation(1000 / this._tickRate);
    this._adapter.endFrame();
    this._emit("advance", frame.tick, frame.inputs, frame.remoteInputs || null);
  }
  this._readyTick = this._session.getReadyTick();
};

// ── Authority tick ────────────────────────────────────────────────────────

GameCastleNetworkBridge.prototype._tickAuthority = function(dt, adapterTick) {
  var packet = this._session.captureLocalFrame(this._adapter.captureInputs());
  if (this._transport && this._transport.sendGameInput) this._transport.sendGameInput(packet.tick, packet.inputs);
  this._tick = this._session.getTick();
  this._tryAdvanceAuthority();
  return true;
};

// ── Authority advance ─────────────────────────────────────────────────────

GameCastleNetworkBridge.prototype._tryAdvanceAuthority = function() {
  var frames = this._session.nextAuthorityFrames();
  for (var i = 0; i < frames.length && this._running; i++) {
    var frame = frames[i];
    this._adapter.injectInputs(frame.inputs, false);
    this._adapter.stepSimulation(1000 / this._tickRate);
    this._adapter.endFrame();
    this._emit("advance", frame.tick, frame.inputs, frame.orderedInputs || null);
  }
  this._readyTick = this._session.getReadyTick();
};

// ── Queries ───────────────────────────────────────────────────────────────

GameCastleNetworkBridge.prototype.getRoomId   = function() { return this._transport ? this._transport.getRoomId() : null; };
GameCastleNetworkBridge.prototype.getPlayerId = function() { return this._transport ? this._transport.getPlayerId() : null; };
GameCastleNetworkBridge.prototype.setRoomId   = function(id) { this._configRoomId = id; };
GameCastleNetworkBridge.prototype.getAdapter  = function() { return this._adapter; };
GameCastleNetworkBridge.prototype.getTick     = function() { return this._session ? this._session.getTick() : this._tick; };
GameCastleNetworkBridge.prototype.getReadyTick= function() { return this._session ? this._session.getReadyTick() : this._readyTick; };
GameCastleNetworkBridge.prototype.isRunning   = function() { return this._running; };
GameCastleNetworkBridge.prototype.getPeerId   = function() { return this._peerId; };
GameCastleNetworkBridge.prototype.getSyncMode = function() { return this._sync; };
GameCastleNetworkBridge.prototype.getFrameStats = function() { return this._session ? this._session.getStats() : {}; };
GameCastleNetworkBridge.prototype.reconnect = function() {
  if (!this._transport || !this._transport.reconnect) return Promise.reject(new Error("Transport reconnect is not available"));
  var self = this;
  return this._transport.reconnect().then(function(result) {
    self._session.setConnected(true);
    self._session.setLocalPlayer(result.playerId, self._localSlot);
    self._emit("reconnected", result);
    return result;
  });
};

// ── Teardown ──────────────────────────────────────────────────────────────

GameCastleNetworkBridge.prototype.detach = function() {
  this._running = false;
  if (this._adapter) this._adapter.stopLoop();
  if (this._transport) { this._transport.leaveRoom(); this._transport.close(); }
};

// ── Module export (Node.js only — stripped by codegen for browser) ─────────

if (typeof module !== "undefined") {
  module.exports = { GameCastleNetworkBridge: GameCastleNetworkBridge, INPUT_SYNC_CHANNEL: INPUT_SYNC_CHANNEL };
}
