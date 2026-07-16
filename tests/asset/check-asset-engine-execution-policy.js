var assert = require('assert');
var policy = require('../../packages/assets/src/asset-engine-execution-policy');

var diagnostic = policy.resolve({ executionProfileId: 'asset-engine-test.v1', providerOptions: { provider: 'comfyui-local' } });
assert.strictEqual(diagnostic.mode, 'diagnostic');
assert.strictEqual(diagnostic.maxGeneratedWorkItems, 1);
assert.strictEqual(diagnostic.maxProductionAttempts, 1);
assert.strictEqual(diagnostic.candidateRounds, 1);
assert.strictEqual(diagnostic.candidatesPerRound, 2);
assert.strictEqual(diagnostic.totalDeadlineMs, 180000);
assert.strictEqual(diagnostic.maxWorkflowSubmissionsPerGeneratedWorkItem, 1);
assert.strictEqual(diagnostic.maxCandidateImagesPerGeneratedWorkItem, 2);
assert.match(diagnostic.profileHash, /^[a-f0-9]{64}$/);
assert.throws(function() { policy.resolve({ executionProfileId: 'missing' }); }, function(error) { return error.code === 'ASSET_ENGINE_EXECUTION_PROFILE_UNKNOWN'; });
assert.throws(function() { policy.resolve({ maxAttempts: 1 }); }, function(error) { return error.code === 'ASSET_ENGINE_LOOSE_EXECUTION_OVERRIDE_FORBIDDEN'; });
['timeoutMs', 'batchSize', 'candidateRounds', 'maxAttempts', 'reviewTimeoutMs'].forEach(function(name) {
  var input = { providerOptions: {} }; input.providerOptions[name] = 1;
  assert.throws(function() { policy.resolve(input); }, function(error) { return error.code === 'ASSET_ENGINE_LOOSE_EXECUTION_OVERRIDE_FORBIDDEN'; });
});
console.log('[AssetEngineExecutionPolicy] named production/test profiles, 1x2x1 diagnostic cap, unified deadline, and loose-override rejection passed');
