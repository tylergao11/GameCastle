'use strict';

var assert = require('assert');
var crypto = require('crypto');
var fs = require('fs');
var os = require('os');
var path = require('path');
var semantic = require('@gamecastle/semantic-module');
var assetEngine = require('@gamecastle/asset-engine');
var assembly = require('@gamecastle/assembly-module');

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(result, key) {
    result[key] = stable(value[key]);
    return result;
  }, {});
  return value;
}
function reseal(value, prefix) {
  var core = JSON.parse(JSON.stringify(value));
  delete core.contentHash;
  value.contentHash = prefix + crypto.createHash('sha256').update(JSON.stringify(stable(core))).digest('hex').slice(0, 24);
  return value;
}

if (!process.env.GAMECASTLE_LIBGD_PATH) {
  var cachedLibGD = path.resolve(__dirname, '../../.gamecastle/cache/gdevelop/codegen/libGD.js');
  var bundledLibGD = path.resolve(__dirname, '../../engine/gdevelop-codegen/libGD.js');
  if (fs.existsSync(cachedLibGD)) process.env.GAMECASTLE_LIBGD_PATH = cachedLibGD;
  else if (fs.existsSync(bundledLibGD)) process.env.GAMECASTLE_LIBGD_PATH = bundledLibGD;
}

function sourceFixture() {
  return {
    schemaVersion: 6,
    documentKind: 'game-semantic-source',
    dictionarySource: semantic.dictionary.source,
    game: { semanticId: 'assembly_module_check', name: 'Assembly Module Check' },
    entities: [{
      semanticId: 'player',
      roles: ['player'],
      objectTypeRef: 'gdjs://object/Sprite::Sprite',
      behaviorTypeRefs: [],
      members: [{ semanticId: 'health', roles: ['survival'], value: 100, bindings: [] }]
    }],
    components: [],
    events: [],
    assetIntents: [{
      semanticId: 'player_visual',
      roles: ['player', 'visual'],
      subject: 'player',
      description: 'A readable player sprite.',
      productionFamily: 'character',
      styleId: 'gamecastle.style-dna.v1',
      constraints: { transparent: true },
      bindings: []
    }],
    layoutIntents: [{
      semanticId: 'player_layout',
      roles: ['world'],
      subject: 'player',
      bounds: { width: 64, height: 64 },
      relations: [{
        semanticId: 'player_anchor',
        layoutRef: 'gc-layout://world/center',
        subjects: ['player']
      }],
      bindings: []
    }],
    tuningPolicies: { relativeChange: { slight: { mode: 'percentage', value: 0.1 } } }
  };
}

