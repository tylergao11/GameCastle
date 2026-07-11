var assert = require('assert'); var fs = require('fs'); var os = require('os'); var path = require('path');
var repository = require('./asset-repository'); var weave = require('./asset-weave-graph');
async function main() {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-sketch-playable-'));
  try {
    var drawing = path.join(root, 'ghost.png'); fs.writeFileSync(drawing, Buffer.from([137,80,78,71]));
    var local = repository.createAssetRepository(path.join(root, 'local'));
    var sketch = local.importAsset(drawing, { provenance: 'sketch-pad', license: 'owned', semanticTags: ['ghost'] });
    var slot = { slotId: 'asset.sprite.ghost', kind: 'sprite', semanticTags: ['ghost'], styleTags: ['doodle'], constraints: { width: 32, height: 48, transparent: true } };
    var result = await weave.runAssetWeave({ runId: 'sketch-playable', buildContract: { assetContract: { slots: [slot] } }, localAssets: { 'asset.sprite.ghost': sketch }, visualIntents: { 'asset.sprite.ghost': { subject: 'ghost', motion: 'float' } }, ports: { generate: async function() { throw new Error('local sketch must not generate'); }, edit: async function() { throw new Error('local sketch must not edit'); }, review: async function() { throw new Error('local sketch must not review'); } } });
    var bound = result.assetBindings[0];
    assert.equal(result.assetManifest.assets[0].source, 'localExplicit'); assert.equal(bound.status, 'reused'); assert.equal(bound.stateMachine.initial, 'idle'); assert(bound.animation.states.death.length > 0);
    console.log('[SketchToPlayable] local sketch -> Asset Weave -> animation binding passed');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
main().catch(function(error) { console.error(error); process.exitCode = 1; });
