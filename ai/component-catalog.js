var fs = require('fs');
var path = require('path');

var COMPONENTS_DIR = path.join(__dirname, 'components');
var COMPONENT_KINDS = ['ability', 'control', 'system', 'ui'];
var CONFIG_TYPES = ['enum', 'number', 'text', 'layout', 'layout-choice', 'color', 'list', 'object', 'binding-ref'];
var BINDING_KINDS = ['action', 'condition'];

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function object(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(label + ' must be an object'); return value; }
function array(value, label) { if (!Array.isArray(value)) throw new Error(label + ' must be an array'); return value; }
function text(value, label) { if (typeof value !== 'string' || !value.trim()) throw new Error(label + ' must be non-empty text'); return value.trim(); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function unique(left, right) {
  var seen = Object.create(null);
  return (left || []).concat(right || []).filter(function(item) { var key = JSON.stringify(item); if (seen[key]) return false; seen[key] = true; return true; }).map(clone);
}
function mergeObject(left, right) { return Object.assign({}, clone(left || {}), clone(right || {})); }
function assertLlm2Text(value, label) {
  if (/gdjs:\/\/|gc-component:\/\/|runtime[-_ ]adapter|\b[a-z]+\.[a-z0-9_]+\b/i.test(String(value || ''))) throw new Error(label + ' contains prohibited machine/backend form');
}
function only(value, fields, label) { Object.keys(value).forEach(function(field) { if (fields.indexOf(field) < 0) throw new Error(label + ' contains unknown field: ' + field); }); }

function mergeImplementation(parent, child) {
  parent = parent || {}; child = child || {};
  return {
    targetMembers: unique(parent.targetMembers, child.targetMembers),
    targetBehaviors: unique(parent.targetBehaviors, child.targetBehaviors),
    entities: unique(parent.entities, child.entities),
    layouts: unique(parent.layouts, child.layouts),
    events: unique(parent.events, child.events)
  };
}

function mergeManifest(parent, child) {
  if (!parent) return clone(child);
  var merged = mergeObject(parent, child);
  merged.id = child.id;
  merged.extends = clone(child.extends || []);
  merged.abstract = child.abstract === true;
  merged.config = mergeObject(parent.config, child.config);
  merged.bindings = mergeObject(parent.bindings, child.bindings);
  merged.namedBindings = child.namedBindings ? clone(child.namedBindings) : clone(parent.namedBindings || null);
  merged.implementation = mergeImplementation(parent.implementation, child.implementation);
  return merged;
}

function parentIds(manifest) { return manifest.extends ? (Array.isArray(manifest.extends) ? manifest.extends : [manifest.extends]) : []; }
function resolve(rawById, id, resolved, stack) {
  if (resolved[id]) return resolved[id];
  if (!rawById[id]) throw new Error('Unknown component parent: ' + id);
  stack = stack || [];
  if (stack.indexOf(id) >= 0) throw new Error('Component inheritance cycle: ' + stack.concat([id]).join(' -> '));
  var merged = null;
  parentIds(rawById[id]).forEach(function(parentId) { merged = mergeManifest(merged, resolve(rawById, parentId, resolved, stack.concat([id]))); });
  merged = mergeManifest(merged, rawById[id]);
  resolved[id] = merged;
  return merged;
}

function validateConfig(component, name, descriptor, path) {
  path = path || component.id + '.config.' + name;
  object(descriptor, path);
  if (CONFIG_TYPES.indexOf(descriptor.type) < 0) throw new Error(path + ' has invalid type');
  if (descriptor.type === 'enum' || descriptor.type === 'layout-choice') {
    array(descriptor.values, path + '.values');
    if (!descriptor.values.length || new Set(descriptor.values).size !== descriptor.values.length) throw new Error(path + ' needs unique enum values');
    if (descriptor.default !== undefined && descriptor.values.indexOf(descriptor.default) < 0) throw new Error(path + ' default is outside enum values');
  }
  if (descriptor.type === 'number' && descriptor.default !== undefined && (typeof descriptor.default !== 'number' || !isFinite(descriptor.default))) throw new Error(path + ' default must be finite');
  if (descriptor.type === 'number' && descriptor.minimum !== undefined && (typeof descriptor.minimum !== 'number' || !isFinite(descriptor.minimum))) throw new Error(path + ' minimum must be finite');
  if (descriptor.type === 'number' && descriptor.maximum !== undefined && (typeof descriptor.maximum !== 'number' || !isFinite(descriptor.maximum))) throw new Error(path + ' maximum must be finite');
  if (descriptor.type === 'number' && descriptor.minimum !== undefined && descriptor.maximum !== undefined && descriptor.minimum > descriptor.maximum) throw new Error(path + ' minimum exceeds maximum');
  if (descriptor.type === 'number' && descriptor.default !== undefined && descriptor.minimum !== undefined && descriptor.default < descriptor.minimum) throw new Error(path + ' default is below minimum');
  if (descriptor.type === 'number' && descriptor.default !== undefined && descriptor.maximum !== undefined && descriptor.default > descriptor.maximum) throw new Error(path + ' default is above maximum');
  if ((descriptor.type === 'text' || descriptor.type === 'layout' || descriptor.type === 'layout-choice' || descriptor.type === 'color') && descriptor.default !== undefined && typeof descriptor.default !== 'string') throw new Error(path + ' default must be text');
  if (descriptor.type === 'list') {
    validateConfig(component, name + '[]', object(descriptor.item, path + '.item'), path + '.item');
    if (descriptor.minItems !== undefined && (!Number.isInteger(descriptor.minItems) || descriptor.minItems < 0)) throw new Error(path + '.minItems must be a non-negative integer');
    if (descriptor.default !== undefined && !Array.isArray(descriptor.default)) throw new Error(path + ' default must be a list');
  }
  if (descriptor.type === 'object') {
    object(descriptor.fields, path + '.fields');
    Object.keys(descriptor.fields).forEach(function(field) { validateConfig(component, field, descriptor.fields[field], path + '.fields.' + field); });
  }
  if (descriptor.type === 'binding-ref' && BINDING_KINDS.indexOf(descriptor.bindingKind) < 0) throw new Error(path + ' bindingKind must be action or condition');
  if (descriptor.required === true && descriptor.default !== undefined) throw new Error(path + ' cannot be required and defaulted');
  if (descriptor.summary) assertLlm2Text(descriptor.summary, path + '.summary');
}
function blueprintUse(use, kind, label) {
  var operation = require('./semantic-event-algebra').operationForUse(text(use, label + '.use'));
  if (!operation || operation.kind !== kind) throw new Error(label + ' must use one declared semantic ' + kind);
}
function blueprintArguments(use, kind, argumentsValue, label) {
  try { require('./semantic-event-algebra').validateOperationArguments(use, kind, argumentsValue); }
  catch (error) { throw new Error(label + ' has invalid arguments: ' + error.message); }
}
function blueprintValue(value, context, label) {
  if (Array.isArray(value)) { value.forEach(function(item, index) { blueprintValue(item, context, label + '[' + index + ']'); }); return; }
  if (value && typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, '$configNumber')) {
      only(value, ['$configNumber', 'multiply', 'add'], label); var descriptor = context.config[value.$configNumber];
      if (!descriptor || descriptor.type !== 'number') throw new Error(label + ' references non-number config: ' + value.$configNumber);
      ['multiply', 'add'].forEach(function(field) { if (value[field] !== undefined && (typeof value[field] !== 'number' || !isFinite(value[field]))) throw new Error(label + '.' + field + ' must be finite'); }); return;
    }
    Object.keys(value).forEach(function(field) { blueprintValue(value[field], context, label + '.' + field); }); return;
  }
  if (typeof value !== 'string' || value[0] !== '$') return;
  if (value === '$target') return;
  var match = /^\$(config|item|member|timer):(.+)$/.exec(value);
  if (match) {
    var name = match[2];
    if (match[1] === 'config' && !context.config[name]) throw new Error(label + ' references unknown config: ' + name);
    if (match[1] === 'item' && !context.itemFields[name]) throw new Error(label + ' references unknown repeated field: ' + name);
    if (match[1] === 'member' && !context.members[name]) throw new Error(label + ' references unknown target member: ' + name);
    if (match[1] === 'timer' && !name.trim()) throw new Error(label + ' has an empty timer name');
    return;
  }
  if (!context.entities[value.slice(1)]) throw new Error(label + ' references unknown generated entity: ' + value);
}
function blueprintGate(gate, context, label) {
  if (!gate) return; object(gate, label); only(gate, ['name', 'values'], label);
  var descriptor = context.config[gate.name];
  if (!descriptor || descriptor.type !== 'enum') throw new Error(label + ' must reference enum config');
  array(gate.values, label + '.values').forEach(function(value) { if (descriptor.values.indexOf(value) < 0) throw new Error(label + ' contains value outside config domain'); });
}
function blueprintOperation(spec, kind, context, label) {
  object(spec, label); only(spec, ['use', 'useByConfig', 'uses', 'binding', 'itemBindingRef', 'optional', 'arguments', 'whenConfigIn'], label);
  var selectors = ['use', 'useByConfig', 'binding', 'itemBindingRef'].filter(function(field) { return spec[field] !== undefined; });
  if (selectors.length !== 1) throw new Error(label + ' requires exactly one operation selector');
  var argumentsValue = object(spec.arguments || {}, label + '.arguments');
  if (spec.use) { blueprintUse(spec.use, kind, label); blueprintArguments(spec.use, kind, argumentsValue, label); }
  if (spec.useByConfig) {
    var descriptor = context.config[spec.useByConfig]; object(spec.uses, label + '.uses');
    if (!descriptor || descriptor.type !== 'enum') throw new Error(label + '.useByConfig must reference enum config');
    only(spec.uses, descriptor.values, label + '.uses');
    descriptor.values.forEach(function(value) { if (!spec.uses[value]) throw new Error(label + '.uses is missing ' + value); blueprintUse(spec.uses[value], kind, label + '.uses.' + value); blueprintArguments(spec.uses[value], kind, argumentsValue, label + '.uses.' + value); });
  }
  if (spec.binding) { var binding = context.bindings[spec.binding]; if (!binding || binding.kind !== kind) throw new Error(label + ' references unknown ' + kind + ' binding: ' + spec.binding); }
  if (spec.itemBindingRef) { var item = context.itemFields[spec.itemBindingRef]; if (!item || item.type !== 'binding-ref' || item.bindingKind !== kind) throw new Error(label + ' references unknown repeated ' + kind + ' binding: ' + spec.itemBindingRef); }
  if ((spec.binding || spec.itemBindingRef) && Object.keys(argumentsValue).length) throw new Error(label + ' binding selector receives arguments from the component instance');
  if (spec.optional !== undefined && typeof spec.optional !== 'boolean') throw new Error(label + '.optional must be boolean');
  blueprintGate(spec.whenConfigIn, context, label + '.whenConfigIn');
  blueprintValue(argumentsValue, context, label + '.arguments');
}
function validateImplementation(component) {
  var implementation = component.implementation, algebra = require('./semantic-event-algebra');
  var context = { config: component.config, bindings: component.bindings, members: Object.create(null), entities: Object.create(null), itemFields: Object.create(null) };
  implementation.targetMembers.forEach(function(spec, index) { object(spec, component.id + '.implementation.targetMembers[' + index + ']'); only(spec, ['name', 'roles', 'value'], component.id + '.implementation.targetMembers[' + index + ']'); var name = text(spec.name, 'target member name'); if (context.members[name]) throw new Error(component.id + ' has duplicate target member ' + name); context.members[name] = true; array(spec.roles, 'target member roles'); if (!spec.roles.length || spec.value === undefined) throw new Error(component.id + ' target member is incomplete'); });
  implementation.targetMembers.forEach(function(spec, index) { blueprintValue(spec.value, context, component.id + '.implementation.targetMembers[' + index + '].value'); });
  implementation.targetBehaviors.forEach(function(kind) { if (!algebra.BEHAVIOR_KINDS[kind]) throw new Error(component.id + ' has unknown target behavior: ' + kind); });
  implementation.entities.forEach(function(spec, index) { object(spec, component.id + '.implementation.entities[' + index + ']'); only(spec, ['name', 'kind', 'roles', 'behaviors'], component.id + '.implementation.entities[' + index + ']'); var name = text(spec.name, 'generated entity name'); if (context.entities[name]) throw new Error(component.id + ' has duplicate generated entity ' + name); if (!algebra.ENTITY_KINDS[spec.kind]) throw new Error(component.id + ' has unknown entity kind: ' + spec.kind); array(spec.roles, 'generated entity roles'); context.entities[name] = true; });
  implementation.layouts.forEach(function(spec, index) { var label = component.id + '.implementation.layouts[' + index + ']'; object(spec, label); only(spec, ['entity', 'config', 'bounds'], label); if (!context.entities[spec.entity]) throw new Error(component.id + ' layout references unknown entity: ' + spec.entity); var descriptor = context.config[spec.config]; if (!descriptor || ['layout', 'layout-choice'].indexOf(descriptor.type) < 0) throw new Error(component.id + ' layout references non-layout config: ' + spec.config); object(spec.bounds, label + '.bounds'); only(spec.bounds, ['width', 'height'], label + '.bounds'); ['width', 'height'].forEach(function(name) { if (spec.bounds[name] === undefined) throw new Error(label + '.bounds requires ' + name); blueprintValue(spec.bounds[name], context, label + '.bounds.' + name); }); });
  var eventNames = Object.create(null);
  implementation.events.forEach(function(spec, index) {
    var label = component.id + '.implementation.events[' + index + ']'; object(spec, label); only(spec, ['name', 'kind', 'repeatConfig', 'whenConfigIn', 'conditions', 'actions'], label);
    var name = text(spec.name, label + '.name'); if (eventNames[name]) throw new Error(component.id + ' has duplicate event blueprint name: ' + name); eventNames[name] = true;
    if (!algebra.EVENT_KINDS[spec.kind]) throw new Error(label + ' has unknown event kind: ' + spec.kind);
    var eventContext = Object.assign({}, context, { itemFields: Object.create(null) });
    if (spec.repeatConfig) { var repeated = context.config[spec.repeatConfig]; if (!repeated || repeated.type !== 'list' || repeated.item.type !== 'object') throw new Error(label + '.repeatConfig must reference a list of objects'); eventContext.itemFields = repeated.item.fields; }
    blueprintGate(spec.whenConfigIn, eventContext, label + '.whenConfigIn');
    array(spec.conditions || [], label + '.conditions').forEach(function(operation, position) { blueprintOperation(operation, 'condition', eventContext, label + '.conditions[' + position + ']'); });
    array(spec.actions || [], label + '.actions').forEach(function(operation, position) { blueprintOperation(operation, 'action', eventContext, label + '.actions[' + position + ']'); });
  });
}

