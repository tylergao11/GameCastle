var draftApi = require('./semantic-draft');
var promptBundle = require('./semantic-prompt-bundle');
var stateMachine = require('./semantic-run-state-machine');
var taskPlan = require('./semantic-task-plan');

var SCHEMA_VERSION = 1;
var CONTEXT_KIND = 'semantic-commander-context';
var DRAFT_SLICE_KIND = 'semantic-task-draft-slice';
var catalogField = {
  'entity-kinds': 'entityKinds',
  'behavior-kinds': 'behaviorKinds',
  'event-kinds': 'eventKinds',
  layouts: 'layouts',
  'asset-families': 'assetFamilies',
  'asset-styles': 'assetStyles',
  'component-library': 'components',
};
catalogField[taskPlan.RETRIEVE_CATALOG] = 'extensionGroups';
var CATALOG_FIELD = Object.freeze(catalogField);

function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'SemanticCommanderContext'; throw error; }
function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function object(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('SEMANTIC_CONTEXT_INVALID', label + ' must be an object.'); return value; }
function text(value, label) { if (typeof value !== 'string' || !value.trim()) fail('SEMANTIC_CONTEXT_INVALID', label + ' must be non-empty text.'); return value; }
function exactFields(value, fields, label) {
  Object.keys(value).forEach(function(key) { if (fields.indexOf(key) < 0) fail('SEMANTIC_CONTEXT_FIELD_INVALID', label + ' contains unknown field: ' + key); });
  fields.forEach(function(key) { if (!Object.prototype.hasOwnProperty.call(value, key)) fail('SEMANTIC_CONTEXT_FIELD_MISSING', label + ' is missing field: ' + key); });
}
function equal(left, right) { return promptBundle.canonical(left) === promptBundle.canonical(right); }
function stringArray(value, label) {
  if (!Array.isArray(value) || value.some(function(item) { return typeof item !== 'string' || !item; })) fail('SEMANTIC_CONTEXT_INVALID', label + ' must be an array of non-empty strings.');
  return value;
}

function machine(projection, expectedTaskId) {
  stateMachine.assertPromptProjection(projection, expectedTaskId);
  return projection.transitionLog.slice();
}

function compactOperation(row) {
  var fields = String(row).split('|');
  if (fields.length < 4 || !fields[0] || !fields[1]) fail('SEMANTIC_CONTEXT_CATALOG_INVALID', 'Foundation operation row is invalid: ' + row);
  return [fields[0], fields[1], fields.slice(3).join('|')].join('|');
}
function plannerCatalog(references) {
  if (!references || typeof references.foundationOperationLines !== 'function' || typeof references.parameterContext !== 'function') fail('SEMANTIC_CONTEXT_REFERENCES_INVALID', 'Planner context requires SemanticReferenceRuntime.');
  var parameters = references.parameterContext();
  var catalogs = {};
  taskPlan.PLANNER_CATALOGS.forEach(function(name) {
    var field = CATALOG_FIELD[name];
    if (!field) fail('SEMANTIC_CONTEXT_CATALOG_INVALID', 'TaskPlan catalog has no SemanticReferenceRuntime projection: ' + name);
    catalogs[name] = clone(parameters[field] || []);
  });
  return {
    sourceFingerprint: clone(references.index && references.index.source || null),
    operationIndex: references.foundationOperationLines().map(compactOperation),
    catalogs: catalogs,
  };
}

function eventIndex(event) {
  return {
    semanticId: event.semanticId,
    kind: event.kind,
    conditions: (event.conditions || []).map(function(item) { return { operationId: item.operationId, use: item.use }; }),
    actions: (event.actions || []).map(function(item) { return { operationId: item.operationId, use: item.use }; }),
    children: (event.children || []).map(eventIndex),
  };
}
function baseDraftIndex(draft) {
  var structure = draftApi.structure(draft);
  return {
    baseDraftHash: promptBundle.hashCanonical(structure),
    index: {
      game: structure.game ? { semanticId: structure.game.semanticId } : null,
      entities: structure.entities.map(function(entity) { return { semanticId: entity.semanticId, roles: clone(entity.roles), kind: entity.kind, behaviors: clone(entity.behaviors), members: entity.members.map(function(member) { return { semanticId: member.semanticId, roles: clone(member.roles), valueType: member.valueType }; }) }; }),
      components: structure.components.map(function(component) { return { semanticId: component.semanticId, kind: component.kind, target: component.target || null }; }),
      events: structure.events.map(eventIndex),
      assetIntents: structure.assetIntents.map(function(asset) { return { semanticId: asset.semanticId, subject: asset.subject, family: asset.family, style: asset.style }; }),
      layoutIntents: structure.layoutIntents.map(function(layout) { return { semanticId: layout.semanticId, subject: layout.subject, layouts: clone(layout.layouts) }; }),
    },
  };
}

function planner(references, draft, request, creativeVision, machineProjection, feedback) {
  var base = baseDraftIndex(draft);
  return {
    schemaVersion: SCHEMA_VERSION,
    contextKind: CONTEXT_KIND,
    phase: 'planner',
    l1: plannerCatalog(references),
    l2: { request: text(request, 'request'), creativeVision: String(creativeVision || ''), sourceMode: draft.baseSource ? 'revision' : 'new', baseDraftHash: base.baseDraftHash, baseDraftIndex: base.index, feedback: feedback === undefined ? null : clone(feedback) },
    l4: { transitionLines: machine(machineProjection, null) },
  };
}

