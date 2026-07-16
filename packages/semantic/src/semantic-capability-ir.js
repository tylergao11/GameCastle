var fs = require('fs');
var path = require('path');
var runtimeNames = require('./semantic-runtime-names');
var variableSerializer = require('./semantic-variable-serializer');

var UNIVERSE_PATH = path.join(__dirname, '..', 'generated', 'capability-universe.json');
var SEMANTIC_INDEX_PATH = path.join(__dirname, '..', '..', 'semantic', 'generated', 'capability-semantic-index.json');
var KINDS = { action: true, condition: true, 'number-expression': true, 'string-expression': true };

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function scalar(value) { return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'; }

function loadRegistry(options) {
  options = options || {};
  var semanticIndex = options.semanticIndex || (options.includeSourceDeclarations ? { by_capability: {}, by_semantic: {} } : readJson(SEMANTIC_INDEX_PATH));
  var registry = { semanticIndex: semanticIndex, officialBindings: {}, byId: {}, families: {}, instructionIds: {} };
  if (options.includeSourceDeclarations) {
    var universe = options.universe || readJson(UNIVERSE_PATH);
    registry.universe = universe;
    (universe.families || []).forEach(function(family) { registry.families[family.id] = family; });
    (universe.capabilities || []).forEach(function(capability) { registry.byId[capability.id] = capability; });
    (universe.runtimeOverrides || []).forEach(function(override) { (override.capabilityIds || []).forEach(function(capabilityId) { registry.instructionIds[capabilityId] = override.instructionId; }); });
  } else {
    Object.keys(semanticIndex.by_capability || {}).forEach(function(capabilityId) {
      var entry = semanticIndex.by_capability[capabilityId];
      if (!entry.binding || entry.binding.status !== 'executable' || !entry.binding.binding) return;
      registry.byId[capabilityId] = { id: capabilityId, kind: entry.kind, owner: clone(entry.owner) };
      registry.officialBindings[capabilityId] = clone(entry.binding.binding);
    });
  }
  return registry;
}

function resolveCapability(registry, reference, expectedKind) {
  if (!registry || !registry.byId) throw new Error('GDJS capability registry is required');
  var capability = registry.byId[reference] || null;
  if (!capability) {
    var ids = (registry.semanticIndex.by_semantic[reference] || []).filter(function(id) { return !!registry.byId[id]; });
    if (ids.length !== 1) {
      if (!ids.length) throw new Error('Unknown GDJS capability or semantic: ' + reference);
      throw new Error('Ambiguous GDJS semantic requires a concrete capability: ' + reference);
    }
    capability = registry.byId[ids[0]];
  }
  if (!KINDS[capability.kind]) throw new Error('Unsupported GDJS capability kind: ' + capability.kind);
  if (expectedKind && capability.kind !== expectedKind) {
    throw new Error('GDJS capability kind mismatch: expected ' + expectedKind + ', got ' + capability.kind);
  }
  return capability;
}

function expressionParameterContract(registry, capability) {
  var official = registry.officialBindings[capability.id];
  if (!official) throw new Error('Capability has no official parameter contract: ' + capability.id);
  return clone(official.parameters).filter(function(parameter) { return !parameter.codeOnly; });
}

function placeholderFor(parameter, index) {
  if (parameter.runtimeNormalization === 'number-expression') return '0';
  if (parameter.runtimeNormalization === 'string-expression') return '""';
  if (parameter.runtimeNormalization === 'boolean-token' || parameter.runtimeNormalization === 'dictionary-token') return (parameter.runtimeValues || [])[0];
  if (parameter.runtimeNormalization === 'entity-object-name') return 'Object' + index;
  if (parameter.runtimeNormalization === 'entity-behavior-name') return 'Behavior' + index;
  if (['object-member-name', 'scene-member-name', 'contextual-member-name', 'local-name', 'name'].indexOf(parameter.runtimeNormalization) >= 0) return 'variable' + index;
  if (parameter.runtimeNormalization === 'resource-name' || parameter.runtimeNormalization === 'text' || parameter.runtimeNormalization === 'scalar') return 'value' + index;
  throw new Error('GDJS parameter has no dictionary normalization: ' + String(parameter.runtimeNormalization));
}

function contractDefault(parameter, index) {
  if (parameter && Object.prototype.hasOwnProperty.call(parameter, 'defaultValue')) return parameter.defaultValue;
  return placeholderFor(parameter, index);
}

function placeholderParameters(registry, capability) {
  var official = registry.officialBindings[capability.id];
  if (!official) throw new Error('Capability has no official parameter contract: ' + capability.id);
  return official.parameters.map(function(parameter, index) { return contractDefault(parameter, index); });
}

function renderExpression(registry, expression) {
  if (!expression || typeof expression !== 'object') throw new Error('GDJS expression invocation must be an object');
  var capability = resolveCapability(registry, expression.capability || expression.semantic || expression.semanticRef);
  if (capability.kind !== 'number-expression' && capability.kind !== 'string-expression') {
    throw new Error('GDJS expression invocation must resolve to an expression capability: ' + capability.id);
  }
  var contract = expressionParameterContract(registry, capability);
  var args = expression.arguments || expression.parameters || [];
  if (!Array.isArray(args)) { var semanticEntry = registry.semanticIndex.by_capability[capability.id]; var visible = semanticEntry && semanticEntry.parameter_contract && semanticEntry.parameter_contract.parameters.filter(function(parameter) { return parameter.kind !== 'code-only'; }); if (!visible) throw new Error('GDJS expression has no generated semantic parameter contract: ' + capability.id); Object.keys(args).forEach(function(key) { if (!visible.some(function(parameter) { return parameter.semanticKey === key; })) throw new Error('GDJS expression has unknown dictionary argument ' + key + ': ' + capability.id); }); args = visible.map(function(parameter, index) { if (Object.prototype.hasOwnProperty.call(expression.arguments, parameter.semanticKey)) return expression.arguments[parameter.semanticKey]; if (!parameter.optional) throw new Error('GDJS expression is missing dictionary argument ' + parameter.semanticKey + ': ' + capability.id); return contractDefault(parameter, index); }); }
  var requiredCount = contract.filter(function(parameter) { return !parameter.optional; }).length;
  if (args.length < requiredCount || args.length > contract.length) {
    throw new Error('GDJS expression argument count mismatch for ' + capability.id + ': expected ' + requiredCount + '..' + contract.length + ', got ' + args.length);
  }
  var rendered = args.map(function(argument) { return serializeParameter(registry, argument); });
  var officialBinding = registry.officialBindings[capability.id];
  if (!officialBinding) throw new Error('Capability is not available on the pinned official GDJS platform: ' + capability.id);
  var runtimeParts = officialBinding.runtimeId.split('::');
  var runtimeLocalId = runtimeParts[runtimeParts.length - 1];
  var name = (capability.owner || {}).kind === 'global' ? officialBinding.runtimeId : runtimeLocalId;
  if ((capability.owner || {}).kind === 'object' && contract[0] && contract[0].runtimeNormalization === 'entity-object-name') {
    var receiver = rendered.shift();
    name = receiver + '.' + name;
  } else if ((capability.owner || {}).kind === 'behavior' && contract.length >= 2 && contract[0].runtimeNormalization === 'entity-object-name' && contract[1].runtimeNormalization === 'entity-behavior-name') {
    var objectName = rendered.shift();
    var behaviorName = rendered.shift();
    name = objectName + '.' + behaviorName + '::' + name;
  }
  return name + '(' + rendered.join(', ') + ')';
}

function serializeParameter(registry, value) {
  if (scalar(value)) return String(value);
  if (value && typeof value === 'object' && (value.capability || value.semantic || value.semanticRef)) return renderExpression(registry, value);
  throw new Error('GDJS invocation parameters must be scalar values or typed expression invocations');
}

function instructionType(registry, capability) {
  var binding = registry.officialBindings[capability.id];
  if (!binding) throw new Error('Capability is not available on the pinned official GDJS platform: ' + capability.id);
  return binding.runtimeId;
}

function compileInstruction(registry, invocation, expectedKind) {
  if (!invocation || typeof invocation !== 'object') throw new Error('GDJS invocation must be an object');
  var capability = resolveCapability(registry, invocation.capability || invocation.semantic, expectedKind);
  if (capability.kind === 'number-expression' || capability.kind === 'string-expression') {
    throw new Error('Expression capabilities must be nested in parameters, not emitted as instructions: ' + capability.id);
  }
  var parameters = invocation.parameters;
  if (parameters === undefined) {
    var semanticEntry = registry.semanticIndex.by_capability[capability.id];
    var semanticParameters = semanticEntry && semanticEntry.parameter_contract && semanticEntry.parameter_contract.parameters;
    if (!semanticParameters) throw new Error('GDJS invocation has no generated semantic parameter contract: ' + capability.id);
    if (!invocation.arguments || typeof invocation.arguments !== 'object' || Array.isArray(invocation.arguments)) throw new Error('GDJS invocation requires dictionary-named arguments: ' + capability.id);
    var visible = semanticParameters.filter(function(parameter) { return parameter.kind !== 'code-only'; });
    Object.keys(invocation.arguments).forEach(function(key) { if (!visible.some(function(parameter) { return parameter.semanticKey === key; })) throw new Error('GDJS invocation has unknown dictionary argument ' + key + ': ' + capability.id); });
    visible.filter(function(parameter) { return !parameter.optional; }).forEach(function(parameter) { if (!Object.prototype.hasOwnProperty.call(invocation.arguments, parameter.semanticKey)) throw new Error('GDJS invocation is missing dictionary argument ' + parameter.semanticKey + ': ' + capability.id); });
    var visibleIndex = 0;
    parameters = semanticParameters.map(function(parameter, index) {
      if (parameter.kind === 'code-only') return contractDefault(parameter, index);
      var visibleParameter = visible[visibleIndex++];
      if (Object.prototype.hasOwnProperty.call(invocation.arguments, visibleParameter.semanticKey)) return invocation.arguments[visibleParameter.semanticKey];
      if (!visibleParameter.optional) throw new Error('GDJS invocation is missing dictionary argument ' + visibleParameter.semanticKey + ': ' + capability.id);
      return contractDefault(visibleParameter, index);
    });
  }
  if (!Array.isArray(parameters)) throw new Error('GDJS invocation parameters must be an array: ' + capability.id);
  var officialParameters = (registry.officialBindings[capability.id] || {}).parameters || [];
  if (!officialParameters.length && !(registry.officialBindings[capability.id] && registry.officialBindings[capability.id].parameterCount === 0)) throw new Error('Capability has no official parameter contract: ' + capability.id);
  var expectedParameterCount = officialParameters.length;
  var requiredParameterCount = officialParameters.filter(function(parameter) { return !parameter.optional; }).length;
  if (parameters.length < requiredParameterCount || parameters.length > expectedParameterCount) {
    throw new Error('GDJS instruction parameter count mismatch for ' + capability.id + ': expected ' + requiredParameterCount + '..' + expectedParameterCount + ', got ' + parameters.length);
  }
  var instructionTypeValue = { value: instructionType(registry, capability) };
  if (capability.kind === 'condition') {
    var inversion = registry.semanticIndex.event_grammar.instructionSerialization.conditionInversion;
    instructionTypeValue[inversion.serializedKey] = invocation.inverted === true;
  }
  if (capability.kind === 'action') {
    var actionAwait = registry.semanticIndex.event_grammar.instructionSerialization.actionAwait;
    instructionTypeValue[actionAwait.serializedKey] = invocation.awaited === true;
  }
  return {
    type: instructionTypeValue,
    parameters: parameters.map(function(value) { return serializeParameter(registry, value); }),
    subInstructions: []
  };
}

function compileEventConnection(registry, connection) {
  if (!connection || typeof connection !== 'object') throw new Error('Semantic event connection must be an object');
  var eventTypeRef = connection.eventTypeRef;
  if (typeof eventTypeRef !== 'string' || !eventTypeRef) throw new Error('Semantic event connection requires an eventTypeRef');
  var eventType = require('./capability-semantic-dictionary').resolveEventType(registry.semanticIndex, eventTypeRef);
  var conditions = connection.conditions || [];
  var actions = connection.actions || [];
  if (!Array.isArray(conditions) || !Array.isArray(actions)) {
    throw new Error('Semantic event connection requires condition and action arrays');
  }
  var eventSerialization = registry.semanticIndex.event_grammar.eventSerialization;
  var instructionLists = eventType.serialization.instructionLists || [];
  var knownChannels = new Set(instructionLists.map(function(channel) { return channel.semanticKey; }));
  conditions.concat(actions).forEach(function(invocation) { if (!knownChannels.has(invocation.channel)) throw new Error('GDJS event invocation has an undeclared serialization channel: ' + invocation.channel); });
  if (conditions.length && !instructionLists.some(function(channel) { return channel.kind === 'condition'; })) throw new Error('GDJS event type does not serialize condition instructions: ' + eventTypeRef);
  if (actions.length && !instructionLists.some(function(channel) { return channel.kind === 'action'; })) throw new Error('GDJS event type does not serialize action instructions: ' + eventTypeRef);
  if ((connection.children || []).length && !eventType.serialization.subEvents) throw new Error('GDJS event type does not serialize subevents: ' + eventTypeRef);
  var result = Object.assign({}, clone(eventType.serialization.defaults || {}));
  (eventSerialization.canonicalFields || []).forEach(function(field) { result[field.serializedKey] = field.defaultValue; });
  result[eventSerialization.type.serializedKey] = eventType.eventType;
  instructionLists.forEach(function(channel) {
    var source = channel.kind === 'condition' ? conditions : actions;
    result[channel.serializedKey] = source.filter(function(invocation) { return invocation.channel === channel.semanticKey; }).map(function(invocation) { return compileInstruction(registry, invocation, channel.kind); });
  });
  if (eventType.serialization.subEvents && (eventType.serialization.subEvents.emission === 'always' || eventType.serialization.subEvents.emission === 'canonical-or-present' || (connection.children || []).length)) result[eventType.serialization.subEvents.serializedKey] = (connection.children || []).map(function(child) { return compileEventConnection(registry, child); });
  var locals = connection.locals || {};
  if (eventType.serialization.localVariables && (eventType.serialization.localVariables.emission === 'canonical-or-present' || Object.keys(locals).length)) result[eventType.serialization.localVariables.serializedKey] = variableSerializer.serializeMap(locals, function(key) { return runtimeNames.generatedName('local', key); });
  var eventArguments = connection.arguments || {};
  (eventType.serialization.parameters || []).forEach(function(parameter) {
    var present = Object.prototype.hasOwnProperty.call(eventArguments, parameter.semanticKey);
    var dependency = /^with:/.test(parameter.emission || '') ? parameter.emission.slice(5) : null;
    if (!present && parameter.emission === 'always' && Object.prototype.hasOwnProperty.call(parameter, 'defaultValue')) { result[parameter.serializedKey] = parameter.defaultValue; return; }
    if (!present && dependency && Object.prototype.hasOwnProperty.call(eventArguments, dependency) && Object.prototype.hasOwnProperty.call(parameter, 'defaultValue')) { result[parameter.serializedKey] = parameter.defaultValue; return; }
    if (!present) return;
    var value = eventArguments[parameter.semanticKey];
    if (parameter.runtimeSerialization === 'expression-or-text') result[parameter.serializedKey] = value && typeof value === 'object' ? renderExpression(registry, value) : String(value);
    else if (parameter.runtimeSerialization === 'text') result[parameter.serializedKey] = String(value);
    else throw new Error('GDJS event parameter has no dictionary serialization rule: ' + parameter.semanticKey);
  });
  return result;
}

function symbolicInvocation(registry, capability) {
  if (/expression$/.test(capability.kind)) {
    return { capability: capability.id, arguments: expressionParameterContract(registry, capability).filter(function(parameter) { return !parameter.optional; }).map(placeholderFor) };
  }
  return { capability: capability.id, parameters: placeholderParameters(registry, capability) };
}

function auditClosure(registry) {
  var counts = { action: 0, condition: 0, 'number-expression': 0, 'string-expression': 0 };
  Object.keys(registry.byId).forEach(function(id) {
    var capability = registry.byId[id];
    var invocation = symbolicInvocation(registry, capability);
    if (/expression$/.test(capability.kind)) renderExpression(registry, invocation);
    else compileInstruction(registry, invocation, capability.kind);
    counts[capability.kind]++;
  });
  return { capabilityCount: Object.keys(registry.byId).length, counts: counts, uncovered: [] };
}

module.exports = {
  UNIVERSE_PATH: UNIVERSE_PATH,
  SEMANTIC_INDEX_PATH: SEMANTIC_INDEX_PATH,
  loadRegistry: loadRegistry,
  resolveCapability: resolveCapability,
  expressionParameterContract: expressionParameterContract,
  placeholderParameters: placeholderParameters,
  renderExpression: renderExpression,
  compileInstruction: compileInstruction,
  compileEventConnection: compileEventConnection,
  symbolicInvocation: symbolicInvocation,
  auditClosure: auditClosure
};
