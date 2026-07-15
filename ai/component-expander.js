var crypto = require('crypto');
var dictionary = require('./capability-semantic-dictionary');
var sourceContract = require('./game-semantic-source');
var referenceRuntime = require('./semantic-reference-runtime');
var draftApi = require('./semantic-draft');
var compilationSources = new WeakMap();

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, Object.create(null)); return value; }
function hash(value) { return 'component-expansion.' + crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0, 24); }
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'ComponentExpander'; throw error; }
function generatedId(instance, suffix) { return instance.semanticId + '.' + suffix; }
function effectiveConfig(definition, instance) {
  var config = Object.keys(definition.compiler.config || {}).reduce(function(out, name) { var descriptor = definition.compiler.config[name]; if (descriptor.default !== undefined) out[name] = clone(descriptor.default); return out; }, Object.create(null));
  Object.keys(instance.config || {}).forEach(function(name) { config[name] = clone(instance.config[name]); });
  return config;
}
function enabled(item, config) {
  if (!item.whenConfigIn) return true;
  return item.whenConfigIn.values.indexOf(config[item.whenConfigIn.name]) >= 0;
}
function materialize(value, context) {
  if (Array.isArray(value)) return value.map(function(item) { return materialize(item, context); });
  if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, '$configNumber')) {
    var configNumberName = value.$configNumber, configNumber = context.config[configNumberName];
    if (typeof configNumber !== 'number' || !isFinite(configNumber)) fail('SEMANTIC_COMPONENT_CONFIG_INVALID', context.definition.component_id + ' numeric blueprint requires config.' + configNumberName);
    return configNumber * (value.multiply === undefined ? 1 : value.multiply) + (value.add === undefined ? 0 : value.add);
  }
  if (value && typeof value === 'object') return Object.keys(value).reduce(function(out, key) { out[key] = materialize(value[key], context); return out; }, Object.create(null));
  if (typeof value !== 'string' || value[0] !== '$') return value;
  if (value === '$target') return context.instance.target;
  if (value.indexOf('$config:') === 0) {
    var configName = value.slice(8);
    if (!Object.prototype.hasOwnProperty.call(context.config, configName)) fail('SEMANTIC_COMPONENT_CONFIG_MISSING', context.definition.component_id + ' has no value for config.' + configName);
    return clone(context.config[configName]);
  }
  if (value.indexOf('$item:') === 0) {
    var itemName = value.slice(6);
    if (!context.item || !Object.prototype.hasOwnProperty.call(context.item, itemName)) fail('SEMANTIC_COMPONENT_CONFIG_MISSING', context.definition.component_id + ' repeated item has no field ' + itemName);
    return clone(context.item[itemName]);
  }
  if (value.indexOf('$member:') === 0) {
    var memberName = value.slice(8);
    if (!context.members[memberName]) fail('SEMANTIC_COMPONENT_MEMBER_MISSING', context.definition.component_id + ' has no generated member ' + memberName);
    return context.instance.target + '.' + context.members[memberName];
  }
  if (value.indexOf('$timer:') === 0) return context.instance.semanticId + '-' + value.slice(7);
  var entityName = value.slice(1);
  if (!context.entities[entityName]) fail('SEMANTIC_COMPONENT_ENTITY_MISSING', context.definition.component_id + ' has no generated entity ' + entityName);
  return context.entities[entityName];
}
function applyTargetMembers(draft, context) {
  var entity = draft.value.entities.filter(function(item) { return item.semanticId === context.instance.target; })[0];
  if (!entity) fail('SEMANTIC_COMPONENT_TARGET_MISSING', context.instance.semanticId + ' target is missing: ' + context.instance.target);
  (context.definition.compiler.implementation.targetMembers || []).forEach(function(spec) {
    var semanticId = context.instance.semanticId + '-' + spec.name;
    if (entity.members.some(function(member) { return member.semanticId === semanticId; })) fail('SEMANTIC_COMPONENT_ID_COLLISION', 'target member already contains generated component id ' + semanticId);
    context.members[spec.name] = semanticId;
    draftApi.execute(draft, { type: 'member', entity: context.instance.target, semanticId: semanticId, roles: clone(spec.roles), value: materialize(spec.value, context), bindings: [] });
  });
}
function ensureUnused(source, collection, semanticId) {
  var used = false;
  function visit(events) { (events || []).forEach(function(event) { if (event.semanticId === semanticId) used = true; visit(event.children); }); }
  if (collection === 'events') visit(source.events);
  else used = (source[collection] || []).some(function(item) { return item.semanticId === semanticId; });
  if (used) fail('SEMANTIC_COMPONENT_ID_COLLISION', collection + ' already contains generated component id ' + semanticId);
}
function applyBehaviorRequirements(draft, context) {
  var kinds = context.definition.compiler.implementation.targetBehaviors || [];
  if (!kinds.length) return;
  var entity = draft.value.entities.filter(function(item) { return item.semanticId === context.instance.target; })[0];
  if (!entity) fail('SEMANTIC_COMPONENT_TARGET_MISSING', context.instance.semanticId + ' target is missing: ' + context.instance.target);
  var refs = draft.references.resolveBehaviorKinds(kinds);
  refs.forEach(function(reference) { if (entity.behaviorTypeRefs.indexOf(reference) < 0) entity.behaviorTypeRefs.push(reference); });
}
function applyEntities(draft, context) {
  (context.definition.compiler.implementation.entities || []).forEach(function(spec) {
    var semanticId = generatedId(context.instance, spec.name);
    ensureUnused(draft.value, 'entities', semanticId);
    context.entities[spec.name] = semanticId;
    draftApi.execute(draft, { type: 'entity', semanticId: semanticId, roles: clone(spec.roles), kind: spec.kind, behaviors: clone(spec.behaviors || []) });
  });
}
function applyLayouts(draft, context) {
  (context.definition.compiler.implementation.layouts || []).forEach(function(spec) {
    var subject = context.entities[spec.entity];
    if (!subject) fail('SEMANTIC_COMPONENT_ENTITY_MISSING', context.definition.component_id + ' layout references unknown entity ' + spec.entity);
    var semanticId = generatedId(context.instance, 'layout-' + spec.entity);
    ensureUnused(draft.value, 'layoutIntents', semanticId);
    var layoutRef = context.config[spec.config];
    draftApi.execute(draft, { type: 'layout', semanticId: semanticId, roles: ['ui', 'component'], subject: subject, bounds: materialize(spec.bounds, context), relations: [{ semanticId: semanticId + '-placement', layout: draft.references.layoutHandle(layoutRef), subjects: [subject] }], bindings: [] });
    context.generatedLayouts.push({ semanticId: semanticId, subject: subject });
  });
}
function operationUse(spec, context) {
  if (spec.use) return spec.use;
  if (spec.useByConfig) {
    var value = context.config[spec.useByConfig];
    if (!spec.uses || !spec.uses[value]) fail('SEMANTIC_COMPONENT_CONFIG_INVALID', context.definition.component_id + ' has no operation for config.' + spec.useByConfig + '=' + value);
    return spec.uses[value];
  }
  fail('SEMANTIC_COMPONENT_BLUEPRINT_INVALID', context.definition.component_id + ' operation has no use');
}
function applyOperation(draft, context, eventId, spec, type) {
  if (spec.binding || spec.itemBindingRef) {
    var bindingName = spec.binding || context.item && context.item[spec.itemBindingRef];
    var binding = bindingName && context.instance.bindings[bindingName];
    if (!binding && spec.optional) return null;
    if (!binding) fail('SEMANTIC_COMPONENT_BINDING_MISSING', context.definition.component_id + ' requires binding ' + bindingName);
    return draftApi.execute(draft, Object.assign({ type: type, event: eventId, use: binding.use }, materialize(binding.arguments || {}, context)));
  }
  return draftApi.execute(draft, Object.assign({ type: type, event: eventId, use: operationUse(spec, context) }, materialize(spec.arguments || {}, context)));
}
function applyEvents(draft, context) {
  (context.definition.compiler.implementation.events || []).filter(function(spec) { return enabled(spec, context.config); }).forEach(function(spec) {
    var repeated = spec.repeatConfig ? context.config[spec.repeatConfig] : [null];
    if (!Array.isArray(repeated)) fail('SEMANTIC_COMPONENT_CONFIG_INVALID', context.definition.component_id + ' repeatConfig must reference a list: ' + spec.repeatConfig);
    repeated.forEach(function(item, index) {
      var eventContext = Object.assign({}, context, { item: item, itemIndex: index });
      var suffix = spec.name + (spec.repeatConfig ? '-' + index : '');
      var semanticId = generatedId(context.instance, suffix);
      ensureUnused(draft.value, 'events', semanticId);
      draftApi.execute(draft, { type: 'event', semanticId: semanticId, kind: spec.kind, locals: {} });
      (spec.conditions || []).filter(function(operation) { return enabled(operation, context.config); }).forEach(function(operation) { applyOperation(draft, eventContext, semanticId, operation, 'when'); });
      (spec.actions || []).filter(function(operation) { return enabled(operation, context.config); }).forEach(function(operation) { applyOperation(draft, eventContext, semanticId, operation, 'then'); });
    });
  });
}
function generatedEventIds(definition, instance, config) {
  var ids = [];
  (definition.compiler.implementation.events || []).filter(function(spec) { return enabled(spec, config); }).forEach(function(spec) {
    var count = spec.repeatConfig ? config[spec.repeatConfig].length : 1;
    for (var index = 0; index < count; index++) ids.push(generatedId(instance, spec.name + (spec.repeatConfig ? '-' + index : '')));
  });
  return ids;
}

