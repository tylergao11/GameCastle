// AuthoritySync Strategy (Server-Authoritative)
// Clients send inputs to server each tick. Server collects, orders,
// and broadcasts ordered inputs back. All clients run the same
// deterministic simulation with server-ordered inputs.
// Template: server-authoritative
//
// Public API:
//   on(event, handler)    — "advance"(tick, allInputs)  allInputs = { playerId: {...}, ... }
//   onRequest(event, fn)  — "readInputs"(tick) → inputs
//   start() / stop()
//   getTick() / getReadyTick()
//
// Wire format:
//   Client→Server: game_input { tick, inputs }
//   Server→Client: game_state { tick, inputs: { p1: {...}, p2: {...} } }

function AuthoritySyncStrategy(transport, config) {
  if (!config || config.tickRate == null) {
    throw new Error("AuthoritySyncStrategy: tickRate is required");
  }

  this._transport = transport;
  this._tickRate = config.tickRate;
  this._inputDelay = config.inputDelay || 2;

  // Internal state
  this._localTick = 0;
  this._readyTick = 0;
  this._stateQueue = {};   // tick → orderedInputs (from server)
  this._timer = null;
  this._running = false;

  // Event system
  this._listeners = {};
  this._requests = {};

  var self = this;

  transport.on("game_state", function (tick, orderedInputs) {
    self._onState(tick, orderedInputs);
  });
}

// ── Event subscription ───────────────────────────────────────────────────

AuthoritySyncStrategy.prototype.on = function (event, handler) {
  if (!this._listeners[event]) this._listeners[event] = [];
  this._listeners[event].push(handler);
};

AuthoritySyncStrategy.prototype.onRequest = function (event, handler) {
  this._requests[event] = handler;
};

AuthoritySyncStrategy.prototype._emit = function (event) {
  var args = Array.prototype.slice.call(arguments, 1);
  var handlers = this._listeners[event];
  if (handlers) {
    for (var i = 0; i < handlers.length; i++) {
      handlers[i].apply(null, args);
    }
  }
};

// ── Lifecycle ────────────────────────────────────────────────────────────

AuthoritySyncStrategy.prototype.start = function () {
  if (this._running) return;
  this._running = true;
  var self = this;
  var intervalMs = Math.round(1000 / this._tickRate);
  this._timer = setInterval(function () { self._tick(); }, intervalMs);
};

AuthoritySyncStrategy.prototype.stop = function () {
  this._running = false;
  if (this._timer) { clearInterval(this._timer); this._timer = null; }
};

// ── Tick logic ───────────────────────────────────────────────────────────

AuthoritySyncStrategy.prototype._tick = function () {
  if (!this._running) return;

  var readFn = this._requests["readInputs"];
  var inputs = readFn ? readFn(this._localTick) : {};
  if (!inputs) inputs = {};

  // Send to server
  this._transport.sendGameInput(this._localTick, inputs);
  this._localTick++;

  // Try to advance
  this._tryAdvance();
};

// ── Receive ──────────────────────────────────────────────────────────────

AuthoritySyncStrategy.prototype._onState = function (tick, orderedInputs) {
  this._stateQueue[tick] = orderedInputs;
  this._tryAdvance();
};

AuthoritySyncStrategy.prototype._tryAdvance = function () {
  while (this._running) {
    var tick = this._readyTick;
    // Don't advance past what we've generated (minus input delay)
    if (tick + this._inputDelay >= this._localTick) break;
    // Wait for server state
    var state = this._stateQueue[tick];
    if (!state) break;

    this._emit("advance", tick, state);

    // Cleanup
    var cutoff = tick - 60;
    delete this._stateQueue[cutoff];

    this._readyTick++;
  }
};

// ── Queries ──────────────────────────────────────────────────────────────

AuthoritySyncStrategy.prototype.getTick = function () { return this._localTick; };
AuthoritySyncStrategy.prototype.getReadyTick = function () { return this._readyTick; };
AuthoritySyncStrategy.prototype.isRunning = function () { return this._running; };

if (typeof module !== "undefined") { module.exports = AuthoritySyncStrategy; }
