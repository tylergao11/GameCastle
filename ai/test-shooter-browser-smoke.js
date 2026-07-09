var assert = require("assert");
var childProcess = require("child_process");
var fs = require("fs");
var http = require("http");
var path = require("path");
var os = require("os");
var WebSocket = require("ws");

var ROOT = path.join(__dirname, "..");
var CHROME_PATHS = [
  path.join(os.homedir(), "AppData", "Local", "ms-playwright", "chromium-1228", "chrome-win64", "chrome.exe"),
  path.join(os.homedir(), "AppData", "Local", "ms-playwright", "chromium-1227", "chrome-win64", "chrome.exe"),
  path.join(os.homedir(), "AppData", "Local", "Google", "Chrome", "Application", "chrome.exe"),
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];

var SIGNAL_PORT = 3001;
var OUTPUT_PORT = 4191;
var HOST_DEBUG_PORT = 9223;
var JOIN_DEBUG_PORT = 9224;

function findChrome() {
  for (var i = 0; i < CHROME_PATHS.length; i++) {
    if (fs.existsSync(CHROME_PATHS[i])) return CHROME_PATHS[i];
  }
  throw new Error("Chromium/Chrome executable not found");
}

function sleep(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

function httpJson(url, options) {
  options = options || {};
  return new Promise(function(resolve, reject) {
    var parsed = new URL(url);
    var req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: options.method || "GET",
    }, function(res) {
      var chunks = [];
      res.on("data", function(chunk) { chunks.push(chunk); });
      res.on("end", function() {
        var body = Buffer.concat(chunks).toString("utf8");
        try { resolve(JSON.parse(body)); } catch (e) { reject(new Error("invalid JSON from " + url + ": " + body.slice(0, 200))); }
      });
    });
    req.end();
    req.on("error", reject);
    req.setTimeout(options.timeout || 5000, function() {
      req.destroy(new Error("timeout: " + url));
    });
  });
}

function httpText(url, options) {
  options = options || {};
  return new Promise(function(resolve, reject) {
    var req = http.get(url, function(res) {
      var chunks = [];
      res.on("data", function(chunk) { chunks.push(chunk); });
      res.on("end", function() { resolve(Buffer.concat(chunks).toString("utf8")); });
    });
    req.on("error", reject);
    req.setTimeout(options.timeout || 5000, function() {
      req.destroy(new Error("timeout: " + url));
    });
  });
}

async function waitForHttp(url, label) {
  var lastError = null;
  for (var i = 0; i < 60; i++) {
    try {
      await httpText(url, { timeout: 1000 });
      return;
    } catch (e) {
      lastError = e;
      await sleep(250);
    }
  }
  throw new Error("timeout waiting for " + label + ": " + (lastError && lastError.message));
}

function createCdp(wsUrl) {
  var ws = new WebSocket(wsUrl);
  var seq = 0;
  var pending = {};
  var events = [];

  ws.on("message", function(raw) {
    var msg = JSON.parse(raw.toString());
    if (msg.id && pending[msg.id]) {
      var item = pending[msg.id];
      delete pending[msg.id];
      if (msg.error) item.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else item.resolve(msg.result || {});
      return;
    }
    events.push(msg);
  });

  function send(method, params) {
    return new Promise(function(resolve, reject) {
      var id = ++seq;
      pending[id] = { resolve: resolve, reject: reject };
      ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
    });
  }

  return new Promise(function(resolve, reject) {
    ws.on("open", function() {
      resolve({
        send: send,
        events: events,
        close: function() { ws.close(); },
      });
    });
    ws.on("error", reject);
  });
}

async function newPage(debugPort, targetUrl) {
  var target = await httpJson("http://127.0.0.1:" + debugPort + "/json/new?" + encodeURIComponent(targetUrl), { method: "PUT" });
  var cdp = await createCdp(target.webSocketDebuggerUrl);
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  await cdp.send("Log.enable");
  return cdp;
}

async function launchChrome(chromePath, debugPort) {
  var profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "gc-shooter-browser-"));
  var chrome = childProcess.spawn(chromePath, [
    "--headless=new",
    "--remote-debugging-port=" + debugPort,
    "--user-data-dir=" + profileDir,
    "--disable-gpu",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank"
  ], { stdio: "ignore" });
  await waitForHttp("http://127.0.0.1:" + debugPort + "/json/version", "chrome debugging " + debugPort);
  return chrome;
}

