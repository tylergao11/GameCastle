var assert = require("assert");

global.GameCastleRuntimeAdapter = require("../../ai/network-runtime/runtime-adapter").GameCastleRuntimeAdapter;
var GameCastleTickIntentBridge = require("../../ai/network-runtime/tick-intent-bridge").GameCastleTickIntentBridge;

function installAnimationFrame() {
  var callbacks = [];
  var now = performance.now();
  global.requestAnimationFrame = function(fn) {
    callbacks.push(fn);
    return callbacks.length;
  };
  global.cancelAnimationFrame = function() {};
  return {
    step: function(deltaMs) {
      now += deltaMs;
      var pending = callbacks.slice();
      callbacks = [];
      pending.forEach(function(fn) { fn(now); });
    },
  };
}

function makeFakeGame() {
  var pressed = { 39: true };
  var steps = 0;
  var injected = [];
  var inputManager = {
    isKeyPressed: function(code) { return !!pressed[code]; },
    releaseAllPressedKeys: function() { pressed = {}; },
    onKeyPressed: function(code) { pressed[code] = true; },
    onFrameEnded: function() { injected.push({ right: !!pressed[39] }); },
  };
  return {
    getSceneAndExtensionsData: function() { return { sceneData: { name: "Game" } }; },
    getSceneStack: function() {
      return {
        replace: function() {},
        step: function() { steps++; return true; },
        renderWithoutStep: function() {},
        getCurrentScene: function() { return null; },
      };
    },
    getInputManager: function() { return inputManager; },
    getRenderer: function() { return {}; },
    _test: {
      steps: function() { return steps; },
      injected: function() { return injected.slice(); },
    },
  };
}

var raf = installAnimationFrame();
var game = makeFakeGame();
var bridge = new GameCastleTickIntentBridge({
  inputs: ["move_right"],
  tickRate: 60,
  sync: "local",
});

var advances = [];
var events = [];
bridge.on("advance", function(tick, inputs, meta) {
  advances.push({ tick: tick, inputs: inputs, meta: meta });
});
bridge.on("events", function(tick, list) {
  events.push({ tick: tick, list: list });
});

bridge.attach(game);
bridge.start();
raf.step(60);

assert.strictEqual(game._test.steps(), 3, "60Hz local bridge should advance three ticks in 60ms");
assert.strictEqual(advances.length, 3, "60Hz local bridge should emit every ready tick");
assert.strictEqual(advances[0].tick, 0, "local ready tick should start at zero");
assert.strictEqual(advances[0].inputs.p1_move_right, true, "local intent should be slotted through tick runtime");
assert(events.length >= 1, "local bridge should expose tick runtime event log");
assert(bridge.getTickStats().eventCount >= 2, "tick runtime should record intent and advance events");
bridge.detach();

console.log("PASS tick_intent_bridge_local");
