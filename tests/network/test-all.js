var path = require("path");
var { fork } = require("child_process");
var GameCastleTransport = require(path.join(__dirname, "..", "..", "packages", "network", "src", "transport.js"));
var TickIntentRuntime = require(path.join(__dirname, "..", "..", "packages", "network", "src", "tick-intent-runtime.js")).GameCastleTickIntentRuntime;
var AsyncPersistenceStrategy = require(path.join(__dirname, "..", "..", "packages", "network", "src", "async-persistence.js")).AsyncPersistenceStrategy;
var EventRelayStrategy = require(path.join(__dirname, "..", "..", "packages", "network", "src", "event-relay.js")).EventRelayStrategy;
var ServerOrderedInputSession = require(path.join(__dirname, "..", "..", "apps", "multiplayer", "src", "server-ordered-input.js")).ServerOrderedInputSession;

var PORT = 3005;
var passed = 0, failed = 0;
function pass(n) { passed++; console.log("PASS " + n); }
function fl(n, why) { failed++; console.log("FAIL " + n + ": " + why); }

var server = fork(path.join(__dirname, "..", "..", "apps", "multiplayer", "src", "signaling-server.js"), [], {
  env: Object.assign({}, process.env, { PORT: String(PORT) }),
  silent: true,
});

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

function testTickIntentTemplate() {
  var s = new TickIntentRuntime({ inputDelay: 0 });
  s.setLocalPlayer("p1", "p1");
  s.setPeerPlayer("p2", "p2");
  s.captureLocalIntent({ right: true });
  s.receiveRemoteIntent("p2", { tick: 0, intent: { left: true } });
  var frames = s.nextLockstepTicks();
  if (frames.length === 1 && frames[0].inputs.p1_right && frames[0].inputs.p2_left) pass("tick_intent_runtime");
  else fl("tick_intent_runtime", JSON.stringify(frames));
}

function testServerOrderedInputTemplate() {
  var s = new ServerOrderedInputSession();
  s.submitInput("p2", 1, { left: true });
  var early = s.collectReadyFrames();
  s.submitInput("p1", 0, { right: true });
  var frames = s.collectReadyFrames();
  if (early.length === 0 && frames.length === 2 && frames[0].tick === 0 && frames[1].tick === 1) pass("server_ordered_input_template");
  else fl("server_ordered_input_template", JSON.stringify({ early: early, frames: frames }));
}

async function testAsyncPersistence() {
  var t = new GameCastleTransport("ws://localhost:" + PORT);
  var s = new AsyncPersistenceStrategy(t, { authority: "server" });
  var joined = false;
  t.on("room_created", function(rid) { t.joinRoom(rid, "p1"); });
  t.on("joined", function() { joined = true; });
  await t.connect();
  t.createRoom();
  while (!joined) await sleep(25);

  try {
    await s.save("p1_world", { level: 42 });
    var data = await s.load("p1", "p1_world");
    var list = await s.list("p1_");
    if (data && data.level === 42 && list.length >= 1) pass("async_persistence_transport");
    else fl("async_persistence_transport", JSON.stringify({ data: data, list: list }));
  } catch (e) {
    fl("async_persistence_transport", e.message);
  }
  t.close();
}

async function testEventRelay() {
  var t1 = new GameCastleTransport("ws://localhost:" + PORT);
  var t2 = new GameCastleTransport("ws://localhost:" + PORT);
  var s1 = new EventRelayStrategy(t1, {});
  var s2 = new EventRelayStrategy(t2, {});
  var roomId;
  var received = false;
  s1.on("player_attack", function(from, payload) {
    received = payload && payload.damage === 10;
  });
  t1.on("room_created", function(rid) { roomId = rid; t1.joinRoom(rid); });
  await t1.connect();
  t1.createRoom();
  while (!t1.isInRoom()) await sleep(25);
  await t2.connect();
  t2.joinRoom(roomId);
  while (!t2.isInRoom()) await sleep(25);
  s2.send("player_attack", { damage: 10 });
  await sleep(200);
  if (received) pass("event_relay_template"); else fl("event_relay_template", "not received");
  t1.close();
  t2.close();
}

async function main() {
  await sleep(500);
  testTickIntentTemplate();
  testServerOrderedInputTemplate();
  await testAsyncPersistence();
  await testEventRelay();
  console.log("\n" + passed + "/" + (passed + failed) + " passed");
  server.kill();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(function(e) { console.error(e); server.kill(); process.exit(1); });