async function evalInPage(cdp, expression) {
  var result = await cdp.send("Runtime.evaluate", {
    expression: expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error("page eval failed: " + JSON.stringify(result.exceptionDetails));
  }
  return result.result ? result.result.value : undefined;
}

async function waitForPage(cdp, predicateExpression, label, timeoutMs) {
  var started = Date.now();
  while (Date.now() - started < timeoutMs) {
    var ok = await evalInPage(cdp, predicateExpression).catch(function() { return false; });
    if (ok) return;
    await sleep(100);
  }
  throw new Error("timeout waiting for page condition: " + label);
}

async function objectPosition(cdp, name) {
  return evalInPage(cdp, "(function(){ var game = window.GameCastleRuntimeGame; var scene = game && game.getSceneStack().getCurrentScene(); var obj = scene && scene.getObjects(" + JSON.stringify(name) + ")[0]; return obj ? { x: obj.getX(), y: obj.getY() } : null; })()");
}

async function pressKey(cdp, key, code, windowsVirtualKeyCode, holdMs) {
  await cdp.send("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key: key,
    code: code,
    windowsVirtualKeyCode: windowsVirtualKeyCode,
    nativeVirtualKeyCode: windowsVirtualKeyCode,
  });
  await sleep(holdMs || 250);
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: key,
    code: code,
    windowsVirtualKeyCode: windowsVirtualKeyCode,
    nativeVirtualKeyCode: windowsVirtualKeyCode,
  });
}

function renderEvents(cdp) {
  return cdp.events.slice(-20).map(function(event) {
    if (event.method === "Runtime.consoleAPICalled") {
      return event.params.type + ": " + event.params.args.map(function(arg) {
        return arg.value !== undefined ? String(arg.value) : arg.description || arg.type;
      }).join(" ");
    }
    if (event.method === "Runtime.exceptionThrown") {
      return "exception: " + event.params.exceptionDetails.text;
    }
    if (event.method === "Log.entryAdded") {
      return event.params.entry.level + ": " + event.params.entry.text;
    }
    return event.method;
  }).join("\n");
}

