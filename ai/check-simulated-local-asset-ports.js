var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var graph = require('./asset-weave-graph');
var portsModule = require('./simulated-local-asset-ports');

(async function() {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-simulated-ports-'));
  try {
    var ports = portsModule.createSimulatedLocalAssetPorts({ outputDir: root });
    var slots = ['asset.icon.sun', 'asset.icon.moon', 'asset.icon.key'].map(function(slotId) { return { slotId: slotId, kind: 'sprite', semanticTags: [slotId.split('.').pop()], styleTags: ['gamecastle.style-1'], constraints: { transparent: true } }; });
    var result = await graph.runAssetWeave({ runId: 'simulated-three-icons', buildContract: { assetContract: { slots: slots } }, ports: ports, projectAssetDir: path.join(root, 'assets', 'generated'), visualIntents: {} });
    assert.equal(result.slots.length, 3);
    result.slots.forEach(function(slot) { assert.equal(slot.accepted, true); assert.equal(slot.candidate.simulated, true); assert.equal(slot.candidate.source, 'imageGeneration'); assert.equal(slot.review.simulated, true); assert.equal(slot.review.pass, true); assert.equal(slot.cloudPromotionQueue.length, 0); assert(fs.existsSync(slot.candidate.path)); var signature = fs.readFileSync(slot.candidate.path).subarray(0, 8); assert(signature.equals(Buffer.from([137,80,78,71,13,10,26,10]))); });
    console.log('[SimulatedLocalAssetPorts] three transparent STYLE 1 icons generated, reviewed, and accepted');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
})().catch(function(error) { console.error(error); process.exit(1); });
