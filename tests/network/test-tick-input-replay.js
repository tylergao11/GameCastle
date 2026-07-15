var assert = require('assert');

global.GameCastleRuntimeAdapter = require('../../ai/network-runtime/runtime-adapter').GameCastleRuntimeAdapter;
var GameCastleTickIntentBridge = require('../../ai/network-runtime/tick-intent-bridge').GameCastleTickIntentBridge;

function makeGame() {
  var pressed = {};
  var steps = 0;
  var input = {
    isKeyPressed: function(code) { return !!pressed[code]; },
    releaseAllPressedKeys: function() { pressed = {}; },
    onKeyPressed: function(code) { pressed[code] = true; },
    onFrameEnded: function() {}
  };
  return {
    getSceneAndExtensionsData: function() { return { sceneData: { name: 'Game' } }; },
    getSceneStack: function() { return { replace: function() {}, step: function() { steps++; return true; }, renderWithoutStep: function() {}, getCurrentScene: function() { return null; } }; },
    getInputManager: function() { return input; },
    getRenderer: function() { return {}; },
    _test: { steps: function() { return steps; } }
  };
}

function buildBridge(game) {
  var bridge = new GameCastleTickIntentBridge({ inputs: ['jump'], tickRate: 60, sync: 'local' });
  bridge.attach(game);
  return bridge;
}

function verifyCanonicalTapReplay() {
  var source = buildBridge(makeGame());
  // A tap is expressed in game ticks, never wall-clock milliseconds.
  source.setVirtualInput('jump', true);
  source.releaseVirtualInputAfter('jump', 2);
  source._running = true;
  source._onLocalTick(50, 1);
  source._onLocalTick(50, 2);
  source._onLocalTick(50, 3);
  source.detach();

  var receipt = source.exportReplayReceipt();
  assert.strictEqual(receipt.kind, 'gamecastle.tick-input-replay', 'receipt must be a canonical tick replay artifact');
  assert.deepStrictEqual(receipt.frames.slice(0, 3).map(function(frame) { return !!frame.inputs.p1_jump; }), [true, true, false], 'tap must hold exactly two tick frames before release');
  assert.deepStrictEqual(receipt.frames.slice(0, 3).map(function(frame) { return !!frame.observedInputs.p1_jump; }), [true, true, false], 'engine input state must match captured tick frames');

  var replayGame = makeGame();
  var replayBridge = buildBridge(replayGame);
  var replayed = replayBridge.replayReceipt(receipt);
  assert.deepStrictEqual(replayed, receipt.frames, 'a receipt must replay the same injected inputs and state hashes');
  assert.strictEqual(replayGame._test.steps(), receipt.frames.length, 'replay must advance exactly one simulation step per recorded tick');
  return {
    kind: receipt.kind,
    tickRate: receipt.tickRate,
    frameCount: receipt.frames.length,
    jumpFrames: receipt.frames.map(function(frame) { return !!frame.inputs.p1_jump; }),
    replayedFrameCount: replayed.length
  };
}

if (require.main === module) {
  verifyCanonicalTapReplay();
  console.log('PASS tick_input_replay');
}

module.exports = { verifyCanonicalTapReplay: verifyCanonicalTapReplay };
