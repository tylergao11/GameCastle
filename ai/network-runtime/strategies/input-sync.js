// InputSync Strategy (Lockstep)
// Deterministic input forwarding between 2 peers over the relay channel.
// Both sides send their inputs each tick. Simulation advances only when
// both local and remote inputs are available for a given tick.
// Template: p2p-lockstep
//
// Public API:
//   on(event, handler)   — subscribe: "advance"(tick, local, remote)
//   onRequest(event, fn) — register request handler: "readInputs"(tick) → inputs
//   start() / stop()
//   getTick() / getReadyTick() / hasPeer()
//
// Wire format (over transport relay):
//   { __gc: { type: "input", tick: N, inputs: {...}, prev: {N-1: {...}, ...} } }

var INPUT_SYNC_EVENT = "__gc:input";

function InputSyncStrategy(transport, config) {
  if (!config || config.tickRate == null) {
    throw new Error("InputSyncStrategy: tickRate is required");
  }

  this._transport = transport;
  this._tickRate = config.tickRate;
  this._inputDelay = config.inputDelay || 2;
  this._redundancyTicks = config.redundancyTicks || 5;

  // Internal state (hidden)
  this._localTick = 0;
  this._readyTick = 0;
  this._remoteInputs = {};   // tick → inputs
  this._localInputs = {};    // tick → inputs (for redundancy)
  this._remotePlayerId = null;
  this._timer = null;
  this._running = false;

  // Event system
  this._listeners = {};      // "advance" → [handler]
  this._requests = {};       // "readInputs" → handler

  var self = this;

  transport.on("player_joined", function (playerId) {
    if (playerId !== transport.getPlayerId()) {
      self._remotePlayerId = playerId;
    }
  });

  transport.on("relay", function (from, data) {
    if (!data || !data.__gc || data.__gc.type !== "input") return;
    self._onRemoteInput(data.__gc.tick, data.__gc.inputs, data.__gc.prev);
  });
}

// ---- Event subscription ----

InputSyncStrategy.prototype.on = function (event, handler) {
  if (!this._listeners[event]) this._listeners[event] = [];
  this._listeners[event].push(handler);
};

// Register a request handler (reads local game state).
// "readInputs": function(tick) → returns { left: true, jump: false, ... }
InputSyncStrategy.prototype.onRequest = function (event, handler) {
  this._requests[event] = handler;
};

InputSyncStrategy.prototype._emit = function (event) {
  var args = Array.prototype.slice.call(arguments, 1);
  var handlers = this._listeners[event];
  if (handlers) {
    for (var i = 0; i < handlers.length; i++) {
      handlers[i].apply(null, args);
    }
  }
};

// ---- Lifecycle ----

InputSyncStrategy.prototype.start = function () {
  if (this._running) return;
  this._running = true;
  var self = this;
  var intervalMs = Math.round(1000 / this._tickRate);
  this._timer = setInterval(function () { self._tick(); }, intervalMs);
};

InputSyncStrategy.prototype.stop = function () {
  this._running = false;
  if (this._timer) { clearInterval(this._timer); this._timer = null; }
};

// ---- Tick logic ----

InputSyncStrategy.prototype._tick = function () {
  if (!this._running || !this._remotePlayerId) return;

  // Read local inputs via registered handler
  var inputs = null;
  var readFn = this._requests["readInputs"];
  if (readFn) { inputs = readFn(this._localTick); }
  if (!inputs) inputs = {};

  // Cache and send
  this._localInputs[this._localTick] = inputs;
  this._sendInputs(this._localTick, inputs);
  this._localTick++;

  // Advance as far as we can
  this._tryAdvance();
};

InputSyncStrategy.prototype._sendInputs = function (tick, inputs) {
  var prev = {};
  for (var i = 1; i <= Math.min(this._redundancyTicks, tick); i++) {
    var pt = tick - i;
    if (this._localInputs[pt] !== undefined) {
      prev[pt] = this._localInputs[pt];
    }
  }

  this._transport.sendTo(this._remotePlayerId, {
    __gc: { type: "input", tick: tick, inputs: inputs, prev: prev }
  });
};

InputSyncStrategy.prototype._onRemoteInput = function (tick, inputs, prev) {
  // Store primary input
  this._remoteInputs[tick] = inputs;

  // Apply redundancy: fill gaps for previous ticks
  if (prev) {
    for (var pt in prev) {
      if (prev.hasOwnProperty(pt) && !this._remoteInputs[pt]) {
        this._remoteInputs[pt] = prev[pt];
      }
    }
  }

  this._tryAdvance();
};

InputSyncStrategy.prototype._tryAdvance = function () {
  while (this._running) {
    var tick = this._readyTick;
    if (tick + this._inputDelay >= this._localTick) break;  // Haven't generated local input yet
    if (!this._remoteInputs[tick]) break;                     // Haven't received remote yet

    var local = this._localInputs[tick] || {};
    var remote = this._remoteInputs[tick];

    this._emit("advance", tick, local, remote);

    // Housekeeping: keep only recent ticks
    var cutoff = tick - (this._redundancyTicks + 10);
    delete this._localInputs[cutoff];
    delete this._remoteInputs[cutoff];

    this._readyTick++;
  }
};

// ---- Queries ----

InputSyncStrategy.prototype.getTick = function () { return this._localTick; };
InputSyncStrategy.prototype.getReadyTick = function () { return this._readyTick; };
InputSyncStrategy.prototype.isRunning = function () { return this._running; };
InputSyncStrategy.prototype.hasPeer = function () { return !!this._remotePlayerId; };

if (typeof module !== "undefined") { module.exports = InputSyncStrategy; }
