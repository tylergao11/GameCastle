var assert = require('assert');
var dictionary = require('../../packages/semantic/src/capability-semantic-dictionary');
var sourceContract = require('../../packages/semantic/src/game-semantic-source');
var index = dictionary.buildIndex();

var source = {
  schemaVersion: sourceContract.SCHEMA_VERSION, documentKind: 'game-semantic-source', dictionarySource: index.source,
  game: { semanticId: 'jump_demo', name: 'Jump Demo' },
  entities: [{ semanticId: 'player', roles: ['player', 'controllable_actor'], objectTypeRef: 'gdjs://object/Sprite::Sprite', behaviorTypeRefs: [], members: [{ semanticId: 'jump_height', roles: ['movement', 'jump_height'], value: 100, bindings: [] }] }],
  components: [],
  events: [], assetIntents: [], layoutIntents: [], tuningPolicies: { relativeChange: { slight: { mode: 'percentage', value: 0.1 } } }
};
var valid = sourceContract.validateSource(source, { index: index });
assert.throws(function() { sourceContract.validateSource(Object.assign({}, source, { schemaVersion: 4 }), { index: index }); }, /invalid document kind or version/, 'v4 Source compatibility stays removed');
var missingComponents = Object.assign({}, source); delete missingComponents.components;
assert.throws(function() { sourceContract.validateSource(missingComponents, { index: index }); }, /components must be an array/, 'component collection has no implicit compatibility default');
var revision = { schemaVersion: sourceContract.SCHEMA_VERSION, documentKind: 'game-semantic-revision', baseSourceHash: sourceContract.sourceHash(valid), operations: [{ op: 'adjust_member_value', target: { entity: 'player', member: 'jump_height' }, direction: 'increase', degree: 'slight' }] };
var next = sourceContract.applyRevision(valid, revision, { index: index });
assert.strictEqual(next.entities[0].members[0].value, 110, 'revision must calculate against the complete source value');
var view = sourceContract.structureView(next, { index: index });
assert.strictEqual(Object.prototype.hasOwnProperty.call(view, 'worldVersion'), false, 'structure truth has no external world version axis');
assert.strictEqual(Object.prototype.hasOwnProperty.call(view.payload.entities[0].members[0], 'value'), false, 'structure view must not disclose concrete member values');
assert.strictEqual(JSON.stringify(view).indexOf('Jump Demo'), -1, 'structure view must not disclose the retained game name value');
assert.strictEqual(view.payload.entities[0].members[0].semanticId, 'jump_height');
var withComponent = JSON.parse(JSON.stringify(next));
withComponent.components.push({ semanticId: 'move_control', componentRef: 'gc-component://input.virtual_joystick', target: 'player', config: { direction: 'horizontal' }, bindings: {} });
var componentView = sourceContract.structureView(withComponent, { index: index });
assert.deepStrictEqual(sourceContract.structuralDiff(view, componentView).collections.components.added, ['move_control'], 'component changes enter structural feedback');
assert.throws(function() { sourceContract.structureView(next, { index: index, worldVersion: 2 }); }, function(error) { return error.code === 'SEMANTIC_STRUCTURE_WORLD_VERSION_FORBIDDEN'; }, 'old worldVersion injection has no compatibility path');
assert.throws(function() { sourceContract.applyRevision(valid, Object.assign({}, revision, { baseSourceHash: 'semantic.stale' }), { index: index }); }, /baseSourceHash/);
assert.throws(function() { sourceContract.applyRevision(valid, Object.assign({}, revision, { operations: [{ op: 'adjust_member_value', target: { entity: 'player', member: 'jump_height' }, direction: 'increase', degree: 'unknown' }] }), { index: index }); }, /No relative tuning policy/);
assert.throws(function() { sourceContract.validateSource(Object.assign({}, source, { dictionarySource: {} }), { index: index }); }, /dictionarySource/);
var zeroAction = Object.keys(index.by_capability).map(function(id) { return index.by_capability[id]; }).filter(function(entry) { return entry.kind === 'action' && entry.binding.status === 'executable' && entry.parameter_contract.parameters.every(function(parameter) { return parameter.kind === 'code-only'; }); })[0];
assert(zeroAction, 'Pinned dictionary must expose a zero-visible-argument action fixture.');
assert.throws(function() { sourceContract.validateSource(Object.assign({}, source, { events: [{ semanticId: 'legacy_parameters', eventTypeRef: dictionary.resolveEventType(index, 'BuiltinCommonInstructions::Standard').semantic_id, arguments: {}, locals: {}, conditions: [], actions: [{ semanticRef: zeroAction.semantic_id, parameters: [] }], children: [] }] }), { index: index }); }, function(error) { return error.code === 'SEMANTIC_SOURCE_UNKNOWN_FIELD'; }, 'Position-array event parameters must have no compatibility path.');
console.log('[GameSemanticSource] dictionary-pinned source, revision, hidden-value structure view, and fail-closed policy checks passed');
