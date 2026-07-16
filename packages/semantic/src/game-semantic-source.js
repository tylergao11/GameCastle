var crypto = require('crypto');
var contract = require('../contracts/semantic-document-contract.json');
var dictionary = require('./capability-semantic-dictionary');
var eventAlgebra = require('./semantic-event-algebra');
var assetProductionTruth = require('../../assets/contracts/asset-production-pipeline-contract.json');
var assetStyleTruth = require('../../assets/contracts/asset-style-dictionary.json');
var frameSetTruth = require('../../assets/contracts/frame-set-contract.json');
var layoutDictionary = require('./semantic-layout-dictionary');

var SCHEMA_VERSION = contract.schemaVersion;

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function object(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('SEMANTIC_SOURCE_INVALID', label + ' must be an object'); return value; }
function text(value, label) { if (typeof value !== 'string' || !value.trim()) fail('SEMANTIC_SOURCE_INVALID', label + ' must be a non-empty string'); return value.trim(); }
function id(value, label) { value = text(value, label); if (!/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(value)) fail('SEMANTIC_SOURCE_INVALID', label + ' must be a semantic id'); return value; }
function allowed(value, keys, label) { Object.keys(value).forEach(function(key) { if (keys.indexOf(key) < 0) fail('SEMANTIC_SOURCE_UNKNOWN_FIELD', label + ' contains unknown field: ' + key); }); }
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'GameSemanticSource'; throw error; }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, Object.create(null)); return value; }
function hash(value, prefix) { return prefix + crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0, 24); }
function sourceHash(source) { return hash(source, 'semantic.'); }
function isScalar(value) { return typeof value === 'string' || (typeof value === 'number' && isFinite(value)) || typeof value === 'boolean'; }
function variableValueType(value) { return Array.isArray(value) ? 'array' : (value && typeof value === 'object' ? 'structure' : typeof value); }
function validateVariableValue(value, label) {
  if (typeof value === 'number') { if (!isFinite(value)) fail('SEMANTIC_MEMBER_INVALID', label + ' must be a finite number'); return; }
  if (typeof value === 'string' || typeof value === 'boolean') return;
  if (Array.isArray(value)) { value.forEach(function(child, index) { validateVariableValue(child, label + '[' + index + ']'); }); return; }
  if (value && typeof value === 'object') { Object.keys(value).forEach(function(key) { text(key, label + ' child name'); validateVariableValue(value[key], label + '.' + key); }); return; }
  fail('SEMANTIC_MEMBER_INVALID', label + ' must be a GDJS number, string, boolean, structure, or array value');
}

