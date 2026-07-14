var assert = require('assert');
var dictionary = require('./capability-semantic-dictionary');
var compiler = require('./semantic-compiler');
var index = dictionary.buildIndex();
var capabilities = Object.keys(index.by_capability).map(function(id) { return index.by_capability[id]; });
function zeroArgument(kind) { return capabilities.filter(function(entry) { return entry.kind === kind && entry.binding.status === 'executable' && entry.binding.binding.parameterCount === 0; })[0]; }
var condition = zeroArgument('condition');
var action = zeroArgument('action');
assert(condition && action, 'pinned GDJS source must expose zero-argument executable condition and action fixtures');
var source = {
  schemaVersion: 2, documentKind: 'game-semantic-source', dictionarySource: index.source,
  game: { semanticId: 'event_demo', name: 'Event Demo' }, entities: [], assetIntents: [], layoutIntents: [], tuningPolicies: { relativeChange: { slight: { mode: 'percentage', value: 0.1 } } },
  events: [{ semanticId: 'root', eventTypeRef: dictionary.resolveEventType(index, 'BuiltinCommonInstructions::Standard').semantic_id, conditions: [{ semanticRef: condition.semantic_id, arguments: {} }], actions: [{ semanticRef: action.semantic_id, arguments: {} }], children: [{ semanticId: 'child', eventTypeRef: dictionary.resolveEventType(index, 'BuiltinCommonInstructions::Standard').semantic_id, conditions: [{ semanticRef: condition.semantic_id, arguments: {} }], actions: [{ semanticRef: action.semantic_id, arguments: {} }], children: [] }] }]
};
var compiled = compiler.compile(source, { index: index });
assert.strictEqual(compiled.events[0].type, 'BuiltinCommonInstructions::Standard', 'compiler must use the event type resolved from dictionary truth');
assert.strictEqual(compiled.events[0].conditions[0].type.value, condition.binding.binding.runtimeId, 'compiler must use official runtime binding');
assert.strictEqual(compiled.events[0].actions[0].type.value, action.binding.binding.runtimeId, 'compiler must use official runtime binding');
assert.strictEqual(compiled.events[0].events[0].type, 'BuiltinCommonInstructions::Standard', 'compiler must preserve nested semantic events');
console.log('[SemanticCompiler] dictionary event type and official executable capability bindings compiled to GDJS events');
