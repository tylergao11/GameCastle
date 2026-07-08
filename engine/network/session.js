// engine/network/session.js
// Room state machine. Tracks roomId, players, isHost. Talks to signaling server via control transport.
var gdjs;(function(g) {
var NetworkSession = {};

NetworkSession.create = function(config) {
  var s = {
    roomId:      config.roomId || null,
    playerId:    config.playerId || generateId(),
    isHost:      config.isHost || false,
    players:     config.players || [],
    state:       "idle",        // idle | waiting | playing | ended
    transport:   config.transport,  // control channel transport
    _listeners:  { playerJoined: [], playerLeft: [], stateChange: [], hostAssigned: [] }
  };

  // Wire incoming control messages
  s.transport.onMessage(function(msg) {
    switch (msg.type) {
      case "room_created":
        s.roomId = msg.roomId;
        s.isHost = true;
        s.state = "waiting";
        s._emit("stateChange", "waiting");
        break;
      case "room_joined":
        s.roomId = msg.roomId;
        s.players = msg.players || [];
        s.state = "waiting";
        s._emit("stateChange", "waiting");
        break;
      case "player_joined":
        s.players = msg.players || s.players;
        if (msg.playerId !== s.playerId) s._emit("playerJoined", msg.playerId);
        break;
      case "player_left":
        s.players = (s.players || []).filter(function(p) { return p !== msg.playerId; });
        s._emit("playerLeft", msg.playerId);
        break;
      case "game_started":
        s.state = "playing";
        s._emit("stateChange", "playing");
        break;
      case "game_ended":
        s.state = "ended";
        s._emit("stateChange", "ended");
        break;
      case "host_assigned":
        s.isHost = (msg.playerId === s.playerId);
        s._emit("hostAssigned", msg.playerId);
        break;
      case "error":
        console.error("[NetworkSession] Server error: " + msg.message);
        break;
    }
  });

  s.createRoom = function() {
    s.transport.send({ type: "create_room" });
  };
  s.joinRoom = function(roomId) {
    s.transport.send({ type: "join_room", roomId: roomId });
  };
  s.startGame = function() {
    s.transport.send({ type: "start_game", roomId: s.roomId });
  };
  s.leaveRoom = function() {
    s.transport.send({ type: "leave_room", roomId: s.roomId });
    s.state = "ended";
  };

  s.on = function(event, cb) {
    if (s._listeners[event]) s._listeners[event].push(cb);
  };
  s._emit = function(event, data) {
    (s._listeners[event] || []).forEach(function(cb) { cb(data); });
  };

  return s;
};

function generateId() {
  return "p_" + Math.random().toString(36).substring(2, 10);
}

g.GameCastleNetworkSession = NetworkSession;
})(gdjs);
