var assert = require('assert');
var resolver = require('./tick-policy-resolver');

var local = resolver.resolve({ sync: 'local' });
assert.strictEqual(local.simulationHz, 60);
assert.strictEqual(local.inputSampleHz, 60);
assert.strictEqual(local.maxCatchUpTicks, 5);
assert.strictEqual(local.renderPolicy, 'request-animation-frame');
assert.throws(function() { resolver.resolve({ sync: 'local', tickRate: 30 }); }, /fixed at 60/);
assert.throws(function() { resolver.resolve({ sync: 'lockstep', tickRate: 20 }); }, /at least 30/);
assert.strictEqual(resolver.resolve({ sync: 'lockstep', tickRate: 30 }).networkHz, 30);
assert.strictEqual(resolver.resolve({ sync: 'server-authoritative', tickRate: 60 }).interpolationPolicy, 'required');

console.log('PASS tick_policy_resolver');
