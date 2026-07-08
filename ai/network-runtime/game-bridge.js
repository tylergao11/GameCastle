// GameCastle Game-Network Bridge
//
// Architecture: replaces GDevelop's startGameLoop with a network-aware loop.
// Does NOT monkey-patch InputManager. Does NOT run two competing loops.
//
//   Local mode:  game.startGameLoop() → GDevelop rAF (unchanged)
//   Network mode: bridge.start() → setInterval(20hz) → game.step(now)
//                 each tick: inject remote → step → capture local → send

var GC_INPUT_KEY_MAP = {
  move_up: "ArrowUp",
  move_down: "ArrowDown",
  move_left: "ArrowLeft",
  move_right: "ArrowRight",
  shoot: "Space",
  jump: "Space",
  start: "Enter",
  restart: "KeyR",
};

var GC_KEY_TO_INPUT = {};
Object.keys(GC_INPUT_KEY_MAP).forEach(function (inputName) {
  GC_KEY_TO_INPUT[GC_INPUT_KEY_MAP[inputName]] = inputName;
});

var GameCastleRuntimeAdapter = require('./runtime-adapter.js').GameCastleRuntimeAdapter;

function GameCastleNetworkBridge(config) {
  this._config = config || {};
  this._declaredInputs = config.inputs || [];
  this._declaredState = config.state || [];
  this._tickRate = config.tickRate || 20;
  this._sync = config.sync || "local";
  this._transport = config.transport || null;
  this._strategy = config.strategy || null;

  this._game = null;
  this._inputManager = null;
  this._tickInterval = null;
  this._tick = 0;
  this._running = false;

  // Remote input buffer: tick → inputs
  this._remoteInputs = {};
  this._orderedInputs = {};
  this._localInputs = {};
  this._peerId = null;
  this._inputDelay = config.inputDelay || 2;
  this._listeners = {};
  this._remoteInputBuffer = {};
  this._lastRemoteTick = -1;
}

GameCastleNetworkBridge.prototype.on = function (event, handler) {
  if (!this._listeners[event]) this._listeners[event] = [];
  this._listeners[event].push(handler);
};

GameCastleNetworkBridge.prototype._emit = function (event) {
  var args = Array.prototype.slice.call(arguments, 1);
  var handlers = this._listeners[event];
  if (handlers) for (var i = 0; i < handlers.length; i++) handlers[i].apply(null, args);
};

// ── Public API ──────────────────────────────────────────────────────────

GameCastleNetworkBridge.prototype.attach = function (game) {
  this._game = game;
  this._adapter = new GameCastleRuntimeAdapter(game);
  this._inputManager = game.getInputManager();

  console.log("[GC:Bridge] Attached. sync=" + this._sync +
    " tickRate=" + this._tickRate +
    " inputs=" + this._declaredInputs.join(","));

  if (this._sync === "local") {
    // Local mode: let GDevelop run normally
    this._startLocalLoop();
    return true;
  }

  // Network mode: bridge controls the game loop
  this._autoConnect();
  return true; // true = bridge will step the game, DO NOT call startGameLoop()
};

// Called when room is joined — starts the network game loop
GameCastleNetworkBridge.prototype._onJoined = function () {
  if (this._running) return;
  this._running = true;
  this._lastFrameTime = 0;

  var self = this;
  this._adapter.startLoop(function (dtMs, tickNum) {
    return self._onNetworkTick(dtMs, tickNum);
  });

  console.log("[GC:Bridge] Network loop started at " + this._tickRate + "hz via adapter");
};


GameCastleNetworkBridge.prototype._onNetworkTick = function (dtMs, tickNum) {
  var tick = tickNum;
  switch (this._sync) {
    case "lockstep":
    case "lockstep-input":
      return this._tickLockstep(dtMs, tick);
    case "server-authoritative":
      return this._tickAuthority(dtMs, tick);
    default:
      this._adapter.stepSimulation(dtMs);
      this._adapter.endFrame();
      return true;
  }
};

