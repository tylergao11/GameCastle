var assert = require("assert");
var ServerOrderedInputSession = require("../../apps/multiplayer/src/server-ordered-input").ServerOrderedInputSession;
var GameLoop = require("../../apps/multiplayer/src/game-loop").GameLoop;

function testSessionOrdersFramesAndDropsLateInputs() {
  var session = new ServerOrderedInputSession({ historySize: 3 });
  assert.strictEqual(session.submitInput("p1", 1, { right: true }), true);
  assert.strictEqual(session.collectReadyFrames().length, 0, "tick 1 should wait for tick 0");
  assert.strictEqual(session.submitInput("p2", 0, { left: true }), true);

  var frames = session.collectReadyFrames();
  assert.deepStrictEqual(frames.map(function(frame) { return frame.tick; }), [0, 1]);
  assert.strictEqual(frames[0].inputs.p2.left, true);
  assert.strictEqual(frames[1].inputs.p1.right, true);
  assert.strictEqual(session.submitInput("p1", 0, { stale: true }), false, "late processed ticks should be dropped");
}

function testGameLoopUsesOrderedInputSession() {
  var emitted = [];
  var loop = new GameLoop({
    tickRate: 60,
    onTick: function(inputs, tick) {
      emitted.push({ inputs: inputs, tick: tick });
    },
  });
  loop.submitInput("p1", 0, { fire: true });
  loop._processReadyTicks();
  assert.strictEqual(emitted.length, 1);
  assert.strictEqual(emitted[0].tick, 0);
  assert.strictEqual(emitted[0].inputs.p1.fire, true);
  assert(loop.getSession(), "game loop should expose canonical ordered-input session");
}

testSessionOrdersFramesAndDropsLateInputs();
testGameLoopUsesOrderedInputSession();

console.log("PASS server_ordered_input");