async function main() {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-assembly-module-'));
  try {
    var semanticAssembly = semantic.compileSemanticAssembly(sourceFixture());
    var forgedSemanticAssembly = JSON.parse(JSON.stringify(semanticAssembly));
    forgedSemanticAssembly.assetRequirements.requirements[0].description = 'Forged asset requirement';
    reseal(forgedSemanticAssembly, 'assembly.');
    assert.throws(function() {
      assembly.createProjectSeed({ semanticAssembly: forgedSemanticAssembly });
    }, function(error) {
      return error.code === 'ASSEMBLY_MODULE_SEMANTIC_ASSEMBLY_NONCANONICAL';
    }, 'A recomputed caller hash must not authorize forged compiler evidence.');
    assert.throws(function() {
      assetEngine.createOfflineRequirementSet({ semanticAssembly: forgedSemanticAssembly, projectId: 'assembly-module-check' });
    }, function(error) {
      return error.code === 'ASSET_ENGINE_SEMANTIC_ASSEMBLY_NONCANONICAL';
    }, 'The semantic-to-asset conversion must reject forged compiler evidence too.');
    var projectSeed = assembly.createProjectSeed({ semanticAssembly: semanticAssembly });
    assert.strictEqual(projectSeed.documentKind, 'gdjs-project-seed');
    assert.strictEqual(projectSeed.assemblyHash, semanticAssembly.contentHash);
    assert.strictEqual(projectSeed.generatedCode.length, 1, 'The public assembly entry must invoke the configured official libGD compiler.');
    assert.deepStrictEqual(assembly.createProjectSeed({ semanticAssembly: semanticAssembly }), projectSeed, 'Project seed creation must be deterministic.');
    assert.deepStrictEqual(assembly.createProjectSeed({ source: semanticAssembly.source }), projectSeed, 'The explicit public source route must compile the same SemanticAssembly and project seed.');

    var offlineRequirementSet = assetEngine.createOfflineRequirementSet({ semanticAssembly: semanticAssembly, projectId: 'assembly-module-check' });
    assert.strictEqual(offlineRequirementSet.sourceHash, semanticAssembly.sourceHash);
    assert.deepStrictEqual(offlineRequirementSet.requirements[0].semanticTags, semanticAssembly.assetRequirements.requirements[0].roles);
    assert.deepStrictEqual(offlineRequirementSet.requirements[0].constraints, { width: 32, height: 32, transparent: true });
    var acceptedAssetWorld = await assetEngine.runOffline(offlineRequirementSet, { assetDir: root });
    assetEngine.validateAcceptedAssetWorld(acceptedAssetWorld, { sourceHash: semanticAssembly.sourceHash });
    assert.strictEqual(fs.existsSync(acceptedAssetWorld.slots[0].path), true, 'Public offline AcceptedAssetWorld must materialize its accepted PNG bytes.');

    var forgedProjectSeed = JSON.parse(JSON.stringify(projectSeed));
    forgedProjectSeed.project.properties.name = 'Forged Project Seed';
    reseal(forgedProjectSeed, 'project-seed.');
    assert.throws(function() {
      assembly.bindAcceptedAssets({ semanticAssembly: semanticAssembly, projectSeed: forgedProjectSeed, acceptedAssetWorld: acceptedAssetWorld });
    }, function(error) {
      return error.code === 'ASSEMBLY_MODULE_PROJECT_SEED_NONCANONICAL';
    }, 'A recomputed caller hash must not authorize a forged project seed.');

    var assetBoundProjectSeed = assembly.bindAcceptedAssets({ semanticAssembly: semanticAssembly, projectSeed: projectSeed, acceptedAssetWorld: acceptedAssetWorld });
    assert.strictEqual(assetBoundProjectSeed.documentKind, 'gdjs-asset-bound-project-seed');
    assert.strictEqual(assetBoundProjectSeed.assetWorldHash, acceptedAssetWorld.contentHash);
    assert.strictEqual(assetBoundProjectSeed.resources.length, 1);

    var forgedAssetBoundProjectSeed = JSON.parse(JSON.stringify(assetBoundProjectSeed));
    forgedAssetBoundProjectSeed.resources[0].path = 'forged-resource.png';
    reseal(forgedAssetBoundProjectSeed, 'asset-bound-project-seed.');
    assert.throws(function() {
      assembly.prepareSpatialAssembly({
        semanticAssembly: semanticAssembly,
        projectSeed: projectSeed,
        assetBoundProjectSeed: forgedAssetBoundProjectSeed,
        acceptedAssetWorld: acceptedAssetWorld
      });
    }, function(error) {
      return error.code === 'ASSEMBLY_MODULE_ASSET_BOUND_SEED_NONCANONICAL';
    }, 'A recomputed caller hash must not authorize forged bound resources.');

    var spatialAssemblyInput = assembly.prepareSpatialAssembly({
      semanticAssembly: semanticAssembly,
      projectSeed: projectSeed,
      assetBoundProjectSeed: assetBoundProjectSeed,
      acceptedAssetWorld: acceptedAssetWorld
    });
    assert.strictEqual(spatialAssemblyInput.documentKind, 'spatial-assembly-input');
    assert.strictEqual(spatialAssemblyInput.geometryFacts.facts.length, 2, 'Canonical geometry must include render and GDJS coordinate facts.');

    var delivery = assembly.runDelivery({ semanticAssembly: semanticAssembly, acceptedAssetWorld: acceptedAssetWorld });
    assert.strictEqual(delivery.documentKind, 'assembly-module-delivery');
    assert.strictEqual(delivery.semanticAssemblyHash, semanticAssembly.contentHash);
    assert.strictEqual(delivery.acceptedAssetWorldHash, acceptedAssetWorld.contentHash);
    assert.strictEqual(delivery.spatialAssemblyInput.contentHash, spatialAssemblyInput.contentHash, 'Run delivery must preserve the canonical spatial handoff.');
    assert.throws(function() {
      assembly.bindAcceptedAssets({ semanticAssembly: semanticAssembly, projectSeed: projectSeed, acceptedAssetWorld: Object.assign({}, acceptedAssetWorld, { sourceHash: 'semantic.other' }) });
    }, function(error) {
      return error.code === 'SEMANTIC_ASSET_WORLD_SOURCE_MISMATCH';
    });

    console.log('[AssemblyModule] public SemanticAssembly -> GDJS seed -> AcceptedAssetWorld binding -> canonical spatial handoff passed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch(function(error) {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
