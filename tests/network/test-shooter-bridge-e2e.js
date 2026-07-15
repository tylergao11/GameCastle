var assert = require("assert");
var path = require("path");
var childProcess = require("child_process");

global.GameCastleRuntimeAdapter = require("../../ai/network-runtime/runtime-adapter").GameCastleRuntimeAdapter;
var GameCastleTickIntentBridge = require("../../ai/network-runtime/tick-intent-bridge").GameCastleTickIntentBridge;
var GameCastleTransport = require("../../ai/network-runtime/transport");

var PORT = 3007;
var SIGNALING_URL = "ws://localhost:" + PORT;

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function installAnimationFrame() {
  var nextId = 1;
  var timers = {};
  global.requestAnimationFrame = function (fn) {
    var id = nextId++;
    timers[id] = setTimeout(function () {
      delete timers[id];
      fn(performance.now());
    }, 16);
    return id;
  };
  global.cancelAnimationFrame = function (id) {
    if (timers[id]) clearTimeout(timers[id]);
    delete timers[id];
  };
}

function makeFakeShooterGame(name, heldCodes) {
  var pressed = {};
  var injectedFrames = [];
  var steps = 0;
  Object.keys(heldCodes || {}).forEach(function (code) {
    pressed[code] = !!heldCodes[code];
  });

  var inputManager = {
    isKeyPressed: function (code) { return !!pressed[code]; },
    releaseAllPressedKeys: function () { pressed = {}; },
    onKeyPressed: function (code) { pressed[code] = true; },
    onFrameEnded: function () {
      injectedFrames.push({
        up: !!pressed[38],
        down: !!pressed[40],
        left: !!pressed[37],
        right: !!pressed[39],
        shoot: !!pressed[32],
        w: !!pressed[87],
        a: !!pressed[65],
        s: !!pressed[83],
        d: !!pressed[68],
        f: !!pressed[70],
      });
    },
  };

  var sceneStack = {
    replace: function () {},
    step: function () {
      steps++;
      return true;
    },
    renderWithoutStep: function () {},
    getCurrentScene: function () { return null; },
  };

  return {
    getSceneAndExtensionsData: function () {
      return { sceneData: { name: name || "Game" } };
    },
    getSceneStack: function () { return sceneStack; },
    getInputManager: function () { return inputManager; },
    getRenderer: function () { return {}; },
    _test: {
      getSteps: function () { return steps; },
      getInjectedFrames: function () { return injectedFrames.slice(); },
    },
  };
}

async function waitFor(predicate, label, timeoutMs) {
  var started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await sleep(25);
  }
  throw new Error("timeout waiting for " + label);
}

async function main() {
  installAnimationFrame();

  var server = childProcess.fork(path.join(__dirname, "..", "..", "server", "signaling-server.js"), [], {
    env: Object.assign({}, process.env, { PORT: String(PORT) }),
    silent: true,
  });

  var hostBridge = null;
  var joinBridge = null;
  try {
    await sleep(500);

    var inputs = ["move_up", "move_down", "move_left", "move_right", "shoot"];
    var hostGame = makeFakeShooterGame("Game");
    var joinGame = makeFakeShooterGame("Game");

    hostBridge = new GameCastleTickIntentBridge({
      inputs: inputs,
      tickRate: 60,
      sync: "lockstep",
      transport: new GameCastleTransport(SIGNALING_URL),
      autoHost: false,
      inputDelay: 1,
    });
    joinBridge = new GameCastleTickIntentBridge({
      inputs: inputs,
      tickRate: 60,
      sync: "lockstep",
      transport: new GameCastleTransport(SIGNALING_URL),
      autoHost: false,
      inputDelay: 1,
    });

    hostBridge.attach(hostGame);
    joinBridge.attach(joinGame);
    hostBridge.setVirtualInput("move_right", true);
    hostBridge.setVirtualInput("shoot", true);
    joinBridge.setVirtualInput("move_up", true);
    hostBridge.start();
    joinBridge.start();

    var hosted = await hostBridge.host();
    await joinBridge.join(hosted.roomId);

    await waitFor(function () {
      return hostBridge.getReadyTick() >= 3 && joinBridge.getReadyTick() >= 3;
    }, "both bridges to advance lockstep ticks", 5000);

    assert(hostGame._test.getSteps() >= 3, "host fake GDJS scene should step");
    assert(joinGame._test.getSteps() >= 3, "join fake GDJS scene should step");

    var hostSawSlottedInputs = hostGame._test.getInjectedFrames().some(function (frame) {
      return frame.right && frame.shoot && frame.w && !frame.up;
    });
    var joinSawSlottedInputs = joinGame._test.getInjectedFrames().some(function (frame) {
      return frame.right && frame.shoot && frame.w && !frame.up;
    });
    assert(hostSawSlottedInputs, "host should replay host inputs as p1 and peer inputs as p2");
    assert(joinSawSlottedInputs, "joiner should replay peer inputs as p1 and local inputs as p2");

    console.log("PASS shooter_bridge_lockstep_e2e");
  } finally {
    if (hostBridge) hostBridge.detach();
    if (joinBridge) joinBridge.detach();
    server.kill();
  }
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
