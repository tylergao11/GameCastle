var crypto = require('crypto');
var semanticAlgebra = require('./semantic-event-algebra');
var syntax = require('./semantic-dsl-syntax');

var SCHEMA_VERSION = 8;
var DOCUMENT_KIND = 'semantic-task-plan';
var LANGUAGE_ID = syntax.LANGUAGE_ID;
var PLAN_COMMANDS = syntax.PLAN_COMMANDS;
var TARGET_KINDS = syntax.TARGET_KINDS;
var TARGET_INTENTS = syntax.TARGET_INTENTS;
var EVENT_FACETS = syntax.EVENT_FACETS;
var CATALOGS = ['entity-kinds', 'behavior-kinds', 'event-kinds', 'layouts', 'asset-families', 'asset-styles', 'component-library'];
var RETRIEVE_CATALOG = 'extension-groups';
var PLANNER_CATALOGS = CATALOGS.concat([RETRIEVE_CATALOG]);
var RETRIEVE_KINDS = syntax.RETRIEVE_KINDS;
var REMOVABLE_KINDS = ['entity-record', 'component', 'event', 'asset', 'layout'];
var DERIVED_CATALOGS_BY_TARGET = Object.freeze({
  'entity-record': Object.freeze(['entity-kinds', 'behavior-kinds']),
  'event#metadata': Object.freeze(['event-kinds']),
  component: Object.freeze(['component-library']),
  asset: Object.freeze(['asset-families', 'asset-styles']),
  layout: Object.freeze(['layouts'])
});
var DERIVED_CATALOG_LINES = Object.freeze(Object.keys(DERIVED_CATALOGS_BY_TARGET).map(function(target) { return target + '=>catalogs(' + DERIVED_CATALOGS_BY_TARGET[target].join(',') + ')'; }));

function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'SemanticTaskPlan'; throw error; }
function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, Object.create(null)); return value; }
function digest(value, prefix) { return prefix + crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0, 24); }
function object(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('SEMANTIC_TASK_PLAN_INVALID', label + ' must be a structure.'); return value; }
function array(value, label) { if (!Array.isArray(value)) fail('SEMANTIC_TASK_PLAN_INVALID', label + ' must be an array.'); return value; }
function text(value, label) { if (typeof value !== 'string' || !value.trim()) fail('SEMANTIC_TASK_PLAN_INVALID', label + ' must be a non-empty string.'); return value.trim(); }
function id(value, label) { value = text(value, label); if (!/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(value)) fail('SEMANTIC_TASK_PLAN_INVALID', label + ' must be a semantic id.'); return value; }
function allowed(value, fields, label) { Object.keys(value).forEach(function(key) { if (fields.indexOf(key) < 0) fail('SEMANTIC_TASK_PLAN_UNKNOWN_FIELD', label + ' contains unknown field: ' + key); }); }
function required(value, fields, label) { fields.forEach(function(field) { if (!Object.prototype.hasOwnProperty.call(value, field)) fail('SEMANTIC_TASK_PLAN_FIELD_REQUIRED', label + ' requires field: ' + field); }); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.keys(value).forEach(function(key) { deepFreeze(value[key]); }); return Object.freeze(value); }
function orderIndex(values, value) { return values.indexOf(value); }

function normalizeUniqueStrings(value, label, validator, order) {
  var seen = Object.create(null);
  var normalized = array(value, label).map(function(item, position) {
    var result = validator(item, label + '[' + position + ']');
    if (seen[result]) fail('SEMANTIC_TASK_PLAN_DUPLICATE', label + ' duplicates ' + result + '.');
    seen[result] = true;
    return result;
  });
  normalized.sort(order || function(left, right) { return left.localeCompare(right); });
  return normalized;
}

function normalizeTarget(value, label) {
  object(value, label);
  required(value, ['kind', 'semanticId', 'intent'], label);
  allowed(value, ['kind', 'semanticId', 'owner', 'facets', 'intent'], label);
  var kind = text(value.kind, label + '.kind');
  if (TARGET_KINDS.indexOf(kind) < 0) fail('SEMANTIC_TASK_TARGET_INVALID', label + '.kind is not a semantic target kind: ' + kind);
  var intent = text(value.intent, label + '.intent');
  if (TARGET_INTENTS.indexOf(intent) < 0) fail('SEMANTIC_TASK_TARGET_INVALID', label + '.intent must be create, update, or delete.');
  if (intent === 'delete' && REMOVABLE_KINDS.indexOf(kind) < 0) fail('SEMANTIC_TASK_TARGET_INVALID', label + ' cannot delete a ' + kind + ' through the current semantic DSL.');
  var target = { kind: kind, semanticId: id(value.semanticId, label + '.semanticId'), intent: intent };
  if (kind === 'member') {
    if (!Object.prototype.hasOwnProperty.call(value, 'owner')) fail('SEMANTIC_TASK_TARGET_INVALID', label + '.owner is required for a member target.');
    target.owner = id(value.owner, label + '.owner');
  } else if (Object.prototype.hasOwnProperty.call(value, 'owner')) fail('SEMANTIC_TASK_TARGET_INVALID', label + '.owner is only valid for a member target.');
  if (kind === 'event' && intent !== 'delete') {
    if (!Object.prototype.hasOwnProperty.call(value, 'facets')) fail('SEMANTIC_TASK_TARGET_INVALID', label + '.facets is required for an event create or update target.');
    target.facets = normalizeUniqueStrings(value.facets, label + '.facets', function(item, itemLabel) {
      var facet = text(item, itemLabel);
      if (EVENT_FACETS.indexOf(facet) < 0) fail('SEMANTIC_TASK_TARGET_INVALID', itemLabel + ' is not an event facet: ' + facet);
      return facet;
    }, function(left, right) { return orderIndex(EVENT_FACETS, left) - orderIndex(EVENT_FACETS, right); });
    if (!target.facets.length) fail('SEMANTIC_TASK_TARGET_INVALID', label + '.facets requires at least one event facet.');
    if (intent === 'create' && target.facets.indexOf('metadata') < 0 && target.facets.length > 1) fail('SEMANTIC_TASK_TARGET_INVALID', label + ' cannot create multiple event facets without metadata; split existing-event facet creation into exact targets.');
  } else if (Object.prototype.hasOwnProperty.call(value, 'facets')) fail('SEMANTIC_TASK_TARGET_INVALID', label + '.facets is only valid for a non-delete event target.');
  return target;
}

