var crypto = require('crypto');
var draftApi = require('./semantic-draft');
var taskPlan = require('./semantic-task-plan');

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.keys(value).forEach(function(key) { freeze(value[key]); }); return Object.freeze(value); }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, Object.create(null)); return value; }
function hash(value) { return 'semantic.slice.' + crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'SemanticTaskDraftSlice'; throw error; }
function byId(items, semanticId) { return (items || []).filter(function(item) { return item.semanticId === semanticId; })[0] || null; }
function flattenEvents(events, parent, out) { out = out || []; (events || []).forEach(function(event) { out.push({ event: event, parent: parent || null }); flattenEvents(event.children, event.semanticId, out); }); return out; }
function eventMetadata(item) { var value = clone(item.event); delete value.conditions; delete value.actions; delete value.children; value.parent = item.parent; return value; }
function entityMetadata(entity) { var value = clone(entity); delete value.members; return value; }
function compactIndex(structure) {
  function eventIndex(event) { return { semanticId: event.semanticId, kind: event.kind, conditions: (event.conditions || []).map(function(item) { return item.operationId; }), actions: (event.actions || []).map(function(item) { return item.operationId; }), children: (event.children || []).map(eventIndex) }; }
  return {
    game: structure.game && structure.game.semanticId || null,
    entities: structure.entities.map(function(entity) { return { semanticId: entity.semanticId, kind: entity.kind, behaviors: clone(entity.behaviors), members: entity.members.map(function(member) { return member.semanticId; }) }; }),
    components: structure.components.map(function(item) { return item.semanticId; }),
    events: structure.events.map(eventIndex),
    assetIntents: structure.assetIntents.map(function(item) { return item.semanticId; }),
    layoutIntents: structure.layoutIntents.map(function(item) { return item.semanticId; }),
    tuningDegrees: Object.keys(structure.tuningPolicies.relativeChange).sort()
  };
}
function valueForClaim(structure, claim) {
  var parts = claim.split('#'), base = parts[0], facet = parts[1] || null, path = base.split('/'), kind = path[0], semanticId = path[path.length - 1];
  if (kind === 'game') return structure.game && structure.game.semanticId === semanticId ? clone(structure.game) : undefined;
  if (kind === 'entity') { var entity = byId(structure.entities, semanticId); return entity ? entityMetadata(entity) : undefined; }
  if (kind === 'member') { var entity = byId(structure.entities, path[1]); return clone(entity && byId(entity.members, semanticId) || undefined); }
  if (kind === 'component') return clone(byId(structure.components, semanticId) || undefined);
  if (kind === 'asset') return clone(byId(structure.assetIntents, semanticId) || undefined);
  if (kind === 'layout') return clone(byId(structure.layoutIntents, semanticId) || undefined);
  if (kind === 'policy') { var policy = structure.tuningPolicies.relativeChange[semanticId]; return policy ? { degree: semanticId, mode: policy.mode, value: clone(policy.value) } : undefined; }
  if (kind === 'event') {
    var found = flattenEvents(structure.events).filter(function(item) { return item.event.semanticId === semanticId; })[0];
    if (!found) return undefined;
    if (facet === 'metadata') return eventMetadata(found);
    if (facet === 'conditions') return found.event.conditions.length ? clone(found.event.conditions) : undefined;
    if (facet === 'actions') return found.event.actions.length ? clone(found.event.actions) : undefined;
    return { metadata: eventMetadata(found), conditions: clone(found.event.conditions), actions: clone(found.event.actions) };
  }
  fail('SEMANTIC_TASK_SLICE_CLAIM_INVALID', 'TaskPlan produced an unmapped Draft slice claim: ' + claim);
}
function dependencyTasks(plan, task) {
  var selected = Object.create(null), ordered = [];
  function visit(taskId) { if (selected[taskId]) return; var value = taskPlan.taskById(plan, taskId); value.dependsOn.forEach(visit); selected[taskId] = true; ordered.push(value); }
  task.dependsOn.forEach(visit); ordered.push(task); return ordered;
}
function create(draft, plan, taskId) {
  if (!draft || !draft.references) fail('SEMANTIC_TASK_SLICE_DRAFT_INVALID', 'A semantic Draft is required.');
  var activeTask = taskPlan.taskById(plan, taskId), structure = draftApi.taskStructure(draft), claims = [];
  dependencyTasks(plan, activeTask).forEach(function(task) { taskPlan.targetsForTask(task).forEach(function(target) { taskPlan.targetClaims(target).forEach(function(claim) { if (claims.indexOf(claim) < 0) claims.push(claim); }); }); });
  claims.sort();
  var facts = claims.map(function(claim) { var value = valueForClaim(structure, claim); return value === undefined ? { claim: claim, exists: false } : { claim: claim, exists: true, value: value }; });
  var slice = { schemaVersion: 1, documentKind: 'semantic-task-draft-slice', taskId: activeTask.semanticId, baseDraftHash: taskPlan.documentHash(draftApi.materialize(draft)), index: compactIndex(structure), facts: facts };
  slice.structureHash = hash(slice);
  return freeze(clone(slice));
}
module.exports = { create: create };
