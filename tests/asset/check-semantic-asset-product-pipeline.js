var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var semantic = require('@gamecastle/semantic-module');
var sourceContract = require('../../packages/semantic/src/game-semantic-source');
var pipeline = require('../../packages/product/src/semantic-asset-product-pipeline');
var engineContract = require('../../packages/assets/contracts/asset-engine-contract.json');
var enginePorts = require('../fixtures/test-asset-engine-ports');

(async function() {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-semantic-asset-product-'));
  try {
    var source = {
      schemaVersion: sourceContract.SCHEMA_VERSION,
      documentKind: 'game-semantic-source',
      dictionarySource: semantic.dictionary.source,
      game: { semanticId: 'product', name: 'Product' },
      entities: [{ semanticId: 'hero', roles: ['hero'], objectTypeRef: 'gdjs://object/Sprite::Sprite', behaviorTypeRefs: [], members: [] }],
      components: [],
      events: [],
      assetIntents: [{ semanticId: 'hero_visual', roles: ['hero', 'visual'], subject: 'hero', description: 'Readable hero sprite.', productionFamily: 'character', styleId: 'gamecastle.style-dna.v1', constraints: { width: 32, height: 32, transparent: true }, bindings: [] }],
      layoutIntents: [{ semanticId: 'hero_layout', roles: ['world'], subject: 'hero', bounds: { width: 64, height: 64 }, relations: [{ semanticId: 'hero_anchor', layoutRef: 'gc-layout://world/center', subjects: ['hero'] }], bindings: [] }],
      tuningPolicies: { relativeChange: { slight: { mode: 'percentage', value: 0.1 } } }
    };
    var result = await pipeline.run({
      runId: 'semantic-asset-product',
      source: source,
      projectAssetDir: path.join(root, 'assets'),
      assetEngine: {
        ports: enginePorts.createTestAssetEnginePorts({ outputDir: path.join(root, 'masters') }),
        modelPolicy: { provider: 'deepseek', simulated: true }
      }
    });
    assert.deepStrictEqual(result.assetState.trace, engineContract.graph);
    assert.strictEqual(result.sourceHash, result.assetState.assetWorld.sourceHash);
    assert.strictEqual(result.assembly.documentKind, 'semantic-assembly');
    assert.strictEqual(result.projectSeed.documentKind, 'gdjs-project-seed');
    assert.strictEqual(result.projectSeed.assemblyHash, result.assembly.contentHash);
    assert.strictEqual(result.artifact.documentKind, 'gdjs-asset-bound-project-seed');
    assert.strictEqual(result.artifact.project.objects[0].assetBinding.adapterId, 'gdjs.configuration.sprite-first-frame.v1');
    await assert.rejects(function() {
      return pipeline.run({
        runId: 'blocked',
        source: source,
        projectAssetDir: path.join(root, 'blocked'),
        assetEngine: { modelPolicy: { provider: 'external-provider', simulated: false } }
      });
    }, function(error) {
      return error.code === 'SEMANTIC_ASSET_PRODUCT_BLOCKED' && error.assetState.debts.length > 0 && error.assetState.assetWorld === null;
    });
    console.log('[SemanticAssetProductPipeline] public SemanticAssembly, official Asset LangGraph, accepted AssetWorld, and GDJS binding passed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(function(error) {
  console.error(error);
  process.exit(1);
});