function normalizeSlot(value, label) {
  object(value, label);
  required(value, ['slot', 'kind', 'semanticId', 'intent'], label);
  allowed(value, ['slot', 'kind', 'semanticId', 'owner', 'facets', 'intent'], label);
  var slot = { slot: id(value.slot, label + '.slot'), kind: text(value.kind, label + '.kind'), semanticId: id(value.semanticId, label + '.semanticId'), intent: text(value.intent, label + '.intent') };
  if (TARGET_KINDS.indexOf(slot.kind) < 0) fail('SEMANTIC_TASK_TARGET_INVALID', label + '.kind is not a semantic target kind: ' + slot.kind);
  if (TARGET_INTENTS.indexOf(slot.intent) < 0) fail('SEMANTIC_TASK_TARGET_INVALID', label + '.intent must be read, create, update, or delete.');
  if (slot.intent === 'delete' && REMOVABLE_KINDS.indexOf(slot.kind) < 0) fail('SEMANTIC_TASK_TARGET_INVALID', label + ' cannot delete a ' + slot.kind + '.');
  if (slot.kind === 'member') {
    if (!Object.prototype.hasOwnProperty.call(value, 'owner')) fail('SEMANTIC_TASK_TARGET_INVALID', label + '.owner is required for a member slot.');
    slot.owner = id(value.owner, label + '.owner');
  } else if (Object.prototype.hasOwnProperty.call(value, 'owner')) fail('SEMANTIC_TASK_TARGET_INVALID', label + '.owner is only valid for a member slot.');
  if (slot.kind === 'event' && slot.intent !== 'delete') {
    if (!Object.prototype.hasOwnProperty.call(value, 'facets')) fail('SEMANTIC_TASK_TARGET_INVALID', label + '.facets is required for a non-delete event slot.');
    slot.facets = normalizeUniqueStrings(value.facets, label + '.facets', function(item, itemLabel) {
      var facet = text(item, itemLabel);
      if (EVENT_FACETS.indexOf(facet) < 0) fail('SEMANTIC_TASK_TARGET_INVALID', itemLabel + ' is not an event facet: ' + facet);
      return facet;
    }, function(left, right) { return orderIndex(EVENT_FACETS, left) - orderIndex(EVENT_FACETS, right); });
    if (!slot.facets.length) fail('SEMANTIC_TASK_TARGET_INVALID', label + '.facets requires at least one event facet.');
  } else if (Object.prototype.hasOwnProperty.call(value, 'facets')) fail('SEMANTIC_TASK_TARGET_INVALID', label + '.facets is only valid for a non-delete event slot.');
  return slot;
}

function targetFromSlot(slot) {
  var target = { kind: slot.kind, semanticId: slot.semanticId, intent: slot.intent };
  if (slot.owner) target.owner = slot.owner;
  if (slot.facets) target.facets = slot.facets.slice();
  return target;
}

function targetsForTask(task) { return array(task.slots, 'task ' + task.semanticId + '.slots').map(targetFromSlot); }

function baseTargetKey(target) {
  if (target.kind === 'member') return 'member/' + target.owner + '/' + target.semanticId;
  if (target.kind === 'entity-record') return 'entity/' + target.semanticId;
  return target.kind + '/' + target.semanticId;
}
function targetClaims(target) {
  var base = baseTargetKey(target);
  if (target.kind === 'event' && target.intent !== 'delete') return target.facets.map(function(facet) { return base + '#' + facet; });
  return [base];
}
function targetSortKey(target) { return targetClaims(target).join(',') + '|' + target.intent; }
function conflict(left, right, leftTarget, rightTarget) {
  if (leftTarget.kind === 'game' && rightTarget.kind === 'game') return true;
  if (left === right) return true;
  if (left.indexOf('event/') === 0 && right.indexOf('event/') === 0) {
    var leftBase = left.split('#')[0], rightBase = right.split('#')[0];
    return leftBase === rightBase && (left.indexOf('#') < 0 || right.indexOf('#') < 0);
  }
  if (left.indexOf('entity/') === 0 && right.indexOf('member/') === 0) return leftTarget.intent === 'delete' && right.indexOf('member/' + left.slice('entity/'.length) + '/') === 0;
  if (right.indexOf('entity/') === 0 && left.indexOf('member/') === 0) return rightTarget.intent === 'delete' && left.indexOf('member/' + right.slice('entity/'.length) + '/') === 0;
  return false;
}

function normalizeRetrieve(value, label) {
  object(value, label); required(value, ['group', 'kind'], label); allowed(value, ['group', 'kind'], label);
  var result = { group: id(value.group, label + '.group'), kind: text(value.kind, label + '.kind') };
  if (RETRIEVE_KINDS.indexOf(result.kind) < 0) fail('SEMANTIC_TASK_RETRIEVE_INVALID', label + '.kind is not an extension retrieve kind: ' + result.kind);
  return result;
}
function retrieveKey(value) { return value.group + '/' + value.kind; }
function derivedCatalogsForTarget(target) {
  if (target.intent === 'delete' || target.intent === 'read') return [];
  var key = target.kind === 'event' ? target.facets && target.facets.indexOf('metadata') >= 0 ? 'event#metadata' : null : target.kind;
  return key && DERIVED_CATALOGS_BY_TARGET[key] ? DERIVED_CATALOGS_BY_TARGET[key].slice() : [];
}
function derivedCatalogsForTargets(targets) {
  var found = Object.create(null);
  targets.forEach(function(target) { derivedCatalogsForTarget(target).forEach(function(catalog) { found[catalog] = true; }); });
  return CATALOGS.filter(function(catalog) { return found[catalog]; });
}

