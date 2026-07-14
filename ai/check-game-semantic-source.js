var assert = require('assert');
var dictionary = require('./capability-semantic-dictionary');
var sourceContract = require('./game-semantic-source');
var index = dictionary.buildIndex();

var source = {
  schemaVersion: 2, documentKind: 'game-semantic-source', dictionarySource: index.source,
  game: { semanticId: 'jump_demo', name: 'Jump Demo' },
  entities: [{ semanticId: 'player', roles: ['player', 'controllable_actor'], objectTypeRef: 'gdjs://object/Sprite::Sprite', behaviorTypeRefs: [], members: [{ semanticId: 'jump_height', roles: ['movement', 'jump_height'], value: 100, bindings: [] }] }],
  events: [], assetIntents: [], layoutIntents: [], tuningPolicies: { relativeChange: { slight: { mode: 'percentage', value: 0.1 } } }
};
var valid = sourceContract.validateSource(source, { index: index });
var revision = { schemaVersion: 2, documentKind: 'game-semantic-revision', baseSourceHash: sourceContract.sourceHash(valid), operations: [{ op: 'adjust_member_value', target: { entity: 'player', member: 'jump_height' }, direction: 'increase', degree: 'slight' }] };
var next = sourceContract.applyRevision(valid, revision, { index: index });
assert.strictEqual(next.entities[0].members[0].value, 110, 'revision must calculate against the complete source value');
var view = sourceContract.structureView(next, { index: index, worldVersion: 2 });
assert.strictEqual(JSON.stringify(view).indexOf('110'), -1, 'structure view must not disclose concrete values');
assert.strictEqual(view.payload.entities[0].members[0].semanticId, 'jump_height');
assert.throws(function() { sourceContract.applyRevision(valid, Object.assign({}, revision, { baseSourceHash: 'semantic.stale' }), { index: index }); }, /baseSourceHash/);
assert.throws(function() { sourceContract.applyRevision(valid, Object.assign({}, revision, { operations: [{ op: 'adjust_member_value', target: { entity: 'player', member: 'jump_height' }, direction: 'increase', degree: 'unknown' }] }), { index: index }); }, /No relative tuning policy/);
assert.throws(function() { sourceContract.validateSource(Object.assign({}, source, { dictionarySource: {} }), { index: index }); }, /dictionarySource/);
var zeroAction = Object.keys(index.by_capability).map(function(id) { return index.by_capability[id]; }).filter(function(entry) { return entry.kind === 'action' && entry.binding.status === 'executable' && entry.parameter_contract.parameters.every(function(parameter) { return parameter.kind === 'code-only'; }); })[0];
assert(zeroAction, 'Pinned dictionary must expose a zero-visible-argument action fixture.');
assert.throws(function() { sourceContract.validateSource(Object.assign({}, source, { events: [{ semanticId: 'legacy_parameters', eventTypeRef: dictionary.resolveEventType(index, 'BuiltinCommonInstructions::Standard').semantic_id, conditions: [], actions: [{ semanticRef: zeroAction.semantic_id, parameters: [] }], children: [] }] }), { index: index }); }, function(error) { return error.code === 'SEMANTIC_SOURCE_UNKNOWN_FIELD'; }, 'Position-array event parameters must have no compatibility path.');
console.log('[GameSemanticSource] dictionary-pinned source, revision, hidden-value structure view, and fail-closed policy checks passed');
