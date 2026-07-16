'use strict';

var semantic = require('..');

var source = {
  schemaVersion: 6,
  documentKind: 'game-semantic-source',
  dictionarySource: semantic.dictionary.source,
  game: { semanticId: 'semantic_module_demo', name: 'Semantic Module Demo' },
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

var validatedSource = semantic.validate(source);
var assembly = semantic.compileSemanticAssembly(validatedSource);

console.log(JSON.stringify({
  documentKind: assembly.documentKind,
  sourceHash: assembly.sourceHash,
  realizedSourceHash: assembly.realizedSourceHash,
  eventCount: assembly.eventGraph.events.length,
  assetRequirementCount: assembly.assetRequirements.requirements.length,
  layoutIntentCount: assembly.layoutPlan.intents.length,
  componentExpansionCount: assembly.componentExpansion.components.length,
  realizedComponentCount: assembly.realizedSource.components.length,
  assemblyHash: assembly.contentHash
}, null, 2));
