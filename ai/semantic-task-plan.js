var crypto = require('crypto');
var semanticAlgebra = require('./semantic-event-algebra');

var SCHEMA_VERSION = 1;
var DOCUMENT_KIND = 'semantic-task-plan';
var LANGUAGE_ID = 'semantic-dsl-v2';
var PLAN_COMMAND = 'plan-task';
var PLAN_COMMANDS = Object.freeze([PLAN_COMMAND]);
var MAX_TASKS = 16;
var PLAN_LINES = Object.freeze([
  'plan-task(semanticId=...semanticId, goal=...text, dependsOn=...stringArray, targets=...taskTargetArray, uses=...stringArray, catalogs=...catalogArray, retrieves=...retrieveArray)'
]);
var TARGET_KINDS = ['game', 'entity', 'member', 'component', 'event', 'asset', 'layout', 'policy'];
var TARGET_INTENTS = ['create', 'update', 'delete'];
var EVENT_FACETS = ['metadata', 'conditions', 'actions'];
var CATALOGS = ['entity-kinds', 'behavior-kinds', 'event-kinds', 'layouts', 'asset-families', 'asset-styles', 'component-library'];
var RETRIEVE_CATALOG = 'extension-groups';
var PLANNER_CATALOGS = CATALOGS.concat([RETRIEVE_CATALOG]);
var RETRIEVE_KINDS = ['object', 'behavior', 'event', 'action', 'condition', 'number-expression', 'string-expression'];
var REMOVABLE_KINDS = ['entity', 'component', 'event', 'asset', 'layout'];

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

