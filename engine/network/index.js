// engine/network/index.js
// Entry point. Reads preset config, wires transport + session + channels + bridge.
var gdjs;(function(g) {
var GameCastleNetwork = {};


// ---- Preset configurations (6 interaction modes) ----
var PRESETS = {
  // 1. Turn-based & event-driven. Server validates every action.
  "event-room": {
    label: "Turn-based or event-driven. Server validates every action.",
    gameChannels: [
      {
        name: "game_event",
        subset: null,   // events are sent manually via network.sendEvent()
        frequency: "manual",
        direction: "both"
      }
    ],
    inboundChannel: "game_event"
  },

  // 2. Host screen mirrored to all clients. Periodic full-state snapshots.
  "host-snapshot": {
    label: "Host sends full game state snapshots to all clients at ~10fps.",
    gameChannels: [
      {
        name: "state_snapshot",
        subset: function(scene) {
          return scene.getNetworkSyncData({
            playerNumber: 1,
            isHost: true,
            syncLayers: true,
            syncSceneTimers: true,
            syncOnceTriggers: true,
            syncAsyncTasks: true,
            syncSceneVisualProps: true,
            syncGameVariables: true
          });
        },
        frequency: { type: "periodic", intervalMs: 100 },
        direction: "out"
      }
    ],
    inboundChannel: "state_snapshot"
  },

  // 3. Deterministic lockstep. P2P input forwarding, frame-accurate.
  "p2p-lockstep": {
    label: "Deterministic lockstep via P2P input forwarding. (WebRTC placeholder)",
    gameChannels: [
      {
        name: "player_input",
        subset: function(scene) {
          return { _tick: 0, inputs: {} };
        },
        frequency: "tick",
        direction: "both"
      }
    ],
    inboundChannel: "player_input"
  },

  // 4. Server is the only source of truth. Clients are remote controllers.
  "server-authoritative": {
    label: "Server-authoritative with client-side input forwarding.",
    gameChannels: [
      {
        name: "player_input",
        subset: function(scene) {
          return { _tick: 0, inputs: {} };
        },
        frequency: "tick",
        direction: "out"
      },
      {
        name: "server_state",
        subset: null,
        frequency: { type: "periodic", intervalMs: 50 },
        direction: "in"
      }
    ],
    inboundChannel: "server_state"
  },

  // 5. Each player owns their own world. Cross-player events via relay.
  "peer-event": {
    label: "Each player owns their world. Events relayed through server.",
    gameChannels: [
      {
        name: "peer_event",
        subset: null,   // events sent manually via network.sendPeerEvent()
        frequency: "manual",
        direction: "both"
      }
    ],
    inboundChannel: "peer_event"
  },

  // 6. State persisted on server. Loaded on connect. No real-time sync.
  "async-state": {
    label: "State saved to server and loaded by others on demand.",
    gameChannels: [
      {
        name: "async_state",
        subset: null,   // saved/loaded manually via network.saveState() / loadState()
        frequency: "manual",
        direction: "both"
      }
    ],
    inboundChannel: "async_state"
  }
};

// ---- Init ----
// config: { preset, signalingUrl, gameUrl?, roomId?, isHost? }
GameCastleNetwork.init = function(config) {
  if (!config || !config.preset) {
    throw new Error("GameCastleNetwork.init requires a preset name");
  }
  var preset = PRESETS[config.preset];
  if (!preset) {
    throw new Error("Unknown network preset: " + config.preset);
  }

  // 1. Create control transport (talks to signaling server)
  var ctrlTransport = new g.GameCastleNetworkTransport.WebSocket(
    config.signalingUrl || "ws://localhost:3001/signal"
  );

  // 2. Create session
  var session = g.GameCastleNetworkSession.create({
    roomId:    config.roomId,
    playerId:  config.playerId,
    isHost:    config.isHost || false,
    transport: ctrlTransport,
    players:   []
  });

  // 3. Create game transport (carries sync data; can be same as control or separate)
  var gameTransport;
  if (config.gameUrl) {
    gameTransport = new g.GameCastleNetworkTransport.WebSocket(config.gameUrl);
  } else {
    // Default: reuse control transport for game data (simple relay)
    gameTransport = ctrlTransport;
  }

  // 4. Create channels from preset
  var channels = [];
  var inboundMap = {};
  (preset.gameChannels || []).forEach(function(chCfg) {
    var ch = g.GameCastleNetworkChannel.create({
      name:       chCfg.name,
      subset:     chCfg.subset,
      frequency:  chCfg.frequency,
      direction:  chCfg.direction,
      transport:  gameTransport
    });
    channels.push(ch);
    if (chCfg.direction === "both" || chCfg.direction === "in") {
      inboundMap[chCfg.name] = ch;
    }
    g.GameCastleNetworkBridge.register(ch);
  });

  // 5. Wire game transport incoming messages to channels
  if (gameTransport !== ctrlTransport) {
    gameTransport.onMessage(function(msg) {
      if (msg.type === "sync" && msg.channel && inboundMap[msg.channel]) {
        inboundMap[msg.channel].receive(msg);
      }
    });
  } else {
    // Shared transport: distinguish control vs sync messages
    ctrlTransport.onMessage(function(msg) {
      // Handled by session already for control messages.
      // For sync messages on shared transport:
      if (msg.type === "sync" && msg.channel && inboundMap[msg.channel]) {
        inboundMap[msg.channel].receive(msg);
      }
    });
  }

  // 6. Connect transport(s)
  ctrlTransport.connect();
  if (gameTransport !== ctrlTransport) {
    gameTransport.connect();
  }

  // 7. Install GDJS bridge hooks
  g.GameCastleNetworkBridge.install();

  // ---- Public API ----
  return {
    session:    session,
    channels:   channels,
    transport:  gameTransport,
    preset:     preset,

    // Send a manual event (for event-room, peer-event presets)
    sendEvent: function(eventName, data, targetPlayerId) {
      gameTransport.send({
        type: "sync",
        channel: config.preset === "peer-event" ? "peer_event" : "game_event",
        data: { event: eventName, payload: data, target: targetPlayerId || null }
      });
    },

    // For peer-event: send an event targeting a specific player
    sendPeerEvent: function(eventName, data, targetPlayerId) {
      gameTransport.send({
        type: "sync",
        channel: "peer_event",
        data: { event: eventName, payload: data, target: targetPlayerId }
      });
    },

    // For host-snapshot: trigger a snapshot manually if needed
    sendSnapshot: function() {
      if (channels.length > 0 && channels[0].send) {
        var scene = getCurrentScene();
        if (scene) channels[0].send(channels[0].subset(scene));
      }
    },

    // For async-state: save current state to server
    saveState: function(state) {
      gameTransport.send({
        type: "sync",
        channel: "async_state",
        data: { action: "save", state: state }
      });
    },

    // For async-state: request state from server
    loadState: function(playerId) {
      gameTransport.send({
        type: "sync",
        channel: "async_state",
        data: { action: "load", playerId: playerId }
      });
    },

    destroy: function() {
      ctrlTransport.close();
      if (gameTransport !== ctrlTransport) gameTransport.close();
    }
  };
};

function getCurrentScene() {
  // Best-effort: try to find the active runtime scene
  if (typeof gdjs !== "undefined" && gdjs.RuntimeGame) {
    // SceneStack is accessed through the game instance, which we don't have here.
    // The channel's subset function receives the scene from the bridge callback.
    return null;
  }
  return null;
}

g.GameCastleNetwork = GameCastleNetwork;
})(gdjs);
