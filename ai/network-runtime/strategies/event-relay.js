// EventRelay Strategy
// Players send named events through the server. No tick loop.
// Templates: event-room, peer-event
//
// Public API:
//   on(eventName, handler) — listen for incoming event: (fromPlayerId, payload)
//   send(eventName, payload) — broadcast event to all other players
//   sendTo(targetPlayerId, eventName, payload) — send to specific player
//   start() / stop() — no-op for lifecycle consistency
//
// Wire format (over transport relay):
//   { __gc: { type: "event", name: "eventName", payload: {...} } }

function EventRelayStrategy(transport, config) {
  this._transport = transport;
  this._sync = config.sync || "event";
  this._handlers = {};

  var self = this;
  transport.on("relay", function (from, data) {
    if (!data || !data.__gc || data.__gc.type !== "event") return;
    self._fire(data.__gc.name, from, data.__gc.payload);
  });
}

EventRelayStrategy.prototype.on = function (eventName, handler) {
  if (!this._handlers[eventName]) this._handlers[eventName] = [];
  this._handlers[eventName].push(handler);
};

EventRelayStrategy.prototype.send = function (eventName, payload) {
  this._transport.broadcast({
    __gc: { type: "event", name: eventName, payload: payload }
  });
};

EventRelayStrategy.prototype.sendTo = function (targetPlayerId, eventName, payload) {
  this._transport.sendTo(targetPlayerId, {
    __gc: { type: "event", name: eventName, payload: payload }
  });
};

EventRelayStrategy.prototype._fire = function (eventName, fromPlayerId, payload) {
  var handlers = this._handlers[eventName];
  if (handlers) {
    for (var i = 0; i < handlers.length; i++) {
      handlers[i](fromPlayerId, payload);
    }
  }
};

EventRelayStrategy.prototype.start = function () {};
EventRelayStrategy.prototype.stop = function () { this._handlers = {}; };

if (typeof module !== "undefined") { module.exports = EventRelayStrategy; }
