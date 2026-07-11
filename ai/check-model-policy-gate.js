var assert = require('assert');
var gate = require('./model-policy-gate');
(async function() {
  var simulated = gate.authorizeModelPorts({ generate: async function() { return { assetId: 'a' }; } }, {});
  assert.equal(simulated.receipt.allowed, true);
  assert.equal((await simulated.ports.generate({})).modelPolicy.simulated, true);
  var denied = gate.authorizeModelPorts({ generate: async function() { throw new Error('must not run'); } }, { provider: 'external', simulated: false });
  assert.equal(denied.receipt.allowed, false);
  assert.equal(denied.receipt.code, 'MODEL_UNAVAILABLE');
  assert.equal(typeof denied.ports.generate, 'undefined');
  console.log('[ModelPolicyGate] simulated default, explicit external authorization, and fail-closed denial passed');
})().catch(function(error) { console.error(error); process.exit(1); });
