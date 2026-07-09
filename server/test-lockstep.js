var FrameSyncSession = require("../ai/network-runtime/frame-sync").GameCastleFrameSyncSession;

var p1 = new FrameSyncSession({ inputDelay: 0, localSlot: "p1", remoteSlot: "p2" });
p1.setLocalPlayer("p1", "p1");
p1.setPeerPlayer("p2", "p2");
p1.captureLocalFrame({ move_right: true });
p1.receiveRemoteFrame("p2", { tick: 0, inputs: { move_left: true } });

var frames = p1.nextLockstepFrames();
if (frames.length !== 1 || !frames[0].inputs.p1_move_right || !frames[0].inputs.p2_move_left) {
  console.error("FAIL frame_sync_template");
  process.exit(1);
}

console.log("PASS frame_sync_template");
