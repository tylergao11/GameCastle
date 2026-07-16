// GameCastle — Smoke test
// Room lifecycle: create, join, relay, leave, error paths.
// Self-contained: forks its own signaling server.
var path = require("path");
var { fork } = require("child_process");
var { WebSocket } = require("ws");

var PORT = 3007;
var passed = 0, failed = 0;
function pass(n) { passed++; console.log("PASS " + n); }
function fl(n, why) { failed++; console.log("FAIL " + n + ": " + why); }

var server = fork(path.join(__dirname, "..", "..", "apps", "multiplayer", "src", "signaling-server.js"), [], {
  env: Object.assign({}, process.env, { PORT: String(PORT) }),
  silent: true,
});

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

async function run() {
  await sleep(500);

  return new Promise(function (resolve) {
    var ws1 = new WebSocket("ws://localhost:" + PORT);
    var ws2 = new WebSocket("ws://localhost:" + PORT);
    var roomId, p2open = false, phase = 0;
    var finished = false;
    var [P1, P2] = ["p1", "p2"];
    var send = function (ws, msg) { ws.send(JSON.stringify(msg)); };

    function done() {
      if (finished) return;
      finished = true;
      ws1.close();
      ws2.close();
      server.kill();
      console.log("\n" + passed + "/" + (passed + failed) + " passed");
      resolve(failed === 0);
    }

    ws1.on("open", function () { send(ws1, { type: "create_room" }); });
    ws2.on("open", function () { p2open = true; });

    ws1.on("message", function (raw) {
      var m;
      try { m = JSON.parse(raw.toString()); } catch (e) { return; }
      switch (m.type) {
        case "room_created":
          roomId = m.roomId; pass("create_room");
          send(ws1, { type: "bad_type" });
          break;
        case "error":
          if (m.error.indexOf("unknown") >= 0) {
            pass("unknown_type_rejected");
            send(ws1, { type: "join_room" });
          } else if (m.error.indexOf("roomId") >= 0) {
            pass("missing_roomId_rejected");
            send(ws1, { type: "join_room", roomId: roomId, playerId: P1 });
          } else if (m.error.indexOf("not found") >= 0) {
            pass("nonexistent_room");
            done();
          }
          break;
        case "joined":
          if (m.playerId === P1 && phase === 0) {
            phase = 1; pass("join_p1");
            if (p2open) send(ws2, { type: "join_room", roomId: roomId, playerId: P2 });
            else ws2.on("open", function () { send(ws2, { type: "join_room", roomId: roomId, playerId: P2 }); });
          }
          break;
        case "player_joined":
          if (m.playerId === P2 && phase === 1) {
            phase = 2; pass("p1_sees_p2");
            send(ws1, { type: "relay", data: { x: 10 } });
          }
          break;
      }
    });

    ws2.on("message", function (raw) {
      var m;
      try { m = JSON.parse(raw.toString()); } catch (e) { return; }
      switch (m.type) {
        case "relay":
          if (m.data && m.data.x === 10) {
            pass("relay_broadcast");
            send(ws1, { type: "relay", target: P2, data: { msg: "hi" } });
          } else if (m.data && m.data.msg === "hi") {
            pass("target_relay");
            send(ws1, { type: "leave_room" });
            setTimeout(function () {
              send(ws1, { type: "join_room", roomId: "deadbeef", playerId: "ghost" });
            }, 100);
          }
          break;
        case "player_left":
          if (m.playerId === P1) pass("leave_broadcast");
          break;
      }
    });

    setTimeout(function () { done(); }, 5000);
  });
}

run().then(function (p) { process.exit(p ? 0 : 1); })
  .catch(function (e) { console.error(e); server.kill(); process.exit(1); });
