var dictionary = require('./capability-semantic-dictionary');
var layoutDictionary = require('./semantic-layout-dictionary');

var SCHEMA_VERSION = 2;
var REQUEST_KIND = 'semantic-context-request';
var RESPONSE_KIND = 'semantic-context-response';
var OPERATIONS = {
  list_semantic_owners: true,
  list_semantic_members: true,
  describe_semantic_member: true,
  list_semantic_operations: true,
  resolve_semantic: true,
  search_semantic_members: true,
  list_event_types: true,
  describe_event_type: true,
  list_object_types: true,
  describe_object_type: true,
  list_behavior_types: true,
  describe_behavior_type: true,
  list_layout_relations: true,
  describe_layout_relation: true
};

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'SemanticContextProvider'; throw error; }
function object(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('SEMANTIC_CONTEXT_INVALID', label + ' must be an object'); return value; }
function text(value, label) { if (typeof value !== 'string' || !value.trim()) fail('SEMANTIC_CONTEXT_INVALID', label + ' must be a non-empty string'); return value.trim(); }
function allowed(value, keys, label) { Object.keys(value).forEach(function(key) { if (keys.indexOf(key) < 0) fail('SEMANTIC_CONTEXT_UNKNOWN_FIELD', label + ' contains unknown field: ' + key); }); }

function eventType(index, reference) {
  try { return dictionary.resolveEventType(index, reference); }
  catch (error) { fail('SEMANTIC_CONTEXT_NOT_FOUND', error.message); }
}

function ownerMembers(index, owner) {
  object(owner, 'owner');
  allowed(owner, ['kind', 'id'], 'owner');
  text(owner.kind, 'owner.kind');
  text(owner.id, 'owner.id');
  var members = dictionary.listMembers(index, owner);
  if (!members.length) fail('SEMANTIC_CONTEXT_NOT_FOUND', 'Unknown GDJS semantic owner: ' + owner.kind + '::' + owner.id);
  return members;
}

function executeQuery(index, query) {
  object(query, 'query');
  allowed(query, ['queryId', 'operation', 'arguments'], 'query');
  var queryId = text(query.queryId, 'query.queryId');
  var operation = text(query.operation, 'query.operation');
  if (!OPERATIONS[operation]) fail('SEMANTIC_CONTEXT_OPERATION_INVALID', 'Unsupported semantic context operation: ' + operation);
  var args = object(query.arguments, 'query.arguments');
  var value;
  if (operation === 'list_semantic_owners') {
    allowed(args, [], 'list_semantic_owners.arguments');
    value = dictionary.listOwners(index);
  } else if (operation === 'list_semantic_members') {
    allowed(args, ['owner'], 'list_semantic_members.arguments');
    value = ownerMembers(index, args.owner);
  } else if (operation === 'describe_semantic_member' || operation === 'resolve_semantic') {
    allowed(args, ['semanticRef'], operation + '.arguments');
    value = dictionary.resolve(index, text(args.semanticRef, operation + '.arguments.semanticRef'));
  } else if (operation === 'list_semantic_operations') {
    allowed(args, ['semanticRef'], 'list_semantic_operations.arguments');
    var entry = dictionary.resolve(index, text(args.semanticRef, 'list_semantic_operations.arguments.semanticRef'));
    value = { semanticRef: entry.semantic_id, eventContract: entry.event_contract, executable: entry.binding.status === 'executable' };
  } else if (operation === 'search_semantic_members') {
    allowed(args, ['query', 'limit'], 'search_semantic_members.arguments');
    if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 100) fail('SEMANTIC_CONTEXT_INVALID', 'search_semantic_members.arguments.limit must be an integer from 1 to 100');
    value = dictionary.search(index, text(args.query, 'search_semantic_members.arguments.query'), args.limit);
  } else if (operation === 'list_event_types') {
    allowed(args, [], 'list_event_types.arguments');
    value = clone(index.event_grammar.eventTypes).map(function(item) { item.semantic_id = dictionary.resolveEventType(index, item.eventType).semantic_id; return item; });
  } else {
    if (operation === 'list_object_types') {
      allowed(args, [], 'list_object_types.arguments');
      value = dictionary.listObjectTypes(index);
    } else if (operation === 'describe_object_type') {
      allowed(args, ['objectTypeRef'], 'describe_object_type.arguments');
      value = dictionary.resolveObjectType(index, text(args.objectTypeRef, 'describe_object_type.arguments.objectTypeRef'));
    } else if (operation === 'list_behavior_types') {
      allowed(args, [], 'list_behavior_types.arguments');
      value = dictionary.listBehaviorTypes(index);
    } else if (operation === 'describe_behavior_type') {
      allowed(args, ['behaviorTypeRef'], 'describe_behavior_type.arguments');
      value = dictionary.resolveBehaviorType(index, text(args.behaviorTypeRef, 'describe_behavior_type.arguments.behaviorTypeRef'));
    } else if (operation === 'list_layout_relations') {
      allowed(args, [], 'list_layout_relations.arguments');
      value = layoutDictionary.list();
    } else if (operation === 'describe_layout_relation') {
      allowed(args, ['layoutRef'], 'describe_layout_relation.arguments');
      try { value = layoutDictionary.resolve(text(args.layoutRef, 'describe_layout_relation.arguments.layoutRef')); }
      catch (error) { fail(error.code || 'SEMANTIC_CONTEXT_NOT_FOUND', error.message); }
    } else {
    allowed(args, ['eventType'], 'describe_event_type.arguments');
    value = eventType(index, text(args.eventType, 'describe_event_type.arguments.eventType'));
    }
  }
  return { queryId: queryId, operation: operation, value: value };
}

function execute(request, options) {
  options = options || {};
  object(request, 'SemanticContextRequest');
  allowed(request, ['schemaVersion', 'documentKind', 'baseStructureHash', 'queries'], 'SemanticContextRequest');
  if (request.schemaVersion !== SCHEMA_VERSION) fail('SEMANTIC_CONTEXT_VERSION_INVALID', 'SemanticContextRequest schemaVersion must be ' + SCHEMA_VERSION);
  if (request.documentKind !== REQUEST_KIND) fail('SEMANTIC_CONTEXT_KIND_INVALID', 'SemanticContextRequest documentKind is invalid');
  text(request.baseStructureHash, 'SemanticContextRequest.baseStructureHash');
  if (!Array.isArray(request.queries) || !request.queries.length) fail('SEMANTIC_CONTEXT_QUERIES_REQUIRED', 'SemanticContextRequest.queries must be non-empty');
  var ids = {};
  request.queries.forEach(function(query) {
    var queryId = text(query && query.queryId, 'query.queryId');
    if (ids[queryId]) fail('SEMANTIC_CONTEXT_QUERY_ID_DUPLICATE', 'SemanticContextRequest queryId is duplicated: ' + queryId);
    ids[queryId] = true;
  });
  var index = options.index || dictionary.buildIndex();
  return {
    schemaVersion: SCHEMA_VERSION,
    documentKind: RESPONSE_KIND,
    baseStructureHash: request.baseStructureHash,
    dictionarySource: clone(index.source),
    results: request.queries.map(function(query) { return executeQuery(index, query); })
  };
}

module.exports = { SCHEMA_VERSION: SCHEMA_VERSION, REQUEST_KIND: REQUEST_KIND, RESPONSE_KIND: RESPONSE_KIND, OPERATIONS: clone(OPERATIONS), execute: execute };
