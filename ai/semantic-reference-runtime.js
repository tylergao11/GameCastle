var dictionary = require('./capability-semantic-dictionary');
var algebra = require('./semantic-event-algebra');
var layoutDictionary = require('./semantic-layout-dictionary');
var production = require('../shared/asset-production-pipeline-contract.json');
var styles = require('../shared/asset-style-dictionary.json');

var CAPABILITY_KINDS = ['action', 'condition', 'number-expression', 'string-expression'];
var EXTENSION_KINDS = ['object', 'behavior', 'event'].concat(CAPABILITY_KINDS);

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'SemanticReferenceRuntime'; throw error; }
function clean(value) { return String(value || '').replace(/[|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function table(items, prefix, identity) {
  var rows = items.slice().sort(function(left, right) { return identity(left).localeCompare(identity(right)); });
  var byHandle = Object.create(null);
  var handleByIdentity = Object.create(null);
  rows.forEach(function(item, position) { var itemHandle = prefix + position; byHandle[itemHandle] = item; handleByIdentity[identity(item)] = itemHandle; });
  return { rows: rows, byHandle: byHandle, handleByIdentity: handleByIdentity };
}
function extensionId(entry) { return entry.capability_id.split('::')[0]; }
function visibleParameters(entry) { return entry.parameter_contract.parameters.filter(function(parameter) { return parameter.kind !== 'code-only'; }); }
function promptToken(value) { return JSON.stringify(value).replace(/\|/g, '\\u007c'); }
function parameterPromptType(parameter) { return parameter.runtimeNormalization === 'dictionary-token' ? 'oneOf(' + parameter.runtimeValues.map(promptToken).join(',') + ')' : parameter.promptType; }
function parameterText(parameter) { return parameter.semanticKey + '=' + parameterPromptType(parameter) + (parameter.optional ? ' optional' : ''); }
function argumentText(entry) { return visibleParameters(entry).map(parameterText).join(','); }
function ownerText(entry) { return entry.owner.kind === 'global' ? 'global' : entry.owner.kind + ':' + entry.owner.id.split('::').pop(); }
function capabilityLine(entryHandle, entry) { return [entryHandle, entry.kind, ownerText(entry), clean(entry.explanation.title), argumentText(entry)].join('|'); }
function eventLine(entryHandle, entry) { return [entryHandle, 'event', clean(entry.explanation.title), (entry.serialization.parameters || []).map(parameterText).join(',')].join('|'); }
function componentConfigType(descriptor, layoutTable) {
  if (descriptor.type === 'enum') return 'oneOf(' + descriptor.values.map(promptToken).join(',') + ')';
  if (descriptor.type === 'layout-choice') return 'oneOf(' + descriptor.values.map(function(value) { return promptToken(layoutTable.handleByIdentity[value]); }).join(',') + ')';
  if (descriptor.type === 'list') return 'list<' + componentConfigType(descriptor.item, layoutTable) + '>';
  if (descriptor.type === 'object') return '{' + Object.keys(descriptor.fields || {}).map(function(name) { var field = descriptor.fields[name]; return name + ':' + componentConfigType(field, layoutTable) + (field.required ? '' : ' optional'); }).join(',') + '}';
  if (descriptor.type === 'binding-ref') return descriptor.bindingKind + ' binding name';
  if (descriptor.type === 'number' && descriptor.minimum !== undefined && descriptor.maximum !== undefined) return 'number[' + descriptor.minimum + ',' + descriptor.maximum + ']';
  if (descriptor.type === 'number' && descriptor.minimum !== undefined) return 'number>=' + descriptor.minimum;
  return descriptor.type;
}
function componentConfigText(name, descriptor, layoutTable) {
  var defaultValue = (descriptor.type === 'layout' || descriptor.type === 'layout-choice') && descriptor.default !== undefined ? layoutTable.handleByIdentity[descriptor.default] : descriptor.default;
  return name + '=' + componentConfigType(descriptor, layoutTable) + (defaultValue === undefined ? (descriptor.required ? ' required' : '') : ' default(' + promptToken(defaultValue) + ')');
}
function componentLine(entryHandle, entry, layoutTable) {
  var card = entry.llm2;
  var config = Object.keys(card.config || {}).map(function(name) { return componentConfigText(name, card.config[name], layoutTable); }).join(',');
  var bindings = Object.keys(card.bindings || {}).map(function(name) { var binding = card.bindings[name]; return name + '=' + binding.kind + (binding.required ? '' : ' optional'); }).join(',');
  if (card.namedBindings) bindings += (bindings ? ',' : '') + 'named=' + card.namedBindings.kinds.join('|');
  return [entryHandle, clean(card.name), clean(card.summary), card.target && card.target.required ? 'target=entity' : 'target=entity optional', 'config:' + config, 'bindings:' + bindings].join('|');
}
function allowed(command, fields, label) { Object.keys(command).forEach(function(key) { if (fields.indexOf(key) < 0) fail('SEMANTIC_REFERENCE_FIELD_INVALID', label + ' contains unknown field: ' + key); }); }
function handle(value, tableValue, label) {
  if (typeof value !== 'string' || !Object.prototype.hasOwnProperty.call(tableValue.byHandle, value)) fail('SEMANTIC_REFERENCE_HANDLE_INVALID', label + ' requires a handle from [param-context] or [retrieve]: ' + String(value));
  return tableValue.byHandle[value];
}
function reverse(tableValue, identity, label) {
  var value = tableValue.handleByIdentity[identity];
  if (!value) fail('SEMANTIC_REFERENCE_SOURCE_INVALID', label + ' is outside the pinned runtime catalog: ' + identity);
  return value;
}
function foundationBindingRefs(index, use) {
  return algebra.bindingRefs(index, use);
}

function create(index) {
  index = algebra.initialize(index || dictionary.loadIndex());
  var extensionEntries = Object.keys(index.by_capability).map(function(id) { return index.by_capability[id]; }).filter(function(entry) {
    return entry.binding.status === 'executable';
  });
  var extensions = table(extensionEntries, 'x', function(entry) { return entry.semantic_id; });
  var foundationObjectRefs = new Set(Object.keys(algebra.ENTITY_KINDS).map(function(kind) { return algebra.ENTITY_KINDS[kind]; }).filter(Boolean));
  var extensionObjects = table(Object.keys(index.by_object_type).map(function(id) { return index.by_object_type[id]; }).filter(function(entry) { return entry.runtime.status === 'executable' && !foundationObjectRefs.has(entry.semantic_id); }), 'xo', function(entry) { return entry.semantic_id; });
  var foundationBehaviorRefs = new Set(Object.keys(algebra.BEHAVIOR_KINDS).map(function(kind) { return algebra.BEHAVIOR_KINDS[kind]; }));
  var extensionBehaviors = table(Object.keys(index.by_behavior_type).map(function(id) { return index.by_behavior_type[id]; }).filter(function(entry) { return entry.runtime.status === 'executable' && !foundationBehaviorRefs.has(entry.semantic_id); }), 'xb', function(entry) { return entry.semantic_id; });
  var foundationEventRefs = new Set(Object.keys(algebra.EVENT_KINDS).map(function(kind) { return dictionary.resolveEventType(index, algebra.EVENT_KINDS[kind]).semantic_id; }));
  var allEventTypes = Object.keys(index.by_event_type).filter(function(key) { return index.by_event_type[key].eventType === key; }).map(function(key) { return index.by_event_type[key]; });
  var extensionEvents = table(allEventTypes.filter(function(entry) { return !foundationEventRefs.has(entry.semantic_id); }), 'xe', function(entry) { return entry.semantic_id; });
  var layouts = table(layoutDictionary.list(), 'l', function(entry) { return entry.semanticRef; });
  var families = table(Object.keys(production.productionFamilies || {}).map(function(id) { return { id: id, recipeId: production.productionFamilies[id].defaultRecipeId }; }), 'f', function(entry) { return entry.id; });
  var styleTable = table(Object.keys(styles.styles || {}).map(function(id) { return { id: id, value: styles.styles[id] }; }), 's', function(entry) { return entry.id; });
  var components = table(dictionary.listComponents(index, { exposed: true, executable: true }), 'component', function(entry) { return entry.semantic_id; });

  var extensionGroupsByKey = Object.create(null);
  function groupFor(extension) {
    if (!extensionGroupsByKey[extension]) extensionGroupsByKey[extension] = { extension: extension, capabilities: [], objectTypes: [], behaviorTypes: [], eventTypes: [] };
    return extensionGroupsByKey[extension];
  }
  extensions.rows.forEach(function(entry) {
    groupFor(extensionId(entry)).capabilities.push(entry);
  });
  extensionObjects.rows.forEach(function(entry) { groupFor(entry.owner.id.split('::')[0]).objectTypes.push(entry); });
  extensionBehaviors.rows.forEach(function(entry) { groupFor(entry.owner.id.split('::')[0]).behaviorTypes.push(entry); });
  extensionEvents.rows.forEach(function(entry) { groupFor(entry.eventType.split('::')[0]).eventTypes.push(entry); });
  var groups = table(Object.keys(extensionGroupsByKey).map(function(key) { return extensionGroupsByKey[key]; }), 'g', function(entry) { return entry.extension; });

  function resolveExtension(value, expectedKind) {
    var entry = handle(value, extensions, 'extension operation');
    if (expectedKind && entry.kind !== expectedKind) fail('SEMANTIC_CAPABILITY_KIND_INVALID', value + ' is ' + entry.kind + ', while this parameter requires ' + expectedKind + '.');
    return entry;
  }
  function validateArguments(entry, value) {
    try { return dictionary.validateCapabilityArguments(entry, value); }
    catch (error) { fail('SEMANTIC_CAPABILITY_ARGUMENT_INVALID', error.message); }
  }
  function normalizeArguments(entry, value, context) {
    validateArguments(entry, value);
    var normalized = Object.create(null);
    visibleParameters(entry).forEach(function(parameter) {
      if (!Object.prototype.hasOwnProperty.call(value, parameter.semanticKey)) return;
      var raw = value[parameter.semanticKey];
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        if (parameter.runtimeValueKind !== 'number-expression' && parameter.runtimeValueKind !== 'string-expression') fail('SEMANTIC_EXPRESSION_KIND_INVALID', entry.explanation.title + '.' + parameter.semanticKey + ' is not an expression parameter.');
        allowed(raw, ['semanticRef', 'arguments'], entry.explanation.title + '.' + parameter.semanticKey + ' expression');
        var expressionEntry = dictionary.resolve(index, raw.semanticRef);
        if (expressionEntry.kind !== 'number-expression' && expressionEntry.kind !== 'string-expression') fail('SEMANTIC_EXPRESSION_KIND_INVALID', raw.semanticRef + ' is ' + expressionEntry.kind + '; an expression is required.');
        if (parameter.runtimeValueKind === 'number-expression' && expressionEntry.kind !== 'number-expression') fail('SEMANTIC_EXPRESSION_KIND_INVALID', entry.explanation.title + '.' + parameter.semanticKey + ' takes a number expression.');
        if (parameter.runtimeValueKind === 'string-expression' && expressionEntry.kind !== 'string-expression') fail('SEMANTIC_EXPRESSION_KIND_INVALID', entry.explanation.title + '.' + parameter.semanticKey + ' takes a string expression.');
        validateArguments(expressionEntry, raw.arguments);
        normalized[parameter.semanticKey] = { semanticRef: expressionEntry.semantic_id, arguments: clone(raw.arguments) };
        return;
      }
      var normalization = parameter.runtimeNormalization;
      if (normalization === 'entity-object-name') {
        normalized[parameter.semanticKey] = context.objectName(raw);
      } else if (normalization === 'entity-behavior-name') {
        var entityParameter = visibleParameters(entry).filter(function(candidate) { return candidate.runtimeNormalization === 'entity-object-name'; })[0];
        if (!entityParameter || !Object.prototype.hasOwnProperty.call(value, entityParameter.semanticKey)) fail('SEMANTIC_CAPABILITY_ARGUMENT_INVALID', entry.explanation.title + '.' + parameter.semanticKey + ' requires an entity parameter in the same dictionary contract.');
        normalized[parameter.semanticKey] = context.behaviorName(value[entityParameter.semanticKey], raw);
      } else if (normalization === 'object-member-name') {
        normalized[parameter.semanticKey] = context.memberVariableName(raw);
      } else if (normalization === 'scene-member-name') {
        normalized[parameter.semanticKey] = context.sceneVariableName(raw);
      } else if (normalization === 'local-name') {
        normalized[parameter.semanticKey] = context.localName(raw);
      } else if (normalization === 'contextual-member-name') {
        normalized[parameter.semanticKey] = context.memberScope(raw) === 'object' ? context.memberVariableName(raw) : context.sceneVariableName(raw);
      } else if (normalization === 'name' || normalization === 'text' || normalization === 'resource-name') {
        if (typeof raw !== 'string' || !raw.length) fail('SEMANTIC_CAPABILITY_ARGUMENT_INVALID', entry.explanation.title + '.' + parameter.semanticKey + ' takes dictionary text or a name.');
        normalized[parameter.semanticKey] = raw;
      } else if (normalization === 'number-expression') {
        if (typeof raw !== 'number' || !isFinite(raw)) fail('SEMANTIC_CAPABILITY_ARGUMENT_INVALID', entry.explanation.title + '.' + parameter.semanticKey + ' takes a finite number or a nested number expression.');
        normalized[parameter.semanticKey] = String(raw);
      } else if (normalization === 'string-expression') {
        if (typeof raw !== 'string') fail('SEMANTIC_CAPABILITY_ARGUMENT_INVALID', entry.explanation.title + '.' + parameter.semanticKey + ' takes text or a nested string expression.');
        normalized[parameter.semanticKey] = JSON.stringify(raw);
      } else if (normalization === 'boolean-token') {
        if (!Array.isArray(parameter.runtimeValues) || parameter.runtimeValues.length !== 2) fail('SEMANTIC_CAPABILITY_ARGUMENT_INVALID', entry.explanation.title + '.' + parameter.semanticKey + ' has an incomplete dictionary boolean domain.');
        var booleanValue;
        if (typeof raw === 'boolean') booleanValue = raw;
        else if (parameter.runtimeValues.indexOf(raw) >= 0) booleanValue = raw === parameter.runtimeValues[0];
        else fail('SEMANTIC_CAPABILITY_ARGUMENT_INVALID', entry.explanation.title + '.' + parameter.semanticKey + ' takes true or false.');
        normalized[parameter.semanticKey] = parameter.runtimeValues[booleanValue ? 0 : 1];
      } else if (normalization === 'dictionary-token') {
        if (typeof raw !== 'string' || !Array.isArray(parameter.runtimeValues) || parameter.runtimeValues.indexOf(raw) < 0) fail('SEMANTIC_CAPABILITY_ARGUMENT_INVALID', entry.explanation.title + '.' + parameter.semanticKey + ' takes one operator: ' + (parameter.runtimeValues || []).join(', ') + '.');
        normalized[parameter.semanticKey] = raw;
      } else if (normalization === 'scalar') {
        if (raw === null || (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean') || (typeof raw === 'number' && !isFinite(raw))) fail('SEMANTIC_CAPABILITY_ARGUMENT_INVALID', entry.explanation.title + '.' + parameter.semanticKey + ' takes a scalar value.');
        normalized[parameter.semanticKey] = raw;
      } else fail('SEMANTIC_CAPABILITY_ARGUMENT_INVALID', entry.explanation.title + '.' + parameter.semanticKey + ' has no dictionary normalization rule.');
    });
    return normalized;
  }
  function retrieve(command) {
    allowed(command, ['type', 'group', 'kind'], 'retrieve');
    var group = handle(command.group, groups, 'retrieve.group');
    if (EXTENSION_KINDS.indexOf(command.kind) < 0) fail('SEMANTIC_RETRIEVE_KIND_INVALID', 'retrieve.kind selects one value: ' + EXTENSION_KINDS.join(', ') + '.');
    if (command.kind === 'object') {
      if (!group.objectTypes.length) fail('SEMANTIC_RETRIEVE_NOT_FOUND', command.group + ' has no object extension kinds.');
      return { group: command.group, kind: command.kind, entityKinds: group.objectTypes.map(function(entry) { return [extensionObjects.handleByIdentity[entry.semantic_id], 'object', clean(entry.explanation.title)].join('|'); }) };
    }
    if (command.kind === 'behavior') {
      if (!group.behaviorTypes.length) fail('SEMANTIC_RETRIEVE_NOT_FOUND', command.group + ' has no behavior extension kinds.');
      return { group: command.group, kind: command.kind, behaviorKinds: group.behaviorTypes.map(function(entry) { return [extensionBehaviors.handleByIdentity[entry.semantic_id], 'behavior', clean(entry.explanation.title)].join('|'); }) };
    }
    if (command.kind === 'event') {
      if (!group.eventTypes.length) fail('SEMANTIC_RETRIEVE_NOT_FOUND', command.group + ' has no event extension kinds.');
      return { group: command.group, kind: command.kind, eventKinds: group.eventTypes.map(function(entry) { return eventLine(extensionEvents.handleByIdentity[entry.semantic_id], entry); }) };
    }
    var matches = group.capabilities.filter(function(entry) { return entry.kind === command.kind; });
    if (!matches.length) fail('SEMANTIC_RETRIEVE_NOT_FOUND', command.group + ' has no ' + command.kind + ' extension operations.');
    return { group: command.group, kind: command.kind, operations: matches.map(function(entry) { return capabilityLine(extensions.handleByIdentity[entry.semantic_id], entry); }) };
  }
  function groupLine(entry) {
    var counts = Object.create(null);
    entry.capabilities.forEach(function(capability) { counts[capability.kind] = (counts[capability.kind] || 0) + 1; });
    counts.object = entry.objectTypes.length; counts.behavior = entry.behaviorTypes.length; counts.event = entry.eventTypes.length;
    var availableKinds = EXTENSION_KINDS.filter(function(kind) { return counts[kind] > 0; });
    return [groups.handleByIdentity[entry.extension], entry.extension, availableKinds.join(',')].join('|');
  }
  function resolveBindings(values, label) {
    var out = [];
    (values || []).forEach(function(value) {
      var foundation = foundationBindingRefs(index, value);
      var refs = foundation || [resolveExtension(value).semantic_id];
      var stableUse = foundation ? value : refs[0];
      if (!out.some(function(binding) { return binding.use === stableUse; })) out.push({ use: stableUse, semanticRefs: refs });
    });
    return out;
  }
  function bindingUses(values) {
    var out = [];
    (values || []).forEach(function(binding) {
      var use = algebra.operationForUse(binding.use) ? binding.use : reverse(extensions, binding.use, 'extension binding');
      if (out.indexOf(use) < 0) out.push(use);
    });
    return out;
  }
  function parameterContext() {
    return {
      entityKinds: Object.keys(algebra.ENTITY_KINDS),
      behaviorKinds: Object.keys(algebra.BEHAVIOR_KINDS),
      eventKinds: algebra.eventKindLines(index),
      layouts: layouts.rows.map(function(entry) { return [layouts.handleByIdentity[entry.semanticRef], clean(entry.title), entry.placement.mode, entry.placement.space, entry.placement.materialization].join('|'); }),
      assetFamilies: families.rows.map(function(entry) { return families.handleByIdentity[entry.id] + '|' + entry.id; }),
      assetStyles: styleTable.rows.map(function(entry) { return styleTable.handleByIdentity[entry.id] + '|' + entry.id + '|' + clean(entry.value.name); }),
      components: components.rows.map(function(entry) { return componentLine(components.handleByIdentity[entry.semantic_id], entry, layouts); }),
      extensionGroups: groups.rows.map(groupLine)
    };
  }

  return {
    index: index,
    foundationOperationLines: function() { return algebra.promptLines(index); },
    parameterContext: parameterContext,
    retrieve: retrieve,
    resolveExtension: resolveExtension,
    validateOperationArguments: function(use, expectedKind, args) {
      var foundation = algebra.operationForUse(use);
      if (foundation) return algebra.validateOperationArguments(use, expectedKind, args);
      return validateArguments(resolveExtension(use, expectedKind), args);
    },
    extensionHandle: function(value) { return reverse(extensions, value, 'extension capability'); },
    normalizeArguments: normalizeArguments,
    compileOperation: function(use, expectedKind, args, context) {
      return algebra.compile(use, expectedKind, args, { index: index, resolveExtension: resolveExtension, normalize: function(entry, values) { return normalizeArguments(entry, values, context); }, memberScope: context.memberScope });
    },
    compileEventKind: function(kind, args, context) {
      var eventRuntime = { index: index, resolveExtension: resolveExtension, normalize: function(entry, values) { return normalizeArguments(entry, values, context); }, memberScope: context.memberScope, objectName: context.objectName, sceneVariableName: context.sceneVariableName, localName: context.localName };
      return Object.prototype.hasOwnProperty.call(algebra.EVENT_KINDS, kind) ? algebra.compileEventKind(index, kind, args, eventRuntime) : algebra.compileEventEntry(handle(kind, extensionEvents, 'event.kind'), args, eventRuntime);
    },
    invocationChannel: function(eventTypeRef, kind) {
      var eventType = dictionary.resolveEventType(index, eventTypeRef);
      var channels = (eventType.serialization.instructionLists || []).filter(function(channel) { return channel.kind === kind; });
      if (!channels.length) fail('SEMANTIC_EVENT_CHANNEL_MISSING', eventType.eventType + ' has no ' + kind + ' instruction channel.');
      var primary = channels.filter(function(channel) { return channel.primary; });
      if (primary.length !== 1) fail('SEMANTIC_EVENT_CHANNEL_AMBIGUOUS', eventType.eventType + ' does not declare one primary ' + kind + ' instruction channel.');
      return primary[0].semanticKey;
    },
    resolveBindings: resolveBindings,
    bindingUses: bindingUses,
    resolveEntityKind: function(kind) { return Object.prototype.hasOwnProperty.call(algebra.ENTITY_KINDS, kind) ? algebra.entityKindRef(index, kind) : handle(kind, extensionObjects, 'entity.kind').semantic_id; },
    entityKind: function(reference) { var foundation = algebra.entityKindForRef(index, reference); return foundation || reverse(extensionObjects, reference, 'extension entity kind'); },
    resolveBehaviorKinds: function(kinds) { return (kinds || []).map(function(kind) { return Object.prototype.hasOwnProperty.call(algebra.BEHAVIOR_KINDS, kind) ? algebra.behaviorRefs(index, [kind])[0] : handle(kind, extensionBehaviors, 'entity.behaviors').semantic_id; }); },
    behaviorKinds: function(references) { return (references || []).map(function(reference) { try { return algebra.behaviorKindsForRefs(index, [reference])[0]; } catch (_error) { return reverse(extensionBehaviors, reference, 'extension behavior kind'); } }); },
    resolveEventKind: function(kind) { return Object.prototype.hasOwnProperty.call(algebra.EVENT_KINDS, kind) ? algebra.eventKindRef(index, kind) : handle(kind, extensionEvents, 'event.kind').semantic_id; },
    eventKind: function(reference) { return algebra.eventKindForRef(index, reference) || reverse(extensionEvents, reference, 'extension event kind'); },
    resolveLayout: function(value) { return handle(value, layouts, 'layout').semanticRef; },
    layoutHandle: function(value) { return reverse(layouts, value, 'layoutRef'); },
    resolveFamily: function(value) { return handle(value, families, 'family').id; },
    familyHandle: function(value) { return reverse(families, value, 'productionFamily'); },
    resolveStyle: function(value) { return handle(value, styleTable, 'style').id; },
    styleHandle: function(value) { return reverse(styleTable, value, 'styleId'); },
    resolveComponent: function(value) { return clone(handle(value, components, 'component.kind')); },
    componentHandle: function(value) { return reverse(components, dictionary.resolveComponent(index, value).semantic_id, 'componentRef'); }
  };
}

module.exports = { CAPABILITY_KINDS: CAPABILITY_KINDS, create: create };
