var assert = require("assert");
var FrameSync = require("./network-runtime/frame-sync").GameCastleFrameSyncSession;

function testLockstepSlotsAndDelay() {
  var session = new FrameSync({ inputDelay: 0, redundancy: 2, localSlot: "p1", remoteSlot: "p2" });
  session.setLocalPlayer("host", "p1");
  session.setPeerPlayer("join", "p2");

  session.captureLocalFrame({ move_right: true, shoot: true });
  session.receiveRemoteFrame("join", { tick: 0, inputs: { move_up: true }, ack: -1 });

  var frames = session.nextLockstepFrames();
  assert.strictEqual(frames.length, 1, "lockstep should advance when local and remote inputs exist");
  assert.strictEqual(frames[0].inputs.p1_move_right, true, "local command should map to p1 slot");
  assert.strictEqual(frames[0].inputs.p1_shoot, true, "local shoot should map to p1 slot");
  assert.strictEqual(frames[0].inputs.p2_move_up, true, "remote command should map to p2 slot");
  assert.strictEqual(frames[0].inputs.move_up, undefined, "generic remote command should not leak into replay frame");
}

function testRedundantPacketFillsFrameGap() {
  var session = new FrameSync({ inputDelay: 0, redundancy: 3, localSlot: "p1", remoteSlot: "p2" });
  session.setLocalPlayer("host", "p1");
  session.setPeerPlayer("join", "p2");

  session.captureLocalFrame({ move_right: true });
  session.captureLocalFrame({ move_down: true });
  session.captureLocalFrame({ shoot: true });

  session.receiveRemoteFrame("join", {
    tick: 2,
    inputs: { shoot: true },
    prev: {
      0: { move_left: true },
      1: { move_up: true },
    },
    ack: 1,
  });

  var frames = session.nextLockstepFrames();
  assert.deepStrictEqual(frames.map(function(frame) { return frame.tick; }), [0, 1, 2], "redundant packet should fill earlier missing frames");
  assert.strictEqual(frames[0].inputs.p2_move_left, true, "tick 0 should use redundant remote input");
  assert.strictEqual(frames[1].inputs.p2_move_up, true, "tick 1 should use redundant remote input");
  assert.strictEqual(frames[2].inputs.p2_shoot, true, "tick 2 should use current remote input");
}

function testDisconnectFreezesAndReconnectResumes() {
  var session = new FrameSync({ inputDelay: 0, redundancy: 3, localSlot: "p1", remoteSlot: "p2" });
  session.setLocalPlayer("host", "p1");
  session.setPeerPlayer("join", "p2");

  session.captureLocalFrame({ move_right: true });
  session.setConnected(false);
  session.receiveRemoteFrame("join", { tick: 0, inputs: { move_up: true } });
  assert.strictEqual(session.nextLockstepFrames().length, 0, "disconnected session should not advance simulation");

  session.setConnected(true);
  var frames = session.nextLockstepFrames();
  assert.strictEqual(frames.length, 1, "reconnected session should resume from buffered frame");
  assert.strictEqual(frames[0].inputs.p1_move_right, true);
  assert.strictEqual(frames[0].inputs.p2_move_up, true);
}

function testAuthoritySlotMapping() {
  var session = new FrameSync({ inputDelay: 0, localSlot: "p2", remoteSlot: "p1" });
  session.setLocalPlayer("join", "p2");
  session.setPeerPlayer("host", "p1");
  session.captureLocalFrame({ move_down: true });
  session.receiveOrderedFrame(0, {
    host: { move_right: true },
    join: { move_down: true },
  });

  var frames = session.nextAuthorityFrames();
  assert.strictEqual(frames.length, 1, "authority mode should advance ordered frames");
  assert.strictEqual(frames[0].inputs.p1_move_right, true, "host should map to p1");
  assert.strictEqual(frames[0].inputs.p2_move_down, true, "join should map to p2");
}

testLockstepSlotsAndDelay();
testRedundantPacketFillsFrameGap();
testDisconnectFreezesAndReconnectResumes();
testAuthoritySlotMapping();

console.log("PASS frame_sync_session");
