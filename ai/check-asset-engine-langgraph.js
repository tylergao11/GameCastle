var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var engine = require('./asset-engine-langgraph');
var portsModule = require('./test-asset-engine-ports');

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
    var testPorts = portsModule.createTestAssetEnginePorts({ outputDir: path.join(root, 'test-provider') });
    var result = await engine.runAssetEngine({ runId: 'asset-engine-graph', assetRequirementContract: requirements(), ports: testPorts, modelPolicy: { provider: 'deepseek', allowExternal: true }, projectAssetDir: path.join(root, 'assets', 'generated'), promotionMode: 'none' });
    assert.deepStrictEqual(result.trace, ['asset-intake', 'local-input-archive', 'model-authorize', 'asset-production-plan', 'asset-resolve', 'asset-production-loop', 'asset-finalize', 'semantic-asset-cache']);
    assert.strictEqual(result.assetSpecs.length, 3);
    assert.strictEqual(result.assetProduction.workItems.length, 3);
    assert.strictEqual(result.assetManifest.sourceHash, 'semantic.asset-engine.fixture');
    assert.strictEqual(result.runtimeBindingManifest.sourceHash, 'semantic.asset-engine.fixture');
    assert.strictEqual(result.runtimeBindingManifest.bindings.length, 3);
    assert.strictEqual(result.debts.length, 0);
    assert.deepStrictEqual(result.cacheWrites, []);
    var denied = await engine.runAssetEngine({ runId: 'asset-engine-model-denied', assetRequirementContract: requirements(), ports: testPorts, modelPolicy: { provider: 'external-provider', simulated: false }, projectAssetDir: path.join(root, 'denied') });
    assert.strictEqual(denied.modelPolicyReceipt.code, 'MODEL_UNAVAILABLE');
    assert.strictEqual(denied.assetProduction.pass, false);
    assert(denied.debts.length > 0);
    assert.throws(function() { engine.compileSpecs({ documentKind: 'semantic-asset-requirements', sourceHash: 'x', requirements: [{ semanticId: 'hero' }] }); }, /incomplete requirement/);
    console.log('[AssetEngineLangGraph] semantic asset requirements, per-intent production loops, and fail-closed provider policy passed');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
})().catch(function(error) { console.error(error); process.exit(1); });