function taskFacts(references, task, retrievedFacts) {
  task = object(task, 'task');
  var rows = references.foundationOperationLines(), byUse = {};
  rows.forEach(function(row) { var fields = String(row).split('|'); byUse[fields[1]] = String(row); });
  var uses = {};
  task.capabilities.forEach(function(capability) { if (!byUse[capability.use]) fail('SEMANTIC_CONTEXT_TASK_USE_MISSING', 'Task use is absent from foundation operation truth: ' + capability.use); uses[capability.alias] = capability.alias + '|' + byUse[capability.use]; });
  var parameters = references.parameterContext(), catalogs = {};
  task.catalogs.forEach(function(name) { var field = CATALOG_FIELD[name]; if (!field) fail('SEMANTIC_CONTEXT_CATALOG_INVALID', 'Unknown task catalog: ' + name); catalogs[name] = clone(parameters[field] || []); });
  var planned = {};
  task.retrievals.forEach(function(item) { planned[item.alias] = item; });
  var retrieves = (retrievedFacts || []).map(function(item, index) {
    item = object(item, 'retrievedFacts[' + index + ']');
    exactFields(item, ['alias', 'group', 'kind', 'facts'], 'retrievedFacts[' + index + ']');
    var plannedItem = planned[item.alias];
    if (!plannedItem || plannedItem.group !== item.group || plannedItem.kind !== item.kind) fail('SEMANTIC_CONTEXT_RETRIEVE_OUTSIDE_TASK', 'Retrieved facts are outside the active task alias: ' + item.alias);
    return clone(item);
  });
  return { uses: uses, catalogs: catalogs, retrieves: retrieves };
}

function validateFacts(task, facts) {
  facts = object(facts, 'facts');
  exactFields(facts, ['uses', 'catalogs', 'retrieves'], 'facts');
  object(facts.uses, 'facts.uses'); object(facts.catalogs, 'facts.catalogs');
  if (!Array.isArray(facts.retrieves)) fail('SEMANTIC_CONTEXT_INVALID', 'facts.retrieves must be an array.');
  var useKeys = Object.keys(facts.uses).sort(), expectedUses = task.capabilities.map(function(item) { return item.alias; }).sort();
  var catalogKeys = Object.keys(facts.catalogs).sort(), expectedCatalogs = task.catalogs.slice().sort();
  if (!equal(useKeys, expectedUses)) fail('SEMANTIC_CONTEXT_TASK_FACTS_DIVERGED', 'facts.uses must exactly match activeTask capability aliases.');
  if (!equal(catalogKeys, expectedCatalogs)) fail('SEMANTIC_CONTEXT_TASK_FACTS_DIVERGED', 'facts.catalogs must exactly match activeTask.catalogs.');
  var planned = {}; task.retrievals.forEach(function(item) { planned[item.alias] = item; });
  var seen = {};
  facts.retrieves.forEach(function(item, index) { item = object(item, 'facts.retrieves[' + index + ']'); exactFields(item, ['alias', 'group', 'kind', 'facts'], 'facts.retrieves[' + index + ']'); var expected = planned[item.alias]; if (!expected || expected.group !== item.group || expected.kind !== item.kind) fail('SEMANTIC_CONTEXT_RETRIEVE_OUTSIDE_TASK', 'facts.retrieves contains an unplanned retrieval alias: ' + item.alias); if (seen[item.alias]) fail('SEMANTIC_CONTEXT_RETRIEVE_DUPLICATE', 'facts.retrieves repeats alias: ' + item.alias); seen[item.alias] = true; });
  return clone(facts);
}

function task(draftSlice, plan, machineProjection, activeTask, facts, feedback, request, creativeVision) {
  plan = object(plan, 'plan'); activeTask = object(activeTask, 'activeTask');
  var frozenTask = taskPlan.taskById(plan, activeTask.semanticId);
  if (!equal(frozenTask, activeTask)) fail('SEMANTIC_CONTEXT_ACTIVE_TASK_DIVERGED', 'activeTask must be the unmodified task from the frozen TaskPlan.');
  machineProjection = object(machineProjection, 'machineProjection');
  var transitions = machine(machineProjection, activeTask.semanticId);
  draftSlice = object(draftSlice, 'draftSlice');
  if (draftSlice.documentKind !== DRAFT_SLICE_KIND || draftSlice.taskId !== activeTask.semanticId) fail('SEMANTIC_CONTEXT_DRAFT_SLICE_INVALID', 'draftSlice must be the authoritative ' + DRAFT_SLICE_KIND + ' for activeTask.');
  return {
    schemaVersion: SCHEMA_VERSION,
    contextKind: CONTEXT_KIND,
    phase: 'executor',
    l2: { request: text(request, 'request'), creativeVision: String(creativeVision || ''), plan: clone(plan), feedback: feedback === undefined ? null : clone(feedback) },
    l3: { activeTask: clone(activeTask), facts: validateFacts(activeTask, facts), draftSlice: clone(draftSlice) },
    l4: { transitionLines: transitions },
  };
}

module.exports = {
  SCHEMA_VERSION: SCHEMA_VERSION,
  CONTEXT_KIND: CONTEXT_KIND,
  DRAFT_SLICE_KIND: DRAFT_SLICE_KIND,
  CATALOG_FIELD: CATALOG_FIELD,
  plannerCatalog: plannerCatalog,
  taskFacts: taskFacts,
  planner: planner,
  task: task,
};
