// engine/network/channel.js
// A Channel connects a subset of game state to a transport, at a given frequency.
// subset: (runtimeScene) => data    — what to sync
// frequency: "tick" | { type:"periodic", intervalMs:N } | "manual"
// direction: "out" | "in" | "both"
var gdjs;(function(g) {
var NetworkChannel = {};

NetworkChannel.create = function(config) {
  var ch = {
    name:       config.name,
    subset:     config.subset,      // function(runtimeScene) -> data
    frequency:  config.frequency,   // "tick" | { type:"periodic", intervalMs:N } | "manual"
    direction:  config.direction || "both",
    transport:  config.transport,   // control or game transport instance
    _lastSend:  0,
    _incoming:  [],                 // queue of received messages to apply
    _pendingOut: null,              // latest outgoing data (for "tick" mode, throttled)
    _tickSeq:   0                   // sequence number for ordering
  };

  // ---- Outgoing ----
  ch.sendOutgoing = function(scene) {
    if (ch.direction !== "out" && ch.direction !== "both") return;
    if (!ch.subset) return;

    var now = performance.now();

    if (ch.frequency === "tick") {
      // Every frame: capture and send
      ch._tickSeq++;
      var data = ch.subset(scene);
      data._tick = ch._tickSeq;
      ch._transportSend(data);
    } else if (ch.frequency && ch.frequency.type === "periodic") {
      // Periodic: throttle by interval
      if (now - ch._lastSend >= ch.frequency.intervalMs) {
        ch._lastSend = now;
        var data = ch.subset(scene);
        ch._transportSend(data);
      }
    }
    // "manual": caller calls ch.send(data) directly
  };

  ch.send = function(data) {
    ch._transportSend(data);
  };

  ch._transportSend = function(data) {
    if (!ch.transport) return;
    ch.transport.send({
      type: "sync",
      channel: ch.name,
      data: data
    });
  };

  // ---- Incoming ----
  ch.applyIncoming = function(scene) {
    if (ch.direction !== "in" && ch.direction !== "both") return;
    while (ch._incoming.length > 0) {
      var msg = ch._incoming.shift();
      if (!msg || !msg.data) continue;
      // Apply to GDJS runtime
      if (scene && scene.updateFromNetworkSyncData) {
        scene.updateFromNetworkSyncData(msg.data, { clearInputs: false });
      }
    }
  };

  ch.receive = function(msg) {
    ch._incoming.push(msg);
  };

  return ch;
};

g.GameCastleNetworkChannel = NetworkChannel;
})(gdjs);
