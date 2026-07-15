var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var componentCatalog = require('./component-catalog');

var UNIVERSE_PATH = path.join(__dirname, 'gdevelop-truth', 'capability-universe.json');
var OFFICIAL_BINDINGS_PATH = path.join(__dirname, 'gdevelop-truth', 'official-capability-bindings.json');
var EVENT_GRAMMAR_PATH = path.join(__dirname, 'gdevelop-truth', 'event-grammar.json');
var SEMANTIC_INDEX_PATH = path.join(__dirname, 'semantic-mapping', 'capability-semantic-index.json');
var OBJECT_CONFIGURATION_TRUTH_PATH = path.join(__dirname, 'gdevelop-truth', 'object-configuration-truth.json');
var LAYOUT_DICTIONARY_PATH = path.join(__dirname, '..', 'shared', 'semantic-layout-dictionary.json');
var ASSET_BINDING_DICTIONARY_PATH = path.join(__dirname, '..', 'shared', 'gdjs-asset-binding-dictionary.json');
var EVENT_ROLE_BY_CAPABILITY_KIND = {
  action: { eventSlot: 'actions', role: 'effect', resultType: null },
  condition: { eventSlot: 'conditions', role: 'predicate', resultType: 'boolean' },
  'number-expression': { eventSlot: 'expression', role: 'value', resultType: 'number' },
  'string-expression': { eventSlot: 'expression', role: 'value', resultType: 'string' }
};

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function loadIndex() {
  var index = readJson(SEMANTIC_INDEX_PATH);
  if (index.schemaVersion !== 3 || index.dictionaryKind !== 'gdjs-semantic-dictionary' || !index.source || !index.by_capability || !index.by_event_type || !index.by_component || !index.event_grammar) throw new Error('Generated GDJS Semantic Dictionary is incomplete');
  return index;
}
function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(value).sort().map(function(key) { return JSON.stringify(key) + ':' + stableStringify(value[key]); }).join(',') + '}';
}
function hash(value) { return crypto.createHash('sha256').update(stableStringify(value)).digest('hex'); }
function parameterKey(parameter, index, used) { var base = String(parameter.label || parameter.type || 'value').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'value'; var key = base, suffix = 2; while (used[key]) key = base + '_' + suffix++; used[key] = true; return key; }
function semanticId(capabilityId) { return 'gdjs://capability/' + capabilityId; }
function eventSemanticId(eventType) { return 'gdjs://event/' + eventType; }
function objectTypeSemanticId(ownerId) { return 'gdjs://object/' + ownerId; }
function behaviorTypeSemanticId(ownerId) { return 'gdjs://behavior/' + ownerId; }
function hasText(value) { return typeof value === 'string' && value.trim().length > 0; }

