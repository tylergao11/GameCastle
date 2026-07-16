'use strict';

var assert = require('assert');
var semantic = require('@gamecastle/semantic-module');

assert.deepStrictEqual(Object.keys(semantic).sort(), [
  'applyRevision',
  'compileSemanticAssembly',
  'dictionary',
  'validate'
]);
assert.strictEqual(semantic.dictionary.dictionaryKind, 'gdjs-semantic-dictionary');
assert.strictEqual(Object.isFrozen(semantic.dictionary), true);

var source = {
  schemaVersion: 6,
  documentKind: 'game-semantic-source',
  dictionarySource: semantic.dictionary.source,
  game: { semanticId: 'semantic_module_check', name: 'Semantic Module Check' },
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

var validatedSource = semantic.validate(source);
var assembly = semantic.compileSemanticAssembly(validatedSource);

assert.strictEqual(assembly.documentKind, 'semantic-assembly');
assert.deepStrictEqual(assembly.source, validatedSource);
assert.strictEqual(assembly.source.documentKind, 'game-semantic-source');
assert.strictEqual(assembly.realizedSource.documentKind, 'game-semantic-source');
assert.strictEqual(assembly.realizedSource.components.length, 0);
assert.strictEqual(assembly.componentExpansion.sourceHash, assembly.sourceHash);
assert.strictEqual(assembly.componentExpansion.realizedSourceHash, assembly.realizedSourceHash);
assert.strictEqual(semantic.compileSemanticAssembly(assembly.source).sourceHash, assembly.sourceHash);
assert.strictEqual(semantic.compileSemanticAssembly(assembly.realizedSource).sourceHash, assembly.realizedSourceHash);
assert.strictEqual(assembly.eventGraph.sourceHash, assembly.sourceHash);
assert.strictEqual(assembly.eventGraph.realizedSourceHash, assembly.realizedSourceHash);
assert.strictEqual(assembly.assetRequirements.sourceHash, assembly.sourceHash);
assert.strictEqual(assembly.assetRequirements.realizedSourceHash, assembly.realizedSourceHash);
assert.strictEqual(assembly.layoutPlan.sourceHash, assembly.sourceHash);
assert.strictEqual(assembly.layoutPlan.realizedSourceHash, assembly.realizedSourceHash);
assert.strictEqual(assembly.eventGraph.events.length, 3);
assert.strictEqual(assembly.assetRequirements.requirements.length, 1);
assert.strictEqual(assembly.layoutPlan.intents.length, 2);
assert.strictEqual(assembly.componentExpansion.components.length, 1);
assert.notStrictEqual(assembly.realizedSourceHash, assembly.sourceHash);
assert(/^assembly\.[a-f0-9]{24}$/.test(assembly.contentHash));
assert.strictEqual(Object.prototype.hasOwnProperty.call(assembly, 'projectSeed'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(assembly, 'spatialAssemblyRequest'), false);
assert.doesNotThrow(function() { JSON.stringify(assembly); });
assert.deepStrictEqual(JSON.parse(JSON.stringify(assembly)), assembly);

var revisedSource = semantic.applyRevision(validatedSource, {
  schemaVersion: 6,
  documentKind: 'game-semantic-revision',
  baseSourceHash: assembly.sourceHash,
  operations: [{
    op: 'adjust_member_value',
    target: { entity: 'player', member: 'health' },
    direction: 'increase',
    degree: 'slight'
  }]
});

assert.strictEqual(revisedSource.entities[0].members[0].value, 110);
assert.notStrictEqual(semantic.compileSemanticAssembly(revisedSource).sourceHash, assembly.sourceHash);
assert.deepStrictEqual(semantic.compileSemanticAssembly(validatedSource), assembly);

console.log('[semantic-module] public dictionary, validation, revision, and deterministic assembly checks passed');
