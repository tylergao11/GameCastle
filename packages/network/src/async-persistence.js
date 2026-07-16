// GameCastle Async Persistence
// Pure async persistence session + transport strategy for non-realtime social state.

function GameCastleAsyncPersistenceSession(config) {
  config = config || {};
  this._namespace = config.namespace || "";
  this._operations = [];
}

GameCastleAsyncPersistenceSession.prototype.key = function(key) {
  key = String(key || "");
  return this._namespace ? this._namespace + "/" + key : key;
};

GameCastleAsyncPersistenceSession.prototype.record = function(type, key, data) {
  var op = {
    type: type,
    key: key,
    data: cloneValue(data),
    at: nowMs(),
  };
  this._operations.push(op);
  return op;
};

GameCastleAsyncPersistenceSession.prototype.getOperations = function() {
  return this._operations.slice();
};

GameCastleAsyncPersistenceSession.prototype.getStats = function() {
  return { operations: this._operations.length, namespace: this._namespace };
};

function AsyncPersistenceStrategy(transport, config) {
  config = config || {};
  this._transport = transport;
  this._authority = config.authority || "server";
  this._session = new GameCastleAsyncPersistenceSession(config);
  this._listeners = {};
}

AsyncPersistenceStrategy.prototype.on = function(event, handler) {
  if (!this._listeners[event]) this._listeners[event] = [];
  this._listeners[event].push(handler);
};

AsyncPersistenceStrategy.prototype._emit = function(event) {
  var args = Array.prototype.slice.call(arguments, 1);
  var handlers = this._listeners[event];
  if (handlers) {
    for (var i = 0; i < handlers.length; i++) handlers[i].apply(null, args);
  }
};

AsyncPersistenceStrategy.prototype.save = function(key, data) {
  var self = this;
  var scopedKey = this._session.key(key);
  return this._transport.saveState(scopedKey, data).then(function() {
    var op = self._session.record("save", scopedKey, data);
    self._emit("saved", scopedKey, op);
    return op;
  });
};

AsyncPersistenceStrategy.prototype.load = function(playerId, key) {
  var self = this;
  var scopedKey = this._session.key(key);
  return this._transport.loadState(playerId, scopedKey).then(function(data) {
    var op = self._session.record("load", scopedKey, data);
    self._emit("loaded", scopedKey, data, op);
    return data;
  });
};

AsyncPersistenceStrategy.prototype.list = function(prefix) {
  return this._transport.listStates(this._session.key(prefix || ""));
};

AsyncPersistenceStrategy.prototype.start = function() {};
AsyncPersistenceStrategy.prototype.stop = function() {};
AsyncPersistenceStrategy.prototype.getSession = function() { return this._session; };
AsyncPersistenceStrategy.prototype.getStats = function() { return this._session.getStats(); };

function cloneValue(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function nowMs() {
  if (typeof performance !== "undefined" && performance.now) return performance.now();
  return Date.now();
}

if (typeof module !== "undefined") {
  module.exports = {
    GameCastleAsyncPersistenceSession: GameCastleAsyncPersistenceSession,
    AsyncPersistenceStrategy: AsyncPersistenceStrategy,
  };
}