function expand(source, options) {
  options = options || {};
  var index = options.index || dictionary.loadIndex();
  var valid = sourceContract.validateSource(source, { index: index });
  var references = options.references || referenceRuntime.create(index);
  var originalHash = sourceContract.sourceHash(valid);
  var realized = clone(valid); realized.components = [];
  var draft = draftApi.create(references, realized);
  var evidence = [];
  valid.components.forEach(function(instance) {
    var definition = dictionary.resolveComponent(index, instance.componentRef);
    var context = { definition: definition, instance: instance, config: effectiveConfig(definition, instance), entities: Object.create(null), members: Object.create(null), generatedLayouts: [], item: null };
    applyTargetMembers(draft, context);
    applyBehaviorRequirements(draft, context);
    applyEntities(draft, context);
    applyLayouts(draft, context);
    applyEvents(draft, context);
    evidence.push({ semanticId: instance.semanticId, componentRef: instance.componentRef, target: instance.target, resolvedConfig: clone(context.config), generatedMembers: Object.keys(context.members).map(function(name) { return context.members[name]; }), generatedEntities: Object.keys(context.entities).map(function(name) { return context.entities[name]; }), generatedLayouts: clone(context.generatedLayouts), generatedEvents: generatedEventIds(definition, instance, context.config) });
  });
  realized = sourceContract.validateSource(draftApi.materialize(draft), { index: index });
  var realizedSourceHash = sourceContract.sourceHash(realized);
  var result = { schemaVersion: 1, documentKind: 'semantic-component-expansion', sourceHash: originalHash, realizedSourceHash: realizedSourceHash, dictionarySource: clone(valid.dictionarySource), components: evidence };
  result.contentHash = hash(result);
  compilationSources.set(result, realized);
  return result;
}

function compilationSource(expansion) {
  var source = compilationSources.get(expansion);
  if (!source) fail('SEMANTIC_COMPONENT_EXPANSION_INVALID', 'Compilation source is available only for a live component expansion result');
  return source;
}

module.exports = { expand: expand, _compilationSource: compilationSource };
