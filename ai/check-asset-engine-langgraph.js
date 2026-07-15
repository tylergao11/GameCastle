var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var engine = require('./asset-engine-langgraph');
var outboxModule = require('./asset-publication-outbox');
var publisher = require('./asset-library-publisher');
var portsModule = require('./test-asset-engine-ports');
var libraryPorts = require('./test-asset-library-ports');
var engineContract = require('../shared/asset-engine-contract.json');

function requirements() {
  return {
    schemaVersion: 2,
    documentKind: 'semantic-asset-requirements',
    sourceHash: 'semantic.asset-engine.fixture',
    requirements: [
      { semanticId: 'hero_visual', subject: 'hero', description: 'Hero sprite', roles: ['hero'], gdjsBindings: [], productionFamily: 'character', recipeId: 'character-sprite.v1', styleId: 'gamecastle.style-dna.v1', constraints: { width: 96, height: 96, transparent: true } },
      { semanticId: 'enemy_visual', subject: 'enemy', description: 'Enemy sprite', roles: ['enemy'], gdjsBindings: [], productionFamily: 'character', recipeId: 'character-sprite.v1', styleId: 'gamecastle.style-dna.v1', constraints: { width: 96, height: 96, transparent: true } },
      { semanticId: 'collectible_visual', subject: 'collectible', description: 'Collectible sprite', roles: ['collectible'], gdjsBindings: [], productionFamily: 'prop', recipeId: 'prop-sprite.v1', styleId: 'gamecastle.style-dna.v1', constraints: { width: 96, height: 96, transparent: true } }
    ]
  };
}

(async function() {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-asset-engine-graph-'));
  try {
    var definition = engine.describeGraph();
    assert.deepStrictEqual(definition.stages.map(function(stage) { return stage.stage; }), engineContract.graph);
    assert(definition.stages.every(function(stage) { return stage.dependencies.length > 0 && stage.dependencies.every(function(dependency) { return dependency.exports.length > 0; }); }), 'every LangGraph stage must resolve its declared module exports before invocation');
    assert.throws(function() { engine.assertLangGraphRuntime({}); }, function(error) { return error.code === 'ASSET_ENGINE_LANGGRAPH_RUNTIME_INVALID'; });
    engineContract.stageDefinitions['asset-intake'][0].exports.push('missingDefinitionProbe');
    assert.throws(function() { engine.describeGraph(); }, function(error) { return error.code === 'ASSET_ENGINE_STAGE_EXPORT_MISSING'; }, 'a missing contract-declared definition must fail before graph invocation');
    engineContract.stageDefinitions['asset-intake'][0].exports.pop();
    var testPorts = portsModule.createTestAssetEnginePorts({ outputDir: path.join(root, 'test-provider') });
    var libraryPort = libraryPorts.createTestAssetLibraryPort();
    var result = await engine.runAssetEngine({ runId: 'asset-engine-graph', assetRequirementContract: requirements(), ports: testPorts, modelPolicy: { provider: 'deepseek', allowExternal: true }, projectAssetDir: path.join(root, 'assets', 'generated') });
    assert.deepStrictEqual(result.trace, engineContract.graph);
    assert.strictEqual(result.assetSpecs.length, 3);
    assert.strictEqual(result.assetProduction.workItems.length, 3);
    assert.strictEqual(result.assetManifest.sourceHash, 'semantic.asset-engine.fixture');
    assert.strictEqual(result.runtimeBindingManifest.sourceHash, 'semantic.asset-engine.fixture');
    assert.strictEqual(result.runtimeBindingManifest.bindings.length, 3);
    assert.strictEqual(result.debts.length, 0);
    assert.strictEqual(result.assetPublicationOutboxEntries.length, 3);
    assert.strictEqual(result.assetLibraryAccelerationReport.events.every(function(event) { return event.outcome === 'unconfigured'; }), true);
    var publication = await publisher.drain({ outbox: outboxModule.create({ path: result.assetPublicationOutbox.path }), assetLibraryPort: libraryPort });
    assert.strictEqual(publication.published.length, 3);
    var reused = await engine.runAssetEngine({ runId: 'asset-engine-library-reuse', assetRequirementContract: requirements(), ports: testPorts, assetLibraryPort: libraryPort, modelPolicy: { provider: 'deepseek', allowExternal: true }, projectAssetDir: path.join(root, 'assets', 'reused') });
    assert.strictEqual(reused.assetManifest.assets.every(function(asset) { return asset.source === 'assetLibrary'; }), true);
    assert.strictEqual(reused.assetPublicationOutboxEntries.length, 0, 'reused library revisions must not enter the publication outbox');
    var denied = await engine.runAssetEngine({ runId: 'asset-engine-model-denied', assetRequirementContract: requirements(), ports: testPorts, assetLibraryPort: libraryPorts.createTestAssetLibraryPort(), modelPolicy: { provider: 'external-provider', simulated: false }, projectAssetDir: path.join(root, 'denied') });
    assert.strictEqual(denied.modelPolicyReceipt.code, 'MODEL_UNAVAILABLE');
    assert.strictEqual(denied.assetProduction.pass, false);
    assert(denied.debts.length > 0);
    var budgetCalls = 0, budgetPorts = Object.assign({}, testPorts, { generateMaster: async function(state) { budgetCalls++; return testPorts.generateMaster(state); } });
    var budget = await engine.runAssetEngine({ runId: 'asset-engine-budget-denied', assetRequirementContract: requirements(), ports: budgetPorts, assetLibraryPort: libraryPorts.createTestAssetLibraryPort(), modelPolicy: { provider: 'deepseek', simulated: true }, maxCost: 0, projectAssetDir: path.join(root, 'budget-denied') });
    assert.strictEqual(budget.modelPolicyReceipt.code, 'MODEL_BUDGET_EXHAUSTED'); assert.strictEqual(budgetCalls, 0, 'zero model budget must remove the master-image port');
    assert.throws(function() { engine.compileSpecs({ documentKind: 'semantic-asset-requirements', sourceHash: 'x', requirements: [{ semanticId: 'hero' }] }); }, /incomplete requirement/);
    console.log('[AssetEngineLangGraph] official runtime, declared stage definitions, semantic requirements, library-first production, deterministic derivation, outbox, and fail-closed provider policy passed');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
})().catch(function(error) { console.error(error); process.exit(1); });