function semanticTypes(universe, bindingsDocument, configurationTruth) {
  function collect(ownerKind, semanticFactory, dictionaryKey) {
    var grouped = {};
    (universe.semanticTypes || []).forEach(function(type) {
      if (type.kind !== ownerKind) return;
      grouped[type.id] = { owner: { kind: ownerKind, id: type.id }, capabilityIds: [], source: clone(type.source || []), presentation: clone(type.presentation || {}) };
    });
    universe.capabilities.forEach(function(capability) {
      if (!capability.owner || capability.owner.kind !== ownerKind || capability.owner.id.indexOf('::__' + ownerKind + '_metadata__') >= 0) return;
      var id = capability.owner.id;
      if (!grouped[id]) grouped[id] = { owner: clone(capability.owner), capabilityIds: [], source: [], presentation: {} };
      grouped[id].capabilityIds.push(capability.id);
      grouped[id].source.push(clone(capability.source));
    });
    var result = {};
    Object.keys(grouped).sort().forEach(function(ownerId) {
      var group = grouped[ownerId];
      var officialTypeKey = ownerKind === 'object' ? 'objectTypes' : 'behaviorTypes';
      var runtimeTypes = (bindingsDocument[officialTypeKey] || []).filter(function(item) {
        return item.runtimeType === ownerId || ownerId === item.extension + '::' + item.runtimeType;
      }).map(function(item) { return item.runtimeType; }).filter(function(value, index, values) { return values.indexOf(value) === index; });
      if (!runtimeTypes.length) runtimeTypes = group.capabilityIds.map(function(capabilityId) { return (bindingsDocument.bindings[capabilityId] || {}).metadataOwnerId || null; }).filter(Boolean).filter(function(value, index, values) { return values.indexOf(value) === index; });
      if (runtimeTypes.length > 1) throw new Error('GDJS semantic ' + ownerKind + ' has conflicting official runtime types: ' + ownerId);
      var sources = {};
      group.source.forEach(function(item) { sources[item.path + ':' + item.line] = item; });
      result[ownerId] = {
        semantic_id: semanticFactory(ownerId),
        kind: dictionaryKey,
        owner: group.owner,
        explanation: {
          title: group.presentation.title || ownerId,
          description: group.presentation.description || 'The pinned no-code declaration exposes this ' + ownerKind + ' through the listed semantic members. Its human-readable type description is not declared by the capability metadata.',
          descriptionStatus: group.presentation.description ? 'declared-by-no-code-metadata' : 'not-declared-by-capability-metadata'
        },
        memberCapabilityIds: group.capabilityIds.slice().sort(),
        runtime: runtimeTypes.length ? { status: 'executable', gdevelopType: runtimeTypes[0] } : { status: 'source-only', reason: 'The pinned GDJS platform exposes no executable member binding for this type.' },
        source: Object.keys(sources).sort().map(function(key) { return sources[key]; })
      };
      if (ownerKind === 'object' && runtimeTypes.length) {
        var configuration = (configurationTruth.objects || []).filter(function(item) { return item.extension === group.owner.id.split('::')[0] && item.runtimeType === runtimeTypes[0]; })[0] || null;
        if (!configuration || configuration.status !== 'executable') throw new Error('Official object configuration truth is missing for executable object type: ' + ownerId);
        result[ownerId].configuration = clone(configuration);
      }
    });
    return result;
  }
  return { objectTypes: collect('object', objectTypeSemanticId, 'object-type'), behaviorTypes: collect('behavior', behaviorTypeSemanticId, 'behavior-type') };
}

function universeFingerprint(universe, bindingsDocument, eventGrammar, configurationTruth, components) {
  var bindingDocument = bindingsDocument || readJson(OFFICIAL_BINDINGS_PATH);
  var grammar = eventGrammar || readJson(EVENT_GRAMMAR_PATH);
  var configuration = configurationTruth || readJson(OBJECT_CONFIGURATION_TRUTH_PATH);
  var layoutDictionary = readJson(LAYOUT_DICTIONARY_PATH);
  var assetBindingDictionary = readJson(ASSET_BINDING_DICTIONARY_PATH);
  var componentDefinitions = components || componentCatalog.loadComponentCatalog();
  var types = semanticTypes(universe, bindingDocument, configuration);
  return {
    sourceCommit: bindingDocument.sourceCommit,
    universeHash: hash({ source: universe.source, capabilities: universe.capabilities, families: universe.families, runtimeOverrides: universe.runtimeOverrides }),
    capabilityCount: universe.capabilities.length,
    bindingCount: Object.keys(bindingDocument.bindings || {}).length,
    bindingsHash: hash({ bindings: bindingDocument.bindings, parameterSemantics: bindingDocument.parameterSemantics }),
    eventGrammarHash: hash(grammar),
    semanticTypesHash: hash(types),
    objectConfigurationHash: hash(configuration),
    layoutDictionaryHash: hash(layoutDictionary),
    assetBindingDictionaryHash: hash(assetBindingDictionary),
    componentDictionaryHash: hash({
      schemaVersion: componentDefinitions.schemaVersion,
      components: componentDefinitions.components.map(function(component) { return componentCatalog.compilerView(component); })
    })
  };
}

function sameFingerprint(left, right) {
  return !!left && !!right && left.sourceCommit === right.sourceCommit && left.universeHash === right.universeHash && left.capabilityCount === right.capabilityCount && left.bindingCount === right.bindingCount && left.bindingsHash === right.bindingsHash && left.eventGrammarHash === right.eventGrammarHash && left.semanticTypesHash === right.semanticTypesHash && left.objectConfigurationHash === right.objectConfigurationHash && left.layoutDictionaryHash === right.layoutDictionaryHash && left.assetBindingDictionaryHash === right.assetBindingDictionaryHash && left.componentDictionaryHash === right.componentDictionaryHash;
}