function dictionaryIndex(options) { return options && options.index || dictionary.loadIndex(); }
function assertDictionarySource(value, index) {
  object(value, 'dictionarySource');
  if (!dictionary.sameFingerprint(value, index.source)) fail('SEMANTIC_DICTIONARY_MISMATCH', 'GameSemanticSource dictionarySource does not match the pinned GDJS Semantic Dictionary');
}
function unique(items, label) { var seen = Object.create(null); items.forEach(function(item, index) { var key = id(item && item.semanticId, label + '[' + index + '].semanticId'); if (seen[key]) fail('SEMANTIC_SOURCE_DUPLICATE', label + ' has duplicate semantic id: ' + key); seen[key] = true; }); }
function resolveCapability(index, semanticRef, expectedKind) {
  var entry;
  try { entry = dictionary.resolve(index, text(semanticRef, 'invocation.semanticRef')); }
  catch (error) { fail('SEMANTIC_REFERENCE_INVALID', error.message); }
  if (semanticRef !== entry.semantic_id) fail('SEMANTIC_REFERENCE_NOT_CANONICAL', semanticRef + ' must use the dictionary semanticRef ' + entry.semantic_id);
  if (entry.kind !== expectedKind) fail('SEMANTIC_REFERENCE_KIND_INVALID', semanticRef + ' is not a ' + expectedKind);
  if (entry.binding.status !== 'executable') fail('SEMANTIC_REFERENCE_SOURCE_ONLY', semanticRef + ' is source-only and cannot be emitted');
  return entry;
}
function resolveObjectType(index, reference, label) {
  var entry;
  try { entry = dictionary.resolveObjectType(index, text(reference, label)); }
  catch (error) { fail('SEMANTIC_OBJECT_TYPE_INVALID', error.message); }
  if (reference !== entry.semantic_id) fail('SEMANTIC_OBJECT_TYPE_INVALID', reference + ' must use the dictionary semanticRef ' + entry.semantic_id);
  if (entry.runtime.status !== 'executable') fail('SEMANTIC_OBJECT_TYPE_SOURCE_ONLY', reference + ' is source-only and cannot be materialized.');
  return entry;
}
function resolveBehaviorType(index, reference, label) {
  var entry;
  try { entry = dictionary.resolveBehaviorType(index, text(reference, label)); }
  catch (error) { fail('SEMANTIC_BEHAVIOR_TYPE_INVALID', error.message); }
  if (reference !== entry.semantic_id) fail('SEMANTIC_BEHAVIOR_TYPE_INVALID', reference + ' must use the dictionary semanticRef ' + entry.semantic_id);
  if (entry.runtime.status !== 'executable') fail('SEMANTIC_BEHAVIOR_TYPE_SOURCE_ONLY', reference + ' is source-only and cannot be materialized.');
  return entry;
}
function validateOperation(index, operation, entry, expectedKind, label) {
  eventAlgebra.initialize(index);
  object(operation, label); allowed(operation, ['use', 'slot', 'part', 'size'], label);
  var use = text(operation.use, label + '.use');
  var slot = text(operation.slot, label + '.slot');
  if (!new RegExp('^' + expectedKind + '\\.\\d+$').test(slot)) fail('SEMANTIC_OPERATION_SLOT_INVALID', label + '.slot must use ' + expectedKind + '.N');
  if (!Number.isInteger(operation.part) || !Number.isInteger(operation.size) || operation.size < 1 || operation.part < 0 || operation.part >= operation.size) fail('SEMANTIC_OPERATION_EXPANSION_INVALID', label + ' requires 0 <= part < size');
  var foundation = eventAlgebra.operationForUse(use);
  if (foundation) {
    if (foundation.kind !== expectedKind) fail('SEMANTIC_OPERATION_KIND_INVALID', use + ' is ' + foundation.kind + ', expected ' + expectedKind);
    var bindings = eventAlgebra.bindingRefs(index, use) || [];
    if (bindings.indexOf(entry.semantic_id) < 0) fail('SEMANTIC_OPERATION_BINDING_INVALID', label + '.use does not expand through ' + entry.semantic_id);
  } else {
    var extension;
    try { extension = dictionary.resolve(index, use); }
    catch (error) { fail('SEMANTIC_OPERATION_USE_INVALID', error.message); }
    if (extension.semantic_id !== entry.semantic_id || extension.kind !== expectedKind) fail('SEMANTIC_OPERATION_BINDING_INVALID', label + '.use must equal the extension semanticRef it invokes');
    if (operation.size !== 1 || operation.part !== 0) fail('SEMANTIC_OPERATION_EXPANSION_INVALID', 'A retrieved extension operation has one dictionary invocation');
  }
  return operation;
}
function validateCanonicalParameter(index, parameter, value, label) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (parameter.runtimeValueKind !== 'number-expression' && parameter.runtimeValueKind !== 'string-expression') fail('SEMANTIC_INVOCATION_ARGUMENT_INVALID', label + ' is not an expression slot');
    var expressionEntry = validateExpression(index, value, label);
    if (parameter.runtimeValueKind === 'number-expression' && expressionEntry.kind !== 'number-expression') fail('SEMANTIC_REFERENCE_KIND_INVALID', label + ' requires a number expression');
    if (parameter.runtimeValueKind === 'string-expression' && expressionEntry.kind !== 'string-expression') fail('SEMANTIC_REFERENCE_KIND_INVALID', label + ' requires a string expression');
    return;
  }
  if (!isScalar(value)) fail('SEMANTIC_INVOCATION_ARGUMENT_INVALID', label + ' must be a canonical scalar or expression');
  if (parameter.runtimeNormalization === 'number-expression') {
    if (typeof value !== 'string' || !value.length || !isFinite(Number(value)) || String(Number(value)) !== value) fail('SEMANTIC_INVOCATION_ARGUMENT_INVALID', label + ' must be the runtime-normalized finite number expression');
    return;
  }
  if (parameter.runtimeNormalization === 'string-expression') {
    var decoded;
    try { decoded = JSON.parse(value); } catch (_error) { fail('SEMANTIC_INVOCATION_ARGUMENT_INVALID', label + ' must be the runtime-normalized string expression'); }
    if (typeof decoded !== 'string' || JSON.stringify(decoded) !== value) fail('SEMANTIC_INVOCATION_ARGUMENT_INVALID', label + ' must be the runtime-normalized string expression');
    return;
  }
  if (parameter.runtimeNormalization === 'boolean-token' || parameter.runtimeNormalization === 'dictionary-token') {
    if (!Array.isArray(parameter.runtimeValues) || parameter.runtimeValues.indexOf(value) < 0) fail('SEMANTIC_INVOCATION_ARGUMENT_INVALID', label + ' must take one dictionary token: ' + (parameter.runtimeValues || []).join(', '));
    return;
  }
  if (['entity-object-name', 'entity-behavior-name', 'object-member-name', 'scene-member-name', 'contextual-member-name', 'local-name', 'name', 'text', 'resource-name'].indexOf(parameter.runtimeNormalization) >= 0) {
    if (typeof value !== 'string' || !value.length) fail('SEMANTIC_INVOCATION_ARGUMENT_INVALID', label + ' must be a runtime-normalized name');
    return;
  }
  if (parameter.runtimeNormalization === 'scalar') return;
  fail('SEMANTIC_INVOCATION_ARGUMENT_INVALID', label + ' has no dictionary normalization rule');
}
function validateInvocation(index, invocation, expectedKind, label) {
  object(invocation, label); allowed(invocation, expectedKind === 'condition' ? ['semanticRef', 'arguments', 'operation', 'channel', 'inverted'] : ['semanticRef', 'arguments', 'operation', 'channel', 'awaited'], label);
  if (expectedKind === 'condition' && typeof invocation.inverted !== 'boolean') fail('SEMANTIC_CONDITION_INVERSION_INVALID', label + '.inverted must be a boolean from the instruction serialization truth');
  if (expectedKind === 'action' && typeof invocation.awaited !== 'boolean') fail('SEMANTIC_ACTION_AWAIT_INVALID', label + '.awaited must be a boolean from the instruction serialization truth');
  var entry = resolveCapability(index, invocation.semanticRef, expectedKind);
  validateOperation(index, invocation.operation, entry, expectedKind, label + '.operation');
  object(invocation.arguments, label + '.arguments');
  var expected = entry.parameter_contract.parameters.filter(function(parameter) { return parameter.kind !== 'code-only'; });
  var expectedKeys = expected.map(function(parameter) { return parameter.semanticKey; });
  Object.keys(invocation.arguments).forEach(function(key) { if (expectedKeys.indexOf(key) < 0) fail('SEMANTIC_INVOCATION_ARGUMENT_INVALID', label + '.arguments contains unknown dictionary parameter: ' + key); });
  expected.filter(function(parameter) { return !parameter.optional; }).forEach(function(parameter) { if (!Object.prototype.hasOwnProperty.call(invocation.arguments, parameter.semanticKey)) fail('SEMANTIC_INVOCATION_ARGUMENT_MISSING', label + '.arguments is missing dictionary parameter: ' + parameter.semanticKey); });
  Object.keys(invocation.arguments).forEach(function(key) { validateCanonicalParameter(index, expected.filter(function(parameter) { return parameter.semanticKey === key; })[0], invocation.arguments[key], label + '.arguments.' + key); });
}
function validateOperationGroups(index, items, expectedKind, label, eventType) {
  var channels = (eventType.serialization.instructionLists || []).filter(function(channel) { return channel.kind === expectedKind; });
  var groups = Object.create(null);
  items.forEach(function(item, position) {
    validateInvocation(index, item, expectedKind, label + '[' + position + ']');
    var channel = text(item.channel, label + '[' + position + '].channel');
    if (!channels.some(function(candidate) { return candidate.semanticKey === channel; })) fail('SEMANTIC_EVENT_CHANNEL_INVALID', eventType.eventType + ' has no ' + expectedKind + ' channel named ' + channel);
    var operation = item.operation;
    var group = groups[operation.slot];
    if (!group) group = groups[operation.slot] = { use: operation.use, channel: channel, size: operation.size, count: 0, lastPosition: position - 1, inverted: item.inverted, awaited: item.awaited, items: [] };
    if (group.use !== operation.use || group.channel !== channel || group.size !== operation.size) fail('SEMANTIC_OPERATION_GROUP_INVALID', operation.slot + ' has inconsistent use, channel, or size');
    if (expectedKind === 'condition' && group.inverted !== item.inverted) fail('SEMANTIC_OPERATION_GROUP_INVALID', operation.slot + ' has inconsistent condition inversion');
    if (expectedKind === 'action' && group.awaited !== item.awaited) fail('SEMANTIC_OPERATION_GROUP_INVALID', operation.slot + ' has inconsistent action await');
    if (group.lastPosition !== position - 1 || operation.part !== group.count) fail('SEMANTIC_OPERATION_GROUP_INVALID', operation.slot + ' must be contiguous and ordered by part');
    group.count++; group.lastPosition = position; group.items.push(item);
  });
  Object.keys(groups).forEach(function(slot) {
    var group = groups[slot];
    if (group.count !== group.size) fail('SEMANTIC_OPERATION_GROUP_INVALID', slot + ' is missing expanded dictionary invocations');
    if (eventAlgebra.operationForUse(group.use)) {
      try { eventAlgebra.assertFoundationExpansion(index, group.use, group.items); }
      catch (error) { fail(error.code || 'SEMANTIC_OPERATION_EXPANSION_INVALID', label + '/' + slot + ': ' + error.message); }
    }
  });
}
function validateExpression(index, expression, label) {
  object(expression, label); allowed(expression, ['semanticRef', 'arguments'], label);
  var entry;
  try { entry = dictionary.resolve(index, text(expression.semanticRef, label + '.semanticRef')); }
  catch (error) { fail('SEMANTIC_REFERENCE_INVALID', error.message); }
  if (expression.semanticRef !== entry.semantic_id) fail('SEMANTIC_REFERENCE_NOT_CANONICAL', expression.semanticRef + ' must use the dictionary semanticRef ' + entry.semantic_id);
  if (entry.kind !== 'number-expression' && entry.kind !== 'string-expression') fail('SEMANTIC_REFERENCE_KIND_INVALID', expression.semanticRef + ' is not an expression');
  if (entry.binding.status !== 'executable') fail('SEMANTIC_REFERENCE_SOURCE_ONLY', expression.semanticRef + ' is source-only and cannot be emitted');
  object(expression.arguments, label + '.arguments');
  var expected = entry.parameter_contract.parameters.filter(function(parameter) { return parameter.kind !== 'code-only'; });
  var expectedKeys = expected.map(function(parameter) { return parameter.semanticKey; });
  Object.keys(expression.arguments).forEach(function(key) { if (expectedKeys.indexOf(key) < 0) fail('SEMANTIC_INVOCATION_ARGUMENT_INVALID', label + '.arguments contains unknown dictionary parameter: ' + key); });
  expected.filter(function(parameter) { return !parameter.optional; }).forEach(function(parameter) { if (!Object.prototype.hasOwnProperty.call(expression.arguments, parameter.semanticKey)) fail('SEMANTIC_INVOCATION_ARGUMENT_MISSING', label + '.arguments is missing dictionary parameter: ' + parameter.semanticKey); });
  Object.keys(expression.arguments).forEach(function(key) { validateCanonicalParameter(index, expected.filter(function(parameter) { return parameter.semanticKey === key; })[0], expression.arguments[key], label + '.arguments.' + key); });
  return entry;
}
function validateMember(index, member, label) {
  object(member, label); allowed(member, ['semanticId', 'roles', 'value', 'bindings'], label); id(member.semanticId, label + '.semanticId');
  if (!Array.isArray(member.roles)) fail('SEMANTIC_MEMBER_INVALID', label + '.roles must be an array'); member.roles.forEach(function(role, index) { text(role, label + '.roles[' + index + ']'); });
  if (!Object.prototype.hasOwnProperty.call(member, 'value')) fail('SEMANTIC_MEMBER_INVALID', label + '.value is required');
  validateVariableValue(member.value, label + '.value');
  if (!Array.isArray(member.bindings)) fail('SEMANTIC_MEMBER_INVALID', label + '.bindings must be an array');
  member.bindings.forEach(function(binding, bindingIndex) { validateBinding(index, binding, label + '.bindings[' + bindingIndex + ']'); });
}
function validateEntity(index, entity, label) {
  object(entity, label); allowed(entity, ['semanticId', 'roles', 'objectTypeRef', 'behaviorTypeRefs', 'members'], label); id(entity.semanticId, label + '.semanticId');
  if (!Array.isArray(entity.roles) || !entity.roles.length) fail('SEMANTIC_ENTITY_INVALID', label + '.roles must be non-empty'); entity.roles.forEach(function(role, roleIndex) { text(role, label + '.roles[' + roleIndex + ']'); });
  if (entity.objectTypeRef !== null && entity.objectTypeRef !== undefined) resolveObjectType(index, entity.objectTypeRef, label + '.objectTypeRef');
  if (!Array.isArray(entity.behaviorTypeRefs)) fail('SEMANTIC_ENTITY_INVALID', label + '.behaviorTypeRefs must be an array');
  var seenBehaviorTypes = Object.create(null);
  entity.behaviorTypeRefs.forEach(function(reference, behaviorIndex) { var behavior = resolveBehaviorType(index, reference, label + '.behaviorTypeRefs[' + behaviorIndex + ']'); if (seenBehaviorTypes[behavior.semantic_id]) fail('SEMANTIC_ENTITY_INVALID', label + '.behaviorTypeRefs has duplicate type: ' + behavior.semantic_id); seenBehaviorTypes[behavior.semantic_id] = true; });
  if (entity.behaviorTypeRefs.length && !entity.objectTypeRef) fail('SEMANTIC_ENTITY_INVALID', label + '.behaviorTypeRefs requires objectTypeRef');
  if (!Array.isArray(entity.members)) fail('SEMANTIC_ENTITY_INVALID', label + '.members must be an array'); unique(entity.members, label + '.members'); entity.members.forEach(function(member, memberIndex) { validateMember(index, member, label + '.members[' + memberIndex + ']'); });
}
function validateComponentBinding(index, binding, expected, label) {
  object(binding, label); allowed(binding, ['use', 'arguments'], label);
  var use = text(binding.use, label + '.use');
  var expectedKinds = expected.kinds || [expected.kind || expected.bindingKind];
  var foundation = eventAlgebra.operationForUse(use);
  if (foundation) {
    if (expectedKinds.indexOf(foundation.kind) < 0) fail('SEMANTIC_COMPONENT_BINDING_INVALID', label + ' requires one of these uses: ' + expectedKinds.join(', '));
    try { eventAlgebra.validateOperationArguments(use, foundation.kind, binding.arguments || {}); }
    catch (error) { fail('SEMANTIC_COMPONENT_BINDING_INVALID', label + ' has invalid arguments: ' + error.message); }
  } else {
    var entry;
    try { entry = dictionary.resolve(index, use); } catch (error) { fail('SEMANTIC_COMPONENT_BINDING_INVALID', error.message); }
    if (entry.semantic_id !== use || expectedKinds.indexOf(entry.kind) < 0 || entry.binding.status !== 'executable') fail('SEMANTIC_COMPONENT_BINDING_INVALID', label + ' must use one executable dictionary ' + expectedKinds.join(' or '));
    try { dictionary.validateCapabilityArguments(entry, binding.arguments || {}); }
    catch (error) { fail('SEMANTIC_COMPONENT_BINDING_INVALID', label + ' has invalid arguments: ' + error.message); }
  }
  object(binding.arguments || {}, label + '.arguments'); validateScalarTree(binding.arguments || {}, label + '.arguments');
}
function validateComponentConfig(index, descriptor, value, bindings, label) {
  if (descriptor.type === 'enum' || descriptor.type === 'layout-choice') { if ((descriptor.values || []).indexOf(value) < 0) fail('SEMANTIC_COMPONENT_CONFIG_INVALID', label + ' must take one dictionary component value: ' + (descriptor.values || []).join(', ')); return; }
  if (descriptor.type === 'number') { if (typeof value !== 'number' || !isFinite(value)) fail('SEMANTIC_COMPONENT_CONFIG_INVALID', label + ' must be a finite number'); if (descriptor.minimum !== undefined && value < descriptor.minimum) fail('SEMANTIC_COMPONENT_CONFIG_INVALID', label + ' must be at least ' + descriptor.minimum); if (descriptor.maximum !== undefined && value > descriptor.maximum) fail('SEMANTIC_COMPONENT_CONFIG_INVALID', label + ' must be at most ' + descriptor.maximum); return; }
  if (descriptor.type === 'text' || descriptor.type === 'layout' || descriptor.type === 'color') { if (typeof value !== 'string' || !value.length) fail('SEMANTIC_COMPONENT_CONFIG_INVALID', label + ' must be text'); return; }
  if (descriptor.type === 'binding-ref') { var bindingName = text(value, label); if (!bindings[bindingName]) fail('SEMANTIC_COMPONENT_BINDING_MISSING', label + ' references missing binding ' + bindingName); validateComponentBinding(index, bindings[bindingName], { kind: descriptor.bindingKind }, label); return; }
  if (descriptor.type === 'list') {
    if (!Array.isArray(value)) fail('SEMANTIC_COMPONENT_CONFIG_INVALID', label + ' must be a list');
    if (descriptor.minItems !== undefined && value.length < descriptor.minItems) fail('SEMANTIC_COMPONENT_CONFIG_INVALID', label + ' requires at least ' + descriptor.minItems + ' items');
    value.forEach(function(item, itemIndex) { validateComponentConfig(index, descriptor.item, item, bindings, label + '[' + itemIndex + ']'); }); return;
  }
  if (descriptor.type === 'object') {
    object(value, label); var fields = descriptor.fields || {};
    Object.keys(value).forEach(function(name) { if (!fields[name]) fail('SEMANTIC_COMPONENT_CONFIG_INVALID', label + ' contains unknown field: ' + name); validateComponentConfig(index, fields[name], value[name], bindings, label + '.' + name); });
    Object.keys(fields).forEach(function(name) { if (fields[name].required && !Object.prototype.hasOwnProperty.call(value, name)) fail('SEMANTIC_COMPONENT_CONFIG_MISSING', label + ' requires ' + name); }); return;
  }
  fail('SEMANTIC_COMPONENT_CONFIG_INVALID', label + ' has an unknown dictionary component config type');
}
function componentBindingRefs(descriptor, value, output) {
  if (descriptor.type === 'binding-ref') { output.push(value); return output; }
  if (descriptor.type === 'list') { value.forEach(function(item) { componentBindingRefs(descriptor.item, item, output); }); return output; }
  if (descriptor.type === 'object') { Object.keys(value).forEach(function(name) { componentBindingRefs(descriptor.fields[name], value[name], output); }); }
  return output;
}
function validateComponent(index, source, component, label) {
  object(component, label); allowed(component, ['semanticId', 'componentRef', 'target', 'config', 'bindings'], label); id(component.semanticId, label + '.semanticId');
  var definition;
  try { definition = dictionary.resolveComponent(index, text(component.componentRef, label + '.componentRef')); }
  catch (error) { fail('SEMANTIC_COMPONENT_REFERENCE_INVALID', error.message); }
  if (component.componentRef !== definition.semantic_id) fail('SEMANTIC_COMPONENT_REFERENCE_INVALID', label + '.componentRef must use ' + definition.semantic_id);
  if (definition.runtime.status !== 'executable') fail('SEMANTIC_COMPONENT_SOURCE_ONLY', definition.component_id + ' has no executable dictionary expansion');
  var target = component.target === null || component.target === undefined ? null : id(component.target, label + '.target');
  if (definition.compiler.target && definition.compiler.target.required && !target) fail('SEMANTIC_COMPONENT_TARGET_MISSING', definition.component_id + ' requires target');
  var targetEntity = target && source.entities.filter(function(entity) { return entity.semanticId === target; })[0];
  if (target && !targetEntity) fail('SEMANTIC_COMPONENT_TARGET_MISSING', label + '.target is not a declared entity: ' + target);
  object(component.bindings, label + '.bindings');
  object(component.config, label + '.config');
  var expectedConfig = definition.compiler.config || {};
  Object.keys(component.config).forEach(function(name) { var descriptor = expectedConfig[name]; if (!descriptor) fail('SEMANTIC_COMPONENT_CONFIG_INVALID', definition.component_id + ' has no config field ' + name); validateComponentConfig(index, descriptor, component.config[name], component.bindings, label + '.config.' + name); });
  Object.keys(expectedConfig).forEach(function(name) { if (expectedConfig[name].required && expectedConfig[name].default === undefined && !Object.prototype.hasOwnProperty.call(component.config, name)) fail('SEMANTIC_COMPONENT_CONFIG_MISSING', definition.component_id + ' requires config.' + name); });
  var expectedBindings = definition.compiler.bindings || {};
  var namedBindings = definition.compiler.namedBindings || null;
  Object.keys(component.bindings).forEach(function(name) { var expected = expectedBindings[name] || namedBindings; if (!expected) fail('SEMANTIC_COMPONENT_BINDING_INVALID', definition.component_id + ' has no binding ' + name); validateComponentBinding(index, component.bindings[name], expected, label + '.bindings.' + name); });
  Object.keys(expectedBindings).forEach(function(name) { if (expectedBindings[name].required && !component.bindings[name]) fail('SEMANTIC_COMPONENT_BINDING_MISSING', definition.component_id + ' requires binding ' + name); });
  if (namedBindings && namedBindings.requireReferenced) {
    var referenced = [];
    Object.keys(component.config).forEach(function(name) { componentBindingRefs(expectedConfig[name], component.config[name], referenced); });
    Object.keys(component.bindings).forEach(function(name) { if (!expectedBindings[name] && referenced.indexOf(name) < 0) fail('SEMANTIC_COMPONENT_BINDING_INVALID', definition.component_id + ' binding is not referenced by config: ' + name); });
  }
}
function validateEventArguments(index, eventType, values, label) {
  object(values, label);
  var parameters = eventType.serialization.parameters || [], byKey = {};
  parameters.forEach(function(parameter) { byKey[parameter.semanticKey] = parameter; });
  Object.keys(values).forEach(function(key) { if (!byKey[key]) fail('SEMANTIC_EVENT_ARGUMENT_INVALID', label + ' contains unknown event parameter: ' + key); });
  parameters.forEach(function(parameter) {
    var present = Object.prototype.hasOwnProperty.call(values, parameter.semanticKey);
    var dependency = /^with:/.test(parameter.emission || '') ? parameter.emission.slice(5) : null;
    if (!parameter.optional && !present) fail('SEMANTIC_EVENT_ARGUMENT_MISSING', label + ' is missing event parameter: ' + parameter.semanticKey);
    if (parameter.emission === 'always' && Object.prototype.hasOwnProperty.call(parameter, 'defaultValue') && !present) fail('SEMANTIC_EVENT_ARGUMENT_MISSING', label + ' is missing runtime default: ' + parameter.semanticKey);
    if (dependency && Object.prototype.hasOwnProperty.call(values, dependency) && Object.prototype.hasOwnProperty.call(parameter, 'defaultValue') && !present) fail('SEMANTIC_EVENT_ARGUMENT_MISSING', label + ' is missing dependent runtime default: ' + parameter.semanticKey);
    if (!present) return;
    var value = values[parameter.semanticKey];
    if (dependency && !Object.prototype.hasOwnProperty.call(values, dependency)) fail('SEMANTIC_EVENT_ARGUMENT_INVALID', parameter.semanticKey + ' requires ' + dependency);
    if (parameter.runtimeNormalization === 'number-expression') {
      if (typeof value === 'number' && isFinite(value)) return;
      validateExpression(index, value, label + '.' + parameter.semanticKey); return;
    }
    if (parameter.runtimeNormalization === 'dictionary-token') { if ((parameter.runtimeValues || []).indexOf(value) < 0) fail('SEMANTIC_EVENT_ARGUMENT_INVALID', parameter.semanticKey + ' has an invalid dictionary token'); return; }
    if (parameter.runtimeNormalization === 'text') { if (typeof value !== 'string') fail('SEMANTIC_EVENT_ARGUMENT_INVALID', label + '.' + parameter.semanticKey + ' must be text'); return; }
    if (['entity-object-name', 'scene-member-name', 'local-name'].indexOf(parameter.runtimeNormalization) >= 0) {
      var exactDefault = Object.prototype.hasOwnProperty.call(parameter, 'defaultValue') && value === parameter.defaultValue;
      if (typeof value !== 'string' || (!value.length && !exactDefault)) fail('SEMANTIC_EVENT_ARGUMENT_INVALID', label + '.' + parameter.semanticKey + ' must be a runtime-normalized name or its dictionary default');
      return;
    }
    fail('SEMANTIC_EVENT_ARGUMENT_INVALID', 'Event parameter has no dictionary normalization: ' + parameter.semanticKey);
  });
}
function validateEvent(index, event, label) {
  object(event, label); allowed(event, ['semanticId', 'eventTypeRef', 'arguments', 'locals', 'conditions', 'actions', 'children'], label); id(event.semanticId, label + '.semanticId');
  var eventType;
  try { eventType = dictionary.resolveEventType(index, text(event.eventTypeRef, label + '.eventTypeRef')); }
  catch (error) { fail('SEMANTIC_EVENT_TYPE_INVALID', error.message); }
  if (event.eventTypeRef !== eventType.semantic_id) fail('SEMANTIC_EVENT_TYPE_INVALID', event.eventTypeRef + ' must use the dictionary semanticRef ' + eventType.semantic_id);
  validateEventArguments(index, eventType, event.arguments, label + '.arguments');
  object(event.locals, label + '.locals');
  Object.keys(event.locals).forEach(function(localId) { id(localId, label + '.locals key'); validateVariableValue(event.locals[localId], label + '.locals.' + localId); });
  if (Object.keys(event.locals).length && !eventType.serialization.localVariables) fail('SEMANTIC_EVENT_GRAMMAR_INVALID', event.eventTypeRef + ' does not serialize local variables');
  if (!Array.isArray(event.conditions) || !Array.isArray(event.actions) || !Array.isArray(event.children)) fail('SEMANTIC_EVENT_INVALID', label + ' conditions, actions, and children must be arrays');
  var instructionLists = eventType.serialization.instructionLists || [];
  if (event.conditions.length && !instructionLists.some(function(channel) { return channel.kind === 'condition'; })) fail('SEMANTIC_EVENT_GRAMMAR_INVALID', event.eventTypeRef + ' does not serialize condition instructions');
  if (event.actions.length && !instructionLists.some(function(channel) { return channel.kind === 'action'; })) fail('SEMANTIC_EVENT_GRAMMAR_INVALID', event.eventTypeRef + ' does not serialize action instructions');
  if (event.children.length && !eventType.serialization.subEvents) fail('SEMANTIC_EVENT_GRAMMAR_INVALID', event.eventTypeRef + ' does not serialize subevents');
  validateOperationGroups(index, event.conditions, 'condition', label + '.conditions', eventType);
  validateOperationGroups(index, event.actions, 'action', label + '.actions', eventType);
  event.children.forEach(function(child, childIndex) { validateEvent(index, child, label + '.children[' + childIndex + ']'); });
}
function validateBindings(index, bindings, label) {
  if (!Array.isArray(bindings)) fail('SEMANTIC_INTENT_INVALID', label + '.bindings must be an array');
  bindings.forEach(function(binding, bindingIndex) { validateBinding(index, binding, label + '.bindings[' + bindingIndex + ']'); });
}
function validateBinding(index, binding, label) {
  object(binding, label); allowed(binding, ['use', 'semanticRefs'], label);
  var use = text(binding.use, label + '.use');
  if (!Array.isArray(binding.semanticRefs) || !binding.semanticRefs.length) fail('SEMANTIC_BINDING_INVALID', label + '.semanticRefs must be non-empty');
  var actual = binding.semanticRefs.map(function(reference, position) { try { return dictionary.resolve(index, text(reference, label + '.semanticRefs[' + position + ']')).semantic_id; } catch (error) { fail('SEMANTIC_REFERENCE_INVALID', error.message); } });
  if (new Set(actual).size !== actual.length) fail('SEMANTIC_BINDING_INVALID', label + '.semanticRefs contains duplicates');
  var foundation = eventAlgebra.operationForUse(use);
  if (foundation) {
    var expected = (eventAlgebra.bindingRefs(index, use) || []).slice().sort();
    if (JSON.stringify(actual.slice().sort()) !== JSON.stringify(expected)) fail('SEMANTIC_BINDING_INVALID', label + ' does not contain the complete dictionary expansion for ' + use);
  } else {
    var extension;
    try { extension = dictionary.resolve(index, use); } catch (error) { fail('SEMANTIC_BINDING_INVALID', error.message); }
    if (actual.length !== 1 || actual[0] !== extension.semantic_id) fail('SEMANTIC_BINDING_INVALID', label + ' must bind one retrieved extension operation to itself');
  }
}
function bindingStructure(bindings) { return bindings.map(function(binding) { return { use: eventAlgebra.operationForUse(binding.use) ? binding.use : 'extension', expansionSize: binding.semanticRefs.length }; }); }
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
  object(intent, label); allowed(intent, ['semanticId', 'roles', 'subject', 'description', 'productionFamily', 'styleId', 'constraints', 'animation', 'bindings'], label); id(intent.semanticId, label + '.semanticId');
  validateRoles(intent.roles, label); validateSubject(source, intent.subject, label); text(intent.description, label + '.description');
  var family = text(intent.productionFamily, label + '.productionFamily');
  if (!assetProductionTruth.productionFamilies || !assetProductionTruth.productionFamilies[family]) fail('SEMANTIC_ASSET_FAMILY_INVALID', label + '.productionFamily is absent from the pinned asset production truth: ' + family);
  var recipe = assetProductionTruth.recipes[assetProductionTruth.productionFamilies[family].defaultRecipeId];
  if (recipe.artifactKind === 'frame-set') {
    object(intent.animation, label + '.animation'); allowed(intent.animation, ['initialStateId', 'states'], label + '.animation'); id(intent.animation.initialStateId, label + '.animation.initialStateId');
    if (!Array.isArray(intent.animation.states) || !intent.animation.states.length) fail('SEMANTIC_ANIMATION_INVALID', label + '.animation.states must be non-empty');
    var animationStateIds = Object.create(null);
    intent.animation.states.forEach(function(state, stateIndex) {
      var stateLabel = label + '.animation.states[' + stateIndex + ']'; object(state, stateLabel); allowed(state, ['stateId', 'loop', 'frameCount', 'frameDurationMs', 'derivationProfileId'], stateLabel);
      var stateId = id(state.stateId, stateLabel + '.stateId'); if (animationStateIds[stateId]) fail('SEMANTIC_ANIMATION_INVALID', stateLabel + '.stateId must be unique'); animationStateIds[stateId] = true;
      if (typeof state.loop !== 'boolean' || !Number.isInteger(state.frameCount) || state.frameCount < (state.loop ? 2 : 1) || !Number.isInteger(state.frameDurationMs) || state.frameDurationMs < 1) fail('SEMANTIC_ANIMATION_INVALID', stateLabel + ' has invalid timing or frame count');
      var profileId = id(state.derivationProfileId, stateLabel + '.derivationProfileId'), profile = frameSetTruth.derivationProfiles[profileId]; if (!profile) fail('SEMANTIC_ANIMATION_INVALID', stateLabel + ' references an unknown derivation profile'); if (state.frameCount > profile.length) fail('SEMANTIC_ANIMATION_INVALID', stateLabel + '.frameCount exceeds the selected derivation profile');
    });
    if (!animationStateIds[intent.animation.initialStateId]) fail('SEMANTIC_ANIMATION_INVALID', label + '.animation.initialStateId must reference a declared state');
  } else if (intent.animation !== undefined) fail('SEMANTIC_ANIMATION_INVALID', label + '.animation is only valid for frame-set production families');
  var styleId = text(intent.styleId, label + '.styleId');
  if (!assetStyleTruth.styles || !assetStyleTruth.styles[styleId]) fail('SEMANTIC_ASSET_STYLE_INVALID', label + '.styleId is absent from the pinned asset style dictionary: ' + styleId);
  object(intent.constraints, label + '.constraints'); validateScalarTree(intent.constraints, label + '.constraints'); validateBindings(index, intent.bindings, label);
}
function validateLayoutRelation(source, relation, label) {
  object(relation, label); allowed(relation, ['semanticId', 'layoutRef', 'subjects'], label); id(relation.semanticId, label + '.semanticId'); try { layoutDictionary.resolve(text(relation.layoutRef, label + '.layoutRef')); } catch (error) { fail(error.code || 'SEMANTIC_LAYOUT_REFERENCE_INVALID', error.message); }
  if (!Array.isArray(relation.subjects) || !relation.subjects.length) fail('SEMANTIC_LAYOUT_RELATION_INVALID', label + '.subjects must be non-empty');
  relation.subjects.forEach(function(subject, subjectIndex) { validateSubject(source, subject, label + '.subjects[' + subjectIndex + ']'); });
}
function validateLayoutBounds(bounds, label) {
  object(bounds, label); allowed(bounds, ['width', 'height'], label);
  ['width', 'height'].forEach(function(name) { if (typeof bounds[name] !== 'number' || !isFinite(bounds[name]) || bounds[name] <= 0) fail('SEMANTIC_LAYOUT_BOUNDS_INVALID', label + '.' + name + ' must be a positive finite number'); });
}
function validateLayoutIntent(index, source, intent, label) {
  object(intent, label); allowed(intent, ['semanticId', 'roles', 'subject', 'bounds', 'relations', 'bindings'], label); id(intent.semanticId, label + '.semanticId'); validateRoles(intent.roles, label); var subject = validateSubject(source, intent.subject, label); var entity = source.entities.filter(function(item) { return item.semanticId === subject; })[0]; if (!entity || !entity.objectTypeRef) fail('SEMANTIC_LAYOUT_SUBJECT_UNMATERIALIZED', label + '.subject must identify an executable object entity'); validateLayoutBounds(intent.bounds, label + '.bounds');
  if (!Array.isArray(intent.relations) || intent.relations.length !== 1) fail('SEMANTIC_LAYOUT_INTENT_INVALID', label + '.relations must contain exactly one dictionary placement relation');
  intent.relations.forEach(function(relation, relationIndex) { validateLayoutRelation(source, relation, label + '.relations[' + relationIndex + ']'); }); validateBindings(index, intent.bindings, label);
}
function validatePolicies(policies) {
  object(policies, 'tuningPolicies'); allowed(policies, ['relativeChange'], 'tuningPolicies'); object(policies.relativeChange, 'tuningPolicies.relativeChange');
  Object.keys(policies.relativeChange).forEach(function(degree) { id(degree, 'relative change degree'); var policy = policies.relativeChange[degree]; object(policy, 'relativeChange.' + degree); allowed(policy, ['mode', 'value'], 'relativeChange.' + degree); if (policy.mode !== 'percentage' && policy.mode !== 'absolute') fail('SEMANTIC_POLICY_INVALID', 'relativeChange.' + degree + '.mode is invalid'); if (typeof policy.value !== 'number' || !isFinite(policy.value) || policy.value <= 0) fail('SEMANTIC_POLICY_INVALID', 'relativeChange.' + degree + '.value must be a positive finite number'); });
}
function validateSource(source, options) {
  var index = dictionaryIndex(options); object(source, 'GameSemanticSource'); allowed(source, ['schemaVersion', 'documentKind', 'dictionarySource', 'game', 'entities', 'components', 'events', 'assetIntents', 'layoutIntents', 'tuningPolicies'], 'GameSemanticSource');
  if (source.schemaVersion !== SCHEMA_VERSION || source.documentKind !== contract.sourceDocumentKind) fail('SEMANTIC_SOURCE_KIND_INVALID', 'GameSemanticSource has an invalid document kind or version');
  assertDictionarySource(source.dictionarySource, index); object(source.game, 'game'); allowed(source.game, ['semanticId', 'name'], 'game'); id(source.game.semanticId, 'game.semanticId'); text(source.game.name, 'game.name');
  contract.collections.forEach(function(collection) { if (!Array.isArray(source[collection])) fail('SEMANTIC_SOURCE_INVALID', collection + ' must be an array'); unique(source[collection], collection); });
  var eventIds = Object.create(null);
  function registerEventIds(item, itemIndex, prefix) {
    var label = prefix + '[' + itemIndex + ']';
    var eventId = id(item && item.semanticId, label + '.semanticId');
    if (eventIds[eventId]) fail('SEMANTIC_SOURCE_DUPLICATE', 'events has duplicate semantic id: ' + eventId);
    eventIds[eventId] = true;
    if (!Array.isArray(item.children)) fail('SEMANTIC_EVENT_INVALID', label + '.children must be an array');
    item.children.forEach(function(child, childIndex) { registerEventIds(child, childIndex, label + '.children'); });
  }
  source.events.forEach(function(item, itemIndex) { registerEventIds(item, itemIndex, 'events'); });
  source.entities.forEach(function(item, itemIndex) { validateEntity(index, item, 'entities[' + itemIndex + ']'); }); source.components.forEach(function(item, itemIndex) { validateComponent(index, source, item, 'components[' + itemIndex + ']'); }); source.events.forEach(function(item, itemIndex) { validateEvent(index, item, 'events[' + itemIndex + ']'); }); source.assetIntents.forEach(function(item, itemIndex) { validateAssetIntent(index, source, item, 'assetIntents[' + itemIndex + ']'); }); source.layoutIntents.forEach(function(item, itemIndex) { validateLayoutIntent(index, source, item, 'layoutIntents[' + itemIndex + ']'); }); validatePolicies(source.tuningPolicies);
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
    else if (operation.op === 'set_member_value') { allowed(operation, ['op', 'target', 'value'], 'set_member_value'); var member = findEntity(next, operation.target); validateVariableValue(operation.value, 'set_member_value.value'); member.value = clone(operation.value); }
    else { allowed(operation, ['op', 'target', 'direction', 'degree'], 'adjust_member_value'); var adjustable = findEntity(next, operation.target); if (typeof adjustable.value !== 'number') fail('SEMANTIC_REVISION_INVALID', 'adjust_member_value requires a numeric member'); if (operation.direction !== 'increase' && operation.direction !== 'decrease') fail('SEMANTIC_REVISION_INVALID', 'adjust_member_value.direction is invalid'); var degree = text(operation.degree, 'adjust_member_value.degree'); var policy = next.tuningPolicies.relativeChange[degree]; if (!policy) fail('SEMANTIC_POLICY_MISSING', 'No relative tuning policy exists for degree: ' + degree); var delta = policy.mode === 'percentage' ? adjustable.value * policy.value : policy.value; adjustable.value += operation.direction === 'increase' ? delta : -delta; }
  });
  return validateSource(next, { index: index });
}
function invocationStructure(item, condition) { var view = { semanticRef: item.semanticRef, operation: clone(item.operation), channel: item.channel, argumentKeys: Object.keys(item.arguments).sort() }; if (condition) view.inverted = item.inverted; else view.awaited = item.awaited; return view; }
function eventStructure(event) { return { semanticId: event.semanticId, eventTypeRef: event.eventTypeRef, argumentKeys: Object.keys(event.arguments).sort(), locals: Object.keys(event.locals).sort().map(function(key) { return { semanticId: key, valueType: variableValueType(event.locals[key]) }; }), conditions: event.conditions.map(function(item) { return invocationStructure(item, true); }), actions: event.actions.map(function(item) { return invocationStructure(item, false); }), children: event.children.map(eventStructure) }; }
function structureView(source, options) {
  if (options && Object.prototype.hasOwnProperty.call(options, 'worldVersion')) fail('SEMANTIC_STRUCTURE_WORLD_VERSION_FORBIDDEN', 'GameSemanticStructure is derived only from its sourceHash; external worldVersion injection is removed.');
  source = validateSource(source, options); var payload = { game: { semanticId: source.game.semanticId, nameType: 'string' }, entities: source.entities.map(function(entity) { return { semanticId: entity.semanticId, roles: clone(entity.roles), objectTypeRef: entity.objectTypeRef || null, behaviorTypeRefs: clone(entity.behaviorTypeRefs), members: entity.members.map(function(member) { return { semanticId: member.semanticId, roles: clone(member.roles), valueType: variableValueType(member.value), bindings: bindingStructure(member.bindings) }; }) }; }), components: source.components.map(function(component) { return { semanticId: component.semanticId, componentRef: component.componentRef, target: component.target, config: clone(component.config), bindings: Object.keys(component.bindings).sort().map(function(name) { return { name: name, use: component.bindings[name].use }; }) }; }), events: source.events.map(eventStructure), assetIntents: source.assetIntents.map(function(item) { return { semanticId: item.semanticId, roles: clone(item.roles), subject: item.subject, descriptionType: typeof item.description, productionFamily: item.productionFamily, styleId: item.styleId, constraintShape: Object.keys(item.constraints).sort(), animation: clone(item.animation || null), bindings: bindingStructure(item.bindings) }; }), layoutIntents: source.layoutIntents.map(function(item) { return { semanticId: item.semanticId, roles: clone(item.roles), subject: item.subject, bounds: clone(item.bounds), relations: item.relations.map(function(relation) { return { semanticId: relation.semanticId, layoutRef: relation.layoutRef, subjects: clone(relation.subjects) }; }), bindings: bindingStructure(item.bindings) }; }) };
  return { schemaVersion: SCHEMA_VERSION, documentKind: contract.structureDocumentKind, sourceHash: sourceHash(source), structureHash: hash(payload, 'structure.'), dictionarySource: clone(source.dictionarySource), payload: payload };
}

