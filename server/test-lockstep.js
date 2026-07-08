var path = require("path");
var GameCastleTransport = require(path.join(__dirname, "..", "ai", "network-runtime", "transport.js"));
var InputSyncStrategy = require(path.join(__dirname, "..", "ai", "network-runtime", "strategies", "input-sync.js"));

var PORT = 3005;
var passed = 0, failed = 0;
function pass(n) { passed++; console.log("PASS " + n); }
function fl(n, why) { failed++; console.log("FAIL " + n + ": " + why); }

var { fork } = require("child_process");
var server = fork("./signaling-server.js", [], {
  env: Object.assign({}, process.env, { PORT: String(PORT) }),
  silent: true,
});

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

async function main() {
  await sleep(500);

  var t1 = new GameCastleTransport("ws://localhost:" + PORT);
  var s1 = new InputSyncStrategy(t1, { tickRate: 20, inputDelay: 2 });
  var t2 = new GameCastleTransport("ws://localhost:" + PORT);
  var s2 = new InputSyncStrategy(t2, { tickRate: 20, inputDelay: 2 });

  var p1Advances = [], p2Advances = [];
  var p1Count = 0, p2Count = 0;

  // NEW: use onRequest and on instead of property assignment
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

  console.log("  Both connected, running for 3 seconds...");
  await sleep(3000);

  s1.stop(); s2.stop();
  t1.close(); t2.close();
  server.kill();

  console.log("  p1 sent " + p1Count + " inputs, advanced " + p1Advances.length + " ticks");
  console.log("  p2 sent " + p2Count + " inputs, advanced " + p2Advances.length + " ticks");

  if (p1Count >= 30) pass("p1_input_count"); else fl("p1_input_count", "only " + p1Count);
  if (p2Count >= 30) pass("p2_input_count"); else fl("p2_input_count", "only " + p2Count);
  if (p1Advances.length >= 15) pass("p1_advances"); else fl("p1_advances", "only " + p1Advances.length);
  if (p2Advances.length >= 15) pass("p2_advances"); else fl("p2_advances", "only " + p2Advances.length);

  if (p1Advances[0] && p1Advances[0].l !== undefined && p1Advances[0].r !== undefined)
    pass("p1_remote_received");
  else
    fl("p1_remote_received", "no remote data");

  if (p2Advances[0] && p2Advances[0].l !== undefined && p2Advances[0].r !== undefined)
    pass("p2_remote_received");
  else
    fl("p2_remote_received", "no remote data");

  console.log("\n" + passed + "/" + (passed + failed) + " passed");
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(function(e) { console.error(e); server.kill(); process.exit(1); });
