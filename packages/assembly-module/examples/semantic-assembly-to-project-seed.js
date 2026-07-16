'use strict';

var semantic = require('../../semantic-module');
var assembly = require('..');

function createExampleSource() {
  return {
    schemaVersion: 6,
    documentKind: 'game-semantic-source',
    dictionarySource: semantic.dictionary.source,
    game: { semanticId: 'assembly_module_demo', name: 'Assembly Module Demo' },
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

function build() {
  var semanticAssembly = semantic.compileSemanticAssembly(createExampleSource());
  var projectSeed = assembly.createProjectSeed({ semanticAssembly: semanticAssembly });
  return { semanticAssembly: semanticAssembly, projectSeed: projectSeed };
}

if (require.main === module) {
  var result = build();
  console.log(JSON.stringify({
    semanticAssemblyHash: result.semanticAssembly.contentHash,
    projectSeedHash: result.projectSeed.contentHash,
    sourceHash: result.projectSeed.sourceHash,
    sceneName: result.projectSeed.sceneName,
    generatedCodeFiles: result.projectSeed.generatedCode.length
  }, null, 2));
}

module.exports = { createExampleSource: createExampleSource, build: build };