function create(commands) {
  array(commands, 'plan commands');
  if (!commands.length) fail('SEMANTIC_TASK_PLAN_EMPTY', 'A semantic task plan requires at least one plan-task command.');
  var builders = Object.create(null), taskOrder = [], taskPosition = Object.create(null), claims = [], planSlots = Object.create(null);
  commands.forEach(function(command, position) {
    var label = 'plan-command[' + position + ']'; object(command, label); required(command, ['type'], label);
    if (PLAN_COMMANDS.indexOf(command.type) < 0) fail('SEMANTIC_TASK_PLAN_COMMAND_INVALID', label + ' is not a current Plan DSL command: ' + command.type);
    syntax.validateCommand(command, 'planner');
    if (command.type !== 'plan-task') return;
    required(command, ['semanticId', 'goal', 'after'], label); allowed(command, ['type', 'semanticId', 'goal', 'after'], label);
    var semanticId = id(command.semanticId, label + '.semanticId');
    if (builders[semanticId]) fail('SEMANTIC_TASK_PLAN_DUPLICATE', 'Task plan duplicates semanticId ' + semanticId + '.');
    taskPosition[semanticId] = taskOrder.length; taskOrder.push(semanticId);
    builders[semanticId] = { semanticId: semanticId, goal: text(command.goal, label + '.goal'), dependsOn: command.after.slice(), slots: [], capabilities: [], retrievals: [] };
  });
  if (!taskOrder.length) fail('SEMANTIC_TASK_PLAN_EMPTY', 'A semantic task plan requires at least one plan-task command.');

  function selected(command, label) {
    var taskId = id(command.task, label + '.task');
    if (!builders[taskId]) fail('SEMANTIC_TASK_MISSING', label + ' names an undeclared task: ' + taskId);
    return builders[taskId];
  }
  commands.forEach(function(command, position) {
    if (command.type === 'plan-task') return;
    var label = command.type + '[' + position + ']', task;
    if (syntax.COMMANDS[command.type].planTarget) {
      task = selected(command, label);
      var targetSlot = { slot: command.slot, kind: syntax.COMMANDS[command.type].planTarget.kind, semanticId: command.semanticId, intent: command.intent };
      if (Object.prototype.hasOwnProperty.call(command, 'owner')) targetSlot.owner = command.owner;
      if (Object.prototype.hasOwnProperty.call(command, 'facets')) targetSlot.facets = command.facets;
      task.slots.push(targetSlot);
    } else if (command.type === 'plan-use') {
      required(command, ['task', 'alias', 'use'], label); allowed(command, ['type', 'task', 'alias', 'use'], label); selected(command, label).capabilities.push({ alias: command.alias, use: command.use });
    } else if (command.type === 'plan-retrieve') {
      required(command, ['task', 'alias', 'group', 'kind'], label); allowed(command, ['type', 'task', 'alias', 'group', 'kind'], label); selected(command, label).retrievals.push({ alias: command.alias, group: command.group, kind: command.kind });
    }
  });

  var tasks = taskOrder.map(function(taskId) {
    var builder = builders[taskId], label = 'task[' + taskId + ']';
    var dependencies = normalizeUniqueStrings(builder.dependsOn, label + '.dependsOn', id);
    dependencies.forEach(function(dependency) { if (!builders[dependency] || dependency === taskId || taskPosition[dependency] >= taskPosition[taskId]) fail('SEMANTIC_TASK_PLAN_DEPENDENCY_INVALID', label + ' after must identify an earlier task: ' + dependency); });
    dependencies.sort(function(left, right) { return taskPosition[left] - taskPosition[right]; });
    var slots = builder.slots.map(function(slotValue, slotPosition) { return normalizeSlot(slotValue, label + '.slots[' + slotPosition + ']'); });
    if (!slots.length) fail('SEMANTIC_TASK_TARGET_INVALID', label + '.slots requires at least one semantic target slot.');
    var localClaims = [];
    slots.forEach(function(slotValue) {
      if (planSlots[slotValue.slot]) fail('SEMANTIC_TASK_PLAN_DUPLICATE', label + ' duplicates plan slot ' + slotValue.slot + '.');
      planSlots[slotValue.slot] = { taskId: taskId, kind: 'target' };
      var targetValue = targetFromSlot(slotValue);
      if (targetValue.intent === 'read') return;
      targetClaims(targetValue).forEach(function(claim) {
        if (localClaims.some(function(existing) { return conflict(existing.claim, claim, existing.target, targetValue); })) fail('SEMANTIC_TASK_PLAN_DUPLICATE', label + ' contains overlapping target claim ' + claim + '.');
        if (claims.some(function(existing) { return conflict(existing.claim, claim, existing.target, targetValue); })) fail('SEMANTIC_TASK_PLAN_TARGET_CONFLICT', label + ' target ' + claim + ' conflicts with task ' + claims.filter(function(existing) { return conflict(existing.claim, claim, existing.target, targetValue); })[0].taskId + '.');
        localClaims.push({ claim: claim, target: targetValue }); claims.push({ claim: claim, target: targetValue, taskId: taskId });
      });
    });
    slots.sort(function(left, right) { return left.slot.localeCompare(right.slot); });
    var capabilities = builder.capabilities.map(function(item, capabilityPosition) {
      var capabilityLabel = label + '.capabilities[' + capabilityPosition + ']';
      var value = { alias: id(item.alias, capabilityLabel + '.alias'), use: id(item.use, capabilityLabel + '.use') };
      if (planSlots[value.alias]) fail('SEMANTIC_TASK_PLAN_DUPLICATE', capabilityLabel + ' duplicates plan name ' + value.alias + '.');
      planSlots[value.alias] = { taskId: taskId, kind: 'capability' };
      return value;
    }).sort(function(left, right) { return left.alias.localeCompare(right.alias); });
    var targets = targetsForTask({ semanticId: taskId, slots: slots });
    var catalogs = derivedCatalogsForTargets(targets);
    var retrieveSeen = Object.create(null);
    var retrievals = builder.retrievals.map(function(item, retrievePosition) {
      var retrievalLabel = label + '.retrievals[' + retrievePosition + ']';
      var normalized = normalizeRetrieve({ group: item.group, kind: item.kind }, retrievalLabel), key = retrieveKey(normalized);
      normalized.alias = id(item.alias, retrievalLabel + '.alias');
      if (planSlots[normalized.alias]) fail('SEMANTIC_TASK_PLAN_DUPLICATE', retrievalLabel + ' duplicates plan name ' + normalized.alias + '.');
      planSlots[normalized.alias] = { taskId: taskId, kind: 'retrieval' };
      if (retrieveSeen[key]) fail('SEMANTIC_TASK_PLAN_DUPLICATE', label + '.retrieves duplicates ' + key + '.');
      retrieveSeen[key] = true; return normalized;
    }).sort(function(left, right) { return retrieveKey(left).localeCompare(retrieveKey(right)); });
    return { semanticId: taskId, goal: builder.goal, dependsOn: dependencies, slots: slots, capabilities: capabilities, catalogs: catalogs, retrievals: retrievals };
  });
  var document = { schemaVersion: SCHEMA_VERSION, documentKind: DOCUMENT_KIND, languageId: LANGUAGE_ID, tasks: tasks };
  document.planHash = planHash(document);
  return deepFreeze(document);
}

function planHash(plan) {
  object(plan, 'task plan');
  var value = clone(plan); delete value.planHash;
  return digest(value, 'semantic-plan.');
}
function documentHash(document) { return digest(document, 'semantic-draft.'); }
function taskById(plan, taskId) {
  var selected = plan && Array.isArray(plan.tasks) && plan.tasks.filter(function(task) { return task.semanticId === taskId; })[0];
  if (!selected) fail('SEMANTIC_TASK_MISSING', 'Task plan is missing active task: ' + taskId);
  return selected;
}

