// StateSync Strategy (Snapshot)
// Authority periodically captures game state and broadcasts to all clients.
// Clients receive state snapshots and apply them to their local game.
// Template: host-snapshot
//
// Public API:
//   on(event, handler)    — subscribe: "snapshot"(state) on clients
//   onRequest(event, fn)  — register: "readState"() → state on authority
//   start() / stop()
//   isAuthority()
//
// Wire format (over transport sync channel):
//   { __gc: { type: "state", tick: N, data: {...} } }

var STATE_SYNC_CHANNEL = "state";

function StateSyncStrategy(transport, config) {
  if (!config || config.tickRate == null) {
    throw new Error("StateSyncStrategy: tickRate is required");
  }

  this._transport = transport;
  this._tickRate = config.tickRate;
  this._authority = config.authority || "host";
  this._isAuthority = false;
  this._timer = null;

  // Event system
  this._listeners = {};
  this._requests = {};

  var self = this;

  transport.on("joined", function (roomId, playerId) {
    // First player to join is the authority (for "host" mode)
    if (transport.getPlayers().size === 0 && self._authority === "host") {
      self._isAuthority = true;
    }
  });

  transport.on("sync", function (from, channel, data) {
    if (channel !== STATE_SYNC_CHANNEL || self._isAuthority) return;
    if (!data || !data.__gc || data.__gc.type !== "state") return;
    self._emit("snapshot", data.__gc.data, data.__gc.tick);
  });
}

// ---- Event subscription ----

StateSyncStrategy.prototype.on = function (event, handler) {
  if (!this._listeners[event]) this._listeners[event] = [];
  this._listeners[event].push(handler);
};

StateSyncStrategy.prototype.onRequest = function (event, handler) {
  this._requests[event] = handler;
};

StateSyncStrategy.prototype._emit = function (event) {
  var args = Array.prototype.slice.call(arguments, 1);
  var handlers = this._listeners[event];
  if (handlers) {
    for (var i = 0; i < handlers.length; i++) {
      handlers[i].apply(null, args);
    }
  }
};

// ---- Lifecycle ----

StateSyncStrategy.prototype.start = function () {
  if (!this._isAuthority) return;
  var self = this;
  var intervalMs = Math.round(1000 / this._tickRate);
  var tick = 0;
  this._timer = setInterval(function () {
    var readFn = self._requests["readState"];
    if (!readFn) return;
    var state = readFn();
    if (state === undefined || state === null) return;
    self._transport.sync(STATE_SYNC_CHANNEL, {
      __gc: { type: "state", tick: tick++, data: state }
    });
  }, intervalMs);
};

StateSyncStrategy.prototype.stop = function () {
  if (this._timer) { clearInterval(this._timer); this._timer = null; }
  this._isAuthority = false;
};

StateSyncStrategy.prototype.isAuthority = function () { return this._isAuthority; };

if (typeof module !== "undefined") { module.exports = StateSyncStrategy; }
