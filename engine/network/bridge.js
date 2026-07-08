// engine/network/bridge.js
// Hooks into GDJS game loop. Runs channels pre/post events each frame.
var gdjs;(function(g) {
var NetworkBridge = {};

// Channels registered for the current game instance
var _channels = [];

NetworkBridge.register = function(channel) {
  _channels.push(channel);
};

// Called once during game init to install GDJS callbacks
NetworkBridge.install = function() {
  // Pre-events: apply incoming network data before game logic runs
  g.registerRuntimeScenePreEventsCallback(function(scene) {
    for (var i = 0; i < _channels.length; i++) {
      _channels[i].applyIncoming(scene);
    }
  });

  // Post-events: collect and send outgoing data after game logic
  g.registerRuntimeScenePostEventsCallback(function(scene) {
    for (var i = 0; i < _channels.length; i++) {
      _channels[i].sendOutgoing(scene);
    }
  });
};

g.GameCastleNetworkBridge = NetworkBridge;
})(gdjs);
