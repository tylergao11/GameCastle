var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var engine = require('./asset-engine-langgraph');
var portsModule = require('./simulated-local-asset-ports');
var cloudAssetEngineModule = require('./cloud-asset-engine');
var memoryCloudPorts = require('./test-memory-cloud-ports');

(async function() {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-asset-engine-graph-'));
  try {
    var inputPng = path.join(root, 'sketch.png'); fs.writeFileSync(inputPng, Buffer.from([137,80,78,71,13,10,26,10]));
    var cloudAssetEngine = cloudAssetEngineModule.createCloudAssetEngine({ ports: memoryCloudPorts.createInMemoryCloudPorts().ports });
    var slots = ['sun', 'moon', 'key'].map(function(tag) { return { slotId: 'asset.graph.' + tag, kind: 'sprite', semanticTags: [tag], styleTags: ['gamecastle.style-1'], constraints: { width: 96, height: 96, transparent: true }, bindingTarget: 'ui.' + tag }; });
    var result = await engine.runAssetEngine({ runId: 'asset-engine-graph', buildContract: { assetContract: { slots: slots } }, localInputs: { 'asset.graph.sun': { path: inputPng, scope: 'private-local' } }, ports: portsModule.createSimulatedLocalAssetPorts({ outputDir: root }), projectAssetDir: path.join(root, 'assets', 'generated'), cloudAssetEngine: cloudAssetEngine, promotionMode: 'none' });
    assert.deepStrictEqual(result.trace, ['asset-intake', 'local-input-archive', 'model-authorize', 'asset-resolve', 'asset-finalize', 'cloud-promotion']);
    assert.equal(result.modelPolicyReceipt.allowed, true);
    assert.equal(result.maxCost, Infinity);
    assert.equal(result.assetSpecs.length, 3);
    assert.equal(result.localInputRecords[0].scope, 'private-local');
    assert.equal(result.localInputRecords[0].contentHash.length, 64);
    assert.equal(result.weaveResult.slots.length, 3);
    assert.equal(result.assetManifest.summary.generated, 3);
    assert.equal(result.runtimeBindingManifest.targetRuntime, 'gdevelop');
    assert.equal(result.runtimeBindingManifest.bindings.length, 3);
    assert.equal(result.assetWorld.summary.totalSlots, 3);
    assert.equal(result.debts.length, 0);
    assert.equal(result.cloudPromotion.entries.length, 0);
    var denied = await engine.runAssetEngine({ runId: 'asset-engine-model-denied', buildContract: { assetContract: { slots: [slots[0]] } }, ports: portsModule.createSimulatedLocalAssetPorts({ outputDir: root }), modelPolicy: { provider: 'external-provider', simulated: false } });
    assert.equal(denied.modelPolicyReceipt.code, 'MODEL_UNAVAILABLE');
    assert.equal(denied.weaveResult.slots[0].candidate.status, 'placeholder');
    assert.equal(denied.weaveResult.slots[0].debt, 'MODEL_UNAVAILABLE');
    var budgeted = await engine.runAssetEngine({ runId: 'asset-engine-budgeted', buildContract: { assetContract: { slots: [slots[0]] } }, ports: portsModule.createSimulatedLocalAssetPorts({ outputDir: root }), modelPolicy: { maxCost: 0 } });
    assert.equal(budgeted.maxCost, 0);
    assert.equal(budgeted.weaveResult.slots[0].candidate.status, 'placeholder');
    assert.equal(budgeted.weaveResult.slots[0].debt, 'budget_exhausted');
    var promotionSlot = { slotId: 'asset.graph.public-hero', kind: 'sprite', styleId: 'gamecastle.style-1', semanticTags: ['role.hero'], constraints: { width: 1, height: 1, transparent: true } };
    var promotion = await engine.runAssetEngine({ runId: 'asset-engine-promotion', buildContract: { assetContract: { slots: [promotionSlot] } }, sources: { 'asset.graph.public-hero': { kind: 'generation_required', requestCloudPromotion: true, cloudKind: 'raster', semanticTags: ['role.hero'], provenanceTypeId: 'provenance.model-assisted-final', licensePolicyId: 'license.creator-share', qualityTierId: 'quality.accepted', qualityFlags: [] } }, ports: { generate: async function() { return { assetId: 'generated.public-hero', path: inputPng, format: 'png', width: 1, height: 1, transparent: true, styleId: 'gamecastle.style-1', semanticTags: ['role.hero'], provenanceTypeId: 'provenance.model-assisted-final', licensePolicyId: 'license.creator-share', qualityTierId: 'quality.accepted', qualityFlags: [], publishability: { playable: true, publishable: true, repoEligible: true, blocksFinalExport: false } }; }, review: async function() { return { pass: true, repairable: false }; } }, cloudAssetEngine: cloudAssetEngine, promotionMode: 'sync', shareConsent: true });
    assert.equal(promotion.cloudPromotion.entries[0].state, 'published');
    assert(cloudAssetEngine.findExactForSpec(promotionSlot), 'published promotion must be queryable by the public cloud engine');
    console.log('[AssetEngineLangGraph] intake, optional local archive, nested resolve/review, finalize, binding, AssetWorld, and explicit-promotion boundary passed');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
})().catch(function(error) { console.error(error); process.exit(1); });