function targetForCommand(command) {
  object(command, 'resolved Draft-write command');
  var type = command.type, target, spec = syntax.COMMANDS[type], rule = spec && spec.target;
  if (rule) {
    if (rule.delete) {
      var collectionKinds = { entities: 'entity-record', components: 'component', events: 'event', assetIntents: 'asset', layoutIntents: 'layout' };
      var kind = collectionKinds[command.collection];
      if (!kind) fail('SEMANTIC_TASK_COMMAND_UNMAPPED', 'remove.collection has no TaskPlan target mapping: ' + command.collection);
      target = { kind: kind, semanticId: id(command.semanticId, 'remove.semanticId'), facet: null, operation: 'delete' };
    } else {
      target = { kind: rule.kind, semanticId: id(command[rule.semanticIdField], type + '.' + rule.semanticIdField), facet: rule.facet || null, operation: 'upsert' };
      if (rule.ownerField) target.owner = id(command[rule.ownerField], type + '.' + rule.ownerField);
    }
  } else fail('SEMANTIC_TASK_COMMAND_UNMAPPED', 'Command is not a Draft-write command owned by a TaskPlan target: ' + type);
  target.claim = target.kind === 'member' ? 'member/' + target.owner + '/' + target.semanticId : target.kind + '/' + target.semanticId + (target.facet ? '#' + target.facet : '');
  return target;
}

function commandMatchesTarget(reference, target) {
  if (reference.kind !== target.kind || reference.semanticId !== target.semanticId || (reference.owner || null) !== (target.owner || null)) return false;
  if (target.intent === 'read') return false;
  if (reference.operation === 'delete') return target.intent === 'delete';
  if (target.intent === 'delete') return false;
  return reference.kind !== 'event' || target.facets.indexOf(reference.facet) >= 0;
}

function dependencyClosure(plan, task) {
  var visible = Object.create(null);
  function add(taskId) {
    if (visible[taskId]) return;
    visible[taskId] = true;
    taskById(plan, taskId).dependsOn.forEach(add);
  }
  add(task.semanticId);
  return visible;
}
function visibleTargetSlot(plan, task, slotId, expectedKind) {
  var visible = dependencyClosure(plan, task), found = null;
  plan.tasks.forEach(function(candidate) {
    if (!visible[candidate.semanticId]) return;
    candidate.slots.forEach(function(slot) { if (slot.slot === slotId) found = slot; });
  });
  if (!found) fail('SEMANTIC_TASK_SLOT_MISSING', 'Task ' + task.semanticId + ' cannot reference target slot ' + slotId + '.');
  if (expectedKind && found.kind !== expectedKind) fail('SEMANTIC_TASK_SLOT_KIND_INVALID', 'Slot ' + slotId + ' must identify ' + expectedKind + ', received ' + found.kind + '.');
  return found;
}
function slotReference(slot) {
  if (slot.kind === 'member') return slot.owner + '.' + slot.semanticId;
  return slot.semanticId;
}
function resolveOperationArguments(plan, task, use, command) {
  var operation = semanticAlgebra.operationForUse(use);
  if (!operation) return;
  function resolveValue(type, value, label) {
    if (type === 'entity') return slotReference(visibleTargetSlot(plan, task, id(value, label), 'entity-record'));
    if (type === 'Entity.member') return slotReference(visibleTargetSlot(plan, task, id(value, label), 'member'));
    if (value && typeof value === 'object' && !Array.isArray(value) && typeof value.use === 'string') {
      var expressionCapability = task.capabilities.filter(function(item) { return item.alias === value.use; })[0];
      if (!expressionCapability) fail('SEMANTIC_TASK_CAPABILITY_ALIAS_MISSING', label + ' expression has no capability alias ' + value.use + '.');
      var expression = semanticAlgebra.operationForUse(expressionCapability.use);
      var resolved = clone(value); resolved.use = expressionCapability.use;
      if (expression) Object.keys(expression.fields || {}).forEach(function(name) { if (Object.prototype.hasOwnProperty.call(resolved, name)) resolved[name] = resolveValue(expression.fields[name], resolved[name], label + '.' + name); });
      return resolved;
    }
    return value;
  }
  var sources = [];
  if (command.arguments && typeof command.arguments === 'object' && !Array.isArray(command.arguments)) sources.push(command.arguments);
  sources.push(command);
  Object.keys(operation.fields || {}).forEach(function(name) {
    var container = sources.filter(function(candidate) { return Object.prototype.hasOwnProperty.call(candidate, name); })[0];
    if (!container) return;
    var type = operation.fields[name];
    container[name] = resolveValue(type, container[name], command.type + '.' + name);
  });
}
function resolveComponentBindings(task, command) {
  if (!command.bindings || typeof command.bindings !== 'object' || Array.isArray(command.bindings)) return;
  Object.keys(command.bindings).forEach(function(name) {
    var binding = command.bindings[name];
    if (!binding || typeof binding !== 'object' || Array.isArray(binding)) return;
    if (!binding.capability) fail('SEMANTIC_TASK_CAPABILITY_ALIAS_MISSING', 'component.bindings.' + name + ' requires a capability alias.');
    var capability = task.capabilities.filter(function(item) { return item.alias === binding.capability; })[0];
    if (!capability) fail('SEMANTIC_TASK_CAPABILITY_ALIAS_MISSING', 'Task ' + task.semanticId + ' has no capability alias ' + binding.capability + '.');
    binding.use = capability.use;
    delete binding.capability;
  });
}
function resolveBatch(plan, taskId, commands) {
  var task = taskById(plan, taskId);
  return array(commands, 'Executor command batch').map(function(raw, position) {
    syntax.validateCommand(raw, 'executor');
    var command = clone(raw), slot = task.slots.filter(function(item) { return item.slot === command.slot; })[0];
    if (!slot) fail('SEMANTIC_TASK_SLOT_MISSING', 'Executor command[' + position + '] must reference an active-task target slot: ' + command.slot);
    var spec = syntax.COMMANDS[command.type], targetRule = spec.target;
    if (command.type === 'remove') {
      if (slot.intent !== 'delete') fail('SEMANTIC_TASK_SLOT_INTENT_INVALID', 'remove requires a delete target slot: ' + slot.slot);
      var collections = { 'entity-record': 'entities', component: 'components', event: 'events', asset: 'assetIntents', layout: 'layoutIntents' };
      if (!collections[slot.kind]) fail('SEMANTIC_TASK_SLOT_KIND_INVALID', 'Slot ' + slot.slot + ' cannot be removed through Semantic DSL.');
      command.collection = collections[slot.kind]; command.semanticId = slot.semanticId;
    } else {
      if (!targetRule || targetRule.kind !== slot.kind || (targetRule.facet && (!slot.facets || slot.facets.indexOf(targetRule.facet) < 0))) fail('SEMANTIC_TASK_SLOT_KIND_INVALID', command.type + ' cannot write target slot ' + slot.slot + '.');
      if (slot.intent === 'delete') fail('SEMANTIC_TASK_SLOT_INTENT_INVALID', command.type + ' cannot write delete target slot ' + slot.slot + '.');
      command[targetRule.semanticIdField] = slot.semanticId;
      if (targetRule.ownerField) command[targetRule.ownerField] = slot.owner;
    }
    delete command.slot;
    if (command.targetSlot !== undefined) { command.target = slotReference(visibleTargetSlot(plan, task, id(command.targetSlot, command.type + '.targetSlot'), 'entity-record')); delete command.targetSlot; }
    if (command.parentSlot !== undefined) { command.parent = slotReference(visibleTargetSlot(plan, task, id(command.parentSlot, command.type + '.parentSlot'), 'event')); delete command.parentSlot; }
    if (spec.capabilityField) {
      var alias = command[spec.capabilityField];
      var capability = task.capabilities.filter(function(item) { return item.alias === alias; })[0];
      if (!capability) fail('SEMANTIC_TASK_CAPABILITY_ALIAS_MISSING', 'Task ' + task.semanticId + ' has no capability alias ' + alias + '.');
      command.use = capability.use; delete command[spec.capabilityField];
      resolveOperationArguments(plan, task, capability.use, command);
    }
    if (command.type === 'component') resolveComponentBindings(task, command);
    return command;
  });
}
function assertBatchScope(plan, taskId, commands) {
  var task = taskById(plan, taskId), targets = targetsForTask(task); array(commands, 'Draft-write batch');
  if (!commands.length) fail('SEMANTIC_TASK_BATCH_EMPTY', 'An active task requires a non-empty Draft-write batch.');
  return commands.map(function(command, position) {
    var reference = targetForCommand(command);
    if (!targets.some(function(target) { return commandMatchesTarget(reference, target); })) fail('SEMANTIC_TASK_SCOPE_VIOLATION', 'Draft-write command[' + position + '] targets undeclared active-task scope: ' + reference.claim);
    return reference;
  });
}

