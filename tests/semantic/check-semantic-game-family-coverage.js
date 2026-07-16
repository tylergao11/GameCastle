var assert = require('assert');
var semantic = require('@gamecastle/semantic-module');
var assemblyModule = require('@gamecastle/assembly-module');
var sourceContract = require('../../packages/semantic/src/game-semantic-source');

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
    schemaVersion: sourceContract.SCHEMA_VERSION,
    documentKind: 'game-semantic-source',
    dictionarySource: semantic.dictionary.source,
    game: { semanticId: family.id, name: family.name },
    entities: [{ semanticId: 'player', roles: family.roles, objectTypeRef: 'gdjs://object/Sprite::Sprite', behaviorTypeRefs: [], members: [{ semanticId: 'primary_value', roles: ['gameplay'], value: 1, bindings: [] }] }],
    components: [],
    events: [],
    assetIntents: [{ semanticId: 'player_visual', roles: family.roles.concat(['visual']), subject: 'player', description: family.name + ' primary readable visual.', productionFamily: family.assetFamily, styleId: 'gamecastle.style-dna.v1', constraints: { transparent: true }, bindings: [] }],
    layoutIntents: [{ semanticId: 'player_layout', roles: family.roles, subject: 'player', bounds: { width: 64, height: 64 }, relations: [{ semanticId: 'primary_anchor', layoutRef: family.layoutRef, subjects: ['player'] }], bindings: [] }],
    tuningPolicies: { relativeChange: { slight: { mode: 'percentage', value: 0.1 } } }
  };
  var projectSeed = assemblyModule.createProjectSeed({ source: source });
  assert.strictEqual(projectSeed.project.properties.name, family.name, family.id + ' project seed must preserve game source identity');
  assert.strictEqual(projectSeed.assetBindingRequirements[0].productionFamily, family.assetFamily, family.id + ' asset intent must remain source-bound');
  assert.strictEqual(projectSeed.project.layouts[0].instances.length, 0, family.id + ' seed must defer spatial instances until the asset-aware assembly stage');
  assert.strictEqual(projectSeed.spatialAssemblyRequest.subjects.length, 1, family.id + ' preserves one spatial assembly request subject');
  assert.strictEqual(projectSeed.generatedCode.length, 1, family.id + ' project seed must compile through official libGD');
});

console.log('[SemanticGameFamilyCoverage] seven game-family semantic sources assemble through the sole public SemanticAssembly and project-seed path');
