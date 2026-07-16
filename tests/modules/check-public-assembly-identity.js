'use strict';

var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var semantic = require('@gamecastle/semantic-module');
var assetEngine = require('@gamecastle/asset-engine');
var assembly = require('@gamecastle/assembly-module');

function json(value) {
  return JSON.parse(JSON.stringify(value));
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
    game: { semanticId: 'public_assembly_identity', name: 'Public Assembly Identity' },
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
      description: 'Readable player sprite.',
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
      relations: [{ semanticId: 'player_anchor', layoutRef: 'gc-layout://world/center', subjects: ['player'] }],
      bindings: []
    }],
    tuningPolicies: { relativeChange: { slight: { mode: 'percentage', value: 0.1 } } }
  };
}

(async function() {
  var source = sourceFixture();
  var semanticAssembly = semantic.compileSemanticAssembly(source);
  assert.strictEqual(semanticAssembly.documentKind, 'semantic-assembly');
  assert.strictEqual(semanticAssembly.compilerKind, 'game-semantic-source-to-semantic-assembly');

  var projectSeed = assembly.createProjectSeed({ semanticAssembly: semanticAssembly });
  assert.strictEqual(projectSeed.assemblyHash, semanticAssembly.contentHash, 'Project seed identity is the sole SemanticAssembly contentHash.');
  assert.deepStrictEqual(
    assembly.createProjectSeed({ source: source }),
    projectSeed,
    'Source route and SemanticAssembly route share one seed identity.'
  );

  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-public-assembly-identity-'));
  try {
    var offlineRequirementSet = assetEngine.createOfflineRequirementSet({
      semanticAssembly: semanticAssembly,
      projectId: 'public-assembly-identity'
    });
    var acceptedAssetWorld = await assetEngine.runOffline(offlineRequirementSet, { assetDir: path.join(root, 'assets') });
    var bound = assembly.bindAcceptedAssets({
      semanticAssembly: semanticAssembly,
      projectSeed: projectSeed,
      acceptedAssetWorld: acceptedAssetWorld
    });
    assert.strictEqual(bound.sourceHash, semanticAssembly.sourceHash);
    assert.strictEqual(bound.projectSeedHash, projectSeed.contentHash);

    var revisedSource = semantic.applyRevision(source, {
      schemaVersion: 6,
      documentKind: 'game-semantic-revision',
      baseSourceHash: semanticAssembly.sourceHash,
      operations: [{
        op: 'adjust_member_value',
        target: { entity: 'player', member: 'health' },
        direction: 'increase',
        degree: 'slight'
      }]
    });
    var revisedAssembly = semantic.compileSemanticAssembly(revisedSource);
    assert.notStrictEqual(revisedAssembly.sourceHash, semanticAssembly.sourceHash);
    assert.notStrictEqual(
      assembly.createProjectSeed({ semanticAssembly: revisedAssembly }).assemblyHash,
      projectSeed.assemblyHash,
      'Revision produces a new single assembly identity.'
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }

  // Dual-path linker must not remain as a production or test entry.
  assert.strictEqual(
    fs.existsSync(path.resolve(__dirname, '../../packages/semantic/src/semantic-runtime-linker.js')),
    false,
    'semantic-runtime-linker side path is deleted.'
  );

  console.log('[PublicAssemblyIdentity] sole SemanticAssembly identity drives project seed, asset binding, and revision hashes');
})().catch(function(error) {
  console.error(error && error.stack || error);
  process.exit(1);
});