function assertRetrievesSatisfied(plan, taskId, retrieved) {
  var task = taskById(plan, taskId), available = Object.create(null);
  array(retrieved, 'retrieved capability facts').forEach(function(item, position) {
    var raw = item.command || item; object(raw, 'retrieved[' + position + ']');
    if (raw.type !== undefined && raw.type !== 'retrieve') fail('SEMANTIC_TASK_RETRIEVE_INVALID', 'retrieved[' + position + '] is not a retrieve fact.');
    var query = normalizeRetrieve({ group: raw.group, kind: raw.kind }, 'retrieved[' + position + ']'); available[retrieveKey(query)] = true;
  });
  task.retrievals.forEach(function(query) { if (!available[retrieveKey(query)]) fail('SEMANTIC_TASK_RETRIEVE_INCOMPLETE', 'Active task requires retrieve ' + retrieveKey(query) + ' before its Draft-write batch.'); });
  return true;
}

function commandUses(commands) {
  var seen = Object.create(null), uses = [];
  function addUse(value, label) {
    var use = id(value, label);
    if (!seen[use]) { seen[use] = true; uses.push(use); }
  }
  function visit(value) {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== 'object') return;
    Object.keys(value).forEach(function(key) {
      if (key === 'use' && typeof value[key] === 'string') addUse(value[key], 'command use');
      visit(value[key]);
    });
  }
  array(commands, 'Draft-write batch').forEach(function(command, position) {
    if (command && ['member', 'asset', 'layout'].indexOf(command.type) >= 0) array(command.bindings === undefined ? [] : command.bindings, 'Draft-write command[' + position + '].bindings').forEach(function(use, usePosition) { addUse(use, 'Draft-write command[' + position + '].bindings[' + usePosition + ']'); });
    visit(command);
  });
  return uses.sort();
}
function assertDeclaredUses(plan, taskId, commands, retrievedUses) {
  var task = taskById(plan, taskId), allowedUses = Object.create(null);
  task.capabilities.forEach(function(capability) { allowedUses[capability.use] = true; });
  normalizeUniqueStrings(retrievedUses || [], 'retrieved uses', id).forEach(function(use) { allowedUses[use] = true; });
  commandUses(commands).forEach(function(use) { if (!allowedUses[use]) fail('SEMANTIC_TASK_USE_UNDECLARED', 'Draft-write batch uses capability outside active-task slicing truth: ' + use); });
  return true;
}

function capabilityFactsObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('SEMANTIC_TASK_CAPABILITY_FACTS_INVALID', label + ' must be a structure.');
  return value;
}
function capabilityFactsArray(value, label) {
  if (!Array.isArray(value)) fail('SEMANTIC_TASK_CAPABILITY_FACTS_INVALID', label + ' must be an array.');
  return value;
}
function exactCapabilityFields(value, fields, label) {
  Object.keys(value).forEach(function(key) { if (fields.indexOf(key) < 0) fail('SEMANTIC_TASK_CAPABILITY_FACTS_INVALID', label + ' contains unknown field: ' + key); });
  fields.forEach(function(field) { if (!Object.prototype.hasOwnProperty.call(value, field)) fail('SEMANTIC_TASK_CAPABILITY_FACTS_INVALID', label + ' requires field: ' + field); });
}
function capabilityRowHandle(row, label) {
  if (typeof row !== 'string' || !row.trim()) fail('SEMANTIC_TASK_CAPABILITY_FACTS_INVALID', label + ' must be a non-empty capability row.');
  var handle = row.split('|')[0].trim();
  if (!handle) fail('SEMANTIC_TASK_CAPABILITY_FACTS_INVALID', label + ' has no capability handle.');
  return handle;
}
function addCapabilityRows(destination, rows, label) {
  capabilityFactsArray(rows, label).forEach(function(row, position) { destination[capabilityRowHandle(row, label + '[' + position + ']')] = true; });
}
function sameKeys(actual, expected) {
  actual = actual.slice().sort(); expected = expected.slice().sort();
  return actual.length === expected.length && actual.every(function(value, position) { return value === expected[position]; });
}
function assertCapabilityFacts(plan, taskId, commands, facts) {
  var task = taskById(plan, taskId);
  facts = capabilityFactsObject(facts, 'task capability facts');
  exactCapabilityFields(facts, ['uses', 'catalogs', 'retrieves'], 'task capability facts');
  var factUses = capabilityFactsObject(facts.uses, 'task capability facts.uses');
  var factCatalogs = capabilityFactsObject(facts.catalogs, 'task capability facts.catalogs');
  if (!sameKeys(Object.keys(factUses), task.capabilities.map(function(item) { return item.alias; }))) fail('SEMANTIC_TASK_CAPABILITY_FACTS_INVALID', 'Capability fact aliases must exactly match the active task declaration.');
  if (!sameKeys(Object.keys(factCatalogs), task.catalogs)) fail('SEMANTIC_TASK_CAPABILITY_FACTS_INVALID', 'Capability fact catalogs must exactly match the active task declaration.');
  Object.keys(factUses).forEach(function(use) {
    if (typeof factUses[use] !== 'string' || !factUses[use].trim()) fail('SEMANTIC_TASK_CAPABILITY_FACTS_INVALID', 'Capability fact use ' + use + ' must contain its declared row.');
  });

  var allowedCapabilities = {
    entity: Object.create(null),
    behavior: Object.create(null),
    event: Object.create(null),
    component: Object.create(null),
    family: Object.create(null),
    style: Object.create(null),
    layout: Object.create(null)
  };
  var catalogDestinations = {
    'entity-kinds': allowedCapabilities.entity,
    'behavior-kinds': allowedCapabilities.behavior,
    'event-kinds': allowedCapabilities.event,
    'component-library': allowedCapabilities.component,
    'asset-families': allowedCapabilities.family,
    'asset-styles': allowedCapabilities.style,
    layouts: allowedCapabilities.layout
  };
  task.catalogs.forEach(function(catalog) { addCapabilityRows(catalogDestinations[catalog], factCatalogs[catalog], 'task capability facts.catalogs.' + catalog); });

  var plannedRetrieves = Object.create(null), seenRetrieves = Object.create(null);
  task.retrievals.forEach(function(query) { plannedRetrieves[query.alias] = query; });
  capabilityFactsArray(facts.retrieves, 'task capability facts.retrieves').forEach(function(item, position) {
    var label = 'task capability facts.retrieves[' + position + ']';
    item = capabilityFactsObject(item, label); exactCapabilityFields(item, ['alias', 'group', 'kind', 'facts'], label);
    var query = normalizeRetrieve({ group: item.group, kind: item.kind }, label), planned = plannedRetrieves[item.alias];
    if (!planned || planned.group !== query.group || planned.kind !== query.kind) fail('SEMANTIC_TASK_CAPABILITY_FACTS_INVALID', label + ' is outside the active task declaration alias: ' + item.alias);
    if (seenRetrieves[item.alias]) fail('SEMANTIC_TASK_CAPABILITY_FACTS_INVALID', label + ' duplicates alias ' + item.alias + '.');
    seenRetrieves[item.alias] = true;
    var retrieved = capabilityFactsObject(item.facts, label + '.facts'), rowsField;
    if (query.kind === 'object') rowsField = 'entityKinds';
    else if (query.kind === 'behavior') rowsField = 'behaviorKinds';
    else if (query.kind === 'event') rowsField = 'eventKinds';
    else rowsField = 'operations';
    exactCapabilityFields(retrieved, ['group', 'kind', rowsField], label + '.facts');
    if (retrieved.group !== query.group || retrieved.kind !== query.kind) fail('SEMANTIC_TASK_CAPABILITY_FACTS_INVALID', label + '.facts does not match its declared retrieve query.');
    if (query.kind === 'object') addCapabilityRows(allowedCapabilities.entity, retrieved.entityKinds, label + '.facts.entityKinds');
    else if (query.kind === 'behavior') addCapabilityRows(allowedCapabilities.behavior, retrieved.behaviorKinds, label + '.facts.behaviorKinds');
    else if (query.kind === 'event') addCapabilityRows(allowedCapabilities.event, retrieved.eventKinds, label + '.facts.eventKinds');
    else addCapabilityRows(Object.create(null), retrieved.operations, label + '.facts.operations');
  });
  Object.keys(plannedRetrieves).forEach(function(alias) { if (!seenRetrieves[alias]) fail('SEMANTIC_TASK_CAPABILITY_FACTS_INVALID', 'Capability facts are missing declared retrieval alias ' + alias + '.'); });

  function authorize(destination, value, label) {
    if (typeof value !== 'string' || !value.trim() || !destination[value.trim()]) fail('SEMANTIC_TASK_CAPABILITY_UNDECLARED', label + ' is outside the active task capability facts: ' + String(value));
  }
  capabilityFactsArray(commands, 'Draft-write batch').forEach(function(command, position) {
    var label = 'Draft-write command[' + position + ']'; command = capabilityFactsObject(command, label);
    if (command.type === 'entity') {
      authorize(allowedCapabilities.entity, command.kind, label + '.kind');
      capabilityFactsArray(command.behaviors === undefined ? [] : command.behaviors, label + '.behaviors').forEach(function(kind, behaviorPosition) { authorize(allowedCapabilities.behavior, kind, label + '.behaviors[' + behaviorPosition + ']'); });
    } else if (command.type === 'event') authorize(allowedCapabilities.event, command.kind, label + '.kind');
    else if (command.type === 'component') authorize(allowedCapabilities.component, command.kind, label + '.kind');
    else if (command.type === 'asset') {
      authorize(allowedCapabilities.family, command.family, label + '.family');
      authorize(allowedCapabilities.style, command.style, label + '.style');
    } else if (command.type === 'layout') {
      capabilityFactsArray(command.relations, label + '.relations').forEach(function(relation, relationPosition) {
        relation = capabilityFactsObject(relation, label + '.relations[' + relationPosition + ']');
        authorize(allowedCapabilities.layout, relation.layout, label + '.relations[' + relationPosition + '].layout');
      });
    }
  });
  return true;
}