GameCastleNetworkBridge.prototype._tickLockstep = function (dtMs, tick) {
  var localInputs = this._adapter.captureInputs();
  this._localInputs[tick] = localInputs;
  this._sendInputs(tick, localInputs);
  this._tick = tick;
  this._tryAdvanceLockstep();
  return true;
};

GameCastleNetworkBridge.prototype._tryAdvanceLockstep = function () {
  var self = this;
  while (this._running) {
    var tick = this._readyTick;
    if (tick + this._inputDelay >= this._tick) break;
    if (this._localInputs[tick] === undefined) break;
    if (this._remoteInputs[tick] === undefined) break;
    this._adapter.injectInputs(this._remoteInputs[tick], false);
    this._adapter.stepSimulation(1000 / this._tickRate);
    this._adapter.endFrame();
    this._emit("advance", tick, this._localInputs[tick], this._remoteInputs[tick]);
    delete this._localInputs[tick - 60];
    delete this._remoteInputs[tick - 60];
    this._readyTick++;
  }
};

GameCastleNetworkBridge.prototype._tickAuthority = function (dtMs, tick) {
  var localInputs = this._adapter.captureInputs();
  if (this._transport && this._transport.sendGameInput) {
    this._transport.sendGameInput(tick, localInputs);
  }
  this._tick = tick;
  this._tryAdvanceAuthority();
  return true;
};

GameCastleNetworkBridge.prototype._tryAdvanceAuthority = function () {
  while (this._running) {
    var tick = this._readyTick;
    if (tick + this._inputDelay >= this._tick) break;
    var ordered = this._orderedInputs[tick];
    if (!ordered) break;
    var self = this;
    var myId = this._transport ? this._transport.getPlayerId() : null;
    Object.keys(ordered).forEach(function (pid) {
      if (pid !== myId) self._adapter.injectInputs(ordered[pid], false);
    });
    this._adapter.stepSimulation(this._adapter.getTickIntervalMs());
    this._adapter.endFrame();
    this._emit("advance", tick, ordered);
    delete this._orderedInputs[tick - 60];
    this._readyTick++;
  }
};

// ── Network tick ────────────────────────────────────────────────────────

GameCastleNetworkBridge.prototype._readInputs = function () {
  return this._adapter ? this._adapter.captureInputs() : {};
};

// ── Sending ─────────────────────────────────────────────────────────────

GameCastleNetworkBridge.prototype._sendInputs = function (tick, inputs) {
  if (this._transport && this._transport.sendGameInput) {
    this._transport.sendGameInput(tick, inputs);
  }
};

// ── Auto-connect (testing) ──────────────────────────────────────────────

GameCastleNetworkBridge.prototype._startLocalLoop = function () {
  if (this._running) return;
  this._running = true;
  var self = this;
  this._adapter.startLoop(function (dtMs, tickNum) {
    self._adapter.stepSimulation(dtMs);
    self._adapter.endFrame();
    self._emit("tick", tickNum, self._adapter.captureInputs());
    self._tick = tickNum;
  });
};

GameCastleNetworkBridge.prototype._autoConnect = function () {
  var self = this;
  if (!this._transport) return;

  this._transport.connect().then(function () {
    console.log("[GC:Bridge] Connected");
    self._transport.on("room_created", function (roomId) {
      self._transport.joinRoom(roomId);
    });
    self._transport.on("joined", function () {
      self._onJoined();
    });
    self._transport.createRoom({ tickRate: self._tickRate });
  }).catch(function (err) {
    console.warn("[GC:Bridge] Offline — " + err.message);
  });
};

// ── Teardown ────────────────────────────────────────────────────────────

GameCastleNetworkBridge.prototype.detach = function () {
  if (this._tickInterval) {
    clearInterval(this._tickInterval);
    this._tickInterval = null;
  }
  this._running = false;
};

// Export
if (typeof module !== "undefined") {
  module.exports = { GameCastleNetworkBridge: GameCastleNetworkBridge, GC_INPUT_KEY_MAP: GC_INPUT_KEY_MAP };
}
