// GameCastle Signaling Server
// Single port, all games. Room management + message relay only.
// Does NOT run game logic.

const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 3001;

// ---- State ----
const rooms = {};
const playerRooms = new Map();

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function broadcast(room, msg, excludeWs) {
  room.players.forEach(function (pWs) {
    if (pWs !== excludeWs) send(pWs, msg);
  });
}

// ---- Server ----
const wss = new WebSocketServer({ port: PORT });
console.log('[Signal] Port ' + PORT);

wss.on('connection', function (ws) {
  var rid = null, pid = null;

  ws.on('message', function (raw) {
    var m;
    try { m = JSON.parse(raw.toString()); } catch (e) { return; }

    switch (m.type) {
      case 'create_room': {
        rid = uid();
        rooms[rid] = { id: rid, players: new Map() };
        send(ws, { type: 'room_created', roomId: rid });
        break;
      }
      case 'join_room': {
        var room = rooms[m.roomId];
        if (!room) { send(ws, { type: 'error', error: 'room not found' }); break; }
        rid = m.roomId;
        pid = m.playerId || uid();
        room.players.set(pid, ws);
        playerRooms.set(ws, rid);
        send(ws, { type: 'joined', roomId: rid, playerId: pid });
        broadcast(room, { type: 'player_joined', playerId: pid }, ws);
        break;
      }
      case 'leave_room': {
        var room = rooms[rid];
        if (room) {
          room.players.delete(pid);
          broadcast(room, { type: 'player_left', playerId: pid });
          if (room.players.size === 0) delete rooms[rid];
        }
        playerRooms.delete(ws);
        rid = null; pid = null;
        break;
      }
      case 'relay': {
        var room = rooms[rid];
        if (!room) break;
        if (m.target) {
          var tws = room.players.get(m.target);
          if (tws) send(tws, { type: 'relay', from: pid, data: m.data });
        } else {
          broadcast(room, { type: 'relay', from: pid, data: m.data }, ws);
        }
        break;
      }
      case 'sync': {
        var room = rooms[rid];
        if (!room) break;
        broadcast(room, { type: 'sync', from: pid, channel: m.channel, data: m.data }, ws);
        break;
      }
    }
  });

  ws.on('close', function () {
    var rid2 = playerRooms.get(ws);
    if (rid2 && rooms[rid2]) {
      rooms[rid2].players.delete(pid);
      broadcast(rooms[rid2], { type: 'player_left', playerId: pid });
      if (rooms[rid2].players.size === 0) delete rooms[rid2];
    }
    playerRooms.delete(ws);
  });
});