function snapshot(document) {
  object(document, 'Draft document');
  var out = Object.create(null);
  function put(key, value) { out[key] = clone(value); }
  if (document.game) put('game/' + id(document.game.semanticId, 'game.semanticId'), document.game);
  (document.entities || []).forEach(function(entity) {
    var entityId = id(entity.semanticId, 'entity.semanticId'), metadata = clone(entity); delete metadata.members;
    put('entity/' + entityId, metadata);
    (entity.members || []).forEach(function(member) { put('member/' + entityId + '/' + id(member.semanticId, 'member.semanticId'), member); });
  });
  (document.components || []).forEach(function(item) { put('component/' + id(item.semanticId, 'component.semanticId'), item); });
  function walkEvents(events, parentId) {
    (events || []).forEach(function(event) {
      var eventId = id(event.semanticId, 'event.semanticId'), metadata = clone(event); delete metadata.conditions; delete metadata.actions; delete metadata.children; metadata.parent = parentId || null;
      put('event/' + eventId + '#metadata', metadata);
      if ((event.conditions || []).length) put('event/' + eventId + '#conditions', event.conditions);
      if ((event.actions || []).length) put('event/' + eventId + '#actions', event.actions);
      walkEvents(event.children, eventId);
    });
  }
  walkEvents(document.events, null);
  (document.assetIntents || []).forEach(function(item) { put('asset/' + id(item.semanticId, 'asset.semanticId'), item); });
  (document.layoutIntents || []).forEach(function(item) { put('layout/' + id(item.semanticId, 'layout.semanticId'), item); });
  var policies = document.tuningPolicies && document.tuningPolicies.relativeChange;
  if (policies) Object.keys(policies).forEach(function(degree) { put('policy/' + id(degree, 'policy.degree'), policies[degree]); });
  else (document.tuningDegrees || []).forEach(function(degree) { put('policy/' + id(degree, 'policy.degree'), true); });
  return out;
}
function assertFeasible(plan, beforeDocument, options) {
  object(plan, 'task plan');
  var tasks = array(plan.tasks, 'task plan.tasks');
  options = object(options, 'task plan feasibility options');
  required(options, ['revision'], 'task plan feasibility options');
  allowed(options, ['revision'], 'task plan feasibility options');
  if (typeof options.revision !== 'boolean') fail('SEMANTIC_TASK_PLAN_INFEASIBLE', 'task plan feasibility options.revision must be a boolean.');
  var gameTargets = [], policyTargets = [];
  tasks.forEach(function(task) {
    targetsForTask(task).filter(function(target) { return target.intent !== 'read'; }).forEach(function(target) {
      if (target.kind === 'game') gameTargets.push(target);
      if (target.kind === 'policy') policyTargets.push(target);
    });
  });
  if (gameTargets.length > 1) fail('SEMANTIC_TASK_PLAN_INFEASIBLE', 'A semantic plan cannot mutate the singleton game identity more than once.');
  if (options.revision) {
    if (gameTargets.length || policyTargets.length) fail('SEMANTIC_TASK_PLAN_INFEASIBLE', 'A revision plan cannot mutate game identity or tuning policies.');
  } else {
    if (gameTargets.length !== 1 || gameTargets[0].intent !== 'create') fail('SEMANTIC_TASK_PLAN_INFEASIBLE', 'A new Semantic Source plan requires exactly one game create target.');
    if (policyTargets.some(function(target) { return target.intent !== 'create'; })) fail('SEMANTIC_TASK_PLAN_INFEASIBLE', 'A new Semantic Source plan may only create tuning policies.');
  }

  var existing = snapshot(beforeDocument);
  function present(claim) { return Object.prototype.hasOwnProperty.call(existing, claim); }
  function infeasible(message) { fail('SEMANTIC_TASK_PLAN_INFEASIBLE', message); }
  function eventDescendants(rootId) {
    var children = Object.create(null), descendants = [], seen = Object.create(null);
    Object.keys(existing).forEach(function(claim) {
      if (claim.indexOf('event/') !== 0 || claim.slice(-9) !== '#metadata') return;
      var eventId = claim.slice('event/'.length, -'#metadata'.length), metadata = existing[claim], parentId = metadata && typeof metadata === 'object' ? metadata.parent : null;
      if (!parentId) return;
      if (!children[parentId]) children[parentId] = [];
      children[parentId].push(eventId);
    });
    function visit(parentId) {
      (children[parentId] || []).forEach(function(childId) {
        if (seen[childId]) return;
        seen[childId] = true; descendants.push(childId); visit(childId);
      });
    }
    visit(rootId);
    return descendants;
  }
  function hasRetrieve(task, kind) { return task.retrievals.some(function(query) { return query.kind === kind; }); }
  function hasFoundationUse(task, kind) { return task.capabilities.some(function(capability) { var operation = semanticAlgebra.operationForUse(capability.use); return operation && operation.kind === kind; }); }
  tasks.forEach(function(task) {
    var allTargets = targetsForTask(task), targets = allTargets.filter(function(target) { return target.intent !== 'read'; });
    allTargets.filter(function(target) { return target.intent === 'read'; }).forEach(function(target) {
      targetClaims(target).forEach(function(claim) { if (!present(claim)) infeasible('Task ' + task.semanticId + ' cannot bind missing read slot ' + claim + '.'); });
    });
    if (JSON.stringify(task.catalogs) !== JSON.stringify(derivedCatalogsForTargets(targets))) infeasible('Task ' + task.semanticId + ' derived catalogs diverge from target truth.');
    var entityCreates = Object.create(null), eventMetadataCreates = Object.create(null), eventDeletes = Object.create(null), deleteDescendants = Object.create(null);
    targets.forEach(function(target) {
      if (target.intent === 'delete') return;
      if (target.kind === 'event' && target.facets.indexOf('conditions') >= 0 && !hasFoundationUse(task, 'condition') && !hasRetrieve(task, 'condition')) infeasible('Task ' + task.semanticId + ' requires a declared condition use or condition retrieve before its event conditions target can execute.');
      if (target.kind === 'event' && target.facets.indexOf('actions') >= 0 && !hasFoundationUse(task, 'action') && !hasRetrieve(task, 'action')) infeasible('Task ' + task.semanticId + ' requires a declared action use or action retrieve before its event actions target can execute.');
    });
    targets.forEach(function(target) {
      if (target.kind === 'entity-record' && target.intent === 'create') entityCreates[target.semanticId] = true;
      if (target.kind === 'event' && target.intent === 'create' && target.facets.indexOf('metadata') >= 0) eventMetadataCreates[target.semanticId] = true;
      if (target.kind === 'event' && target.intent === 'delete') eventDeletes[target.semanticId] = true;
    });
    targets.forEach(function(target) {
      if (target.kind !== 'event' || target.intent !== 'delete') return;
      var descendants = eventDescendants(target.semanticId); deleteDescendants[target.semanticId] = descendants;
      descendants.forEach(function(descendantId) {
        if (!eventDeletes[descendantId]) infeasible('Task ' + task.semanticId + ' must declare descendant event delete target ' + descendantId + ' when deleting parent event ' + target.semanticId + '.');
      });
    });
    targets.forEach(function(target) {
      if (target.kind === 'member' && !present('entity/' + target.owner) && !entityCreates[target.owner]) infeasible('Task ' + task.semanticId + ' member target requires an existing or same-task entity owner: ' + target.owner);
      if (target.kind === 'event' && target.intent !== 'delete' && target.facets.some(function(facet) { return facet !== 'metadata'; }) && !present('event/' + target.semanticId + '#metadata') && !eventMetadataCreates[target.semanticId]) infeasible('Task ' + task.semanticId + ' event facet requires existing or same-task event metadata: ' + target.semanticId);
      var claims = target.kind === 'event' && target.intent === 'delete' ? ['event/' + target.semanticId + '#metadata'] : targetClaims(target);
      claims.forEach(function(claim) {
        if (target.intent === 'create' && present(claim)) infeasible('Task ' + task.semanticId + ' cannot create existing target ' + claim + '.');
        if ((target.intent === 'update' || target.intent === 'delete') && !present(claim)) infeasible('Task ' + task.semanticId + ' cannot ' + target.intent + ' missing target ' + claim + '.');
      });
      if (target.kind === 'game' && target.intent === 'create' && Object.keys(existing).some(function(claim) { return claim.indexOf('game/') === 0; })) infeasible('Task ' + task.semanticId + ' cannot create a second singleton game identity.');
    });
    targets.forEach(function(target) {
      var claims = target.kind === 'event' && target.intent === 'delete' ? ['event/' + target.semanticId + '#metadata'] : targetClaims(target);
      claims.forEach(function(claim) { if (target.intent === 'delete') delete existing[claim]; else if (target.intent === 'create') existing[claim] = true; });
      if (target.kind === 'entity-record' && target.intent === 'delete') Object.keys(existing).forEach(function(claim) { if (claim.indexOf('member/' + target.semanticId + '/') === 0) delete existing[claim]; });
      if (target.kind === 'event' && target.intent === 'delete') {
        var deletedEvents = Object.create(null); deletedEvents[target.semanticId] = true;
        (deleteDescendants[target.semanticId] || []).forEach(function(descendantId) { deletedEvents[descendantId] = true; });
        Object.keys(existing).forEach(function(claim) {
          if (claim.indexOf('event/') !== 0) return;
          var eventId = claim.slice('event/'.length).split('#')[0];
          if (deletedEvents[eventId]) delete existing[claim];
        });
      }
    });
  });
  return true;
}
function changedClaims(before, after) {
  var keys = Object.keys(before).concat(Object.keys(after)).filter(function(key, position, all) { return all.indexOf(key) === position; }).sort();
  return keys.filter(function(key) { return JSON.stringify(stable(before[key])) !== JSON.stringify(stable(after[key])); });
}
function targetAllowsClaim(target, claim) {
  if (targetClaims(target).indexOf(claim) >= 0) return true;
  if (target.intent === 'delete' && target.kind === 'event') return claim.indexOf('event/' + target.semanticId + '#') === 0;
  if (target.intent === 'delete' && target.kind === 'entity-record') return claim.indexOf('member/' + target.semanticId + '/') === 0;
  return false;
}
function assertIntent(target, claim, before, after) {
  var beforePresent = Object.prototype.hasOwnProperty.call(before, claim), afterPresent = Object.prototype.hasOwnProperty.call(after, claim);
  if (target.intent === 'create' && (beforePresent || !afterPresent)) fail('SEMANTIC_TASK_DELTA_INVALID', claim + ' must be absent before and present after a create task.');
  if (target.intent === 'update' && (!beforePresent || !afterPresent || JSON.stringify(stable(before[claim])) === JSON.stringify(stable(after[claim])))) fail('SEMANTIC_TASK_DELTA_INVALID', claim + ' must exist and change during an update task.');
  if (target.intent === 'delete' && (!beforePresent || afterPresent)) fail('SEMANTIC_TASK_DELTA_INVALID', claim + ' must be present before and absent after a delete task.');
}
function verifyBatch(plan, taskId, commands, beforeDocument, afterDocument) {
  var task = taskById(plan, taskId), targets = targetsForTask(task);
  assertBatchScope(plan, taskId, commands);
  var before = snapshot(beforeDocument), after = snapshot(afterDocument), changed = changedClaims(before, after);
  if (!changed.length) fail('SEMANTIC_TASK_DELTA_EMPTY', 'Active-task Draft-write batch produced no semantic delta.');
  changed.forEach(function(claim) { if (!targets.some(function(target) { return targetAllowsClaim(target, claim); })) fail('SEMANTIC_TASK_SCOPE_VIOLATION', 'Draft-write batch changed undeclared semantic scope: ' + claim); });
  targets.forEach(function(target) {
    targetClaims(target).forEach(function(claim) {
      if (target.kind === 'event' && target.intent === 'delete') claim += '#metadata';
      assertIntent(target, claim, before, after);
    });
  });
  return deepFreeze({ schemaVersion: 1, receiptKind: 'semantic-task-write-receipt', planHash: plan.planHash, taskId: taskId, beforeDraftHash: documentHash(beforeDocument), afterDraftHash: documentHash(afterDocument), changedClaims: changed });
}