function componentEntries(catalog) {
  var byComponent = Object.create(null);
  catalog.components.forEach(function(component) {
    var compiler = componentCatalog.compilerView(component);
    var exposed = componentCatalog.aiView(component);
    var implementation = compiler.implementation || {};
    var status = compiler.abstract || !(implementation.targetBehaviors || []).length && !(implementation.entities || []).length && !(implementation.events || []).length ? 'source-only' : 'executable';
    byComponent[component.id] = {
      semantic_id: 'gc-component://' + component.id,
      component_id: component.id,
      kind: component.kind,
      name: component.name,
      llm2: clone(exposed),
      compiler: compiler,
      runtime: {
        status: status,
        reason: status === 'executable' ? null : 'The component is an internal abstract definition.'
      },
      source: { kind: 'component-manifest', path: 'ai/components/' + component.sourceFile }
    };
  });
  return byComponent;
}

function sourceContract(capability, capabilityById, families, seen) {
  seen = seen || {};
  if (seen[capability.id]) throw new Error('GDJS semantic alias cycle: ' + capability.id);
  seen[capability.id] = true;
  if (capability.aliasOf) {
    var localId = String(capability.aliasOf).split('::').pop();
    var target = Object.keys(capabilityById).map(function(id) { return capabilityById[id]; }).filter(function(candidate) {
      return candidate.extension === capability.extension && candidate.owner.kind === capability.owner.kind && candidate.owner.id === capability.owner.id && candidate.kind === capability.kind && candidate.localId === localId;
    });
    if (target.length !== 1) throw new Error('GDJS semantic alias target is not unique: ' + capability.id + ' -> ' + capability.aliasOf);
    return sourceContract(target[0], capabilityById, families, seen);
  }
  var family = capability.inherits ? families[capability.inherits] : null;
  var parameters = clone(family ? family.parameters : capability.parameters) || [];
  var parameterMacros = clone(family ? family.parameterMacros : capability.parameterMacros) || [];
  return {
    parameters: parameters,
    parameterMacros: parameterMacros
  };
}
function bindRuntimeParameterTruth(contract, status, capabilityId) {
  if (status.status !== 'executable') {
    var sourceUsed = {};
    contract.parameters.forEach(function(parameter, index) { parameter.semanticKey = parameter.kind === 'code-only' ? null : parameterKey(parameter, index, sourceUsed); });
    return contract;
  }
  var runtimeParameters = status.binding.parameters || [];
  var remaining = contract.parameters.slice();
  contract.parameters = runtimeParameters.map(function(runtime, index) {
    var match = remaining.findIndex(function(parameter) { return runtime.type === parameter.type && Boolean(runtime.codeOnly) === (parameter.kind === 'code-only'); });
    if (match < 0 && !runtime.codeOnly && !contract.parameterMacros.length) throw new Error('GDJS source/runtime visible parameter mismatch: ' + capabilityId + '[' + index + ']');
    var parameter = match < 0 ? {
      description: 'Materialized from the pinned GDJS runtime parameter contract.',
      extra: runtime.extra || null,
      kind: runtime.codeOnly ? 'code-only' : 'visible',
      label: runtime.codeOnly ? null : (runtime.runtimeNormalization === 'dictionary-token' ? 'Operator' : 'Value'),
      type: runtime.type
    } : remaining.splice(match, 1)[0];
    parameter.optional = Boolean(runtime.optional);
    parameter.defaultValue = runtime.defaultValue;
    if (!runtime.promptType || !runtime.runtimeValueKind || !runtime.runtimeNormalization) throw new Error('GDJS runtime parameter semantics are missing: ' + capabilityId + '[' + index + ']');
    if ((runtime.runtimeNormalization === 'dictionary-token' || runtime.runtimeNormalization === 'boolean-token') && (!Array.isArray(runtime.runtimeValues) || !runtime.runtimeValues.length)) throw new Error('GDJS runtime parameter token domain is missing: ' + capabilityId + '[' + index + ']');
    if (runtime.runtimeNormalization === 'boolean-token' && runtime.runtimeValues.length !== 2) throw new Error('GDJS runtime boolean parameter domain must contain two values: ' + capabilityId + '[' + index + ']');
    parameter.promptType = runtime.promptType;
    parameter.runtimeValueKind = runtime.runtimeValueKind;
    parameter.runtimeNormalization = runtime.runtimeNormalization;
    if (runtime.runtimeValues) parameter.runtimeValues = clone(runtime.runtimeValues);
    return parameter;
  });
  if (remaining.length) throw new Error('GDJS source parameter is absent from runtime binding: ' + capabilityId);
  var used = {};
  contract.parameters.forEach(function(parameter, index) { parameter.semanticKey = parameter.kind === 'code-only' ? null : parameterKey(parameter, index, used); });
  return contract;
}

