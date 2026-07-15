var assert = require("assert");
var adapterModule = require("../../ai/network-runtime/runtime-adapter");

var GameCastleRuntimeAdapter = adapterModule.GameCastleRuntimeAdapter;

function makeFakeGame() {
  var pressed = {};
  var pressedCalls = [];
  var released = false;
  return {
    getSceneStack: function () {
      return {
        step: function () { return true; },
        renderWithoutStep: function () {},
      };
    },
    getInputManager: function () {
      return {
        isKeyPressed: function (code) { return !!pressed[code]; },
        releaseAllPressedKeys: function () { released = true; pressed = {}; },
        onKeyPressed: function (code) { pressedCalls.push(code); pressed[code] = true; },
        onFrameEnded: function () {},
      };
    },
    getRenderer: function () { return {}; },
    _test: {
      setPressed: function (code, value) { pressed[code] = value; },
      getPressedCalls: function () { return pressedCalls.slice(); },
      wasReleased: function () { return released; },
    },
  };
}

var game = makeFakeGame();
var adapter = new GameCastleRuntimeAdapter(game);
adapter.init({
  inputs: ["p1_move_up", "p1_move_down", "p1_move_left", "p1_move_right", "p1_shoot", "p2_move_up", "p2_move_down", "p2_move_left", "p2_move_right", "p2_shoot"],
  captureInputs: ["move_up", "move_down", "move_left", "move_right", "shoot"],
  tickRate: 60,
});

game._test.setPressed(38, true);
game._test.setPressed(32, true);
var frame = adapter.captureInputs();
assert.strictEqual(frame.move_up, true, "move_up should read ArrowUp keyCode");
assert.strictEqual(frame.shoot, true, "shoot should read Space keyCode");
assert.strictEqual(frame.move_down, false, "move_down should be false when keyCode is not pressed");

adapter.injectInputs({ p1_move_left: true, p1_shoot: true, p2_move_up: true, p2_shoot: true }, false);
assert(game._test.wasReleased(), "remote injection should clear previous pressed keys");
assert.deepStrictEqual(game._test.getPressedCalls(), [37, 32, 87, 70], "remote injection should press GDJS keyCodes in declared input order");

console.log("PASS runtime_adapter_keycode_mapping");
