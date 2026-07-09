var path = require("path");
var GameCastleTransport = require(path.join(__dirname, "..", "ai", "network-runtime", "transport.js"));
var InputSyncStrategy = require(path.join(__dirname, "..", "ai", "network-runtime", "strategies", "input-sync.js"));
var AsyncStateStrategy = require(path.join(__dirname, "..", "ai", "network-runtime", "strategies", "async-state.js"));

var PORT = 3005;
var passed = 0, failed = 0;
function pass(n) { passed++; console.log("PASS " + n); }
function fl(n, why) { failed++; console.log("FAIL " + n + ": " + why); }

var { fork } = require("child_process");
var server = fork(path.join(__dirname, "signaling-server.js"), [], {
  env: Object.assign({}, process.env, { PORT: String(PORT) }),
  silent: true,
});

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

// ══════════════════════════════════════════════════════════════════════════
// Test 1: Lockstep sync (regression)
// ══════════════════════════════════════════════════════════════════════════

async function testLockstep() {
  console.log("\n── Test: Lockstep ──");
  var t1 = new GameCastleTransport("ws://localhost:" + PORT);
  var s1 = new InputSyncStrategy(t1, { tickRate: 20, inputDelay: 2 });
  var t2 = new GameCastleTransport("ws://localhost:" + PORT);
  var s2 = new InputSyncStrategy(t2, { tickRate: 20, inputDelay: 2 });

  var p1Advances = [], p2Advances = [];
  var p1Count = 0, p2Count = 0;

  s1.onRequest("readInputs", function(tick) { p1Count++; return { m: "right", t: tick }; });
  s1.on("advance", function(tick, local, remote) { p1Advances.push({ t: tick, l: local.t, r: remote.t }); });
  s2.onRequest("readInputs", function(tick) { p2Count++; return { m: "left", t: tick }; });
  s2.on("advance", function(tick, local, remote) { p2Advances.push({ t: tick, l: local.t, r: remote.t }); });

  var hostRoomId = null;
  t1.on("room_created", function(rid) { hostRoomId = rid; t1.joinRoom(rid); });
  t1.on("joined", function() { s1.start(); });
  await t1.connect();
  t1.createRoom();

  await new Promise(function(r) {
    var iv = setInterval(function() {
      if (t1.isInRoom() && hostRoomId) { clearInterval(iv); r(); }
    }, 50);
  });

  t2.on("joined", function() { s2.start(); });
  await t2.connect();
  t2.joinRoom(hostRoomId);

  await new Promise(function(r) {
    var iv = setInterval(function() {
      if (s1.hasPeer() && s2.hasPeer()) { clearInterval(iv); r(); }
    }, 50);
  });

  await sleep(2000);
  s1.stop(); s2.stop();
  t1.close(); t2.close();

  if (p1Count >= 20) pass("lockstep_p1_inputs"); else fl("lockstep_p1_inputs", "only " + p1Count);
  if (p2Count >= 20) pass("lockstep_p2_inputs"); else fl("lockstep_p2_inputs", "only " + p2Count);
  if (p1Advances.length >= 10) pass("lockstep_advances"); else fl("lockstep_advances", "only " + p1Advances.length);

  // Clean up room
  await sleep(200);
}

// ══════════════════════════════════════════════════════════════════════════
// Test 2: State persistence (async-state)
// ══════════════════════════════════════════════════════════════════════════

async function testAsyncState() {
  console.log("\n── Test: AsyncState ──");
  var t = new GameCastleTransport("ws://localhost:" + PORT);
  var s = new AsyncStateStrategy(t, { authority: "server" });

  var roomId;
  t.on("room_created", function(rid) { roomId = rid; t.joinRoom(rid, "p1"); });

  var joined = false;
  t.on("joined", function() { joined = true; });

  await t.connect();
  t.createRoom();

  await new Promise(function(r) {
    var iv = setInterval(function() { if (joined) { clearInterval(iv); r(); } }, 50);
  });

  // Save state
  try {
    await s.save("p1_world", { level: 42, coins: 99 });
    pass("state_save");
  } catch (e) { fl("state_save", e.message); }

  // Load state
  try {
    var data = await s.load("p1", "p1_world");
    if (data && data.level === 42) pass("state_load"); else fl("state_load", JSON.stringify(data));
  } catch (e) { fl("state_load", e.message); }

  // List states
  try {
    var list = await s.list("p1_");
    if (list.length >= 1 && list[0].key === "p1_world") pass("state_list"); else fl("state_list", JSON.stringify(list));
  } catch (e) { fl("state_list", e.message); }

  // Load non-existent
  try {
    await s.load("ghost", "nonexistent");
    fl("state_missing", "should have thrown");
  } catch (e) {
    pass("state_missing_rejected");
  }

  t.close();
}

// ════════════════════════════��══════════════════════════════════════════════
// Test 3: Event validation
// ══════════════════════════════════════════════════════════════════════════

async function testEventValidation() {
  console.log("\n── Test: Event Validation ──");
  var t1 = new GameCastleTransport("ws://localhost:" + PORT);
  var t2 = new GameCastleTransport("ws://localhost:" + PORT);

  var roomId;
  t1.on("room_created", function(rid) { roomId = rid; t1.joinRoom(rid); });
  await t1.connect();
  t1.createRoom();

  await new Promise(function(r) {
    t1.on("joined", function() { r(); });
  });

  await t2.connect();
  t2.joinRoom(roomId);

  var received = false;
  t1.on("game_event", function(name, payload, from) {
    received = true;
  });

  // Wait for both joined
  await sleep(300);

  // Send event (no validator = allow all)
  t2.sendEvent("player_attack", { damage: 10 });
  await sleep(200);

  if (received) pass("event_relay"); else fl("event_relay", "not received");

  t1.close();
  t2.close();
}

// ══════════════════════════════════════════════════════════════════════════
// Test 4: Sync channel
// ══════════════════════════════════════════════════════════════════════════

async function testSyncChannel() {
  console.log("\n── Test: Sync Channel ──");
  var t1 = new GameCastleTransport("ws://localhost:" + PORT);
  var t2 = new GameCastleTransport("ws://localhost:" + PORT);

  var roomId;
  var p2received = false;
  var p1receivedEcho = false;

  t1.on("room_created", function(rid) { roomId = rid; t1.joinRoom(rid); });
  await t1.connect();
  t1.createRoom();

  await new Promise(function(r) {
    t1.on("joined", function() { r(); });
  });

  t2.on("sync", function(from, channel, data) {
    if (channel === "test" && data === "hello") {
      p2received = true;
    }
  });

  // p1 should NOT receive its own sync (broadcast excludes sender)
  t1.on("sync", function(from, channel, data) {
    p1receivedEcho = true;
  });

  await t2.connect();
  t2.joinRoom(roomId);

  await sleep(300);

  // p1 sends a sync on channel "test"
  t1.sync("test", "hello");
  await sleep(300);

  if (p2received) pass("sync_p2_received"); else fl("sync_p2_received", "not received");
  if (!p1receivedEcho) pass("sync_no_self_echo"); else fl("sync_no_self_echo", "sender received own sync");

  t1.close();
  t2.close();
}

// ══════════════════════════════════════════════════════════════════════════

async function main() {
  await sleep(500);

  await testLockstep();
  await testAsyncState();
  await testEventValidation();
  await testSyncChannel();

  console.log("\n" + passed + "/" + (passed + failed) + " passed");
  server.kill();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(function(e) { console.error(e); server.kill(); process.exit(1); });
