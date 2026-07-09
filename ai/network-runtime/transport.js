// GameCastle Network Transport
// WebSocket client for the signaling server.
// Handles connection, room lifecycle, message dispatch, state persistence.
// All sync strategies sit on top of this layer.

function GameCastleTransport(url) {
  this._url = url;
  this._ws = null;
  this._roomId = null;
  this._playerId = null;
  this._lastRoomId = null;
  this._lastPlayerId = null;
  this._players = new Set();
  this._listeners = {};   // eventName → [handler]
  this._pending = {};      // seq → { resolve, reject }
  this._seq = 0;
}

// ── Event system ─────────────────────────────────────────────────────────

GameCastleTransport.prototype.on = function (event, handler) {
  if (!this._listeners[event]) this._listeners[event] = [];
  this._listeners[event].push(handler);
};

GameCastleTransport.prototype._emit = function (event) {
  var args = Array.prototype.slice.call(arguments, 1);
  var handlers = this._listeners[event];
  if (handlers) {
    for (var i = 0; i < handlers.length; i++) {
      handlers[i].apply(null, args);
    }
  }
};

// ── Connection ───────────────────────────────────────────────────────────

GameCastleTransport.prototype.connect = function () {
  var self = this;
  return new Promise(function (resolve, reject) {
    if (self._ws) { self._ws.close(); }
    self._ws = new WebSocket(self._url);
    self._ws.onopen = function () {
      self._emit("connected");
      resolve();
    };
    self._ws.onerror = function () {
      reject(new Error("WebSocket error"));
    };
    self._ws.onclose = function () {
      var lastRoomId = self._roomId || self._lastRoomId;
      var lastPlayerId = self._playerId || self._lastPlayerId;
      if (self._roomId) {
        self._players.clear();
        self._roomId = null;
        self._playerId = null;
      }
      self._emit("disconnected", { roomId: lastRoomId, playerId: lastPlayerId });
    };
    self._ws.onmessage = function (e) {
      var msg;
      try { msg = JSON.parse(e.data); } catch (err) { return; }
      self._dispatch(msg);
    };
  });
};

GameCastleTransport.prototype._send = function (msg) {
  if (this._ws && this._ws.readyState === 1) {
    this._ws.send(JSON.stringify(msg));
  }
};

// ── Request-Response ─────────────────────────────────────────────────────
// For messages that expect a reply (save_state → state_saved, etc.)

GameCastleTransport.prototype._request = function (msg, responseType) {
  var self = this;
  return new Promise(function (resolve, reject) {
    var seq = ++self._seq;
    self._pending[seq] = { resolve: resolve, reject: reject, type: responseType };
    msg._seq = seq;
    self._send(msg);

    // Timeout after 10s
    setTimeout(function () {
      if (self._pending[seq]) {
        delete self._pending[seq];
        reject(new Error("request timeout: " + msg.type));
      }
    }, 10000);
  });
};

// ── Message dispatch ─────────────────────────────────────────────────────

GameCastleTransport.prototype._dispatch = function (msg) {
  // Check if this is a response to a pending request
  if (msg._seq && this._pending[msg._seq]) {
    var pending = this._pending[msg._seq];
    if (msg.type === "error") {
      pending.reject(new Error(msg.error));
    } else {
      pending.resolve(msg);
    }
    delete this._pending[msg._seq];
    return;
  }

  switch (msg.type) {
    case "room_created":
      this._roomId = msg.roomId;
      this._emit("room_created", msg.roomId);
      break;
    case "joined":
      this._roomId = msg.roomId;
      this._playerId = msg.playerId;
      this._lastRoomId = msg.roomId;
      this._lastPlayerId = msg.playerId;
      this._emit("joined", msg.roomId, msg.playerId);
      break;
    case "player_joined":
      this._players.add(msg.playerId);
      this._emit("player_joined", msg.playerId);
      break;
    case "player_left":
      this._players.delete(msg.playerId);
      this._emit("player_left", msg.playerId);
      break;
    case "relay":
      this._emit("relay", msg.from, msg.data);
      if (msg.channel) this._emit("sync", msg.from, msg.channel, msg.data);
      break;
    case "sync":
      this._emit("sync", msg.from, msg.channel, msg.data);
      break;
    case "game_event":
      this._emit("game_event", msg.name, msg.payload, msg.from);
      break;
    case "game_input":
      this._emit("game_input", msg.from, msg.tick, msg.inputs);
      break;
    case "game_state":
      this._emit("game_state", msg.tick, msg.inputs);
      break;
    case "state_saved":
    case "state_loaded":
    case "state_list":
      // Handled by _request mechanism via _seq
      break;
    case "error":
      this._emit("error", msg.error);
      break;
  }
};

