var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var engine = require('./asset-engine-langgraph');
var portsModule = require('./test-asset-engine-ports');
var cloudAssetEngineModule = require('./cloud-asset-engine');
var memoryCloudPorts = require('./test-memory-cloud-ports');

(async function() {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-asset-engine-graph-'));
  try {
    var inputPng = path.join(root, 'sketch.png'); fs.writeFileSync(inputPng, Buffer.from([137,80,78,71,13,10,26,10]));
    var cloudAssetEngine = cloudAssetEngineModule.createCloudAssetEngine({ ports: memoryCloudPorts.createInMemoryCloudPorts().ports });
    var targets = { hero: 'game.player.visual', enemy: 'game.enemy.visual', collectible: 'game.collectible.visual' };
    var slots = ['hero', 'enemy', 'collectible'].map(function(tag) { return { slotId: tag, kind: 'sprite', semanticTags: [tag], styleTags: ['gamecastle.style-dna.v1'], constraints: { width: 96, height: 96, transparent: true }, targetVisualSlotId: targets[tag] }; });
    var productionRequest = { requestId: 'asset-engine-graph', projectId: 'asset-engine-graph', templateId: 'game.runner.v1', templateVersion: 2, styleId: 'gamecastle.style-dna.v1', requiredSlotIds: ['hero', 'enemy', 'collectible'], targetVisualSlotIds: targets };
    var testPorts = portsModule.createTestAssetEnginePorts({ outputDir: path.join(root, 'test-provider') });
    var policy = { provider: 'deepseek', allowExternal: true };
    var result = await engine.runAssetEngine({ runId: 'asset-engine-graph', productionRequest: productionRequest, buildContract: { assetContract: { slots: slots } }, ports: testPorts, modelPolicy: policy, projectAssetDir: path.join(root, 'assets', 'generated'), cloudAssetEngine: cloudAssetEngine, promotionMode: 'none' });
    assert.deepStrictEqual(result.trace, ['asset-intake', 'local-input-archive', 'model-authorize', 'asset-production-plan', 'asset-resolve', 'asset-production-loop', 'asset-finalize', 'cloud-promotion']);
    assert.equal(result.modelPolicyReceipt.allowed, true);
    assert.equal(result.maxCost, Infinity);
    assert.equal(result.assetSpecs.length, 3);
    assert.equal(result.assetProduction.workItems.length, 3);
    assert.equal(result.assetManifest.summary.generated, 3);
    assert.equal(result.runtimeBindingManifest.targetRuntime, 'gdevelop');
    assert.equal(result.runtimeBindingManifest.bindings.length, 3);
    assert.equal(result.runtimeBindingManifest.bindings[0].targetVisualSlotId, 'game.player.visual');
    assert(result.runtimeBindingManifest.bindings[0].asset.path, 'runtime binding must retain the accepted pixel path');
    assert.equal(result.assetWorld.summary.totalSlots, 3);
    assert.equal(result.debts.length, 0);
    assert.equal(result.cloudPromotion.entries.length, 0);
    var denied = await engine.runAssetEngine({ runId: 'asset-engine-model-denied', productionRequest: Object.assign({}, productionRequest, { requestId: 'asset-engine-model-denied' }), buildContract: { assetContract: { slots: slots } }, ports: testPorts, modelPolicy: { provider: 'external-provider', simulated: false }, projectAssetDir: path.join(root, 'denied') });
    assert.equal(denied.modelPolicyReceipt.code, 'MODEL_UNAVAILABLE');
    assert.equal(denied.assetProduction.pass, false);
    assert(denied.debts.length > 0);
    var budgeted = await engine.runAssetEngine({ runId: 'asset-engine-budgeted', productionRequest: Object.assign({}, productionRequest, { requestId: 'asset-engine-budgeted' }), buildContract: { assetContract: { slots: slots } }, ports: testPorts, modelPolicy: { provider: 'deepseek', allowExternal: true, maxCost: 0 }, projectAssetDir: path.join(root, 'budgeted') });
    assert.equal(budgeted.maxCost, 0);
    assert.equal(budgeted.assetProduction.pass, false);
    assert(budgeted.debts.length > 0);
    assert.throws(function() { engine.compileSpecs({ assetContract: { slots: [{ slotId: 'hero', bindingTarget: 'Player' }] } }); }, /stale input/);
    console.log('[AssetEngineLangGraph] canonical production plan, per-slot loops, complete coverage, binding projection and fail-closed provider policy passed');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
})().catch(function(error) { console.error(error); process.exit(1); });
