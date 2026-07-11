var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var storeModule = require('./local-runtime/local-asset-store');
var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-local-assets-'));
(async function() {
try {
  var store = storeModule.createLocalAssetStore({ outputDir: root });
  var png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLw0QAAAABJRU5ErkJggg==';
  var saved = await store.bind({ binding: 'asset.ui.custom', revisionId: 'revision-1', asset: { png: png }, assetSpec: { slotId: 'asset.ui.custom', kind: 'sprite', semanticTags: ['asset.ui.custom'], styleTags: ['gamecastle.style-1'] }, visualIntent: { motion: 'float' } });
  assert.equal(saved.asset.path.indexOf('assets/local/') === 0, true);
  assert.equal(store.list().length, 1);
  assert(fs.existsSync(path.join(root, saved.asset.path)));
  var world = JSON.parse(fs.readFileSync(path.join(root, 'asset-world.json'), 'utf8'));
  assert.equal(world.slots.length, 1);
  assert.equal(world.slots[0].slotId, 'asset.ui.custom');
  assert.equal(world.slots[0].source, 'localExplicit');
  assert.equal(saved.revision.immutable, true);
  assert.equal(saved.revision.revisionId, 'revision-1');
  assert.equal(saved.operationReceipt.inputHash, saved.operationReceipt.outputHash);
  await assert.rejects(function() { return store.bind({ binding: '../escape', asset: { png: png }, visualIntent: {} }); }, /malformed/);
  await assert.rejects(function() { return store.bind({ binding: 'asset.ui.bad', asset: { png: 'data:image\/jpeg;base64,AAAA' }, visualIntent: {} }); }, /Only PNG/);
  console.log('[LocalAssetStore] PNG validation, content hash, and export binding passed');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
})().catch(function(error) { console.error(error); process.exit(1); });