// ── Room lifecycle ───────────────────────────────────────────────────────

GameCastleTransport.prototype.createRoom = function (options) {
  options = options || {};
  this._send({ type: "create_room", tickRate: options.tickRate, maxPlayers: options.maxPlayers, inputDelay: options.inputDelay });
};

GameCastleTransport.prototype.joinRoom = function (roomId, playerId) {
  this._send({ type: "join_room", roomId: roomId, playerId: playerId || undefined });
};

GameCastleTransport.prototype.reconnect = function () {
  var self = this;
  var roomId = this._lastRoomId || this._roomId;
  var playerId = this._lastPlayerId || this._playerId;
  if (!roomId || !playerId) return Promise.reject(new Error("No previous room/player to reconnect"));
  return this.connect().then(function () {
    return new Promise(function (resolve, reject) {
      var done = false;
      function onJoined(rid, pid) {
        if (done) return;
        done = true;
        resolve({ roomId: rid, playerId: pid });
      }
      function onError(err) {
        if (done) return;
        done = true;
        reject(new Error(err));
      }
      self.on("joined", onJoined);
      self.on("error", onError);
      self.joinRoom(roomId, playerId);
    });
  });
};

GameCastleTransport.prototype.leaveRoom = function () {
  this._send({ type: "leave_room" });
};

// ── Data channels ────────────────────────────────────────────────────────

GameCastleTransport.prototype.broadcast = function (data) {
  this._send({ type: "relay", data: data });
};

GameCastleTransport.prototype.sendTo = function (targetPlayerId, data) {
  this._send({ type: "relay", target: targetPlayerId, data: data });
};

GameCastleTransport.prototype.sync = function (channel, data) {
  this._send({ type: "sync", channel: channel, data: data });
};

// ── State persistence ────────────────────────────────────────────────────

GameCastleTransport.prototype.saveState = function (key, data) {
  return this._request({ type: "save_state", key: key, data: data }, "state_saved");
};

GameCastleTransport.prototype.loadState = function (playerId, key) {
  return this._request(
    { type: "load_state", playerId: playerId, key: key },
    "state_loaded"
  ).then(function (msg) { return msg.data; });
};

GameCastleTransport.prototype.listStates = function (prefix) {
  return this._request(
    { type: "list_states", prefix: prefix || "" },
    "state_list"
  ).then(function (msg) { return msg.entries; });
};

// ── Event ────────────────────────────────────────────────────────────────

GameCastleTransport.prototype.sendEvent = function (name, payload) {
  this._send({ type: "send_event", name: name, payload: payload });
};

// ── Game input ───────────────────────────────────────────────────────────

GameCastleTransport.prototype.sendGameInput = function (tick, inputs) {
  this._send({ type: "game_input", tick: tick, inputs: inputs });
};

// ── Queries ──────────────────────────────────────────────────────────────

GameCastleTransport.prototype.getRoomId = function () { return this._roomId; };
GameCastleTransport.prototype.getPlayerId = function () { return this._playerId; };
GameCastleTransport.prototype.getPlayers = function () { return this._players; };
GameCastleTransport.prototype.getPlayerCount = function () { return this._players.size; };
GameCastleTransport.prototype.isInRoom = function () { return !!this._roomId; };
GameCastleTransport.prototype.isConnected = function () { return this._ws && this._ws.readyState === 1; };

GameCastleTransport.prototype.close = function () {
  if (this._ws) { this._ws.close(); this._ws = null; }
};

if (typeof module !== "undefined") { module.exports = GameCastleTransport; }
