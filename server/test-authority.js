var path = require("path");
var GameCastleTransport = require(path.join(__dirname, "..", "ai", "network-runtime", "transport.js"));
var AuthoritySyncStrategy = require(path.join(__dirname, "..", "ai", "network-runtime", "strategies", "authority-sync.js"));

var PORT = 3006;
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

  console.log("── Test: Server-Authoritative ──");

  // Create room with game loop (tickRate > 0 activates authoritative mode)
  var t1 = new GameCastleTransport("ws://localhost:" + PORT);
  t1.on("room_created", function(rid) { t1.joinRoom(rid); });

  var joined = false, roomId;
  t1.on("joined", function(rid) { roomId = rid; joined = true; });

  await t1.connect();
  t1.createRoom({ tickRate: 20, maxPlayers: 2 }); // ← activates server GameLoop

  await new Promise(function(r) {
    var iv = setInterval(function() { if (joined) { clearInterval(iv); r(); } }, 50);
  });

  // Player 1: AuthorityStrategy
  var s1 = new AuthoritySyncStrategy(t1, { tickRate: 20, inputDelay: 2 });
  var s1Advances = [];

  s1.onRequest("readInputs", function(tick) { return { dir: "east", seq: tick }; });
  s1.on("advance", function(tick, allInputs) {
    s1Advances.push({ tick: tick, inputs: allInputs });
  });

  s1.start();

  // Player 2: join and run same strategy
  var t2 = new GameCastleTransport("ws://localhost:" + PORT);
  var s2 = new AuthoritySyncStrategy(t2, { tickRate: 20, inputDelay: 2 });
  var s2Advances = [];

  s2.onRequest("readInputs", function(tick) { return { dir: "west", seq: tick }; });
  s2.on("advance", function(tick, allInputs) {
    s2Advances.push({ tick: tick, inputs: allInputs });
  });

  t2.on("joined", function() { s2.start(); });
  await t2.connect();
  t2.joinRoom(roomId);

  console.log("  Running authoritative ticks for 3 seconds...");
  await sleep(3000);

  s1.stop(); s2.stop();

  console.log("  p1 advances: " + s1Advances.length);
  console.log("  p2 advances: " + s2Advances.length);

  if (s1Advances.length >= 20) pass("p1_advance_count"); else fl("p1_advance_count", "only " + s1Advances.length);
  if (s2Advances.length >= 20) pass("p2_advance_count"); else fl("p2_advance_count", "only " + s2Advances.length);

  // Check that both players received each other's inputs
  if (s1Advances.length > 0) {
    var sampleP1 = s1Advances[s1Advances.length - 1].inputs;
    var p2Id = Object.keys(sampleP1).find(function(k) { return k !== t1.getPlayerId(); });
    if (p2Id) pass("p1_sees_p2_inputs"); else fl("p1_sees_p2_inputs", JSON.stringify(sampleP1).slice(0, 100));
  }

  if (s2Advances.length > 0) {
    var sampleP2 = s2Advances[s2Advances.length - 1].inputs;
    var p1Id = Object.keys(sampleP2).find(function(k) { return k !== t2.getPlayerId(); });
    if (p1Id) pass("p2_sees_p1_inputs"); else fl("p2_sees_p1_inputs", JSON.stringify(sampleP2).slice(0, 100));
  }

  // Check input ordering is consistent between players
  if (s1Advances.length >= 2 && s2Advances.length >= 2) {
    var tick1 = s1Advances[0].tick;
    var tick2 = s2Advances[0].tick;
    if (tick1 === tick2) pass("tick_ordering_consistent"); else fl("tick_ordering_consistent", "p1@" + tick1 + " p2@" + tick2);
  }

  t1.close(); t2.close();

  console.log("\n" + passed + "/" + (passed + failed) + " passed");
  server.kill();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(function(e) { console.error(e); server.kill(); process.exit(1); });