function structuralDiff(previousView, nextView) {
  object(previousView, 'previous structure view'); object(nextView, 'next structure view');
  if (previousView.documentKind !== contract.structureDocumentKind || nextView.documentKind !== contract.structureDocumentKind) fail('SEMANTIC_STRUCTURE_DIFF_INVALID', 'structure views are required');
  var result = { fromStructureHash: previousView.structureHash, toStructureHash: nextView.structureHash, collections: {} };
  ['entities', 'components', 'events', 'assetIntents', 'layoutIntents'].forEach(function(name) {
    var before = previousView.payload[name] || []; var after = nextView.payload[name] || [];
    var beforeById = Object.create(null); var afterById = Object.create(null); before.forEach(function(item) { beforeById[item.semanticId] = item; }); after.forEach(function(item) { afterById[item.semanticId] = item; });
    var added = Object.keys(afterById).filter(function(key) { return !beforeById[key]; }).sort(); var removed = Object.keys(beforeById).filter(function(key) { return !afterById[key]; }).sort(); var changed = Object.keys(afterById).filter(function(key) { return beforeById[key] && JSON.stringify(stable(beforeById[key])) !== JSON.stringify(stable(afterById[key])); }).sort();
    result.collections[name] = { added: added, removed: removed, changed: changed };
  });
  return result;
}

module.exports = { SCHEMA_VERSION: SCHEMA_VERSION, sourceHash: sourceHash, validateSource: validateSource, applyRevision: applyRevision, structureView: structureView, structuralDiff: structuralDiff };
