var assert = require("assert");
var asyncModule = require("../../packages/network/src/async-persistence");
var GameCastleAsyncPersistenceSession = asyncModule.GameCastleAsyncPersistenceSession;
var AsyncPersistenceStrategy = asyncModule.AsyncPersistenceStrategy;

function makeTransport() {
  var saved = {};
  return {
    saveState: function(key, data) {
      saved[key] = data;
      return Promise.resolve();
    },
    loadState: function(playerId, key) {
      return Promise.resolve({ playerId: playerId, key: key, data: saved[key] });
    },
    listStates: function(prefix) {
      return Promise.resolve(Object.keys(saved).filter(function(key) {
        return key.indexOf(prefix) === 0;
      }).map(function(key) { return { key: key }; }));
    },
    _test: { saved: saved },
  };
}

async function main() {
  var session = new GameCastleAsyncPersistenceSession({ namespace: "world" });
  assert.strictEqual(session.key("slot1"), "world/slot1", "session should scope keys");
  session.record("save", "world/slot1", { level: 2 });
  assert.strictEqual(session.getStats().operations, 1);

  var transport = makeTransport();
  var strategy = new AsyncPersistenceStrategy(transport, { namespace: "world" });
  var savedEvent = null;
  var loadedEvent = null;
  strategy.on("saved", function(key, op) { savedEvent = { key: key, op: op }; });
  strategy.on("loaded", function(key, data, op) { loadedEvent = { key: key, data: data, op: op }; });

  await strategy.save("slot1", { level: 7 });
  assert.strictEqual(transport._test.saved["world/slot1"].level, 7);
  assert.strictEqual(savedEvent.key, "world/slot1");

  var loaded = await strategy.load("p1", "slot1");
  assert.strictEqual(loaded.key, "world/slot1");
  assert.strictEqual(loadedEvent.data.playerId, "p1");

  var list = await strategy.list("slot");
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].key, "world/slot1");

  console.log("PASS async_persistence");
}

main().catch(function(err) {
  console.error(err);
  process.exit(1);
});
