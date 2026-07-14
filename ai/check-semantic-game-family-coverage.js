var assert = require('assert');
var dictionary = require('./capability-semantic-dictionary');
var linker = require('./semantic-runtime-linker');

var index = dictionary.buildIndex();
var families = [
  { id: 'stardew', name: 'Farm Life', roles: ['farmer', 'crop'], assetFamily: 'prop', layoutRef: 'gc-layout://world/center' },
  { id: 'moba', name: 'Arena Battle', roles: ['hero', 'skill'], assetFamily: 'character', layoutRef: 'gc-layout://world/left-middle' },
  { id: 'battle-royale', name: 'Battle Royale', roles: ['shooter', 'reticle'], assetFamily: 'character', layoutRef: 'gc-layout://world/center' },
  { id: 'survivor', name: 'Survivor Arena', roles: ['survivor', 'upgrade'], assetFamily: 'character', layoutRef: 'gc-layout://world/center' },
  { id: 'parking', name: 'Parking Puzzle', roles: ['vehicle', 'parking'], assetFamily: 'prop', layoutRef: 'gc-layout://world/origin' },
  { id: 'cultivation', name: 'Cultivation Sect', roles: ['sect', 'disciple'], assetFamily: 'character', layoutRef: 'gc-layout://world/top-center' },
  { id: 'roguelike', name: 'Dungeon Roguelike', roles: ['adventurer', 'dungeon'], assetFamily: 'character', layoutRef: 'gc-layout://world/center' }
];

families.forEach(function(family) {
  var source = {
    schemaVersion: 2,
    documentKind: 'game-semantic-source',
    dictionarySource: index.source,
    game: { semanticId: family.id, name: family.name },
    entities: [{ semanticId: 'player', roles: family.roles, objectTypeRef: 'gdjs://object/Sprite::Sprite', behaviorTypeRefs: [], members: [{ semanticId: 'primary_value', roles: ['gameplay'], value: 1, bindings: [] }] }],
    events: [],
    assetIntents: [{ semanticId: 'player_visual', roles: family.roles.concat(['visual']), subject: 'player', description: family.name + ' primary readable visual.', productionFamily: family.assetFamily, styleId: 'gamecastle.style-dna.v1', constraints: { transparent: true }, bindings: [] }],
    layoutIntents: [{ semanticId: 'player_layout', roles: family.roles, subject: 'player', relations: [{ semanticId: 'primary_anchor', layoutRef: family.layoutRef, subjects: ['player'] }], bindings: [] }],
    tuningPolicies: { relativeChange: { slight: { mode: 'percentage', value: 0.1 } } }
  };
  var assembly = linker.assemble(source, { index: index });
  assert.strictEqual(assembly.projectSeed.project.properties.name, family.name, family.id + ' project seed must preserve game source identity');
  assert.strictEqual(assembly.projectSeed.assetBindingRequirements[0].productionFamily, family.assetFamily, family.id + ' asset intent must remain source-bound');
  assert.strictEqual(assembly.projectSeed.project.layouts[0].instances.length, 1, family.id + ' layout must materialize one source-bound instance');
  assert.strictEqual(assembly.projectSeed.generatedCode.length, 1, family.id + ' project seed must compile through official libGD');
});

console.log('[SemanticGameFamilyCoverage] seven game-family semantic sources assemble through assets, layout, project seed, and official libGD');
