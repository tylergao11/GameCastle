var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var encoder = require('./local-derivation-port');
var runnerModule = require('./cloud-local-plan-runner');
var weave = require('./asset-weave-graph');

(async function() {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-cloud-plan-'));
  try {
    var raster = { width: 1, height: 1, data: new Uint8ClampedArray([238,73,58,255]) }, source = path.join(root, 'source.png'); fs.writeFileSync(source, encoder.encodePng(raster));
    var plan = { operations: [{ op: 'pad_canvas', params: { padding: 1 } }], requiresNewPixels: false, estimatedCost: 'local-only' }, runner = runnerModule.createCloudLocalPlanRunner({ outputDir: path.join(root, 'derived') });
    var candidate = await runner.run({ source: { asset: { assetId: 'revision.cloud', revisionId: 'revision.cloud', path: source, styleId: 'gamecastle.style-1', semanticTags: ['hero'], styleTags: ['arcade'] }, localPlan: plan } });
    assert.equal(candidate.width, 3); assert.equal(candidate.height, 3); assert(fs.existsSync(candidate.path)); assert.equal(candidate.operationReceipts[0].op, 'pad_canvas');
    var result = await weave.runAssetWeave({ runId: 'cloud-plan-run', buildContract: { assetContract: { slots: [{ slotId: 'asset.hero', kind: 'sprite', styleId: 'gamecastle.style-1', semanticTags: ['hero'], styleTags: ['arcade'], constraints: { width: 3, height: 3, transparent: true } }] } }, sources: { 'asset.hero': { kind: 'cloud_near', asset: { assetId: 'revision.cloud', path: source, format: 'png', width: 1, height: 1, transparent: true, styleId: 'gamecastle.style-1', semanticTags: ['hero'], styleTags: ['arcade'], status: 'approved' }, localPlan: plan } }, ports: { localPlan: runner } });
    assert.equal(result.slots[0].candidate.source, 'deterministicVariant'); assert.equal(result.slots[0].candidate.width, 3); assert.equal(result.assetBindings[0].status, 'variant');
    console.log('[CloudLocalPlanRunner] declared cloud plan executes locally before any model route');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
})().catch(function(error) { console.error(error); process.exit(1); });