module.exports = {
  SCHEMA_VERSION: SCHEMA_VERSION,
  DOCUMENT_KIND: DOCUMENT_KIND,
  LANGUAGE_ID: LANGUAGE_ID,
  PLAN_COMMANDS: PLAN_COMMANDS,
  TARGET_KINDS: TARGET_KINDS,
  TARGET_INTENTS: TARGET_INTENTS,
  EVENT_FACETS: EVENT_FACETS,
  CATALOGS: CATALOGS,
  RETRIEVE_CATALOG: RETRIEVE_CATALOG,
  PLANNER_CATALOGS: PLANNER_CATALOGS,
  RETRIEVE_KINDS: RETRIEVE_KINDS,
  DERIVED_CATALOGS_BY_TARGET: DERIVED_CATALOGS_BY_TARGET,
  DERIVED_CATALOG_LINES: DERIVED_CATALOG_LINES,
  derivedCatalogsForTarget: derivedCatalogsForTarget,
  derivedCatalogsForTargets: derivedCatalogsForTargets,
  create: create,
  planHash: planHash,
  documentHash: documentHash,
  taskById: taskById,
  targetsForTask: targetsForTask,
  targetClaims: targetClaims,
  targetForCommand: targetForCommand,
  resolveBatch: resolveBatch,
  assertBatchScope: assertBatchScope,
  assertRetrievesSatisfied: assertRetrievesSatisfied,
  commandUses: commandUses,
  assertDeclaredUses: assertDeclaredUses,
  assertCapabilityFacts: assertCapabilityFacts,
  assertFeasible: assertFeasible,
  verifyBatch: verifyBatch
};
