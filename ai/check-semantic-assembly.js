var assert = require('assert');
var dictionary = require('./capability-semantic-dictionary');
var linker = require('./semantic-runtime-linker');

var index = dictionary.buildIndex();
var source = {
  schemaVersion: 4,
  documentKind: 'game-semantic-source',
  dictionarySource: index.source,
  game: { semanticId: 'demo', name: 'Demo' },
  entities: [{ semanticId: 'player', roles: ['player'], objectTypeRef: 'gdjs://object/Sprite::Sprite', behaviorTypeRefs: [], members: [{ semanticId: 'health', roles: ['survival'], value: 100, bindings: [] }] }],
  events: [],
  assetIntents: [{ semanticId: 'player_visual', roles: ['player', 'visual'], subject: 'player', description: 'A readable explorer avatar for a top-down adventure.', productionFamily: 'character', styleId: 'gamecastle.style-dna.v1', constraints: { transparent: true, anchor: 'bottom-center' }, bindings: [] }],
  layoutIntents: [{ semanticId: 'player_world_layout', roles: ['world', 'spawn'], subject: 'player', relations: [{ semanticId: 'world_origin', layoutRef: 'gc-layout://world/origin', subjects: ['player'] }], bindings: [] }],
  tuningPolicies: { relativeChange: { slight: { mode: 'percentage', value: 0.1 } } }
};
var assembly = linker.assemble(source, { index: index });
assert.strictEqual(assembly.eventGraph.sourceHash, assembly.sourceHash);
assert.strictEqual(assembly.assetRequirements.sourceHash, assembly.sourceHash);
assert.strictEqual(assembly.layoutPlan.sourceHash, assembly.sourceHash);
assert.strictEqual(assembly.assetRequirements.requirements[0].recipeId, 'character-sprite.v1', 'asset recipe must come from pinned asset production truth');
assert.strictEqual(assembly.layoutPlan.intents[0].relation.semanticRef, 'gc-layout://world/origin');
assert.throws(function() { var invalid = JSON.parse(JSON.stringify(source)); invalid.assetIntents[0].productionFamily = 'invented_family'; linker.assemble(invalid, { index: index }); }, function(error) { return error.code === 'SEMANTIC_ASSET_FAMILY_INVALID'; });
console.log('[SemanticAssembly] one GameSemanticSource deterministically compiles events, asset requirements, layout plan, and one source-bound assembly manifest');
