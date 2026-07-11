var assert = require('assert');
var graph = require('./asset-weave-graph');
var slot = { slotId: 'asset.no-model', kind: 'sprite', semanticTags: ['hero'], styleTags: ['arcade'], constraints: { width: 32, height: 32, transparent: true } };
(async function() {
  var result = await graph.runAssetWeave({ runId: 'no-model-port', buildContract: { assetContract: { slots: [slot] } }, sources: { 'asset.no-model': { kind: 'generation_required' } }, ports: {}, ledger: {} });
  assert.equal(result.slots[0].candidate.status, 'placeholder');
  assert.equal(result.slots[0].debt, 'image_generation_port_unavailable');
  assert.equal(result.assetBindings[0].runtimeFallback, true);
  var noReview = await graph.runAssetWeave({ runId: 'no-review-port', buildContract: { assetContract: { slots: [slot] } }, sources: { 'asset.no-model': { kind: 'generation_required' } }, ports: { generate: async function() { return { assetId: 'candidate.hero', path: 'memory://candidate', format: 'png', width: 32, height: 32, transparent: true, semanticTags: ['hero'], styleTags: ['arcade'], source: 'imageGeneration', publishability: { playable: true, publishable: false, blocksFinalExport: false } }; } }, ledger: {} });
  assert.equal(noReview.slots[0].candidate.status, 'placeholder');
  assert.equal(noReview.slots[0].debt, 'vision_review_port_unavailable');
  console.log('[AssetModelDebt] unavailable model port becomes playable placeholder debt');
})().catch(function(error) { console.error(error); process.exit(1); });
