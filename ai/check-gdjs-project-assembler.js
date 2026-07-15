var assert = require('assert');
var dictionary = require('./capability-semantic-dictionary');
var linker = require('./semantic-runtime-linker');

var index = dictionary.buildIndex();
var source = { schemaVersion: 4, documentKind: 'game-semantic-source', dictionarySource: index.source, game: { semanticId: 'assembly_demo', name: 'Assembly Demo' }, entities: [{ semanticId: 'player', roles: ['player'], objectTypeRef: 'gdjs://object/Sprite::Sprite', behaviorTypeRefs: [], members: [{ semanticId: 'health', roles: ['survival'], value: 100, bindings: [] }] }], events: [], assetIntents: [{ semanticId: 'player_visual', roles: ['player', 'visual'], subject: 'player', description: 'A readable player visual.', productionFamily: 'character', styleId: 'gamecastle.style-dna.v1', constraints: { transparent: true }, bindings: [] }], layoutIntents: [{ semanticId: 'player_layout', roles: ['world'], subject: 'player', relations: [{ semanticId: 'initial_world', layoutRef: 'gc-layout://world/center', subjects: ['player'] }], bindings: [] }], tuningPolicies: { relativeChange: { slight: { mode: 'percentage', value: 0.1 } } } };
var assembly = linker.assemble(source, { index: index });
var seed = assembly.projectSeed;
assert.strictEqual(seed.documentKind, 'gdjs-project-seed');
assert.strictEqual(seed.project.properties.name, 'Assembly Demo');
assert.strictEqual(seed.objectDeclarations[0].type, 'Sprite');
assert.strictEqual(seed.project.objects[0].variables[0].value, 100);
assert.strictEqual(seed.project.layouts[0].instances[0].x, 400, 'Layout dictionary must materialize the world-center instance position.');
assert.strictEqual(seed.project.layouts[0].instances[0].y, 300, 'Layout dictionary must materialize the world-center instance position.');
assert.strictEqual(seed.generatedCode.length, 1, 'Official libGD must compile the assembled project seed.');
assert.throws(function() { var invalid = JSON.parse(JSON.stringify(source)); delete invalid.entities[0].objectTypeRef; linker.assemble(invalid, { index: index }); }, function(error) { return error.code === 'SEMANTIC_PROJECT_SUBJECT_UNMATERIALIZED'; });
console.log('[GDJSProjectAssembler] dictionary-declared objects, members, events, and official libGD project generation passed');