function executableStatus(capabilityId, bindingsDocument) {
  var binding = (bindingsDocument.bindings || {})[capabilityId];
  if (binding) return { status: 'executable', binding: clone(binding) };
  var inoperable = (bindingsDocument.codegenInoperableDeclarations || []).filter(function(item) { return item.id === capabilityId; })[0];
  if (inoperable) return { status: 'source-only', reason: inoperable.reason };
  var unavailable = (bindingsDocument.unavailableSourceDeclarations || []).indexOf(capabilityId) >= 0;
  if (unavailable) return { status: 'source-only', reason: 'The pinned GDJS platform does not expose this source declaration as an executable runtime binding.' };
  throw new Error('GDJS binding ledger has no status for source declaration: ' + capabilityId);
}

function capabilityEntry(capability, capabilityById, families, bindingsDocument) {
  var presentation = capability.presentation || {};
  if (!hasText(presentation.title) || !hasText(presentation.description)) throw new Error('GDJS source declaration lacks interpretable presentation: ' + capability.id);
  var eventRole = EVENT_ROLE_BY_CAPABILITY_KIND[capability.kind];
  if (!eventRole) throw new Error('Unsupported GDJS source capability kind: ' + capability.kind);
  var status = executableStatus(capability.id, bindingsDocument);
  var parameterContract = bindRuntimeParameterTruth(sourceContract(capability, capabilityById, families), status, capability.id);
  return {
    semantic_id: semanticId(capability.id),
    capability_id: capability.id,
    explanation: {
      title: presentation.title,
      description: presentation.description,
      sentence: presentation.sentence || null,
      group: presentation.group || null,
      aliasOf: presentation.aliasOf || null
    },
    owner: clone(capability.owner),
    kind: capability.kind,
    event_contract: {
      eventSlot: eventRole.eventSlot,
      role: eventRole.role,
      resultType: eventRole.resultType,
      executionScope: capability.owner.kind,
      selectionEffect: { status: 'not-declared-by-capability-metadata', compilerRequirement: 'selection proof is required before a compiler may assert a picking effect' },
      reads: { status: 'not-declared-by-capability-metadata' },
      writes: { status: 'not-declared-by-capability-metadata' },
      sideEffects: { status: 'not-declared-by-capability-metadata' },
      orderingRequirements: { status: 'event-order-defined-by-parent-event-grammar' },
      subeventCompatibility: { status: 'event-type-defined-by-parent-event-grammar' }
    },
    parameter_contract: parameterContract,
    binding: status,
    source: clone(capability.source)
  };
}

function addIndex(index, key, capabilityId) {
  if (!index[key]) index[key] = [];
  index[key].push(capabilityId);
}

