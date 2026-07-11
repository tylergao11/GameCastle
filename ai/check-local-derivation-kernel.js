var assert = require('assert');
var kernelModule = require('./local-derivation-kernel');
var spec = { schemaVersion: 1, dictionaryId: 'gamecastle.asset-style-dictionary', styleId: 'gamecastle.style-1', operationId: 'op.sheet.1', op: 'sprite_sheet_split', input: { assetId: 'asset.sheet', contentHash: 'sha256.input' }, params: { columns: 3 }, output: { format: 'png', transparent: true }, scope: 'project-local' };
(async function() {
  var kernel = kernelModule.createLocalDerivationKernel({});
  await assert.rejects(function() { return kernel.execute(spec); }, function(error) { return error.code === 'LOCAL_OPERATION_UNAVAILABLE'; });
  var called = 0;
  kernel = kernelModule.createLocalDerivationKernel({ sprite_sheet_split: async function(received, context) { called++; assert.equal(received, spec); assert.equal(context.cloud, undefined); return { parentRevisionId: 'rev.parent', inputHash: 'sha256.input', outputHash: 'sha256.output', outputs: ['asset.frame.1', 'asset.frame.2', 'asset.frame.3'], scriptVersion: 'fixture-1' }; } });
  var receipt = await kernel.execute(spec, {});
  assert.equal(called, 1); assert.equal(receipt.owner, 'LocalDerivationKernel'); assert.equal(receipt.outputHash, 'sha256.output'); assert.equal(receipt.scope, 'project-local'); assert.equal(receipt.styleId, 'gamecastle.style-1');
  assert.throws(function() { kernelModule.assertSpec(Object.assign({}, spec, { scope: 'cloud' })); }, function(error) { return error.code === 'LOCAL_OPERATION_SCOPE_INVALID'; });
  assert.throws(function() { kernelModule.assertSpec(Object.assign({}, spec, { styleId: 'unknown.style' })); }, function(error) { return error.code === 'LOCAL_OPERATION_INVALID'; });
  console.log('[LocalDerivationKernel] contract, fail-closed dispatch, immutable receipt, and local scope passed');
})().catch(function(error) { console.error(error); process.exit(1); });
