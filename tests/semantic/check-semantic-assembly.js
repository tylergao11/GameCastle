var assert = require('assert');
var semantic = require('@gamecastle/semantic-module');
var assemblyModule = require('@gamecastle/assembly-module');
var sourceContract = require('../../packages/semantic/src/game-semantic-source');

var source = {
  schemaVersion: sourceContract.SCHEMA_VERSION,
  documentKind: 'game-semantic-source',
  dictionarySource: semantic.dictionary.source,
  game: { semanticId: 'demo', name: 'Demo' },
  entities: [{ semanticId: 'player', roles: ['player'], objectTypeRef: 'gdjs://object/Sprite::Sprite', behaviorTypeRefs: [], members: [{ semanticId: 'health', roles: ['survival'], value: 100, bindings: [] }] }],
  components: [],
  events: [],
  assetIntents: [{ semanticId: 'player_visual', roles: ['player', 'visual'], subject: 'player', description: 'A readable explorer avatar for a top-down adventure.', productionFamily: 'character', styleId: 'gamecastle.style-dna.v1', constraints: { transparent: true, anchor: 'bottom-center' }, bindings: [] }],
  layoutIntents: [{ semanticId: 'player_world_layout', roles: ['world', 'spawn'], subject: 'player', bounds: { width: 64, height: 64 }, relations: [{ semanticId: 'world_origin', layoutRef: 'gc-layout://world/origin', subjects: ['player'] }], bindings: [] }],
  tuningPolicies: { relativeChange: { slight: { mode: 'percentage', value: 0.1 } } }
};
var semanticAssembly = semantic.compileSemanticAssembly(source);
var projectSeed = assemblyModule.createProjectSeed({ semanticAssembly: semanticAssembly });
assert.strictEqual(semanticAssembly.eventGraph.sourceHash, semanticAssembly.sourceHash);
assert.strictEqual(semanticAssembly.assetRequirements.sourceHash, semanticAssembly.sourceHash);
assert.strictEqual(semanticAssembly.layoutPlan.sourceHash, semanticAssembly.sourceHash);
assert.strictEqual(projectSeed.sourceHash, semanticAssembly.sourceHash);
assert.strictEqual(projectSeed.assemblyHash, semanticAssembly.contentHash);
assert.strictEqual(projectSeed.spatialAssemblyRequest.sourceHash, semanticAssembly.sourceHash);
assert.strictEqual(semanticAssembly.assetRequirements.requirements[0].recipeId, 'character-sprite.v1', 'asset recipe must come from pinned asset production truth');
assert.strictEqual(semanticAssembly.layoutPlan.intents[0].relation.semanticRef, 'gc-layout://world/origin');
assert.strictEqual(projectSeed.spatialAssemblyRequest.subjects[0].reservation.width, 64, 'Semantic layout preserves a reservation for later spatial assembly.');
assert.throws(function() {
  var invalid = JSON.parse(JSON.stringify(source));
  invalid.assetIntents[0].productionFamily = 'invented_family';
  semantic.compileSemanticAssembly(invalid);
}, function(error) { return error.code === 'SEMANTIC_ASSET_FAMILY_INVALID'; });
console.log('[SemanticAssembly] one GameSemanticSource deterministically compiles through the sole public SemanticAssembly and project-seed path');