function baseTargetKey(target) {
  if (target.kind === 'member') return 'member/' + target.owner + '/' + target.semanticId;
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

function create(commands) {
  array(commands, 'plan commands');
  if (!commands.length) fail('SEMANTIC_TASK_PLAN_EMPTY', 'A semantic task plan requires at least one plan-task command.');
  if (commands.length > MAX_TASKS) fail('SEMANTIC_TASK_PLAN_TOO_LARGE', 'A semantic task plan supports at most ' + MAX_TASKS + ' atomic tasks.');
  var seenTasks = Object.create(null), claims = [], taskPosition = Object.create(null);
  var tasks = commands.map(function(command, position) {
    var label = 'plan-task[' + position + ']';
    object(command, label);
    required(command, ['type', 'semanticId', 'goal', 'dependsOn', 'targets', 'uses', 'catalogs', 'retrieves'], label);
    allowed(command, ['type', 'semanticId', 'goal', 'dependsOn', 'targets', 'uses', 'catalogs', 'retrieves'], label);
    if (command.type !== PLAN_COMMAND) fail('SEMANTIC_TASK_PLAN_COMMAND_INVALID', label + ' must use ' + PLAN_COMMAND + '(...).');
    var semanticId = id(command.semanticId, label + '.semanticId');
    if (seenTasks[semanticId]) fail('SEMANTIC_TASK_PLAN_DUPLICATE', 'Task plan duplicates semanticId ' + semanticId + '.');
    seenTasks[semanticId] = true; taskPosition[semanticId] = position;
    var dependencies = normalizeUniqueStrings(command.dependsOn, label + '.dependsOn', id);
    dependencies.forEach(function(dependency) { if (!Object.prototype.hasOwnProperty.call(taskPosition, dependency) || dependency === semanticId) fail('SEMANTIC_TASK_PLAN_DEPENDENCY_INVALID', label + ' dependency must identify an earlier task: ' + dependency); });
    dependencies.sort(function(left, right) { return taskPosition[left] - taskPosition[right]; });
    var targets = array(command.targets, label + '.targets').map(function(target, targetPosition) { return normalizeTarget(target, label + '.targets[' + targetPosition + ']'); });
    if (!targets.length) fail('SEMANTIC_TASK_TARGET_INVALID', label + '.targets requires at least one semantic target.');
    var localClaims = [];
    targets.forEach(function(target) {
      targetClaims(target).forEach(function(claim) {
        if (localClaims.some(function(existing) { return conflict(existing.claim, claim, existing.target, target); })) fail('SEMANTIC_TASK_PLAN_DUPLICATE', label + ' contains overlapping target claim ' + claim + '.');
        if (claims.some(function(existing) { return conflict(existing.claim, claim, existing.target, target); })) fail('SEMANTIC_TASK_PLAN_TARGET_CONFLICT', label + ' target ' + claim + ' conflicts with task ' + claims.filter(function(existing) { return conflict(existing.claim, claim, existing.target, target); })[0].taskId + '.');
        localClaims.push({ claim: claim, target: target }); claims.push({ claim: claim, target: target, taskId: semanticId });
      });
    });
    targets.sort(function(left, right) { return targetSortKey(left).localeCompare(targetSortKey(right)); });
    var uses = normalizeUniqueStrings(command.uses, label + '.uses', id);
    var catalogs = normalizeUniqueStrings(command.catalogs, label + '.catalogs', function(item, itemLabel) {
      var catalog = text(item, itemLabel);
      if (CATALOGS.indexOf(catalog) < 0) fail('SEMANTIC_TASK_CATALOG_INVALID', itemLabel + ' is not an allowed capability catalog: ' + catalog);
      return catalog;
    }, function(left, right) { return orderIndex(CATALOGS, left) - orderIndex(CATALOGS, right); });
    var retrieveSeen = Object.create(null);
    var retrieves = array(command.retrieves, label + '.retrieves').map(function(item, retrievePosition) {
      var normalized = normalizeRetrieve(item, label + '.retrieves[' + retrievePosition + ']'), key = retrieveKey(normalized);
      if (retrieveSeen[key]) fail('SEMANTIC_TASK_PLAN_DUPLICATE', label + '.retrieves duplicates ' + key + '.');
      retrieveSeen[key] = true; return normalized;
    }).sort(function(left, right) { return retrieveKey(left).localeCompare(retrieveKey(right)); });
    return { semanticId: semanticId, goal: text(command.goal, label + '.goal'), dependsOn: dependencies, targets: targets, uses: uses, catalogs: catalogs, retrieves: retrieves };
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
  object(command, 'Draft-write command');
  var type = command.type, target;
  if (type === 'game') target = { kind: 'game', semanticId: id(command.semanticId, 'game.semanticId'), facet: null, operation: 'upsert' };
  else if (type === 'entity') target = { kind: 'entity', semanticId: id(command.semanticId, 'entity.semanticId'), facet: null, operation: 'upsert' };
  else if (type === 'member') target = { kind: 'member', owner: id(command.entity, 'member.entity'), semanticId: id(command.semanticId, 'member.semanticId'), facet: null, operation: 'upsert' };
  else if (type === 'component') target = { kind: 'component', semanticId: id(command.semanticId, 'component.semanticId'), facet: null, operation: 'upsert' };
  else if (type === 'event') target = { kind: 'event', semanticId: id(command.semanticId, 'event.semanticId'), facet: 'metadata', operation: 'upsert' };
  else if (type === 'when') target = { kind: 'event', semanticId: id(command.event, 'when.event'), facet: 'conditions', operation: 'upsert' };
  else if (type === 'then') target = { kind: 'event', semanticId: id(command.event, 'then.event'), facet: 'actions', operation: 'upsert' };
  else if (type === 'asset') target = { kind: 'asset', semanticId: id(command.semanticId, 'asset.semanticId'), facet: null, operation: 'upsert' };
  else if (type === 'layout') target = { kind: 'layout', semanticId: id(command.semanticId, 'layout.semanticId'), facet: null, operation: 'upsert' };
  else if (type === 'policy') target = { kind: 'policy', semanticId: id(command.degree, 'policy.degree'), facet: null, operation: 'upsert' };
  else if (type === 'remove') {
    var collectionKinds = { entities: 'entity', components: 'component', events: 'event', assetIntents: 'asset', layoutIntents: 'layout' };
    var kind = collectionKinds[command.collection];
    if (!kind) fail('SEMANTIC_TASK_COMMAND_UNMAPPED', 'remove.collection has no TaskPlan target mapping: ' + command.collection);
    target = { kind: kind, semanticId: id(command.semanticId, 'remove.semanticId'), facet: null, operation: 'delete' };
  } else fail('SEMANTIC_TASK_COMMAND_UNMAPPED', 'Command is not a Draft-write command owned by a TaskPlan target: ' + type);
  target.claim = target.kind === 'member' ? 'member/' + target.owner + '/' + target.semanticId : target.kind + '/' + target.semanticId + (target.facet ? '#' + target.facet : '');
  return target;
}

function commandMatchesTarget(reference, target) {
  if (reference.kind !== target.kind || reference.semanticId !== target.semanticId || (reference.owner || null) !== (target.owner || null)) return false;
  if (reference.operation === 'delete') return target.intent === 'delete';
  if (target.intent === 'delete') return false;
  return reference.kind !== 'event' || target.facets.indexOf(reference.facet) >= 0;
}
function assertBatchScope(plan, taskId, commands) {
  var task = taskById(plan, taskId); array(commands, 'Draft-write batch');
  if (!commands.length) fail('SEMANTIC_TASK_BATCH_EMPTY', 'An active task requires a non-empty Draft-write batch.');
  return commands.map(function(command, position) {
    var reference = targetForCommand(command);
    if (!task.targets.some(function(target) { return commandMatchesTarget(reference, target); })) fail('SEMANTIC_TASK_SCOPE_VIOLATION', 'Draft-write command[' + position + '] targets undeclared active-task scope: ' + reference.claim);
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
  task.retrieves.forEach(function(query) { if (!available[retrieveKey(query)]) fail('SEMANTIC_TASK_RETRIEVE_INCOMPLETE', 'Active task requires retrieve ' + retrieveKey(query) + ' before its Draft-write batch.'); });
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
  task.uses.forEach(function(use) { allowedUses[use] = true; });
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
  if (!sameKeys(Object.keys(factUses), task.uses)) fail('SEMANTIC_TASK_CAPABILITY_FACTS_INVALID', 'Capability fact uses must exactly match the active task declaration.');
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
  task.retrieves.forEach(function(query) { plannedRetrieves[retrieveKey(query)] = query; });
  capabilityFactsArray(facts.retrieves, 'task capability facts.retrieves').forEach(function(item, position) {
    var label = 'task capability facts.retrieves[' + position + ']';
    item = capabilityFactsObject(item, label); exactCapabilityFields(item, ['group', 'kind', 'facts'], label);
    var query = normalizeRetrieve({ group: item.group, kind: item.kind }, label), key = retrieveKey(query);
    if (!plannedRetrieves[key]) fail('SEMANTIC_TASK_CAPABILITY_FACTS_INVALID', label + ' is outside the active task declaration: ' + key);
    if (seenRetrieves[key]) fail('SEMANTIC_TASK_CAPABILITY_FACTS_INVALID', label + ' duplicates ' + key + '.');
    seenRetrieves[key] = true;
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
  Object.keys(plannedRetrieves).forEach(function(key) { if (!seenRetrieves[key]) fail('SEMANTIC_TASK_CAPABILITY_FACTS_INVALID', 'Capability facts are missing declared retrieve ' + key + '.'); });

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
    array(task.targets, 'task ' + task.semanticId + '.targets').forEach(function(target) {
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
  function hasCatalog(task, catalog) { return task.catalogs.indexOf(catalog) >= 0; }
  function hasRetrieve(task, kind) { return task.retrieves.some(function(query) { return query.kind === kind; }); }
  function hasFoundationUse(task, kind) { return task.uses.some(function(use) { var operation = semanticAlgebra.operationForUse(use); return operation && operation.kind === kind; }); }
  tasks.forEach(function(task) {
    var entityCreates = Object.create(null), eventMetadataCreates = Object.create(null), eventDeletes = Object.create(null), deleteDescendants = Object.create(null);
    task.targets.forEach(function(target) {
      if (target.intent === 'delete') return;
      if (target.kind === 'entity' && !hasCatalog(task, 'entity-kinds') && !hasRetrieve(task, 'object')) infeasible('Task ' + task.semanticId + ' requires entity-kinds or an object retrieve before its entity ' + target.intent + ' target can execute.');
      if (target.kind === 'event' && target.facets.indexOf('metadata') >= 0 && !hasCatalog(task, 'event-kinds') && !hasRetrieve(task, 'event')) infeasible('Task ' + task.semanticId + ' requires event-kinds or an event retrieve before its event metadata target can execute.');
      if (target.kind === 'event' && target.facets.indexOf('conditions') >= 0 && !hasFoundationUse(task, 'condition') && !hasRetrieve(task, 'condition')) infeasible('Task ' + task.semanticId + ' requires a declared condition use or condition retrieve before its event conditions target can execute.');
      if (target.kind === 'event' && target.facets.indexOf('actions') >= 0 && !hasFoundationUse(task, 'action') && !hasRetrieve(task, 'action')) infeasible('Task ' + task.semanticId + ' requires a declared action use or action retrieve before its event actions target can execute.');
      if (target.kind === 'component' && !hasCatalog(task, 'component-library')) infeasible('Task ' + task.semanticId + ' requires component-library before its component ' + target.intent + ' target can execute.');
      if (target.kind === 'asset' && (!hasCatalog(task, 'asset-families') || !hasCatalog(task, 'asset-styles'))) infeasible('Task ' + task.semanticId + ' requires both asset-families and asset-styles before its asset ' + target.intent + ' target can execute.');
      if (target.kind === 'layout' && !hasCatalog(task, 'layouts')) infeasible('Task ' + task.semanticId + ' requires layouts before its layout ' + target.intent + ' target can execute.');
    });
    task.targets.forEach(function(target) {
      if (target.kind === 'entity' && target.intent === 'create') entityCreates[target.semanticId] = true;
      if (target.kind === 'event' && target.intent === 'create' && target.facets.indexOf('metadata') >= 0) eventMetadataCreates[target.semanticId] = true;
      if (target.kind === 'event' && target.intent === 'delete') eventDeletes[target.semanticId] = true;
    });
    task.targets.forEach(function(target) {
      if (target.kind !== 'event' || target.intent !== 'delete') return;
      var descendants = eventDescendants(target.semanticId); deleteDescendants[target.semanticId] = descendants;
      descendants.forEach(function(descendantId) {
        if (!eventDeletes[descendantId]) infeasible('Task ' + task.semanticId + ' must declare descendant event delete target ' + descendantId + ' when deleting parent event ' + target.semanticId + '.');
      });
    });
    task.targets.forEach(function(target) {
      if (target.kind === 'member' && !present('entity/' + target.owner) && !entityCreates[target.owner]) infeasible('Task ' + task.semanticId + ' member target requires an existing or same-task entity owner: ' + target.owner);
      if (target.kind === 'event' && target.intent !== 'delete' && target.facets.some(function(facet) { return facet !== 'metadata'; }) && !present('event/' + target.semanticId + '#metadata') && !eventMetadataCreates[target.semanticId]) infeasible('Task ' + task.semanticId + ' event facet requires existing or same-task event metadata: ' + target.semanticId);
      var claims = target.kind === 'event' && target.intent === 'delete' ? ['event/' + target.semanticId + '#metadata'] : targetClaims(target);
      claims.forEach(function(claim) {
        if (target.intent === 'create' && present(claim)) infeasible('Task ' + task.semanticId + ' cannot create existing target ' + claim + '.');
        if ((target.intent === 'update' || target.intent === 'delete') && !present(claim)) infeasible('Task ' + task.semanticId + ' cannot ' + target.intent + ' missing target ' + claim + '.');
      });
      if (target.kind === 'game' && target.intent === 'create' && Object.keys(existing).some(function(claim) { return claim.indexOf('game/') === 0; })) infeasible('Task ' + task.semanticId + ' cannot create a second singleton game identity.');
    });
    task.targets.forEach(function(target) {
      var claims = target.kind === 'event' && target.intent === 'delete' ? ['event/' + target.semanticId + '#metadata'] : targetClaims(target);
      claims.forEach(function(claim) { if (target.intent === 'delete') delete existing[claim]; else if (target.intent === 'create') existing[claim] = true; });
      if (target.kind === 'entity' && target.intent === 'delete') Object.keys(existing).forEach(function(claim) { if (claim.indexOf('member/' + target.semanticId + '/') === 0) delete existing[claim]; });
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
  if (target.intent === 'delete' && target.kind === 'entity') return claim.indexOf('member/' + target.semanticId + '/') === 0;
  return false;
}
function assertIntent(target, claim, before, after) {
  var beforePresent = Object.prototype.hasOwnProperty.call(before, claim), afterPresent = Object.prototype.hasOwnProperty.call(after, claim);
  if (target.intent === 'create' && (beforePresent || !afterPresent)) fail('SEMANTIC_TASK_DELTA_INVALID', claim + ' must be absent before and present after a create task.');
  if (target.intent === 'update' && (!beforePresent || !afterPresent || JSON.stringify(stable(before[claim])) === JSON.stringify(stable(after[claim])))) fail('SEMANTIC_TASK_DELTA_INVALID', claim + ' must exist and change during an update task.');
  if (target.intent === 'delete' && (!beforePresent || afterPresent)) fail('SEMANTIC_TASK_DELTA_INVALID', claim + ' must be present before and absent after a delete task.');
}
function verifyBatch(plan, taskId, commands, beforeDocument, afterDocument) {
  var task = taskById(plan, taskId);
  assertBatchScope(plan, taskId, commands);
  var before = snapshot(beforeDocument), after = snapshot(afterDocument), changed = changedClaims(before, after);
  if (!changed.length) fail('SEMANTIC_TASK_DELTA_EMPTY', 'Active-task Draft-write batch produced no semantic delta.');
  changed.forEach(function(claim) { if (!task.targets.some(function(target) { return targetAllowsClaim(target, claim); })) fail('SEMANTIC_TASK_SCOPE_VIOLATION', 'Draft-write batch changed undeclared semantic scope: ' + claim); });
  task.targets.forEach(function(target) {
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
  PLAN_COMMAND: PLAN_COMMAND,
  PLAN_COMMANDS: PLAN_COMMANDS,
  MAX_TASKS: MAX_TASKS,
  PLAN_LINES: PLAN_LINES,
  TARGET_KINDS: TARGET_KINDS,
  TARGET_INTENTS: TARGET_INTENTS,
  EVENT_FACETS: EVENT_FACETS,
  CATALOGS: CATALOGS,
  RETRIEVE_CATALOG: RETRIEVE_CATALOG,
  PLANNER_CATALOGS: PLANNER_CATALOGS,
  RETRIEVE_KINDS: RETRIEVE_KINDS,
  create: create,
  planHash: planHash,
  documentHash: documentHash,
  taskById: taskById,
  targetClaims: targetClaims,
  targetForCommand: targetForCommand,
  assertBatchScope: assertBatchScope,
  assertRetrievesSatisfied: assertRetrievesSatisfied,
  commandUses: commandUses,
  assertDeclaredUses: assertDeclaredUses,
  assertCapabilityFacts: assertCapabilityFacts,
  assertFeasible: assertFeasible,
  verifyBatch: verifyBatch
};
