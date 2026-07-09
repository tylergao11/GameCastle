var assert = require("assert");

var OriginalWebSocket = global.WebSocket;
var sockets = [];

function FakeWebSocket(url) {
  this.url = url;
  this.readyState = 0;
  this.sent = [];
  sockets.push(this);
  var self = this;
  setTimeout(function() {
    self.readyState = 1;
    if (self.onopen) self.onopen();
  }, 0);
}

FakeWebSocket.prototype.send = function(raw) {
  this.sent.push(JSON.parse(raw));
};

FakeWebSocket.prototype.close = function() {
  this.readyState = 3;
  if (this.onclose) this.onclose();
};

global.WebSocket = FakeWebSocket;
var GameCastleTransport = require("./network-runtime/transport");

function sleep(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

async function main() {
  try {
    var transport = new GameCastleTransport("ws://fake");
    await transport.connect();
    transport._dispatch({ type: "joined", roomId: "room-a", playerId: "player-a" });
    assert.strictEqual(transport.getRoomId(), "room-a");
    assert.strictEqual(transport.getPlayerId(), "player-a");

    sockets[0].close();
    assert.strictEqual(transport.isInRoom(), false, "transport should leave active room state on close");

    var reconnectPromise = transport.reconnect();
    await sleep(5);
    assert.strictEqual(sockets.length, 2, "reconnect should open a new socket");
    assert.deepStrictEqual(sockets[1].sent[0], {
      type: "join_room",
      roomId: "room-a",
      playerId: "player-a",
    }, "reconnect should rejoin with the previous player identity");

    transport._dispatch({ type: "joined", roomId: "room-a", playerId: "player-a" });
    var result = await reconnectPromise;
    assert.deepStrictEqual(result, { roomId: "room-a", playerId: "player-a" });
    console.log("PASS transport_reconnect");
  } finally {
    global.WebSocket = OriginalWebSocket;
  }
}

main().catch(function(err) {
  console.error(err);
  process.exit(1);
});
