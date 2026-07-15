var assert = require('assert');
var dictionary = require('./capability-semantic-dictionary');
var sourceContract = require('./game-semantic-source');
var executor = require('./semantic-product-executor');

var index = dictionary.buildIndex();
var source = { schemaVersion: 4, documentKind: 'game-semantic-source', dictionarySource: index.source, game: { semanticId: 'executor_demo', name: 'Executor Demo' }, entities: [{ semanticId: 'player', roles: ['player'], objectTypeRef: 'gdjs://object/Sprite::Sprite', behaviorTypeRefs: [], members: [{ semanticId: 'jump_height', roles: ['movement'], value: 100, bindings: [] }] }], events: [], assetIntents: [], layoutIntents: [], tuningPolicies: { relativeChange: { slight: { mode: 'percentage', value: 0.1 } } } };
var result = executor.execute({ requestId: 'seed', source: source }, { index: index });
assert.strictEqual(result.artifactKind, 'gdjs-project-seed');
assert.strictEqual(result.sourceHash, sourceContract.sourceHash(source));
var revised = executor.execute({ requestId: 'revision', source: source, revision: { schemaVersion: 4, documentKind: 'game-semantic-revision', baseSourceHash: sourceContract.sourceHash(source), operations: [{ op: 'adjust_member_value', target: { entity: 'player', member: 'jump_height' }, direction: 'increase', degree: 'slight' }] } }, { index: index });
assert.strictEqual(revised.artifact.project.objects[0].variables[0].value, 110);
assert.throws(function() { executor.execute({ source: source, feedback: {} }, { index: index }); }, function(error) { return error.code === 'SEMANTIC_EXECUTION_REQUEST_UNKNOWN_FIELD'; });
console.log('[SemanticProductExecutor] source/revision execution is deterministic, source-bound, and has no feedback routing field');
