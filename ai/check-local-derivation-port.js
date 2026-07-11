var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var portModule = require('./local-derivation-port');
var weave = require('./asset-weave-graph');

function raster() { var data = new Uint8ClampedArray(4 * 4 * 4); data[(1 * 4 + 1) * 4] = 255; data[(1 * 4 + 1) * 4 + 3] = 255; return { width: 4, height: 4, data: data }; }
function spec() { return { schemaVersion: 1, dictionaryId: 'gamecastle.asset-style-dictionary', styleId: 'gamecastle.style-1', operationId: 'derive.trim', op: 'trim_alpha', input: { assetId: 'local.source', contentHash: 'fixture' }, params: {}, output: { format: 'png', transparent: true }, scope: 'project-local' }; }
(async function() {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-local-derive-port-'));
  try {
    var port = portModule.createLocalDerivationPort({ outputDir: root });
    var state = { slot: { slotId: 'asset.derived', semanticTags: ['gem'], styleTags: ['arcade'] }, source: { derivationSpec: spec(), derivationContext: { raster: raster(), parentRevisionId: 'rev.source' } } };
    var candidate = await port.derive(state);
    assert(fs.existsSync(candidate.path)); assert.equal(candidate.format, 'png'); assert.equal(candidate.width, 1); assert.equal(candidate.derivationReceipt.parentRevisionId, 'rev.source');
    var result = await weave.runAssetWeave({ runId: 'local-derive-port', buildContract: { assetContract: { slots: [{ slotId: 'asset.derived', kind: 'sprite', semanticTags: ['gem'], styleId: 'gamecastle.style-1', styleTags: ['arcade'], constraints: { transparent: true } }] } }, sources: { 'asset.derived': { kind: 'cloud_near', derivationSpec: spec(), derivationContext: { raster: raster(), parentRevisionId: 'rev.source' } } }, ports: { localDerive: port } });
    assert.equal(result.slots[0].candidate.source, 'deterministicVariant'); assert(fs.existsSync(result.slots[0].candidate.path)); assert.equal(result.assetBindings[0].status, 'variant');
    console.log('[LocalDerivationPort] kernel raster materializes as project-local PNG and enters Asset Weave binding');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
})().catch(function(error) { console.error(error); process.exit(1); });
