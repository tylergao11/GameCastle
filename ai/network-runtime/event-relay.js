// GameCastle Event Relay
// Pure event session + transport strategy for room events and peer events.

function GameCastleEventRelaySession(config) {
  config = config || {};
  this._historySize = config.historySize !== undefined ? config.historySize : 120;
  this._nextSeq = 0;
  this._events = [];
  this._seen = {};
}

GameCastleEventRelaySession.prototype.createEvent = function(name, payload, targetPlayerId) {
  var event = {
    __gc: {
      type: "event",
      seq: this._nextSeq++,
      name: String(name || ""),
      payload: cloneValue(payload || {}),
      target: targetPlayerId || null,
      sentAt: nowMs(),
    },
  };
  return event;
};

GameCastleEventRelaySession.prototype.receiveEvent = function(fromPlayerId, packet) {
  var meta = packet && packet.__gc;
  if (!meta || meta.type !== "event" || !meta.name) return null;
  var key = fromPlayerId + ":" + (meta.seq !== undefined ? meta.seq : meta.name + ":" + this._events.length);
  if (this._seen[key]) return null;
  this._seen[key] = true;
  var event = {
    from: fromPlayerId,
    seq: meta.seq,
    name: meta.name,
    payload: cloneValue(meta.payload || {}),
    target: meta.target || null,
    receivedAt: nowMs(),
  };
  this._events.push(event);
  this._prune();
  return event;
};

GameCastleEventRelaySession.prototype.getEvents = function(name) {
  return this._events.filter(function(event) {
    return !name || event.name === name;
  });
};

GameCastleEventRelaySession.prototype._prune = function() {
  while (this._events.length > this._historySize) this._events.shift();
};

GameCastleEventRelaySession.prototype.getStats = function() {
  return { nextSeq: this._nextSeq, buffered: this._events.length };
};

function EventRelayStrategy(transport, config) {
  config = config || {};
  this._transport = transport;
  this._sync = config.sync || "event";
  this._session = new GameCastleEventRelaySession(config);
  this._handlers = {};

  var self = this;
  transport.on("relay", function(from, data) {
    var event = self._session.receiveEvent(from, data);
    if (event) self._fire(event.name, event.from, event.payload, event);
  });
}

EventRelayStrategy.prototype.on = function(eventName, handler) {
  if (!this._handlers[eventName]) this._handlers[eventName] = [];
  this._handlers[eventName].push(handler);
};

EventRelayStrategy.prototype.send = function(eventName, payload) {
  this._transport.broadcast(this._session.createEvent(eventName, payload));
};

EventRelayStrategy.prototype.sendTo = function(targetPlayerId, eventName, payload) {
  this._transport.sendTo(targetPlayerId, this._session.createEvent(eventName, payload, targetPlayerId));
};

EventRelayStrategy.prototype._fire = function(eventName, fromPlayerId, payload, event) {
  var handlers = this._handlers[eventName];
  if (handlers) {
    for (var i = 0; i < handlers.length; i++) handlers[i](fromPlayerId, payload, event);
  }
};

EventRelayStrategy.prototype.start = function() {};
EventRelayStrategy.prototype.stop = function() { this._handlers = {}; };
EventRelayStrategy.prototype.getSession = function() { return this._session; };
EventRelayStrategy.prototype.getStats = function() { return this._session.getStats(); };

function cloneValue(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function nowMs() {
  if (typeof performance !== "undefined" && performance.now) return performance.now();
  return Date.now();
}

if (typeof module !== "undefined") {
  module.exports = {
    GameCastleEventRelaySession: GameCastleEventRelaySession,
    EventRelayStrategy: EventRelayStrategy,
  };
}
