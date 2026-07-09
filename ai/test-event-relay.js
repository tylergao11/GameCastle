var assert = require("assert");
var relayModule = require("./network-runtime/event-relay");
var GameCastleEventRelaySession = relayModule.GameCastleEventRelaySession;
var EventRelayStrategy = relayModule.EventRelayStrategy;

function makeTransport() {
  var handlers = {};
  var broadcasts = [];
  var directed = [];
  return {
    on: function(event, handler) {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    },
    emit: function(event) {
      var args = Array.prototype.slice.call(arguments, 1);
      (handlers[event] || []).forEach(function(handler) { handler.apply(null, args); });
    },
    broadcast: function(data) { broadcasts.push(data); },
    sendTo: function(target, data) { directed.push({ target: target, data: data }); },
    _test: { broadcasts: broadcasts, directed: directed },
  };
}

function testSessionCreatesAndDedupesEvents() {
  var session = new GameCastleEventRelaySession({ historySize: 2 });
  var packet = session.createEvent("attack", { damage: 3 }, "p2");
  assert.strictEqual(packet.__gc.type, "event");
  assert.strictEqual(packet.__gc.name, "attack");
  assert.strictEqual(packet.__gc.target, "p2");

  var first = session.receiveEvent("p1", packet);
  var dupe = session.receiveEvent("p1", packet);
  assert(first, "first event should be accepted");
  assert.strictEqual(dupe, null, "duplicate event seq from same player should be ignored");
  assert.strictEqual(session.getEvents("attack").length, 1);
}

function testStrategyBroadcastAndReceive() {
  var transport = makeTransport();
  var strategy = new EventRelayStrategy(transport, {});
  var received = null;
  strategy.on("attack", function(from, payload, event) {
    received = { from: from, payload: payload, event: event };
  });

  strategy.send("attack", { damage: 5 });
  assert.strictEqual(transport._test.broadcasts.length, 1, "send should broadcast event packet");
  transport.emit("relay", "p2", transport._test.broadcasts[0]);
  assert(received, "incoming relay should fire handler");
  assert.strictEqual(received.from, "p2");
  assert.strictEqual(received.payload.damage, 5);

  strategy.sendTo("p3", "heal", { amount: 2 });
  assert.strictEqual(transport._test.directed[0].target, "p3", "sendTo should use directed transport");
}

testSessionCreatesAndDedupesEvents();
testStrategyBroadcastAndReceive();

console.log("PASS event_relay");
