var assert = require('assert');
var provider = require('./semantic-context-provider');
var dictionary = require('./capability-semantic-dictionary');

var index = dictionary.buildIndex();
var keyboard = dictionary.search(index, 'key pressed', 1)[0];
var response = provider.execute({
  schemaVersion: 2,
  documentKind: 'semantic-context-request',
  baseStructureHash: 'structure.test',
  queries: [
    { queryId: 'owners', operation: 'list_semantic_owners', arguments: {} },
    { queryId: 'keyboard', operation: 'describe_semantic_member', arguments: { semanticRef: keyboard.semantic_id } },
    { queryId: 'operations', operation: 'list_semantic_operations', arguments: { semanticRef: keyboard.semantic_id } },
    { queryId: 'events', operation: 'list_event_types', arguments: {} },
    { queryId: 'objects', operation: 'list_object_types', arguments: {} },
    { queryId: 'sprite', operation: 'describe_object_type', arguments: { objectTypeRef: 'gdjs://object/Sprite::Sprite' } },
    { queryId: 'layout', operation: 'describe_layout_relation', arguments: { layoutRef: 'gc-layout://world/center' } }
  ]
}, { index: index });
assert.strictEqual(response.documentKind, 'semantic-context-response');
assert(response.results[0].value.length > 0, 'owner query must return dictionary owners');
assert(response.results[1].value.explanation.description, 'member query must return official explanation');
assert.strictEqual(response.results[2].value.semanticRef, keyboard.semantic_id, 'operation query must preserve deterministic semantic reference');
assert(response.results[3].value.length === index.summary.eventTypeCount, 'event query must return complete GDJS event grammar');
assert(response.results[4].value.length === index.summary.objectTypeCount, 'object type query must return complete declared object types');
assert.strictEqual(response.results[5].value.runtime.gdevelopType, 'Sprite', 'object type query must expose the exact official materialization type');
assert.strictEqual(response.results[6].value.placement.xFraction, 0.5, 'layout query must expose dictionary-defined placement truth');
assert.throws(function() {
  provider.execute({ schemaVersion: 2, documentKind: 'semantic-context-request', baseStructureHash: 'structure.test', queries: [{ queryId: 'guess', operation: 'search_semantic_members', arguments: { query: 'camera' } }] }, { index: index });
}, /limit/);
assert.throws(function() {
  provider.execute({ schemaVersion: 2, documentKind: 'semantic-context-request', baseStructureHash: 'structure.test', queries: [{ queryId: 'guess', operation: 'invent_target', arguments: {} }] }, { index: index });
}, /Unsupported/);
console.log('[SemanticContextProvider] exact dictionary reads, event grammar, and fail-closed query validation passed');
