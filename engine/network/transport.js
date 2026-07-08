// engine/network/transport.js
// Transport abstraction. Only knows how to send/receive bytes. Knows nothing about game state.
var gdjs;(function(g) {
var NetworkTransport = {};

// ---- WebSocket Transport ----
NetworkTransport.WebSocket = function(url) {
  this._url = url;
  this._ws = null;
  this._handlers = [];
  this._state = "disconnected"; // disconnected | connecting | connected | closed
};

NetworkTransport.WebSocket.prototype.connect = function() {
  var self = this;
  if (self._ws) { self.close(); }
  self._state = "connecting";
  self._ws = new WebSocket(self._url);
  self._ws.onopen = function() { self._state = "connected"; };
  self._ws.onmessage = function(event) {
    var msg;
    try { msg = JSON.parse(event.data); } catch(e) { return; }
    for (var i = 0; i < self._handlers.length; i++) {
      self._handlers[i](msg);
    }
  };
  self._ws.onclose = function() { self._state = "disconnected"; };
  self._ws.onerror = function() { self._state = "disconnected"; };
};

NetworkTransport.WebSocket.prototype.send = function(message) {
  if (this._state !== "connected" || !this._ws) return;
  this._ws.send(JSON.stringify(message));
};

NetworkTransport.WebSocket.prototype.onMessage = function(handler) {
  this._handlers.push(handler);
};

NetworkTransport.WebSocket.prototype.close = function() {
  if (this._ws) { this._ws.close(); this._ws = null; }
  this._state = "disconnected";
};

NetworkTransport.WebSocket.prototype.getState = function() {
  return this._state;
};

// ---- Exports ----
g.GameCastleNetworkTransport = NetworkTransport;
})(gdjs);
