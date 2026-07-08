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

function GameCastleNetworkBridge(config) {
  config = config || {};
  this._declaredInputs = config.inputs || [];
  this._tickRate = config.tickRate || 20;
  this._sync = config.sync || "local";
  this._transport = config.transport || null;
  this._adapter = null;
  this._game = null;
  this._inputManager = null;
  this._tick = 0;
  this._readyTick = 0;
  this._running = false;
  this._localInputs = {};
  this._remoteInputs = {};
  this._orderedInputs = {};
  this._peerId = null;
  this._inputDelay = config.inputDelay || 2;
  this._autoHost = config.autoHost || false;
  this._configRoomId = config.roomId || null;
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
  this._adapter.init({ inputs: this._declaredInputs, tickRate: this._tickRate });
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
    self._remoteInputs[tick] = inputs;
    self._tryAdvanceLockstep();
  });

  // Server-authoritative: server-ordered inputs
  self._transport.on("game_state", function(tick, ordered) {
    self._orderedInputs[tick] = ordered;
    self._tryAdvanceAuthority();
  });

  // Lockstep: sync-channel input relay with redundancy
  self._transport.on("sync", function(from, ch, data) {
    if (ch === INPUT_SYNC_CHANNEL && data) {
      self._remoteInputs[data.tick] = data.inputs;
      // Apply redundancy: fill gaps for any missing previous ticks
      if (data.prev) {
        for (var pt in data.prev) {
          if (data.prev.hasOwnProperty(pt) && self._remoteInputs[pt] === undefined) {
            self._remoteInputs[pt] = data.prev[pt];
          }
        }
      }
      self._tryAdvanceLockstep();
    }
  });

  // Track peer presence
  self._transport.on("player_joined", function(pid) {
    if (pid !== self._transport.getPlayerId()) {
      self._peerId = pid;
      self._emit("peer_joined", pid);
    }
  });
  self._transport.on("player_left", function(pid) {
    if (pid === self._peerId) {
      self._peerId = null;
      self._emit("peer_left", pid);
    }
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
  this._localInputs = {};
  this._remoteInputs = {};
  this._orderedInputs = {};
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
  // Use bridge's own tick counter (starts at 0), not the adapter's (starts at 1).
  // This ensures _readyTick==0 aligns with _localInputs[0] on the first call.
  var tick = this._tick;
  this._localInputs[tick] = this._adapter.captureInputs();
  if (this._peerId) {
    // Send current inputs + last 5 ticks as redundancy (UDP-style loss recovery)
    var redundancy = {};
    for (var i = 1; i <= 5; i++) {
      var pt = tick - i;
      if (this._localInputs[pt] !== undefined) redundancy[pt] = this._localInputs[pt];
    }
    this._transport.sync(INPUT_SYNC_CHANNEL, { tick: tick, inputs: this._localInputs[tick], prev: redundancy });
  }
  this._tick++;
  this._tryAdvanceLockstep();
  return true;
};

// ── Lockstep advance ──────────────────────────────────────────────────────
// Advances ready ticks where both local AND remote inputs are available.
// CRITICAL: merges local + remote inputs into one combined frame and injects
// them all programmatically — does NOT depend on live keyboard state for
// deterministic replay across peers.

GameCastleNetworkBridge.prototype._tryAdvanceLockstep = function() {
  // Effective delay: 0 when solo (no network jitter), configured delay with peer
  var effectiveDelay = this._peerId ? this._inputDelay : 0;
  while (this._running) {
    var tick = this._readyTick;
    if (tick + effectiveDelay >= this._tick) break;
    if (this._localInputs[tick] === undefined) break;
    if (this._peerId && this._remoteInputs[tick] === undefined) break;

    // Merge local + remote inputs for deterministic replay
    var combined = {};
    var localFrame = this._localInputs[tick] || {};
    var remoteFrame = this._remoteInputs[tick] || {};
    for (var k in localFrame) { if (localFrame.hasOwnProperty(k)) combined[k] = localFrame[k]; }
    for (var k2 in remoteFrame) { if (remoteFrame.hasOwnProperty(k2)) combined[k2] = remoteFrame[k2]; }

    // Inject combined frame (isLocal=false → force programmatic injection)
    this._adapter.injectInputs(combined, false);
    this._adapter.stepSimulation(1000 / this._tickRate);
    this._adapter.endFrame();

    this._emit("advance", tick, combined, remoteFrame || null);

    // Housekeeping
    delete this._localInputs[tick - 60];
    delete this._remoteInputs[tick - 60];
    this._readyTick++;
  }
};

// ── Authority tick ────────────────────────────────────────────────────────

GameCastleNetworkBridge.prototype._tickAuthority = function(dt, adapterTick) {
  var tick = this._tick;
  var inputs = this._adapter.captureInputs();
  if (this._transport && this._transport.sendGameInput) this._transport.sendGameInput(tick, inputs);
  this._tick++;
  this._tryAdvanceAuthority();
  return true;
};

// ── Authority advance ─────────────────────────────────────────────────────

GameCastleNetworkBridge.prototype._tryAdvanceAuthority = function() {
  var effectiveDelay = this._peerId ? this._inputDelay : 0;
  while (this._running) {
    var tick = this._readyTick;
    if (tick + effectiveDelay >= this._tick) break;
    var ordered = this._orderedInputs[tick];
    if (!ordered) break;
    var self = this, myId = this._transport ? this._transport.getPlayerId() : null;

    // Merge ALL player inputs into one combined frame
    var combined = {};
    Object.keys(ordered).forEach(function(pid) {
      var frame = ordered[pid] || {};
      for (var k in frame) { if (frame.hasOwnProperty(k)) combined[k] = frame[k]; }
    });

    // Inject combined (isLocal=false → deterministic programmatic injection)
    self._adapter.injectInputs(combined, false);
    self._adapter.stepSimulation(1000 / self._tickRate);
    self._adapter.endFrame();

    self._emit("advance", tick, ordered);
    delete self._orderedInputs[tick - 60];
    self._readyTick++;
  }
};

// ── Queries ───────────────────────────────────────────────────────────────

GameCastleNetworkBridge.prototype.getRoomId   = function() { return this._transport ? this._transport.getRoomId() : null; };
GameCastleNetworkBridge.prototype.getPlayerId = function() { return this._transport ? this._transport.getPlayerId() : null; };
GameCastleNetworkBridge.prototype.setRoomId   = function(id) { this._configRoomId = id; };
GameCastleNetworkBridge.prototype.getAdapter  = function() { return this._adapter; };
GameCastleNetworkBridge.prototype.getTick     = function() { return this._tick; };
GameCastleNetworkBridge.prototype.getReadyTick= function() { return this._readyTick; };
GameCastleNetworkBridge.prototype.isRunning   = function() { return this._running; };
GameCastleNetworkBridge.prototype.getPeerId   = function() { return this._peerId; };
GameCastleNetworkBridge.prototype.getSyncMode = function() { return this._sync; };

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
