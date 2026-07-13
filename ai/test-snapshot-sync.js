var assert = require("assert");
var snapshotModule = require("./network-runtime/snapshot-sync");
var GameCastleSnapshotSyncSession = snapshotModule.GameCastleSnapshotSyncSession;
var SnapshotSyncStrategy = snapshotModule.SnapshotSyncStrategy;
var SNAPSHOT_SYNC_CHANNEL = snapshotModule.SNAPSHOT_SYNC_CHANNEL;

function makeTransport() {
  var handlers = {};
  var sent = [];
  var players = new Set();
  return {
    on: function(event, handler) {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    },
    emit: function(event) {
      var args = Array.prototype.slice.call(arguments, 1);
      (handlers[event] || []).forEach(function(handler) { handler.apply(null, args); });
    },
    sync: function(channel, data) {
      sent.push({ channel: channel, data: data });
    },
    getPlayers: function() { return players; },
    _test: {
      sent: sent,
      players: players,
    },
  };
}

function testSessionBuffersAndPrunesSnapshots() {
  var session = new GameCastleSnapshotSyncSession({ historySize: 2, interpolationDelayMs: 0 });
  var p0 = session.createSnapshot({ x: 1 }, 10);
  var p1 = session.createSnapshot({ x: 2 }, 11);
  var p2 = session.createSnapshot({ x: 3 }, 12);

  assert.strictEqual(p0.__gc.type, "snapshot");
  assert.strictEqual(p0.__gc.seq, 0);
  session.receiveSnapshot(p0);
  session.receiveSnapshot(p1);
  session.receiveSnapshot(p2);

  var latest = session.getLatestSnapshot();
  assert.strictEqual(latest.seq, 2, "latest snapshot should track highest sequence");
  assert.strictEqual(latest.data.x, 3, "latest snapshot should carry cloned data");
  assert.strictEqual(session.getStats().buffered, 2, "history should be pruned to configured size");
}

function testStrategyAuthorityPublishesSnapshots() {
  var transport = makeTransport();
  var strategy = new SnapshotSyncStrategy(transport, { tickRate: 1000, authority: "host" });
  var ticks = [];
  strategy.onRequest("readSnapshot", function(tick) {
    ticks.push(tick);
    return { score: tick + 1 };
  });

  transport.emit("joined", "room", "host");
  assert.strictEqual(strategy.isAuthority(), true, "first host player should become snapshot authority");
  strategy.start();
  return new Promise(function(resolve) {
    setTimeout(function() {
      strategy.stop();
      assert(transport._test.sent.length >= 1, "authority should publish snapshots");
      assert.strictEqual(transport._test.sent[0].channel, SNAPSHOT_SYNC_CHANNEL);
      assert.strictEqual(transport._test.sent[0].data.__gc.type, "snapshot");
      assert.strictEqual(transport._test.sent[0].data.__gc.data.score, 1);
      assert.strictEqual(ticks[0], 0);
      resolve();
    }, 5);
  });
}

function testStrategyReceivesSnapshots() {
  var transport = makeTransport();
  transport._test.players.add("host");
  var strategy = new SnapshotSyncStrategy(transport, { tickRate: 60, authority: "host" });
  var received = null;
  strategy.on("snapshot", function(data, meta) {
    received = { data: data, meta: meta };
  });
  transport.emit("joined", "room", "join");
  assert.strictEqual(strategy.isAuthority(), false, "non-first player should not become host authority");

  var session = new GameCastleSnapshotSyncSession();
  var packet = session.createSnapshot({ x: 42 }, 7);
  transport.emit("sync", "host", SNAPSHOT_SYNC_CHANNEL, packet);
  assert(received, "client should emit received snapshot");
  assert.strictEqual(received.data.x, 42);
  assert.strictEqual(received.meta.tick, 7);
}

async function main() {
  testSessionBuffersAndPrunesSnapshots();
  await testStrategyAuthorityPublishesSnapshots();
  testStrategyReceivesSnapshots();
  console.log("PASS snapshot_sync");
}

main().catch(function(err) {
  console.error(err);
  process.exit(1);
});