async function main() {
  var signalServer = null;
  var outputServer = null;
  var hostChrome = null;
  var joinChrome = null;
  var hostPage = null;
  var joinPage = null;

  try {
    var chromePath = findChrome();
    childProcess.execFileSync(process.execPath, [
      path.join(ROOT, "ai", "pipeline.js"),
      "--module-dsl-file",
      path.join(ROOT, "ai", "fixtures", "module-shooter.dsl"),
      "shooter-browser-smoke"
    ], { cwd: ROOT, stdio: "pipe" });

    signalServer = childProcess.fork(path.join(ROOT, "server", "signaling-server.js"), [], {
      env: Object.assign({}, process.env, { PORT: String(SIGNAL_PORT) }),
      silent: true,
    });
    outputServer = childProcess.fork(path.join(ROOT, "scripts", "serve-output.js"), [], {
      env: Object.assign({}, process.env, { PORT: String(OUTPUT_PORT), HOST: "127.0.0.1" }),
      silent: true,
    });

    await waitForHttp("http://127.0.0.1:" + OUTPUT_PORT + "/game.html", "output server");

    hostChrome = await launchChrome(chromePath, HOST_DEBUG_PORT);
    joinChrome = await launchChrome(chromePath, JOIN_DEBUG_PORT);

    var url = "http://127.0.0.1:" + OUTPUT_PORT + "/game.html";
    hostPage = await newPage(HOST_DEBUG_PORT, url);
    joinPage = await newPage(JOIN_DEBUG_PORT, url);

    await waitForPage(hostPage, "!!(window.GameCastleNetwork && window.GameCastleNetwork.bridge && document.querySelector('canvas'))", "host bridge and canvas", 10000);
    await waitForPage(joinPage, "!!(window.GameCastleNetwork && window.GameCastleNetwork.bridge && document.querySelector('canvas'))", "join bridge and canvas", 10000);
    await waitForPage(hostPage, "!!(window.GameCastleRuntimeGame && window.GameCastleRuntimeGame.getSceneStack().getCurrentScene() && window.GameCastleRuntimeGame.getSceneStack().getCurrentScene().getObjects('Player1')[0] && window.GameCastleRuntimeGame.getSceneStack().getCurrentScene().getObjects('Player2')[0])", "host player objects", 10000);

    var beforeMove = await objectPosition(hostPage, "Player1");
    await pressKey(hostPage, "ArrowRight", "ArrowRight", 39, 350);
    await pressKey(hostPage, "ArrowDown", "ArrowDown", 40, 350);
    await sleep(200);
    var afterMove = await objectPosition(hostPage, "Player1");
    assert(afterMove.x > beforeMove.x + 4, "ArrowRight should move Player1 right");
    assert(afterMove.y > beforeMove.y + 4, "ArrowDown should move Player1 down");

    var hostRoom = await evalInPage(hostPage, "(async function(){ var result = await window.GameCastleNetwork.host(); return result.roomId; })()");
    assert(hostRoom, "host should create a room");
    await evalInPage(joinPage, "(async function(){ await window.GameCastleNetwork.join(" + JSON.stringify(hostRoom) + "); return true; })()");

    try {
      await waitForPage(hostPage, "window.GameCastleNetwork.bridge.getPeerId() && window.GameCastleNetwork.bridge.getReadyTick() >= 2", "host peer and ticks", 10000);
      await waitForPage(joinPage, "window.GameCastleNetwork.bridge.getPeerId() && window.GameCastleNetwork.bridge.getReadyTick() >= 2", "join peer and ticks", 10000);
    } catch (e) {
      var hostDebug = await evalInPage(hostPage, "({ room: window.GameCastleNetwork.bridge.getRoomId(), player: window.GameCastleNetwork.bridge.getPlayerId(), peer: window.GameCastleNetwork.bridge.getPeerId(), tick: window.GameCastleNetwork.bridge.getTick(), ready: window.GameCastleNetwork.bridge.getReadyTick(), running: window.GameCastleNetwork.bridge.isRunning(), connected: window.GameCastleNetwork.transport.isConnected(), inRoom: window.GameCastleNetwork.transport.isInRoom() })").catch(function(err) { return { error: err.message }; });
      var joinDebug = await evalInPage(joinPage, "({ room: window.GameCastleNetwork.bridge.getRoomId(), player: window.GameCastleNetwork.bridge.getPlayerId(), peer: window.GameCastleNetwork.bridge.getPeerId(), tick: window.GameCastleNetwork.bridge.getTick(), ready: window.GameCastleNetwork.bridge.getReadyTick(), running: window.GameCastleNetwork.bridge.isRunning(), connected: window.GameCastleNetwork.transport.isConnected(), inRoom: window.GameCastleNetwork.transport.isInRoom() })").catch(function(err) { return { error: err.message }; });
      throw new Error(e.message + "\nhost=" + JSON.stringify(hostDebug) + "\njoin=" + JSON.stringify(joinDebug) + "\nhost events:\n" + renderEvents(hostPage) + "\njoin events:\n" + renderEvents(joinPage));
    }

    var hostState = await evalInPage(hostPage, "({ tick: window.GameCastleNetwork.bridge.getTick(), ready: window.GameCastleNetwork.bridge.getReadyTick(), sync: window.GameCastleNetwork.bridge.getSyncMode(), canvas: !!document.querySelector('canvas') })");
    var joinState = await evalInPage(joinPage, "({ tick: window.GameCastleNetwork.bridge.getTick(), ready: window.GameCastleNetwork.bridge.getReadyTick(), sync: window.GameCastleNetwork.bridge.getSyncMode(), canvas: !!document.querySelector('canvas') })");

    assert(hostState.canvas && joinState.canvas, "both pages should render canvas");
    assert.strictEqual(hostState.sync, "lockstep", "host should run lockstep");
    assert.strictEqual(joinState.sync, "lockstep", "join should run lockstep");
    assert(hostState.ready >= 2, "host should advance ready ticks");
    assert(joinState.ready >= 2, "join should advance ready ticks");

    var beforeNetworkMove = await objectPosition(hostPage, "Player1");
    var player2BeforeNetworkMove = await objectPosition(hostPage, "Player2");
    await pressKey(hostPage, "ArrowRight", "ArrowRight", 39, 350);
    await sleep(300);
    var afterNetworkMove = await objectPosition(hostPage, "Player1");
    var player2AfterNetworkMove = await objectPosition(hostPage, "Player2");
    assert(afterNetworkMove.x > beforeNetworkMove.x + 4, "ArrowRight should move Player1 after host/join");
    assert(player2AfterNetworkMove.x <= player2BeforeNetworkMove.x + 4, "host ArrowRight should not move Player2");
    await sleep(1500);
    var afterNetworkRest = await objectPosition(hostPage, "Player1");
    assert(afterNetworkRest.x <= afterNetworkMove.x + 12, "released ArrowRight should not keep moving after network replay");

    console.log("PASS shooter_browser_lockstep_smoke hostReady=" + hostState.ready + " joinReady=" + joinState.ready + " moved=" + beforeMove.x + "," + beforeMove.y + "->" + afterMove.x + "," + afterMove.y + " networkMoved=" + beforeNetworkMove.x + "," + beforeNetworkMove.y + "->" + afterNetworkMove.x + "," + afterNetworkMove.y + " rest=" + afterNetworkRest.x + "," + afterNetworkRest.y);
  } finally {
    if (hostPage) hostPage.close();
    if (joinPage) joinPage.close();
    if (hostChrome) hostChrome.kill();
    if (joinChrome) joinChrome.kill();
    if (signalServer) signalServer.kill();
    if (outputServer) outputServer.kill();
  }
}

main().catch(function(err) {
  console.error(err);
  process.exit(1);
});
