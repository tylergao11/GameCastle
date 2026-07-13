var assert = require('assert');
var gate = require('./model-policy-gate');
(async function() {
  var unconfigured = gate.authorizeModelPorts({ generate: async function() { return { assetId: 'a' }; } }, {});
  assert.equal(unconfigured.receipt.allowed, false);
  assert.equal(unconfigured.receipt.code, 'MODEL_UNAVAILABLE');
  var denied = gate.authorizeModelPorts({ generate: async function() { throw new Error('must not run'); } }, { provider: 'external', simulated: false });
  assert.equal(denied.receipt.allowed, false);
  assert.equal(denied.receipt.code, 'MODEL_UNAVAILABLE');
  assert.equal(typeof denied.ports.generate, 'undefined');
  console.log('[ModelPolicyGate] unconfigured default and explicit external authorization fail closed');
})().catch(function(error) { console.error(error); process.exit(1); });
