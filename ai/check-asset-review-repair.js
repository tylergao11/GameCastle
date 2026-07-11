var assert = require('assert');
var graph = require('./asset-weave-graph');
var slot = { slotId: 'asset.repair', kind: 'sprite', semanticTags: ['hero'], styleTags: ['arcade'], constraints: { width: 32, height: 32, transparent: true } };
function candidate(id, source) { return { assetId: id, status: source === 'imageEdit' ? 'variant' : 'generated', source: source, path: 'memory://' + id, format: 'png', width: 32, height: 32, transparent: true, semanticTags: ['hero'], styleTags: ['arcade'], publishability: { playable: true, publishable: false, blocksFinalExport: false } }; }
(async function() {
  var reviews = 0, edits = 0;
  var result = await graph.runAssetWeave({ runId: 'repair-then-pass', buildContract: { assetContract: { slots: [slot] } }, sources: { 'asset.repair': { kind: 'generation_required' } }, ports: {
    generate: async function() { return candidate('generated.repair', 'imageGeneration'); },
    edit: async function() { edits++; return candidate('edited.repair', 'imageEdit'); },
    review: async function() { reviews++; return reviews === 1 ? { pass: false, repairable: true } : { pass: true }; },
  }, ledger: {} });
  assert.equal(edits, 1);
  assert.equal(reviews, 2);
  assert.equal(result.slots[0].candidate.status, 'variant');
  assert.equal(result.slots[0].accepted, true);
  console.log('[AssetReviewRepair] edited candidate receives a fresh review and can pass');
})().catch(function(error) { console.error(error); process.exit(1); });
