var crypto = require('crypto');
var contract = require('./semantic-document-contract.json');
var dictionary = require('./capability-semantic-dictionary');
var assetProductionTruth = require('../shared/asset-production-pipeline-contract.json');
var assetStyleTruth = require('../shared/asset-style-dictionary.json');
var layoutDictionary = require('./semantic-layout-dictionary');

var SCHEMA_VERSION = 2;

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function object(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('SEMANTIC_SOURCE_INVALID', label + ' must be an object'); return value; }
function text(value, label) { if (typeof value !== 'string' || !value.trim()) fail('SEMANTIC_SOURCE_INVALID', label + ' must be a non-empty string'); return value.trim(); }
function id(value, label) { value = text(value, label); if (!/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(value)) fail('SEMANTIC_SOURCE_INVALID', label + ' must be a semantic id'); return value; }
function allowed(value, keys, label) { Object.keys(value).forEach(function(key) { if (keys.indexOf(key) < 0) fail('SEMANTIC_SOURCE_UNKNOWN_FIELD', label + ' contains unknown field: ' + key); }); }
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'GameSemanticSource'; throw error; }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, {}); return value; }
function hash(value, prefix) { return prefix + crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0, 24); }
function sourceHash(source) { return hash(source, 'semantic.'); }
function isScalar(value) { return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'; }

function dictionaryIndex(options) { return options && options.index || dictionary.buildIndex(); }
function assertDictionarySource(value, index) {
  object(value, 'dictionarySource');
  if (!dictionary.sameFingerprint(value, index.source)) fail('SEMANTIC_DICTIONARY_MISMATCH', 'GameSemanticSource dictionarySource does not match the pinned GDJS Semantic Dictionary');
}
function unique(items, label) { var seen = {}; items.forEach(function(item, index) { var key = id(item && item.semanticId, label + '[' + index + '].semanticId'); if (seen[key]) fail('SEMANTIC_SOURCE_DUPLICATE', label + ' has duplicate semantic id: ' + key); seen[key] = true; }); }
function resolveCapability(index, semanticRef, expectedKind) {
  var entry;
  try { entry = dictionary.resolve(index, text(semanticRef, 'invocation.semanticRef')); }
  catch (error) { fail('SEMANTIC_REFERENCE_INVALID', error.message); }
  if (entry.kind !== expectedKind) fail('SEMANTIC_REFERENCE_KIND_INVALID', semanticRef + ' is not a ' + expectedKind);
  if (entry.binding.status !== 'executable') fail('SEMANTIC_REFERENCE_SOURCE_ONLY', semanticRef + ' is source-only and cannot be emitted');
  return entry;
}
function resolveObjectType(index, reference, label) {
  var entry;
  try { entry = dictionary.resolveObjectType(index, text(reference, label)); }
  catch (error) { fail('SEMANTIC_OBJECT_TYPE_INVALID', error.message); }
  if (entry.runtime.status !== 'executable') fail('SEMANTIC_OBJECT_TYPE_SOURCE_ONLY', reference + ' is source-only and cannot be materialized.');
  return entry;
}
function resolveBehaviorType(index, reference, label) {
  var entry;
  try { entry = dictionary.resolveBehaviorType(index, text(reference, label)); }
  catch (error) { fail('SEMANTIC_BEHAVIOR_TYPE_INVALID', error.message); }
  if (entry.runtime.status !== 'executable') fail('SEMANTIC_BEHAVIOR_TYPE_SOURCE_ONLY', reference + ' is source-only and cannot be materialized.');
  return entry;
}
function validateInvocation(index, invocation, expectedKind, label) {
  object(invocation, label); allowed(invocation, ['semanticRef', 'arguments'], label);
  var entry = resolveCapability(index, invocation.semanticRef, expectedKind);
  object(invocation.arguments, label + '.arguments');
  var expected = entry.parameter_contract.parameters.filter(function(parameter) { return parameter.kind !== 'code-only'; }).map(function(parameter) { return parameter.semanticKey; });
  Object.keys(invocation.arguments).forEach(function(key) { if (expected.indexOf(key) < 0) fail('SEMANTIC_INVOCATION_ARGUMENT_INVALID', label + '.arguments contains unknown dictionary parameter: ' + key); });
  expected.forEach(function(key) { if (!Object.prototype.hasOwnProperty.call(invocation.arguments, key)) fail('SEMANTIC_INVOCATION_ARGUMENT_MISSING', label + '.arguments is missing dictionary parameter: ' + key); });
  Object.keys(invocation.arguments).forEach(function(key) { var value = invocation.arguments[key];
    if (isScalar(value)) return;
    validateExpression(index, value, label + '.arguments.' + key);
  });
}
function validateExpression(index, expression, label) {
  object(expression, label); allowed(expression, ['semanticRef', 'arguments'], label);
  var entry;
  try { entry = dictionary.resolve(index, text(expression.semanticRef, label + '.semanticRef')); }
  catch (error) { fail('SEMANTIC_REFERENCE_INVALID', error.message); }
  if (entry.kind !== 'number-expression' && entry.kind !== 'string-expression') fail('SEMANTIC_REFERENCE_KIND_INVALID', expression.semanticRef + ' is not an expression');
  if (entry.binding.status !== 'executable') fail('SEMANTIC_REFERENCE_SOURCE_ONLY', expression.semanticRef + ' is source-only and cannot be emitted');
  object(expression.arguments, label + '.arguments');
  var expected = entry.parameter_contract.parameters.filter(function(parameter) { return parameter.kind !== 'code-only'; }).map(function(parameter) { return parameter.semanticKey; });
  Object.keys(expression.arguments).forEach(function(key) { if (expected.indexOf(key) < 0) fail('SEMANTIC_INVOCATION_ARGUMENT_INVALID', label + '.arguments contains unknown dictionary parameter: ' + key); });
  expected.forEach(function(key) { if (!Object.prototype.hasOwnProperty.call(expression.arguments, key)) fail('SEMANTIC_INVOCATION_ARGUMENT_MISSING', label + '.arguments is missing dictionary parameter: ' + key); });
  Object.keys(expression.arguments).forEach(function(key) { var value = expression.arguments[key]; if (!isScalar(value)) validateExpression(index, value, label + '.arguments.' + key); });
}
function validateMember(index, member, label) {
  object(member, label); allowed(member, ['semanticId', 'roles', 'value', 'bindings'], label); id(member.semanticId, label + '.semanticId');
  if (!Array.isArray(member.roles)) fail('SEMANTIC_MEMBER_INVALID', label + '.roles must be an array'); member.roles.forEach(function(role, index) { text(role, label + '.roles[' + index + ']'); });
  if (!Object.prototype.hasOwnProperty.call(member, 'value') || !isScalar(member.value)) fail('SEMANTIC_MEMBER_INVALID', label + '.value must be a scalar');
  if (!Array.isArray(member.bindings)) fail('SEMANTIC_MEMBER_INVALID', label + '.bindings must be an array');
  member.bindings.forEach(function(reference, bindingIndex) { try { dictionary.resolve(index, text(reference, label + '.bindings[' + bindingIndex + ']')); } catch (error) { fail('SEMANTIC_REFERENCE_INVALID', error.message); } });
}
function validateEntity(index, entity, label) {
  object(entity, label); allowed(entity, ['semanticId', 'roles', 'objectTypeRef', 'behaviorTypeRefs', 'members'], label); id(entity.semanticId, label + '.semanticId');
  if (!Array.isArray(entity.roles) || !entity.roles.length) fail('SEMANTIC_ENTITY_INVALID', label + '.roles must be non-empty'); entity.roles.forEach(function(role, roleIndex) { text(role, label + '.roles[' + roleIndex + ']'); });
  if (entity.objectTypeRef !== null && entity.objectTypeRef !== undefined) resolveObjectType(index, entity.objectTypeRef, label + '.objectTypeRef');
  if (!Array.isArray(entity.behaviorTypeRefs)) fail('SEMANTIC_ENTITY_INVALID', label + '.behaviorTypeRefs must be an array');
  var seenBehaviorTypes = {};
  entity.behaviorTypeRefs.forEach(function(reference, behaviorIndex) { var behavior = resolveBehaviorType(index, reference, label + '.behaviorTypeRefs[' + behaviorIndex + ']'); if (seenBehaviorTypes[behavior.semantic_id]) fail('SEMANTIC_ENTITY_INVALID', label + '.behaviorTypeRefs has duplicate type: ' + behavior.semantic_id); seenBehaviorTypes[behavior.semantic_id] = true; });
  if (entity.behaviorTypeRefs.length && !entity.objectTypeRef) fail('SEMANTIC_ENTITY_INVALID', label + '.behaviorTypeRefs requires objectTypeRef');
  if (!Array.isArray(entity.members)) fail('SEMANTIC_ENTITY_INVALID', label + '.members must be an array'); unique(entity.members, label + '.members'); entity.members.forEach(function(member, memberIndex) { validateMember(index, member, label + '.members[' + memberIndex + ']'); });
}
function validateEvent(index, event, label) {
  object(event, label); allowed(event, ['semanticId', 'eventTypeRef', 'conditions', 'actions', 'children'], label); id(event.semanticId, label + '.semanticId');
  var eventType;
  try { eventType = dictionary.resolveEventType(index, text(event.eventTypeRef, label + '.eventTypeRef')); }
  catch (error) { fail('SEMANTIC_EVENT_TYPE_INVALID', error.message); }
  if (!Array.isArray(event.conditions) || !Array.isArray(event.actions) || !Array.isArray(event.children)) fail('SEMANTIC_EVENT_INVALID', label + ' conditions, actions, and children must be arrays');
  if (event.conditions.length && eventType.grammar.hasConditions !== true) fail('SEMANTIC_EVENT_GRAMMAR_INVALID', event.eventTypeRef + ' does not declare conditions');
  if (event.actions.length && eventType.grammar.hasActions !== true) fail('SEMANTIC_EVENT_GRAMMAR_INVALID', event.eventTypeRef + ' does not declare actions');
  if (event.children.length && eventType.grammar.canHaveSubEvents !== true) fail('SEMANTIC_EVENT_GRAMMAR_INVALID', event.eventTypeRef + ' does not declare subevents');
  event.conditions.forEach(function(item, itemIndex) { validateInvocation(index, item, 'condition', label + '.conditions[' + itemIndex + ']'); });
  event.actions.forEach(function(item, itemIndex) { validateInvocation(index, item, 'action', label + '.actions[' + itemIndex + ']'); });
  event.children.forEach(function(child, childIndex) { validateEvent(index, child, label + '.children[' + childIndex + ']'); });
}
function validateBindings(index, bindings, label) {
  if (!Array.isArray(bindings)) fail('SEMANTIC_INTENT_INVALID', label + '.bindings must be an array');
  bindings.forEach(function(reference, bindingIndex) { try { dictionary.resolve(index, text(reference, label + '.bindings[' + bindingIndex + ']')); } catch (error) { fail('SEMANTIC_REFERENCE_INVALID', error.message); } });
}
function validateRoles(roles, label) {
  if (!Array.isArray(roles) || !roles.length) fail('SEMANTIC_INTENT_INVALID', label + '.roles must be non-empty');
  roles.forEach(function(role, roleIndex) { text(role, label + '.roles[' + roleIndex + ']'); });
}
function validateScalarTree(value, label) {
  if (isScalar(value)) return;
  if (Array.isArray(value)) { value.forEach(function(item, itemIndex) { validateScalarTree(item, label + '[' + itemIndex + ']'); }); return; }
  object(value, label); Object.keys(value).forEach(function(key) { text(key, label + ' key'); validateScalarTree(value[key], label + '.' + key); });
}
function validateSubject(source, subject, label) {
  var value = id(subject, label + '.subject');
  if (value === source.game.semanticId || source.entities.some(function(entity) { return entity.semanticId === value; })) return value;
  fail('SEMANTIC_INTENT_SUBJECT_MISSING', label + '.subject does not identify the game or a declared entity: ' + value);
}
function validateAssetIntent(index, source, intent, label) {
  object(intent, label); allowed(intent, ['semanticId', 'roles', 'subject', 'description', 'productionFamily', 'styleId', 'constraints', 'bindings'], label); id(intent.semanticId, label + '.semanticId');
  validateRoles(intent.roles, label); validateSubject(source, intent.subject, label); text(intent.description, label + '.description');
  var family = text(intent.productionFamily, label + '.productionFamily');
  if (!assetProductionTruth.productionFamilies || !assetProductionTruth.productionFamilies[family]) fail('SEMANTIC_ASSET_FAMILY_INVALID', label + '.productionFamily is absent from the pinned asset production truth: ' + family);
  var styleId = text(intent.styleId, label + '.styleId');
  if (!assetStyleTruth.styles || !assetStyleTruth.styles[styleId]) fail('SEMANTIC_ASSET_STYLE_INVALID', label + '.styleId is absent from the pinned asset style dictionary: ' + styleId);
  object(intent.constraints, label + '.constraints'); validateScalarTree(intent.constraints, label + '.constraints'); validateBindings(index, intent.bindings, label);
}
function validateLayoutRelation(source, relation, label) {
  object(relation, label); allowed(relation, ['semanticId', 'layoutRef', 'subjects'], label); id(relation.semanticId, label + '.semanticId'); try { layoutDictionary.resolve(text(relation.layoutRef, label + '.layoutRef')); } catch (error) { fail(error.code || 'SEMANTIC_LAYOUT_REFERENCE_INVALID', error.message); }
  if (!Array.isArray(relation.subjects) || !relation.subjects.length) fail('SEMANTIC_LAYOUT_RELATION_INVALID', label + '.subjects must be non-empty');
  relation.subjects.forEach(function(subject, subjectIndex) { validateSubject(source, subject, label + '.subjects[' + subjectIndex + ']'); });
}
function validateLayoutIntent(index, source, intent, label) {
  object(intent, label); allowed(intent, ['semanticId', 'roles', 'subject', 'relations', 'bindings'], label); id(intent.semanticId, label + '.semanticId'); validateRoles(intent.roles, label); validateSubject(source, intent.subject, label);
  if (!Array.isArray(intent.relations) || intent.relations.length !== 1) fail('SEMANTIC_LAYOUT_INTENT_INVALID', label + '.relations must contain exactly one dictionary placement relation');
  intent.relations.forEach(function(relation, relationIndex) { validateLayoutRelation(source, relation, label + '.relations[' + relationIndex + ']'); }); validateBindings(index, intent.bindings, label);
}
function validatePolicies(policies) {
  object(policies, 'tuningPolicies'); allowed(policies, ['relativeChange'], 'tuningPolicies'); object(policies.relativeChange, 'tuningPolicies.relativeChange');
  Object.keys(policies.relativeChange).forEach(function(degree) { id(degree, 'relative change degree'); var policy = policies.relativeChange[degree]; object(policy, 'relativeChange.' + degree); allowed(policy, ['mode', 'value'], 'relativeChange.' + degree); if (policy.mode !== 'percentage' && policy.mode !== 'absolute') fail('SEMANTIC_POLICY_INVALID', 'relativeChange.' + degree + '.mode is invalid'); if (typeof policy.value !== 'number' || !isFinite(policy.value) || policy.value <= 0) fail('SEMANTIC_POLICY_INVALID', 'relativeChange.' + degree + '.value must be a positive finite number'); });
}
function validateSource(source, options) {
  var index = dictionaryIndex(options); object(source, 'GameSemanticSource'); allowed(source, ['schemaVersion', 'documentKind', 'dictionarySource', 'game', 'entities', 'events', 'assetIntents', 'layoutIntents', 'tuningPolicies'], 'GameSemanticSource');
  if (source.schemaVersion !== SCHEMA_VERSION || source.documentKind !== contract.sourceDocumentKind) fail('SEMANTIC_SOURCE_KIND_INVALID', 'GameSemanticSource has an invalid document kind or version');
  assertDictionarySource(source.dictionarySource, index); object(source.game, 'game'); allowed(source.game, ['semanticId', 'name'], 'game'); id(source.game.semanticId, 'game.semanticId'); text(source.game.name, 'game.name');
  contract.collections.forEach(function(collection) { if (!Array.isArray(source[collection])) fail('SEMANTIC_SOURCE_INVALID', collection + ' must be an array'); unique(source[collection], collection); });
  source.entities.forEach(function(item, itemIndex) { validateEntity(index, item, 'entities[' + itemIndex + ']'); }); source.events.forEach(function(item, itemIndex) { validateEvent(index, item, 'events[' + itemIndex + ']'); }); source.assetIntents.forEach(function(item, itemIndex) { validateAssetIntent(index, source, item, 'assetIntents[' + itemIndex + ']'); }); source.layoutIntents.forEach(function(item, itemIndex) { validateLayoutIntent(index, source, item, 'layoutIntents[' + itemIndex + ']'); }); validatePolicies(source.tuningPolicies);
  return clone(source);
}
function collection(source, name) { if (contract.collections.indexOf(name) < 0) fail('SEMANTIC_REVISION_INVALID', 'Unknown semantic collection: ' + name); return source[name]; }
function findEntity(source, target) { object(target, 'target'); allowed(target, ['entity', 'member'], 'target'); var entityId = id(target.entity, 'target.entity'); var memberId = id(target.member, 'target.member'); var entity = source.entities.filter(function(item) { return item.semanticId === entityId; })[0]; if (!entity) fail('SEMANTIC_TARGET_MISSING', 'Unknown entity: ' + entityId); var member = entity.members.filter(function(item) { return item.semanticId === memberId; })[0]; if (!member) fail('SEMANTIC_TARGET_MISSING', 'Unknown member: ' + entityId + '.' + memberId); return member; }
function applyRevision(source, revision, options) {
  var index = dictionaryIndex(options); var next = validateSource(source, { index: index }); object(revision, 'GameSemanticRevision'); allowed(revision, ['schemaVersion', 'documentKind', 'baseSourceHash', 'operations'], 'GameSemanticRevision');
  if (revision.schemaVersion !== SCHEMA_VERSION || revision.documentKind !== contract.revisionDocumentKind) fail('SEMANTIC_REVISION_INVALID', 'GameSemanticRevision has an invalid document kind or version'); if (revision.baseSourceHash !== sourceHash(next)) fail('SEMANTIC_REVISION_BASE_MISMATCH', 'GameSemanticRevision baseSourceHash does not match the source'); if (!Array.isArray(revision.operations) || !revision.operations.length) fail('SEMANTIC_REVISION_INVALID', 'GameSemanticRevision.operations must be non-empty');
  revision.operations.forEach(function(operation, operationIndex) {
    object(operation, 'operations[' + operationIndex + ']'); if (contract.revisionOperations.indexOf(operation.op) < 0) fail('SEMANTIC_REVISION_INVALID', 'Unknown revision operation: ' + operation.op);
    if (operation.op === 'upsert') { allowed(operation, ['op', 'collection', 'value'], 'upsert'); var items = collection(next, text(operation.collection, 'upsert.collection')); object(operation.value, 'upsert.value'); var position = items.map(function(item) { return item.semanticId; }).indexOf(id(operation.value.semanticId, 'upsert.value.semanticId')); if (position < 0) items.push(clone(operation.value)); else items[position] = clone(operation.value); }
    else if (operation.op === 'remove') { allowed(operation, ['op', 'collection', 'semanticId'], 'remove'); var removeItems = collection(next, text(operation.collection, 'remove.collection')); var removeId = id(operation.semanticId, 'remove.semanticId'); var removePosition = removeItems.map(function(item) { return item.semanticId; }).indexOf(removeId); if (removePosition < 0) fail('SEMANTIC_TARGET_MISSING', 'Cannot remove missing semantic item: ' + removeId); removeItems.splice(removePosition, 1); }
    else if (operation.op === 'set_member_value') { allowed(operation, ['op', 'target', 'value'], 'set_member_value'); var member = findEntity(next, operation.target); if (!isScalar(operation.value)) fail('SEMANTIC_REVISION_INVALID', 'set_member_value.value must be scalar'); member.value = operation.value; }
    else { allowed(operation, ['op', 'target', 'direction', 'degree'], 'adjust_member_value'); var adjustable = findEntity(next, operation.target); if (typeof adjustable.value !== 'number') fail('SEMANTIC_REVISION_INVALID', 'adjust_member_value requires a numeric member'); if (operation.direction !== 'increase' && operation.direction !== 'decrease') fail('SEMANTIC_REVISION_INVALID', 'adjust_member_value.direction is invalid'); var degree = text(operation.degree, 'adjust_member_value.degree'); var policy = next.tuningPolicies.relativeChange[degree]; if (!policy) fail('SEMANTIC_POLICY_MISSING', 'No relative tuning policy exists for degree: ' + degree); var delta = policy.mode === 'percentage' ? adjustable.value * policy.value : policy.value; adjustable.value += operation.direction === 'increase' ? delta : -delta; }
  });
  return validateSource(next, { index: index });
}
function invocationStructure(item) { return { semanticRef: item.semanticRef, argumentKeys: Object.keys(item.arguments).sort() }; }
function eventStructure(event) { return { semanticId: event.semanticId, eventTypeRef: event.eventTypeRef, conditions: event.conditions.map(invocationStructure), actions: event.actions.map(invocationStructure), children: event.children.map(eventStructure) }; }
function structureView(source, options) {
  source = validateSource(source, options); var payload = { game: clone(source.game), entities: source.entities.map(function(entity) { return { semanticId: entity.semanticId, roles: clone(entity.roles), objectTypeRef: entity.objectTypeRef || null, behaviorTypeRefs: clone(entity.behaviorTypeRefs), members: entity.members.map(function(member) { return { semanticId: member.semanticId, roles: clone(member.roles), valueType: member.value === null ? 'null' : typeof member.value, bindings: clone(member.bindings) }; }) }; }), events: source.events.map(eventStructure), assetIntents: source.assetIntents.map(function(item) { return { semanticId: item.semanticId, roles: clone(item.roles), subject: item.subject, description: item.description, productionFamily: item.productionFamily, styleId: item.styleId, constraintShape: Object.keys(item.constraints).sort(), bindings: clone(item.bindings) }; }), layoutIntents: source.layoutIntents.map(function(item) { return { semanticId: item.semanticId, roles: clone(item.roles), subject: item.subject, relations: item.relations.map(function(relation) { return { semanticId: relation.semanticId, layoutRef: relation.layoutRef, subjects: clone(relation.subjects) }; }), bindings: clone(item.bindings) }; }) };
  return { schemaVersion: SCHEMA_VERSION, documentKind: contract.structureDocumentKind, sourceHash: sourceHash(source), structureHash: hash(payload, 'structure.'), worldVersion: options && options.worldVersion === undefined ? null : (options && options.worldVersion), dictionarySource: clone(source.dictionarySource), payload: payload };
}

function structuralDiff(previousView, nextView) {
  object(previousView, 'previous structure view'); object(nextView, 'next structure view');
  if (previousView.documentKind !== contract.structureDocumentKind || nextView.documentKind !== contract.structureDocumentKind) fail('SEMANTIC_STRUCTURE_DIFF_INVALID', 'structure views are required');
  var result = { fromStructureHash: previousView.structureHash, toStructureHash: nextView.structureHash, collections: {} };
  ['entities', 'events', 'assetIntents', 'layoutIntents'].forEach(function(name) {
    var before = previousView.payload[name] || []; var after = nextView.payload[name] || [];
    var beforeById = {}; var afterById = {}; before.forEach(function(item) { beforeById[item.semanticId] = item; }); after.forEach(function(item) { afterById[item.semanticId] = item; });
    var added = Object.keys(afterById).filter(function(key) { return !beforeById[key]; }).sort(); var removed = Object.keys(beforeById).filter(function(key) { return !afterById[key]; }).sort(); var changed = Object.keys(afterById).filter(function(key) { return beforeById[key] && JSON.stringify(stable(beforeById[key])) !== JSON.stringify(stable(afterById[key])); }).sort();
    result.collections[name] = { added: added, removed: removed, changed: changed };
  });
  return result;
}

module.exports = { SCHEMA_VERSION: SCHEMA_VERSION, sourceHash: sourceHash, validateSource: validateSource, applyRevision: applyRevision, structureView: structureView, structuralDiff: structuralDiff };