function validateManifest(component, sourceFile) {
  var manifestFields = ['schemaVersion', 'id', 'kind', 'name', 'summary', 'abstract', 'extends', 'target', 'config', 'bindings', 'namedBindings', 'implementation', 'sourceFile'];
  Object.keys(component).forEach(function(field) { if (manifestFields.indexOf(field) < 0) throw new Error(sourceFile + ' contains unknown component field: ' + field); });
  if (component.schemaVersion !== 3) throw new Error(sourceFile + ' unsupported component schemaVersion');
  if (!/^[a-z][a-z0-9]*(\.[a-z0-9_]+)+$/.test(component.id || '')) throw new Error(sourceFile + ' invalid component id');
  if (COMPONENT_KINDS.indexOf(component.kind) < 0) throw new Error(sourceFile + ' invalid component kind');
  text(component.name, component.id + '.name');
  text(component.summary, component.id + '.summary');
  assertLlm2Text(component.name + '\n' + component.summary, component.id);
  object(component.target || {}, component.id + '.target');
  object(component.config, component.id + '.config');
  Object.keys(component.config).forEach(function(name) { validateConfig(component, name, component.config[name]); });
  object(component.bindings, component.id + '.bindings');
  Object.keys(component.bindings).forEach(function(name) {
    var binding = object(component.bindings[name], component.id + '.bindings.' + name);
    if (BINDING_KINDS.indexOf(binding.kind) < 0) throw new Error(component.id + '.bindings.' + name + ' has invalid kind');
    if (binding.summary) assertLlm2Text(binding.summary, component.id + '.bindings.' + name + '.summary');
  });
  if (component.namedBindings) {
    var named = object(component.namedBindings, component.id + '.namedBindings');
    Object.keys(named).forEach(function(field) { if (['kinds', 'requireReferenced', 'summary'].indexOf(field) < 0) throw new Error(component.id + '.namedBindings contains unknown field: ' + field); });
    array(named.kinds, component.id + '.namedBindings.kinds').forEach(function(kind) { if (BINDING_KINDS.indexOf(kind) < 0) throw new Error(component.id + '.namedBindings has invalid kind'); });
    if (!named.kinds.length || new Set(named.kinds).size !== named.kinds.length) throw new Error(component.id + '.namedBindings needs unique kinds');
    if (named.requireReferenced !== undefined && typeof named.requireReferenced !== 'boolean') throw new Error(component.id + '.namedBindings.requireReferenced must be boolean');
    if (named.summary) assertLlm2Text(named.summary, component.id + '.namedBindings.summary');
  }
  var implementation = object(component.implementation, component.id + '.implementation');
  ['targetMembers', 'targetBehaviors', 'entities', 'layouts', 'events'].forEach(function(field) { array(implementation[field], component.id + '.implementation.' + field); });
  if (!component.abstract && !(implementation.targetMembers.length || implementation.entities.length || implementation.events.length || implementation.targetBehaviors.length)) throw new Error(component.id + ' has no deterministic implementation');
  validateImplementation(component);
}

