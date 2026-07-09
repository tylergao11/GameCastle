var TickIntentRuntime = require("../ai/network-runtime/tick-intent-runtime").GameCastleTickIntentRuntime;

var p1 = new TickIntentRuntime({ inputDelay: 0, localSlot: "p1", remoteSlot: "p2" });
p1.setLocalPlayer("p1", "p1");
p1.setPeerPlayer("p2", "p2");
p1.captureLocalIntent({ move_right: true });
p1.receiveRemoteIntent("p2", { tick: 0, intent: { move_left: true } });

var frames = p1.nextLockstepTicks();
if (frames.length !== 1 || !frames[0].inputs.p1_move_right || !frames[0].inputs.p2_move_left) {
  console.error("FAIL tick_intent_runtime");
  process.exit(1);
}

console.log("PASS tick_intent_runtime");
