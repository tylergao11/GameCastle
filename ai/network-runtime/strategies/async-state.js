// AsyncState Strategy
// Player state persisted to server, loaded by others on demand.
// No real-time tick loop — save/load is event-driven.
// Template: async-state
//
// Public API:
//   on(event, handler)    — "loaded"(key, data), "saved"(key)
//   save(key, data)       — persist state to server
//   load(playerId, key)   — load another player's state
//   list(prefix)          — list current player's saved state keys
//   start() / stop()      — lifecycle (no-op for this strategy)
//
// Wire format (over transport state persistence):
//   Server: save_state / load_state / list_states

function AsyncStateStrategy(transport, config) {
  this._transport = transport;
  this._authority = config.authority || "server";

  // Event system
  this._listeners = {};
}

// ── Event subscription ─────────────────────────────────────────��─────────

AsyncStateStrategy.prototype.on = function (event, handler) {
  if (!this._listeners[event]) this._listeners[event] = [];
  this._listeners[event].push(handler);
};

AsyncStateStrategy.prototype._emit = function (event) {
  var args = Array.prototype.slice.call(arguments, 1);
  var handlers = this._listeners[event];
  if (handlers) {
    for (var i = 0; i < handlers.length; i++) {
      handlers[i].apply(null, args);
    }
  }
};

// ── Operations ───────────────────────────────────────────────────────────

AsyncStateStrategy.prototype.save = function (key, data) {
  var self = this;
  return this._transport.saveState(key, data).then(function () {
    self._emit("saved", key);
  });
};

AsyncStateStrategy.prototype.load = function (playerId, key) {
  var self = this;
  return this._transport.loadState(playerId, key).then(function (data) {
    self._emit("loaded", key, data);
    return data;
  });
};

AsyncStateStrategy.prototype.list = function (prefix) {
  return this._transport.listStates(prefix);
};

// ── Lifecycle ────────────────────────────────────────────────────────────

AsyncStateStrategy.prototype.start = function () {};
AsyncStateStrategy.prototype.stop = function () {};

if (typeof module !== "undefined") { module.exports = AsyncStateStrategy; }
