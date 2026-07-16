var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var engine = require('../../packages/assets/src/asset-engine-langgraph');
var outboxModule = require('../../packages/assets/src/asset-publication-outbox');
var publisher = require('../../packages/assets/src/asset-library-publisher');
var portsModule = require('../fixtures/test-asset-engine-ports');
var libraryPorts = require('../fixtures/test-asset-library-ports');
var engineContract = require('../../packages/assets/contracts/asset-engine-contract.json');
var assetWorldContract = require('../../packages/assets/src/asset-world');

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
function oneRequirement() { var value = requirements(); value.sourceHash = 'semantic.asset-engine.diagnostic-fixture'; value.requirements = [value.requirements[0]]; return value; }

(async function() {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-asset-engine-graph-'));
  try {
    assert.strictEqual(assetWorldContract.buildAssetWorld, undefined, 'retired partial AssetWorld builder must not remain as a compatibility API');
    var definition = engine.describeGraph();
    assert.deepStrictEqual(definition.stages.map(function(stage) { return stage.stage; }), engineContract.graph);
    assert(definition.stages.every(function(stage) { return stage.dependencies.length > 0 && stage.dependencies.every(function(dependency) { return dependency.exports.length > 0; }); }), 'every LangGraph stage must resolve its declared module exports before invocation');
    assert.throws(function() { engine.assertLangGraphRuntime({}); }, function(error) { return error.code === 'ASSET_ENGINE_LANGGRAPH_RUNTIME_INVALID'; });
    engineContract.stageDefinitions['asset-intake'][0].exports.push('missingDefinitionProbe');
    assert.throws(function() { engine.describeGraph(); }, function(error) { return error.code === 'ASSET_ENGINE_STAGE_EXPORT_MISSING'; }, 'a missing contract-declared definition must fail before graph invocation');
    engineContract.stageDefinitions['asset-intake'][0].exports.pop();
    engine._resetCompiledGraphCache();
    assert.deepStrictEqual(engine._compiledGraphMetrics(), { compiles: 0, cacheHits: 0, invocations: 0, cached: false });
    var testPorts = portsModule.createTestAssetEnginePorts({ outputDir: path.join(root, 'test-provider') });
    var diagnosticCalls = 0, diagnosticPorts = Object.assign({}, testPorts, { generateMaster: async function(state) { diagnosticCalls++; return testPorts.generateMaster(state); } });
    assert.deepStrictEqual(await engine.prewarmGraph(), { ready: true, stages: engineContract.graph }, 'prewarm compiles only the contract-declared AssetEngine graph');
    assert.strictEqual(diagnosticCalls, 0, 'prewarm must not invoke a model or construct a run');
    assert.deepStrictEqual(engine._compiledGraphMetrics(), { compiles: 1, cacheHits: 0, invocations: 0, cached: true }, 'prewarm creates a reusable graph without any invocation state');
    var diagnostic = await engine.runAssetEngine({ runId: 'asset-engine-diagnostic', executionProfileId: 'asset-engine-test.v1', assetRequirementContract: oneRequirement(), ports: diagnosticPorts, modelPolicy: { provider: 'deepseek', allowExternal: true }, projectAssetDir: path.join(root, 'assets', 'diagnostic'), assetPublicationOutboxPath: path.join(root, 'diagnostic-outbox.json') });
    assert.strictEqual(diagnostic.accepted, true); assert.strictEqual(diagnosticCalls, 1); assert.strictEqual(diagnostic.assetProductionReport.executionPolicy.maxCandidateImagesPerGeneratedWorkItem, 2);
    assert.deepStrictEqual(engine._compiledGraphMetrics(), { compiles: 1, cacheHits: 1, invocations: 1, cached: true }, 'the first invocation uses the prewarmed AssetEngine graph');
    diagnosticCalls = 0;
    var cacheProbeRequirements = oneRequirement(); cacheProbeRequirements.sourceHash = 'semantic.asset-engine.cache-reuse-fixture';
    var cacheProbe = await engine.runAssetEngine({ runId: 'asset-engine-cache-reuse', executionProfileId: 'asset-engine-test.v1', assetRequirementContract: cacheProbeRequirements, ports: testPorts, modelPolicy: { provider: 'deepseek', allowExternal: true }, projectAssetDir: path.join(root, 'assets', 'cache-reuse') });
    assert.strictEqual(cacheProbe.accepted, true); assert.strictEqual(cacheProbe.assetManifest.runId, 'asset-engine-cache-reuse'); assert.strictEqual(cacheProbe.assetManifest.sourceHash, cacheProbeRequirements.sourceHash); assert.deepStrictEqual(cacheProbe.trace, engineContract.graph, 'a reused compiled graph starts from fresh per-run state');
    assert.deepStrictEqual(engine._compiledGraphMetrics(), { compiles: 1, cacheHits: 2, invocations: 2, cached: true }, 'two distinct runs share one compiled graph without sharing their input state');
    await assert.rejects(engine.runAssetEngine({ runId: 'asset-engine-diagnostic-too-wide', executionProfileId: 'asset-engine-test.v1', assetRequirementContract: requirements(), ports: diagnosticPorts, modelPolicy: { provider: 'deepseek', allowExternal: true }, projectAssetDir: path.join(root, 'assets', 'diagnostic-too-wide') }), function(error) { return error.code === 'ASSET_ENGINE_EXECUTION_SCOPE_EXCEEDED'; });
    assert.strictEqual(diagnosticCalls, 0, 'diagnostic profile must reject multi-generation scope before the first provider call');
    var libraryPort = libraryPorts.createTestAssetLibraryPort();
    var result = await engine.runAssetEngine({ runId: 'asset-engine-graph', assetRequirementContract: requirements(), ports: testPorts, modelPolicy: { provider: 'deepseek', allowExternal: true }, projectAssetDir: path.join(root, 'assets', 'generated') });
    assert.deepStrictEqual(result.trace, engineContract.graph);
    assert.strictEqual(result.assetSpecs.length, 3);
    assert.strictEqual(result.assetProduction.workItems.length, 3);
    assert.strictEqual(result.assetManifest.sourceHash, 'semantic.asset-engine.fixture');
    assert.strictEqual(result.runtimeBindingManifest.sourceHash, 'semantic.asset-engine.fixture');
    assert.strictEqual(result.runtimeBindingManifest.bindings.length, 3);
    assert.strictEqual(assetWorldContract.validateAcceptedAssetWorld(result.assetWorld).contentHash, result.assetWorld.contentHash);
    assert.strictEqual(result.assetWorld.workItemAcceptanceReceipts.length, 3);
    assert(result.assetWorld.reviewReceipts.length > 0);
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
    assert.strictEqual(denied.assetWorld, null, 'blocked production must not expose a partial AssetWorld');
    var budgetCalls = 0, budgetPorts = Object.assign({}, testPorts, { generateMaster: async function(state) { budgetCalls++; return testPorts.generateMaster(state); } });
    var budget = await engine.runAssetEngine({ runId: 'asset-engine-budget-denied', assetRequirementContract: requirements(), ports: budgetPorts, assetLibraryPort: libraryPorts.createTestAssetLibraryPort(), modelPolicy: { provider: 'deepseek', simulated: true }, maxCost: 0, projectAssetDir: path.join(root, 'budget-denied') });
    assert.strictEqual(budget.modelPolicyReceipt.code, 'MODEL_BUDGET_EXHAUSTED'); assert.strictEqual(budgetCalls, 0, 'zero model budget must remove the master-image port');
    assert.strictEqual(budget.assetWorld, null, 'budget debt must not expose a partial AssetWorld');
    assert.throws(function() { engine.compileSpecs({ documentKind: 'semantic-asset-requirements', sourceHash: 'x', requirements: [{ semanticId: 'hero' }] }); }, /incomplete requirement/);
    console.log('[AssetEngineLangGraph] official runtime, declared stage definitions, semantic requirements, library-first production, deterministic derivation, outbox, and fail-closed provider policy passed');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
})().catch(function(error) { console.error(error); process.exit(1); });
