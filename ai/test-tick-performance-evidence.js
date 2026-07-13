var assert = require('assert');
var GameCastleRuntimeAdapter = require('./network-runtime/runtime-adapter').GameCastleRuntimeAdapter;

function installAnimationFrame() {
  var callbacks = [];
  var now = performance.now();
  global.requestAnimationFrame = function(fn) { callbacks.push(fn); return callbacks.length; };
  global.cancelAnimationFrame = function() {};
  return {
    step: function(deltaMs) {
      now += deltaMs;
      var pending = callbacks.slice();
      callbacks = [];
      pending.forEach(function(fn) { fn(now); });
    }
  };
}

function game() {
  return {
    getSceneStack: function() { return { step: function() { return true; }, renderWithoutStep: function() {}, getCurrentScene: function() { return null; } }; },
    getInputManager: function() { return { isKeyPressed: function() { return false; }, releaseAllPressedKeys: function() {}, onKeyPressed: function() {}, onFrameEnded: function() {} }; },
    getRenderer: function() { return {}; }
  };
}

var raf = installAnimationFrame();
var adapter = new GameCastleRuntimeAdapter(game());
adapter.init({ tickPolicy: { simulationHz: 60, maxCatchUpTicks: 5 } });
adapter.startLoop(function() { return true; });
raf.step(1000 / 60);
raf.step(500);
var report = adapter.getPerformanceReport();
adapter.stopLoop();

assert.strictEqual(report.elapsedMs > 500, true, 'report must use actual elapsed wall time');
assert.strictEqual(report.observedRenderHz > 0, true, 'report must derive render Hz from observed frames');
assert.strictEqual(report.missedTickCount > 0, true, 'a 500ms frame must create observable performance debt');
assert.strictEqual(report.debt.code, 'TICK_CATCH_UP_BUDGET_EXCEEDED', 'overload must identify the catch-up-budget owner route');
console.log('PASS tick_performance_evidence');
