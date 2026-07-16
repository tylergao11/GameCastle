'use strict';

var assert = require('assert');
var childProcess = require('child_process');
var crypto = require('crypto');
var fs = require('fs');
var os = require('os');
var path = require('path');
var assetEngine = require('@gamecastle/asset-engine');
var semantic = require('@gamecastle/semantic-module');
var semanticExampleModule = require('../../packages/asset-engine/examples/from-semantic-assembly');

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

function requirementSet() {
  return {
    schemaVersion: 1,
    documentKind: 'asset-requirement-set',
    sourceHash: 'semantic.demo.asset-engine.v1',
    projectId: 'demo-asset-engine',
    requirements: [{
      semanticId: 'hero',
      subject: 'hero',
      description: 'A cheerful playable hero sprite',
      productionFamily: 'character',
      recipeId: 'character-sprite.v1',
      styleId: 'gamecastle.style-dna.v1',
      semanticTags: ['hero', 'character'],
      constraints: { width: 24, height: 32, transparent: true },
      acceptedFormats: ['png']
    }]
  };
}
function fileHash(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function within(directory, candidate) {
  var relative = path.relative(directory, candidate);
  return !!relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

(async function() {
  assert.deepStrictEqual(Object.keys(assetEngine).sort(), ['contracts', 'createOfflineRequirementSet', 'runOffline', 'runProduction', 'validateAcceptedAssetWorld']);
  assert.strictEqual(typeof assetEngine.createOfflineRequirementSet, 'function');
  assert.strictEqual(typeof assetEngine.runProduction, 'function');
  assert.strictEqual(typeof assetEngine.runOffline, 'function');
  assert.strictEqual(assetEngine.contracts.AssetRequirementSet.documentKind, 'asset-requirement-set');
  assert.strictEqual(assetEngine.contracts.AcceptedAssetWorld.documentKind, 'semantic-asset-world');

  var semanticAssembly = semantic.compileSemanticAssembly(semanticExampleModule.source);
  var semanticRequirementSet = assetEngine.createOfflineRequirementSet({ semanticAssembly: semanticAssembly, projectId: 'asset-engine-module-semantic-check' });
  assert.strictEqual(semanticRequirementSet.sourceHash, semanticAssembly.sourceHash);
  assert.deepStrictEqual(semanticRequirementSet.requirements[0].semanticTags, semanticAssembly.assetRequirements.requirements[0].roles);
  assert.deepStrictEqual(semanticRequirementSet.requirements[0].acceptedFormats, ['png']);
  var forgedSemanticAssembly = JSON.parse(JSON.stringify(semanticAssembly));
  forgedSemanticAssembly.assetRequirements.requirements[0].description = 'forged requirement';
  reseal(forgedSemanticAssembly, 'assembly.');
  assert.throws(function() {
    assetEngine.createOfflineRequirementSet({ semanticAssembly: forgedSemanticAssembly, projectId: 'asset-engine-module-semantic-check' });
  }, function(error) {
    return error.code === 'ASSET_ENGINE_SEMANTIC_ASSEMBLY_NONCANONICAL';
  }, 'A recomputed caller hash must not authorize forged semantic asset evidence.');

  var first = await assetEngine.runOffline(requirementSet());
  var second = await assetEngine.runOffline(requirementSet());
  assert.deepStrictEqual(first, second, 'the offline public run must be deterministic');
  assert.strictEqual(first.documentKind, 'semantic-asset-world');
  assert.strictEqual(first.schemaVersion, 4);
  assert.strictEqual(first.acceptedAssets.length, 1);
  assert.match(first.acceptedAssets[0].path, /^data:image\/png;base64,/);
  assert.strictEqual(first.acceptedAssets[0].sha256.length, 64);
  assert.strictEqual(first.productionSetAcceptanceReceipt.decision, 'accepted');
  assert.deepStrictEqual(assetEngine.validateAcceptedAssetWorld(first, { sourceHash: requirementSet().sourceHash }), first);

  var tempParent = path.resolve(os.tmpdir());
  var assetDir = fs.mkdtempSync(path.join(tempParent, 'gamecastle-asset-engine-module-'));
  try {
    assert(within(tempParent, assetDir), 'the test materialization directory must remain under the temporary directory');
    var materialized = await assetEngine.runOffline(requirementSet(), { assetDir: assetDir });
    assert.notStrictEqual(materialized.contentHash, first.contentHash, 'a materialized world must bind its file paths in the world content hash');
    assert.strictEqual(materialized.slots.length, 1);
    assert(within(assetDir, materialized.slots[0].path), 'the materialized asset path must remain inside assetDir');
    assert.strictEqual(path.extname(materialized.slots[0].path), '.png');
    assert.strictEqual(fileHash(materialized.slots[0].path), materialized.slots[0].sha256);
    assert.deepStrictEqual(assetEngine.validateAcceptedAssetWorld(materialized, { sourceHash: requirementSet().sourceHash }), materialized);
    assert.deepStrictEqual(await assetEngine.runOffline(requirementSet(), { assetDir: assetDir }), materialized, 'materializing the same requirement set must reuse the same verified bytes and world');
  } finally {
    if (within(tempParent, assetDir)) fs.rmSync(assetDir, { recursive: true, force: true });
  }

  var corrupt = JSON.parse(JSON.stringify(first));
  corrupt.acceptedAssets[0].sha256 = '0'.repeat(64);
  assert.throws(function() { assetEngine.validateAcceptedAssetWorld(corrupt); }, function(error) {
    return error && error.code === 'SEMANTIC_ASSET_WORLD_RECEIPT_INVALID';
  });

  var unsupported = requirementSet();
  unsupported.requirements[0].resourceKind = 'audio';
  await assert.rejects(assetEngine.runOffline(unsupported), function(error) {
    return error && error.code === 'ASSET_ENGINE_OFFLINE_RESOURCE_UNSUPPORTED';
  });
  await assert.rejects(assetEngine.runOffline(requirementSet(), { assetDir: 'relative-assets' }), function(error) {
    return error && error.code === 'ASSET_ENGINE_OFFLINE_ASSET_DIR_INVALID';
  });

  var examplePath = path.resolve(__dirname, '../../packages/asset-engine/examples/deterministic-offline.js');
  var exampleWorld = JSON.parse(childProcess.execFileSync(process.execPath, [examplePath], { encoding: 'utf8' }));
  assert.deepStrictEqual(exampleWorld, first, 'the documented example must use only the public module API and produce the same world');
  assert.deepStrictEqual(assetEngine.validateAcceptedAssetWorld(exampleWorld), exampleWorld);

  var semanticExamplePath = path.resolve(__dirname, '../../packages/asset-engine/examples/from-semantic-assembly.js');
  var semanticExampleOutput = JSON.parse(childProcess.execFileSync(process.execPath, [semanticExamplePath], { encoding: 'utf8' }));
  assert.match(semanticExampleOutput.semanticAssemblyHash, /^assembly\.[a-f0-9]{24}$/);
  assert.strictEqual(semanticExampleOutput.requirementSet.documentKind, 'asset-requirement-set');
  assert.strictEqual(semanticExampleOutput.requirementSet.sourceHash, semanticExampleOutput.acceptedAssetWorld.sourceHash);
  assert.deepStrictEqual(assetEngine.validateAcceptedAssetWorld(semanticExampleOutput.acceptedAssetWorld, { sourceHash: semanticExampleOutput.requirementSet.sourceHash }), semanticExampleOutput.acceptedAssetWorld);

  console.log('[AssetEngineModule] public API, deterministic offline AssetRequirementSet -> AcceptedAssetWorld example, and fail-closed validation passed');
})().catch(function(error) {
  console.error(error.stack || error);
  process.exitCode = 1;
});