function buildIndex(options) {
  options = options || {};
  var universe = clone(options.universe || readJson(UNIVERSE_PATH));
  var bindingsDocument = clone(options.officialBindings || readJson(OFFICIAL_BINDINGS_PATH));
  var eventGrammar = clone(options.eventGrammar || readJson(EVENT_GRAMMAR_PATH));
  var configurationTruth = clone(options.objectConfigurationTruth || readJson(OBJECT_CONFIGURATION_TRUTH_PATH));
  var components = options.components || componentCatalog.loadComponentCatalog();
  if (!Array.isArray(universe.unresolvedDeclarations) || universe.unresolvedDeclarations.length) throw new Error('GDJS source universe has unresolved declarations');
  if (!bindingsDocument.parameterSemantics || !Array.isArray(bindingsDocument.parameterSemantics.source) || !bindingsDocument.parameterSemantics.source.length) throw new Error('GDJS runtime parameter semantics truth is incomplete');
  if (eventGrammar.schemaVersion !== 3 || eventGrammar.grammarKind !== 'gdjs-event-grammar' || !eventGrammar.instructionSerialization || !eventGrammar.instructionSerialization.conditionInversion || !eventGrammar.instructionSerialization.actionAwait || !eventGrammar.eventSerialization || !Array.isArray(eventGrammar.eventTypes) || !eventGrammar.eventTypes.length || eventGrammar.eventTypes.some(function(eventType) { return !eventType.serialization || !Array.isArray(eventType.serialization.instructionLists); })) throw new Error('GDJS event grammar is incomplete');
  eventGrammar.eventTypes.forEach(function(eventType) {
    (eventType.serialization.parameters || []).forEach(function(parameter) {
      if (!parameter.promptType || !parameter.runtimeValueKind || !parameter.runtimeNormalization || !parameter.runtimeSerialization) throw new Error('GDJS event parameter semantics are missing: ' + eventType.eventType + '.' + parameter.semanticKey);
      if (parameter.runtimeNormalization === 'dictionary-token' && (!Array.isArray(parameter.runtimeValues) || !parameter.runtimeValues.length)) throw new Error('GDJS event token domain is missing: ' + eventType.eventType + '.' + parameter.semanticKey);
    });
  });
  var capabilityById = {};
  var families = {};
  (universe.families || []).forEach(function(family) { families[family.id] = family; });
  universe.capabilities.forEach(function(capability) {
    if (capabilityById[capability.id]) throw new Error('Duplicate GDJS source capability: ' + capability.id);
    capabilityById[capability.id] = capability;
  });
  var byCapability = {};
  var bySemantic = {};
  var byOwner = {};
  var byEventType = {};
  var types = semanticTypes(universe, bindingsDocument, configurationTruth);
  universe.capabilities.slice().sort(function(left, right) { return left.id.localeCompare(right.id); }).forEach(function(capability) {
    var entry = capabilityEntry(capability, capabilityById, families, bindingsDocument);
    byCapability[capability.id] = entry;
    addIndex(bySemantic, entry.semantic_id, capability.id);
    addIndex(byOwner, [capability.owner.kind, capability.owner.id].join('::'), capability.id);
  });
  Object.keys(bySemantic).forEach(function(key) { bySemantic[key].sort(); });
  Object.keys(byOwner).forEach(function(key) { byOwner[key].sort(); });
  eventGrammar.eventTypes.forEach(function(eventType) {
    var entry = clone(eventType);
    entry.semantic_id = eventSemanticId(entry.eventType);
    byEventType[entry.eventType] = entry;
    byEventType[entry.semantic_id] = entry;
  });
  var executableCount = Object.keys(byCapability).filter(function(id) { return byCapability[id].binding.status === 'executable'; }).length;
  var byComponent = componentEntries(components);
  return {
    schemaVersion: 3,
    dictionaryKind: 'gdjs-semantic-dictionary',
    source: universeFingerprint(universe, bindingsDocument, eventGrammar, configurationTruth, components),
    summary: {
      capabilityCount: universe.capabilities.length,
      interpretableCapabilityCount: Object.keys(byCapability).length,
      executableCapabilityCount: executableCount,
      sourceOnlyCapabilityCount: universe.capabilities.length - executableCount,
      ownerCount: Object.keys(byOwner).length,
      eventTypeCount: eventGrammar.eventTypes.length,
      objectTypeCount: Object.keys(types.objectTypes).length,
      behaviorTypeCount: Object.keys(types.behaviorTypes).length,
      componentCount: Object.keys(byComponent).length
    },
    by_capability: byCapability,
    by_semantic: bySemantic,
    by_owner: byOwner,
    by_event_type: byEventType,
    by_object_type: types.objectTypes,
    by_behavior_type: types.behaviorTypes,
    by_component: byComponent,
    event_grammar: eventGrammar
  };
}

function resolve(index, reference) {
  var ids = index.by_capability[reference] ? [reference] : (index.by_semantic[reference] || []);
  if (ids.length !== 1) throw new Error(ids.length ? 'GDJS semantic reference is ambiguous: ' + reference : 'Unknown GDJS semantic reference: ' + reference);
  return clone(index.by_capability[ids[0]]);
}

function resolveEventType(index, reference) {
  var entry = index.by_event_type && index.by_event_type[reference];
  if (!entry) throw new Error('Unknown GDJS event type reference: ' + reference);
  return clone(entry);
}

function resolveType(index, reference, collection, kind) {
  var values = index[collection] || {};
  var entry = values[reference] || Object.keys(values).map(function(key) { return values[key]; }).filter(function(candidate) { return candidate.semantic_id === reference; })[0];
  if (!entry) throw new Error('Unknown GDJS ' + kind + ' reference: ' + reference);
  return clone(entry);
}
function resolveObjectType(index, reference) { return resolveType(index, reference, 'by_object_type', 'object type'); }
function resolveBehaviorType(index, reference) { return resolveType(index, reference, 'by_behavior_type', 'behavior type'); }
function resolveComponent(index, reference) {
  var values = index.by_component || {};
  var entry = values[reference] || Object.keys(values).map(function(key) { return values[key]; }).filter(function(candidate) { return candidate.semantic_id === reference; })[0];
  if (!entry) throw new Error('Unknown component reference: ' + reference);
  return clone(entry);
}