function isLlm2Exposed(component) { return !!component && component.abstract !== true; }
function aiView(component) {
  if (!isLlm2Exposed(component)) return null;
  return {
    name: component.name,
    summary: component.summary,
    target: clone(component.target || {}),
    config: clone(component.config || {}),
    bindings: clone(component.bindings || {}),
    namedBindings: clone(component.namedBindings || null)
  };
}
function compilerView(component) { return clone(component); }

function loadComponentCatalog(dir) {
  dir = dir || COMPONENTS_DIR;
  var rawById = Object.create(null);
  fs.readdirSync(dir).filter(function(file) { return /\.json$/i.test(file); }).sort().forEach(function(file) {
    var manifest = readJson(path.join(dir, file));
    if (!manifest.id || rawById[manifest.id]) throw new Error(file + ' has missing or duplicate component id');
    manifest.sourceFile = file;
    rawById[manifest.id] = manifest;
  });
  var resolved = Object.create(null);
  var catalog = { schemaVersion: 3, sourceDir: dir, components: [], byId: Object.create(null) };
  Object.keys(rawById).sort().forEach(function(id) {
    var component = resolve(rawById, id, resolved);
    component.sourceFile = rawById[id].sourceFile;
    validateManifest(component, component.sourceFile);
    catalog.components.push(component); catalog.byId[id] = component;
  });
  return catalog;
}

function getComponent(catalog, id) { return catalog.byId[id] || null; }
module.exports = {
  COMPONENTS_DIR: COMPONENTS_DIR,
  loadComponentCatalog: loadComponentCatalog,
  validateManifest: validateManifest,
  getComponent: getComponent,
  compilerView: compilerView,
  isLlm2Exposed: isLlm2Exposed,
  aiView: aiView
};
