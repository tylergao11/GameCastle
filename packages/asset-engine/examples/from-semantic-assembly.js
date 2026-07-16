'use strict';

var semantic = require('@gamecastle/semantic-module');
var assetEngine = require('..');

var source = {
  schemaVersion: 6,
  documentKind: 'game-semantic-source',
  dictionarySource: semantic.dictionary.source,
  game: { semanticId: 'asset_engine_semantic_demo', name: 'Asset Engine Semantic Demo' },
  entities: [{
    semanticId: 'player',
    roles: ['player'],
    objectTypeRef: 'gdjs://object/Sprite::Sprite',
    behaviorTypeRefs: [],
    members: []
  }],
  components: [],
  events: [],
  assetIntents: [{
    semanticId: 'player_visual',
    roles: ['player', 'visual'],
    subject: 'player',
    description: 'A readable explorer avatar for a top-down adventure.',
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
      semanticId: 'world_origin',
      layoutRef: 'gc-layout://world/origin',
      subjects: ['player']
    }],
    bindings: []
  }],
  tuningPolicies: { relativeChange: { slight: { mode: 'percentage', value: 0.1 } } }
};

async function main() {
  var semanticAssembly = semantic.compileSemanticAssembly(source);
  var requirementSet = assetEngine.createOfflineRequirementSet({
    semanticAssembly: semanticAssembly,
    projectId: 'asset-engine-semantic-demo'
  });
  var acceptedAssetWorld = await assetEngine.runOffline(requirementSet);
  process.stdout.write(JSON.stringify({
    semanticAssemblyHash: semanticAssembly.contentHash,
    requirementSet,
    acceptedAssetWorld
  }, null, 2) + '\n');
}

if (require.main === module) {
  main().catch(function(error) {
    process.stderr.write((error.stack || error.message) + '\n');
    process.exitCode = 1;
  });
}

module.exports = { source: source, main: main };
