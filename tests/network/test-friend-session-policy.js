var assert = require('assert');
var friendSession = require('../../packages/network/src/friend-session-policy');
var fs = require('fs');
var path = require('path');

var session = friendSession.resolve({ initiatorId: 'alice' });
assert.strictEqual(session.sessionKind, 'friend-invite');
assert.strictEqual(session.authority, 'host');
assert.strictEqual(session.hostPlayerId, 'alice');
assert.strictEqual(session.initiatorId, 'alice');
assert.strictEqual(session.sync, 'lockstep');
assert.strictEqual(session.simulationHz, 60);
assert.strictEqual(session.networkHz, 60);
assert.strictEqual(session.latencyModel.localPrediction, 'required');
assert.strictEqual(session.latencyModel.hostDisconnect, 'dissolve-room');
assert.strictEqual(session.latencyModel.serverRole, 'signaling-and-relay-only');

var at30 = friendSession.resolve({ initiatorId: 'bob', tickRate: 30 });
assert.strictEqual(at30.simulationHz, 30);

assert.throws(function() {
  friendSession.resolve({ initiatorId: 'carol', tickRate: 20 });
}, function(error) {
  return error.code === 'FRIEND_SESSION_TICK_UNPLAYABLE';
});

assert.throws(function() {
  friendSession.resolve({});
}, function(error) {
  return error.code === 'FRIEND_SESSION_INITIATOR_REQUIRED';
});

assert.throws(function() {
  friendSession.resolve({ initiatorId: 'a', hostPlayerId: 'b' });
}, function(error) {
  return error.code === 'FRIEND_SESSION_HOST_MISMATCH';
});

var withDelivery = friendSession.resolve({
  initiatorId: 'alice',
  deliveryAttestation: { sourceHash: 'semantic.abc', assetWorldHash: 'asset.xyz' }
});
assert.strictEqual(withDelivery.deliveryAttestation.sourceHash, 'semantic.abc');
assert.strictEqual(withDelivery.deliveryAttestation.assetWorldHash, 'asset.xyz');

// Templates must not ship unplayable interactive defaults.
var templatesDir = path.join(__dirname, '..', '..', 'packages', 'network', 'templates');
['p2p-lockstep.json', 'server-authoritative.json', 'host-snapshot.json'].forEach(function(name) {
  var template = JSON.parse(fs.readFileSync(path.join(templatesDir, name), 'utf8'));
  var tick = template.syncConfig && template.syncConfig.tickRate;
  if (!tick || tick.default == null) return;
  assert(tick.default >= 30, name + ' default tickRate must be >= 30 (playable); got ' + tick.default);
  assert(tick.min >= 30, name + ' min tickRate must be >= 30; got ' + tick.min);
});

var schema = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'packages', 'network', 'contracts', 'sync-schema.json'), 'utf8'));
assert.strictEqual(schema.friendSession.simulationHz.default, 60);
assert.strictEqual(schema.friendSession.simulationHz.min, 30);
assert.strictEqual(schema.friendSession.defaultAuthority, 'host');

console.log('PASS friend_session_policy');