function validateCapabilityArguments(entry, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(entry.semantic_id + ' requires one arguments object');
  var expected = entry.parameter_contract.parameters.filter(function(parameter) { return parameter.kind !== 'code-only'; });
  var expectedKeys = expected.map(function(parameter) { return parameter.semanticKey; });
  Object.keys(value).forEach(function(key) { if (expectedKeys.indexOf(key) < 0) throw new Error(entry.semantic_id + ' has no argument named ' + key + '. Fill: ' + expectedKeys.join(', ')); });
  expected.filter(function(parameter) { return !parameter.optional; }).forEach(function(parameter) { if (!Object.prototype.hasOwnProperty.call(value, parameter.semanticKey)) throw new Error(entry.semantic_id + ' requires argument ' + parameter.semanticKey + '. Fill: ' + expectedKeys.join(', ')); });
  return clone(value);
}

function listOwners(index) {
  return Object.keys(index.by_owner).sort().map(function(ownerKey) {
    var ids = index.by_owner[ownerKey];
    var sample = index.by_capability[ids[0]];
    return { owner: clone(sample.owner), capabilityCount: ids.length };
  });
}

function listMembers(index, owner) {
  var ownerKey = [owner.kind, owner.id].join('::');
  return (index.by_owner[ownerKey] || []).map(function(id) { return clone(index.by_capability[id]); });
}
function listObjectTypes(index) { return Object.keys(index.by_object_type || {}).sort().map(function(key) { return clone(index.by_object_type[key]); }); }
function listBehaviorTypes(index) { return Object.keys(index.by_behavior_type || {}).sort().map(function(key) { return clone(index.by_behavior_type[key]); }); }
function listComponents(index, options) {
  options = options || {};
  return Object.keys(index.by_component || {}).sort().map(function(key) { return index.by_component[key]; }).filter(function(entry) {
    if (options.exposed && !entry.llm2) return false;
    if (options.executable && entry.runtime.status !== 'executable') return false;
    return true;
  }).map(clone);
}

function searchableText(entry) {
  return [entry.explanation.title, entry.explanation.description, entry.explanation.sentence, entry.explanation.group].concat(entry.parameter_contract.parameters.map(function(parameter) { return [parameter.label, parameter.description].join(' '); })).join(' ').toLocaleLowerCase();
}

function search(index, query, limit) {
  if (!hasText(query)) throw new Error('GDJS semantic search query is required');
  var terms = query.toLocaleLowerCase().trim().split(/\s+/);
  return Object.keys(index.by_capability).map(function(id) { return index.by_capability[id]; }).filter(function(entry) {
    var text = searchableText(entry);
    return terms.every(function(term) { return text.indexOf(term) >= 0; });
  }).sort(function(left, right) { return left.semantic_id.localeCompare(right.semantic_id); }).slice(0, limit === undefined ? 20 : limit).map(clone);
}

module.exports = {
  UNIVERSE_PATH: UNIVERSE_PATH,
  OFFICIAL_BINDINGS_PATH: OFFICIAL_BINDINGS_PATH,
  EVENT_GRAMMAR_PATH: EVENT_GRAMMAR_PATH,
  SEMANTIC_INDEX_PATH: SEMANTIC_INDEX_PATH,
  OBJECT_CONFIGURATION_TRUTH_PATH: OBJECT_CONFIGURATION_TRUTH_PATH,
  LAYOUT_DICTIONARY_PATH: LAYOUT_DICTIONARY_PATH,
  ASSET_BINDING_DICTIONARY_PATH: ASSET_BINDING_DICTIONARY_PATH,
  readJson: readJson,
  loadIndex: loadIndex,
  universeFingerprint: universeFingerprint,
  sameFingerprint: sameFingerprint,
  buildIndex: buildIndex,
  resolve: resolve,
  validateCapabilityArguments: validateCapabilityArguments,
  resolveEventType: resolveEventType,
  resolveObjectType: resolveObjectType,
  resolveBehaviorType: resolveBehaviorType,
  resolveComponent: resolveComponent,
  listOwners: listOwners,
  listMembers: listMembers,
  listObjectTypes: listObjectTypes,
  listBehaviorTypes: listBehaviorTypes,
  listComponents: listComponents,
  search: search
};
