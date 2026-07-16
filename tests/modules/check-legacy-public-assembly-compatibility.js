'use strict';

var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var dictionary = require('../../packages/semantic/src/capability-semantic-dictionary');
var legacyLinker = require('../../packages/semantic/src/semantic-runtime-linker');
var spatialRuntime = require('../../packages/spatial/src/runtime');
var semantic = require('@gamecastle/semantic-module');
var assetEngine = require('@gamecastle/asset-engine');
var assembly = require('@gamecastle/assembly-module');

function json(value) {
  return JSON.parse(JSON.stringify(value));
}

function omit(value, fields) {
  var result = json(value);
  fields.forEach(function(field) { delete result[field]; });
  return result;
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
    game: { semanticId: 'legacy_public_compatibility', name: 'Legacy/Public Compatibility' },
    entities: [{
      semanticId: 'player',
      roles: ['player'],
      objectTypeRef: 'gdjs://object/Sprite::Sprite',
      behaviorTypeRefs: [],
      members: [{ semanticId: 'health', roles: ['survival'], value: 100, bindings: [] }]
    }],
    components: [{
      semanticId: 'move_control',
      componentRef: 'gc-component://input.virtual_joystick',
      target: 'player',
      config: { direction: 'horizontal' },
      bindings: {}
    }],
    events: [],
    assetIntents: [{
      semanticId: 'player_visual',
      roles: ['player', 'visual'],
      subject: 'player',
      description: 'A readable explorer avatar for a top-down adventure.',
      productionFamily: 'character',
      styleId: 'gamecastle.style-dna.v1',
      constraints: { transparent: true, anchor: 'bottom-center' },
      bindings: []
    }],
    layoutIntents: [{
      semanticId: 'player_world_layout',
      roles: ['world', 'spawn'],
      subject: 'player',
      bounds: { width: 64, height: 64 },
      relations: [{
        semanticId: 'world_origin',
        layoutRef: 'gc-layout://world/origin',
        subjects: ['player']
      }],
      bindings: []
    }],
    tuningPolicies: { relativeChange: { slight: { mode: 'percentage', value: 0.1 } } }
  };
}

function assertSemanticProjectionParity(source, index) {
  var legacy = legacyLinker.assemble(source, { index: index });
  var publicAssembly = semantic.compileSemanticAssembly(source);
  assert.deepStrictEqual({
    sourceHash: publicAssembly.sourceHash,
    realizedSourceHash: publicAssembly.realizedSourceHash,
    dictionarySource: json(publicAssembly.dictionarySource),
    componentExpansion: json(publicAssembly.componentExpansion),
    eventGraph: json(publicAssembly.eventGraph),
    assetRequirements: json(publicAssembly.assetRequirements),
    layoutPlan: json(publicAssembly.layoutPlan)
  }, {
    sourceHash: legacy.sourceHash,
    realizedSourceHash: legacy.realizedSourceHash,
    dictionarySource: json(legacy.dictionarySource),
    componentExpansion: json(legacy.componentExpansion),
    eventGraph: json(legacy.eventGraph),
    assetRequirements: json(legacy.assetRequirements),
    layoutPlan: json(legacy.layoutPlan)
  }, 'The public compiler must preserve the legacy compiler projection exactly.');
  assert.deepStrictEqual(
    json(spatialRuntime.createAssemblyRequest(publicAssembly.layoutPlan)),
    json(legacy.spatialAssemblyRequest),
    'The public layout projection must produce the legacy spatial request exactly.'
  );
  assert.notStrictEqual(
    publicAssembly.contentHash,
    legacy.contentHash,
    'The staged public assembly has an intentionally distinct document identity until the product migration is complete.'
  );
  return { legacy: legacy, publicAssembly: publicAssembly };
}

async function main() {
  var index = dictionary.loadIndex();
  var source = sourceFixture();
  var parity = assertSemanticProjectionParity(source, index);
  var publicSeed = assembly.createProjectSeed({ semanticAssembly: parity.publicAssembly });
  assert.notStrictEqual(publicSeed.assemblyHash, parity.legacy.projectSeed.assemblyHash, 'Public and legacy seed identities remain distinct during the staged migration.');
  assert.deepStrictEqual(
    omit(publicSeed, ['assemblyHash', 'contentHash']),
    omit(parity.legacy.projectSeed, ['assemblyHash', 'contentHash']),
    'The public GDJS seed must have the same executable projection as the legacy seed.'
  );

  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-legacy-public-compatibility-'));
  try {
    var requirementSet = assetEngine.createOfflineRequirementSet({
      semanticAssembly: parity.publicAssembly,
      projectId: 'legacy-public-compatibility'
    });
    var acceptedAssetWorld = await assetEngine.runOffline(requirementSet, { assetDir: root });
    var publicBoundSeed = assembly.bindAcceptedAssets({
      semanticAssembly: parity.publicAssembly,
      projectSeed: publicSeed,
      acceptedAssetWorld: acceptedAssetWorld
    });
    var legacyBoundSeed = require('../../packages/gdjs/src/gdjs-project-asset-binder').bindResources(
      parity.legacy.projectSeed,
      acceptedAssetWorld
    );
    assert.deepStrictEqual(
      omit(publicBoundSeed, ['projectSeedHash', 'contentHash']),
      omit(legacyBoundSeed, ['projectSeedHash', 'contentHash']),
      'The public resource binding must preserve the legacy executable projection.'
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }

  var revised = semantic.applyRevision(source, {
    schemaVersion: 6,
    documentKind: 'game-semantic-revision',
    baseSourceHash: parity.publicAssembly.sourceHash,
    operations: [{
      op: 'adjust_member_value',
      target: { entity: 'player', member: 'health' },
      direction: 'increase',
      degree: 'slight'
    }]
  });
  assert.strictEqual(revised.entities[0].members[0].value, 110);
  assertSemanticProjectionParity(revised, index);

  console.log('[LegacyPublicAssemblyCompatibility] semantic, GDJS seed, asset binding, spatial request, and revision projections remain compatible while document identities stay intentionally distinct');
}

main().catch(function(error) {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
