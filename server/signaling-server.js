// GameCastle Signaling Server
// WebSocket transport + message routing + handler composition.
//
// Architecture:
//   StateStore  — pure key-value persistence (state-store.js)
//   GameLoop    — tick-driven input ordering (game-loop.js)
//   Room        — players + store + validator + game loop (room.js)
//   Server      — transport + schema + routing (this file)

const { WebSocketServer } = require("ws");
const { Room } = require("./room");

// ── Config ────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;

// ── Helpers ───────────────────────────────────────────────────��───────────
const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const send = (ws, msg) => {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
};

// ── Schema ───────────────────────────────────────────────────��────────────
const SCHEMA = {
  create_room:  {},
  join_room:    { required: ["roomId"] },
  leave_room:   {},
  relay:        {},
  sync:         {},
  save_state:   { required: ["key"] },
  load_state:   { required: ["playerId", "key"] },
  list_states:  {},
  send_event:   { required: ["name"] },
  game_input:   { required: ["tick"] },
};

const validate = (msg) => {
  const rules = SCHEMA[msg.type];
  if (!rules) return `unknown message type: ${msg.type}`;
  for (const field of rules.required || []) {
    if (msg[field] == null) return `missing required field: ${field}`;
  }
  return null;
};

// ── Server State ──────────────────────────────────────────────────────────
const rooms = new Map();   // roomId → Room
const conns = new Map();   // ws → { roomId, playerId }

// ── Handlers ───────────────────────────────────────────────────��──────────

const handlers = {

  create_room(ctx, msg) {
    const roomId = uid();
    const room = new Room(roomId, {
      tickRate: msg.tickRate || 0,
      maxPlayers: msg.maxPlayers || 0,
      inputDelay: msg.inputDelay || 2,
      eventValidator: msg.eventValidator || null,
    });
    room.setSender(send);
    ctx.rooms.set(roomId, room);
    ctx.roomId = roomId;
    return { type: "room_created", roomId };
  },

  join_room(ctx, msg) {
    const room = ctx.rooms.get(msg.roomId);
    if (!room) return { type: "error", error: "room not found" };

    const playerId = msg.playerId || uid();
    try {
      room.add(playerId, ctx.ws);
    } catch (e) {
      return { type: "error", error: e.message };
    }
    ctx.conns.set(ctx.ws, { roomId: msg.roomId, playerId });
    ctx.roomId = msg.roomId;
    ctx.playerId = playerId;

    room.forEach((_ws, existingPid) => {
      if (existingPid !== playerId) {
        send(ctx.ws, { type: "player_joined", playerId: existingPid });
      }
    });
    room.broadcast({ type: "player_joined", playerId }, ctx.ws);
    return { type: "joined", roomId: msg.roomId, playerId };
  },

  leave_room(ctx) {
    const room = ctx.rooms.get(ctx.roomId);
    if (room) {
      room.remove(ctx.playerId);
      room.broadcast({ type: "player_left", playerId: ctx.playerId });
      if (room.isEmpty) {
        room.destroy();
        ctx.rooms.delete(ctx.roomId);
      }
    }
    ctx.conns.delete(ctx.ws);
    ctx.roomId = null;
    ctx.playerId = null;
    return null;
  },

  // relay / sync — shared data broadcast.
  //   relay: general game data. Optional `target` for directed messages.
  //   sync:  channel-based coordination (response preserves type:"sync" for client routing).
  relay(ctx, msg) {
    const room = ctx.rooms.get(ctx.roomId);
    if (!room) return null;
    if (!msg.target && msg.type === "sync") {
      // sync is always broadcast on a named channel
      room.broadcast(
        { type: "sync", from: ctx.playerId, channel: msg.channel, data: msg.data },
        ctx.ws
      );
      return null;
    }
    const payload = { type: "relay", from: ctx.playerId, data: msg.data };
    if (msg.channel) payload.channel = msg.channel;
    if (msg.target) {
      room.sendTo(msg.target, payload);
    } else {
      room.broadcast(payload, ctx.ws);
    }
    return null;
  },

  // sync delegates to relay — same underlying logic, different response type.
  sync(ctx, msg) {
    return handlers.relay(ctx, msg);
  },

  save_state(ctx, msg) {
    const room = ctx.rooms.get(ctx.roomId);
    if (!room) return { type: "error", error: "not in a room" };
    // Scope key by player for multi-tenant isolation
    const scopedKey = ctx.playerId ? ctx.playerId + "::" + msg.key : msg.key;
    room.saveState(scopedKey, msg.data);
    return { type: "state_saved", key: msg.key };
  },

  load_state(ctx, msg) {
    const room = ctx.rooms.get(ctx.roomId);
    if (!room) return { type: "error", error: "not in a room" };
    // Isolate state by playerId: key is scoped as playerId::key
    const scopedKey = msg.playerId ? msg.playerId + "::" + msg.key : msg.key;
    const value = room.loadState(scopedKey);
    if (value === undefined) {
      return { type: "error", error: "state not found: " + msg.key };
    }
    return { type: "state_loaded", key: msg.key, data: value };
  },

  list_states(ctx, msg) {
    const room = ctx.rooms.get(ctx.roomId);
    if (!room) return { type: "error", error: "not in a room" };
    return { type: "state_list", entries: room.listStates(msg.prefix || "") };
  },

  send_event(ctx, msg) {
    const room = ctx.rooms.get(ctx.roomId);
    if (!room) return { type: "error", error: "not in a room" };
    const err = room.validateEvent(msg.name, msg.payload, ctx.playerId);
    if (err) return { type: "error", error: "event rejected: " + err };
    room.broadcast(
      { type: "game_event", name: msg.name, payload: msg.payload, from: ctx.playerId },
      ctx.ws
    );
    return null;
  },

  game_input(ctx, msg) {
    const room = ctx.rooms.get(ctx.roomId);
    if (!room) return { type: "error", error: "not in a room" };
    if (room.hasGameLoop) {
      room.submitGameInput(ctx.playerId, msg.tick, msg.inputs);
    } else {
      room.broadcast(
        { type: "game_input", from: ctx.playerId, tick: msg.tick, inputs: msg.inputs },
        ctx.ws
      );
    }
    return null;
  },

};

// ── Server ────────────────────────────────────────────────────────────────
const wss = new WebSocketServer({ port: PORT });
console.log(`[Signal] :${PORT}`);

wss.on("connection", (ws) => {
  const ctx = { ws, roomId: null, playerId: null, rooms, conns };

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    const err = validate(msg);
    if (err) { send(ws, { type: "error", error: err }); return; }

    const handler = handlers[msg.type];
    if (!handler) {
      send(ws, { type: "error", error: `unknown type: ${msg.type}` });
      return;
    }

    const reply = handler(ctx, msg);
    if (reply) {
      if (msg._seq != null) reply._seq = msg._seq;
      send(ws, reply);
    }
  });

  ws.on("close", () => {
    if (ctx.roomId && ctx.playerId) {
      handlers.leave_room(ctx);
    } else if (ctx.roomId) {
      const room = ctx.rooms.get(ctx.roomId);
      if (room) { room.destroy(); ctx.rooms.delete(ctx.roomId); }
    }
  });
});

// ── Shutdown ──────────────────────────────────────────────────────────────
process.on("SIGINT", () => {
  console.log("[Signal] shutting down…");
  for (const room of rooms.values()) room.destroy();
  rooms.clear();
  wss.close(() => process.exit(0));
});

module.exports = { Room, wss };
