var fs = require('fs');
var path = require('path');

var UNIVERSE_PATH = path.join(__dirname, 'gdevelop-truth', 'capability-universe.json');
var SEMANTIC_INDEX_PATH = path.join(__dirname, 'semantic-mapping', 'capability-semantic-index.json');
var OFFICIAL_BINDINGS_PATH = path.join(__dirname, 'gdevelop-truth', 'official-capability-bindings.json');
var KINDS = { action: true, condition: true, 'number-expression': true, 'string-expression': true };

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function scalar(value) { return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'; }

function loadRegistry(options) {
  options = options || {};
  var universe = options.universe || readJson(UNIVERSE_PATH);
  var semanticIndex = options.semanticIndex || readJson(SEMANTIC_INDEX_PATH);
  var officialBindings = options.officialBindings || readJson(OFFICIAL_BINDINGS_PATH);
  var registry = { universe: universe, semanticIndex: semanticIndex, officialBindings: officialBindings.bindings || {}, byId: {}, families: {}, instructionIds: {} };
  (universe.families || []).forEach(function(family) { registry.families[family.id] = family; });
  (universe.capabilities || []).forEach(function(capability) {
    if (options.includeSourceDeclarations || registry.officialBindings[capability.id]) registry.byId[capability.id] = capability;
  });
  (universe.runtimeOverrides || []).forEach(function(override) {
    (override.capabilityIds || []).forEach(function(capabilityId) { registry.instructionIds[capabilityId] = override.instructionId; });
  });
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

function effectiveContract(registry, capability) {
  if (capability.aliasOf) {
    var aliasParts = String(capability.aliasOf).split('::');
    var aliasLocalId = aliasParts[aliasParts.length - 1];
    var aliasTarget = Object.keys(registry.byId).map(function(id) { return registry.byId[id]; }).filter(function(candidate) {
      return candidate.extension === capability.extension && candidate.kind === capability.kind && candidate.owner.kind === capability.owner.kind && candidate.owner.id === capability.owner.id && candidate.localId === aliasLocalId;
    })[0];
    if (!aliasTarget) throw new Error('GDJS capability alias target is unavailable: ' + capability.id + ' -> ' + capability.aliasOf);
    return effectiveContract(registry, aliasTarget);
  }
  var family = capability.inherits ? registry.families[capability.inherits] : null;
  return {
    parameters: clone(family ? family.parameters : capability.parameters) || [],
    parameterMacros: clone(family ? family.parameterMacros : capability.parameterMacros) || [],
    valueType: family ? family.valueType : (capability.kind === 'string-expression' ? 'string' : capability.kind === 'number-expression' ? 'number' : null)
  };
}

function expressionParameterContract(registry, capability) {
  var official = registry.officialBindings[capability.id];
  if (official) return clone(official.parameters).filter(function(parameter) { return !parameter.codeOnly; });
  var contract = effectiveContract(registry, capability);
  var parameters = contract.parameters.filter(function(parameter) { return parameter.kind !== 'code-only'; });
  if (/expression$/.test(capability.kind) && contract.parameterMacros.some(function(macro) { return macro.kind === 'standard-value'; })) {
    var last = parameters[parameters.length - 1];
    if (last && (last.type === 'expression' || last.type === 'string')) parameters.pop();
  }
  return parameters;
}

function placeholderFor(parameter, index) {
  if (parameter.kind === 'code-only') return '';
  if (/^(?:object|objectList|objectListOrEmptyIfJustDeclared|objectListOrEmptyWithoutPicking|objectPtr)$/.test(parameter.type)) return 'Object' + index;
  if (parameter.type === 'behavior') return 'Behavior' + index;
  if (parameter.type === 'layer') return '';
  if (parameter.type === 'operator' || parameter.type === 'relationalOperator') return '=';
  if (parameter.type === 'scenevar' || parameter.type === 'globalvar' || parameter.type === 'variable' || parameter.type === 'variableOrProperty' || parameter.type === 'variableOrPropertyOrParameter') return 'variable' + index;
  if (parameter.type === 'objectvar') return 'objectvar' + index;
  if (parameter.type === 'yesorno' || parameter.type === 'trueorfalse') return 'yes';
  if (parameter.type === 'color') return '255;255;255';
  if (parameter.type === 'number' || parameter.type === 'expression' || parameter.type === 'forceMultiplier') return '0';
  if (parameter.type === 'string' || parameter.type === 'stringWithSelector') return '""';
  return parameter.type + index;
}

function placeholderParameters(registry, capability) {
  var official = registry.officialBindings[capability.id];
  if (official) return official.parameters.map(function(parameter, index) { return placeholderFor({ kind: parameter.codeOnly ? 'code-only' : 'visible', type: parameter.type }, index); });
  var contract = effectiveContract(registry, capability);
  var parameters = contract.parameters.map(placeholderFor);
  contract.parameterMacros.forEach(function(macro) {
    if (macro.kind === 'standard-operator' || macro.kind === 'standard-relational-operator' || macro.kind === 'standard-value') {
      parameters.push('=', macro.valueType === 'string' ? '""' : '0');
    }
  });
  return parameters;
}

function renderExpression(registry, expression) {
  if (!expression || typeof expression !== 'object') throw new Error('GDJS expression invocation must be an object');
  var capability = resolveCapability(registry, expression.capability || expression.semantic || expression.semanticRef);
  if (capability.kind !== 'number-expression' && capability.kind !== 'string-expression') {
    throw new Error('GDJS expression invocation must resolve to an expression capability: ' + capability.id);
  }
  var contract = expressionParameterContract(registry, capability);
  var args = expression.arguments || expression.parameters || [];
  if (!Array.isArray(args)) { var semanticEntry = registry.semanticIndex.by_capability[capability.id]; var visible = semanticEntry && semanticEntry.parameter_contract && semanticEntry.parameter_contract.parameters.filter(function(parameter) { return parameter.kind !== 'code-only'; }); if (!visible) throw new Error('GDJS expression has no generated semantic parameter contract: ' + capability.id); Object.keys(args).forEach(function(key) { if (!visible.some(function(parameter) { return parameter.semanticKey === key; })) throw new Error('GDJS expression has unknown dictionary argument ' + key + ': ' + capability.id); }); args = visible.map(function(parameter) { if (!Object.prototype.hasOwnProperty.call(expression.arguments, parameter.semanticKey)) throw new Error('GDJS expression is missing dictionary argument ' + parameter.semanticKey + ': ' + capability.id); return expression.arguments[parameter.semanticKey]; }); }
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
  if ((capability.owner || {}).kind === 'object' && contract[0] && /^(?:object|objectList|objectListOrEmptyIfJustDeclared|objectListOrEmptyWithoutPicking|objectPtr)$/.test(contract[0].type)) {
    var receiver = rendered.shift();
    name = receiver + '.' + name;
  } else if ((capability.owner || {}).kind === 'behavior' && contract.length >= 2 && contract[0].type === 'object' && contract[1].type === 'behavior') {
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
  if (parameters === undefined) { var semanticEntry = registry.semanticIndex.by_capability[capability.id]; var visible = semanticEntry && semanticEntry.parameter_contract && semanticEntry.parameter_contract.parameters.filter(function(parameter) { return parameter.kind !== 'code-only'; }); if (!visible) throw new Error('GDJS invocation has no generated semantic parameter contract: ' + capability.id); if (!invocation.arguments || typeof invocation.arguments !== 'object' || Array.isArray(invocation.arguments)) throw new Error('GDJS invocation requires dictionary-named arguments: ' + capability.id); parameters = visible.map(function(parameter) { if (!Object.prototype.hasOwnProperty.call(invocation.arguments, parameter.semanticKey)) throw new Error('GDJS invocation is missing dictionary argument ' + parameter.semanticKey + ': ' + capability.id); return invocation.arguments[parameter.semanticKey]; }); }
  if (!Array.isArray(parameters)) throw new Error('GDJS invocation parameters must be an array: ' + capability.id);
  var officialParameters = (registry.officialBindings[capability.id] || {}).parameters || [];
  var expectedParameterCount = officialParameters.length || placeholderParameters(registry, capability).length;
  var requiredParameterCount = officialParameters.length ? officialParameters.filter(function(parameter) { return !parameter.optional; }).length : expectedParameterCount;
  if (parameters.length < requiredParameterCount || parameters.length > expectedParameterCount) {
    throw new Error('GDJS instruction parameter count mismatch for ' + capability.id + ': expected ' + requiredParameterCount + '..' + expectedParameterCount + ', got ' + parameters.length);
  }
  return {
    type: { inverted: capability.kind === 'condition' && invocation.inverted === true, value: instructionType(registry, capability) },
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
  if (!Array.isArray(conditions) || !Array.isArray(actions) || !actions.length) {
    throw new Error('Semantic event connection requires condition and non-empty action arrays');
  }
  if (conditions.length && eventType.grammar.hasConditions !== true) throw new Error('GDJS event type does not declare conditions: ' + eventTypeRef);
  if (actions.length && eventType.grammar.hasActions !== true) throw new Error('GDJS event type does not declare actions: ' + eventTypeRef);
  if ((connection.children || []).length && eventType.grammar.canHaveSubEvents !== true) throw new Error('GDJS event type does not declare subevents: ' + eventTypeRef);
  return {
    disabled: connection.enabled === false,
    folded: false,
    type: eventType.eventType,
    conditions: conditions.map(function(invocation) { return compileInstruction(registry, invocation, 'condition'); }),
    actions: actions.map(function(invocation) { return compileInstruction(registry, invocation, 'action'); }),
    events: (connection.children || []).map(function(child) { return compileEventConnection(registry, child); })
  };
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
  OFFICIAL_BINDINGS_PATH: OFFICIAL_BINDINGS_PATH,
  loadRegistry: loadRegistry,
  resolveCapability: resolveCapability,
  effectiveContract: effectiveContract,
  expressionParameterContract: expressionParameterContract,
  placeholderParameters: placeholderParameters,
  renderExpression: renderExpression,
  compileInstruction: compileInstruction,
  compileEventConnection: compileEventConnection,
  symbolicInvocation: symbolicInvocation,
  auditClosure: auditClosure
};
