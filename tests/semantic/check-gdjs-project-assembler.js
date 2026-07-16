var assert = require('assert');
var semantic = require('@gamecastle/semantic-module');
var assemblyModule = require('@gamecastle/assembly-module');
var sourceContract = require('../../packages/semantic/src/game-semantic-source');

var source = { schemaVersion: sourceContract.SCHEMA_VERSION, documentKind: 'game-semantic-source', dictionarySource: semantic.dictionary.source, game: { semanticId: 'assembly_demo', name: 'Assembly Demo' }, entities: [{ semanticId: 'player', roles: ['player'], objectTypeRef: 'gdjs://object/Sprite::Sprite', behaviorTypeRefs: [], members: [{ semanticId: 'health', roles: ['survival'], value: 100, bindings: [] }] }], components: [], events: [], assetIntents: [{ semanticId: 'player_visual', roles: ['player', 'visual'], subject: 'player', description: 'A readable player visual.', productionFamily: 'character', styleId: 'gamecastle.style-dna.v1', constraints: { transparent: true }, bindings: [] }], layoutIntents: [{ semanticId: 'player_layout', roles: ['world'], subject: 'player', bounds: { width: 64, height: 64 }, relations: [{ semanticId: 'initial_world', layoutRef: 'gc-layout://world/center', subjects: ['player'] }], bindings: [] }], tuningPolicies: { relativeChange: { slight: { mode: 'percentage', value: 0.1 } } } };
var seed = assemblyModule.createProjectSeed({ source: source });
assert.strictEqual(seed.documentKind, 'gdjs-project-seed');
assert.strictEqual(seed.project.properties.name, 'Assembly Demo');
assert.strictEqual(seed.objectDeclarations[0].type, 'Sprite');
assert.strictEqual(seed.project.objects[0].variables[0].value, 100);
assert.strictEqual(seed.project.layouts[0].instances.length, 0, 'Project seed keeps instances unresolved until asset-aware spatial assembly.');
assert.strictEqual(seed.spatialAssemblyRequest.subjects[0].reservation.width, 64, 'Project seed preserves semantic reservation evidence for assembly.');
assert.strictEqual(seed.generatedCode.length, 1, 'Official libGD must compile the assembled project seed.');
assert.throws(function() { var invalid = JSON.parse(JSON.stringify(source)); delete invalid.entities[0].objectTypeRef; assemblyModule.createProjectSeed({ source: invalid }); }, function(error) { return error.code === 'SEMANTIC_LAYOUT_SUBJECT_UNMATERIALIZED'; });
console.log('[GDJSProjectAssembler] dictionary-declared objects, members, events, and official libGD project generation passed');
