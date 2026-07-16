var assert = require('assert');
var contract = require('./snake-semantic-contract.json');

function fail(message) { throw new Error(message); }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, Object.create(null)); return value; }
function same(left, right) { try { assert.deepStrictEqual(stable(left), stable(right)); return true; } catch (_error) { return false; } }
function flattenEvents(events, out) { out = out || []; (events || []).forEach(function(event) { out.push(event); flattenEvents(event.children, out); }); return out; }
function byId(items, id) { return (items || []).find(function(item) { return item.semanticId === id; }) || null; }
function ids(items) { return (items || []).map(function(item) { return item.semanticId; }); }
function valueAt(value, locator) { var path = locator.split('.'); for (var i = 0; i < path.length; i++) { if (!value || !Object.prototype.hasOwnProperty.call(value, path[i])) return undefined; value = value[path[i]]; } return value; }
function cloneBindings(value) { return Object.keys(value).reduce(function(out, key) { out[key] = value[key]; return out; }, Object.create(null)); }
function resolve(value, bindings) {
  if (Array.isArray(value)) return value.map(function(item) { return resolve(item, bindings); });
  if (value && typeof value === 'object') {
    if (Object.keys(value).length === 1 && value.$entity) { if (!bindings[value.$entity]) fail('Missing entity binding: ' + value.$entity); return bindings[value.$entity].semanticId; }
    if (Object.keys(value).length === 1 && value.$member) { if (!bindings[value.$member]) fail('Missing member binding: ' + value.$member); return bindings[value.$member].entity + '.' + bindings[value.$member].member.semanticId; }
    if (Object.keys(value).length === 1 && value.$value) { if (!Object.prototype.hasOwnProperty.call(bindings, value.$value)) fail('Missing value binding: ' + value.$value); return bindings[value.$value]; }
    return Object.keys(value).reduce(function(out, key) { out[key] = resolve(value[key], bindings); return out; }, Object.create(null));
  }
  return value;
}
function operationMatch(operation, specification, bindings) {
  if (!operation || operation.use !== specification.use) return false;
  var args = operation.arguments || {};
  try { return Object.keys(specification.args || {}).every(function(locator) { return same(valueAt(args, locator), resolve(specification.args[locator], bindings)); }); }
  catch (error) { if (/^Missing (entity|member|value) binding: /.test(error.message)) return false; throw error; }
}
function capture(operation, specification, bindings) { Object.keys(specification.capture || {}).forEach(function(locator) { bindings[specification.capture[locator]] = valueAt(operation.arguments || {}, locator); }); }
function matchOperations(operations, specifications, bindings) {
  var used = Object.create(null);
  return (specifications || []).every(function(specification) {
    for (var i = 0; i < operations.length; i++) if (!used[i] && operationMatch(operations[i], specification, bindings)) { used[i] = true; capture(operations[i], specification, bindings); return true; }
    return false;
  });
}
function eventMatches(event, specification, bindings) {
  var local = cloneBindings(bindings);
  if (specification.conditionCount !== undefined && event.conditions.length !== specification.conditionCount) return null;
  if (specification.actionCount !== undefined && event.actions.length !== specification.actionCount) return null;
  if (!matchOperations(event.conditions || [], specification.conditions || [], local)) return null;
  if (!matchOperations(event.actions || [], specification.actions || [], local)) return null;
  return local;
}
function changes(base, finalDraft) {
  base = base || { entities: [], components: [], events: [], assetIntents: [], layoutIntents: [] };
  var baseEventIds = ids(flattenEvents(base.events)), finalEvents = flattenEvents(finalDraft.events), addedMembers = [];
  (finalDraft.entities || []).forEach(function(entity) { var previous = byId(base.entities, entity.semanticId); var previousMembers = previous ? ids(previous.members) : []; (entity.members || []).filter(function(member) { return previousMembers.indexOf(member.semanticId) < 0; }).forEach(function(member) { addedMembers.push({ entity: entity.semanticId, member: member }); }); });
  return {
    entities: (finalDraft.entities || []).filter(function(item) { return ids(base.entities).indexOf(item.semanticId) < 0; }),
    members: addedMembers,
    components: (finalDraft.components || []).filter(function(item) { return ids(base.components).indexOf(item.semanticId) < 0; }),
    events: finalEvents.filter(function(item) { return baseEventIds.indexOf(item.semanticId) < 0; }),
    assetIntents: (finalDraft.assetIntents || []).filter(function(item) { return ids(base.assetIntents).indexOf(item.semanticId) < 0; }),
    layoutIntents: (finalDraft.layoutIntents || []).filter(function(item) { return ids(base.layoutIntents).indexOf(item.semanticId) < 0; })
  };
}
function preservedSource(base, finalSource) {
  if (!base) return { passed: true, missing: [], changed: [] };
  var missing = [], changed = [];
  ['components', 'assetIntents', 'layoutIntents'].forEach(function(collection) { (base[collection] || []).forEach(function(item) { var finalItem = byId(finalSource && finalSource[collection], item.semanticId); if (!finalItem) missing.push(collection + '/' + item.semanticId); else if (!same(item, finalItem)) changed.push(collection + '/' + item.semanticId); }); });
  (base.entities || []).forEach(function(entity) { var finalEntity = byId(finalSource && finalSource.entities, entity.semanticId); if (!finalEntity) { missing.push('entities/' + entity.semanticId); return; } ['semanticId', 'roles', 'objectTypeRef', 'behaviorTypeRefs'].forEach(function(field) { if (!same(entity[field], finalEntity[field])) changed.push('entities/' + entity.semanticId + '/' + field); }); (entity.members || []).forEach(function(member) { var finalMember = byId(finalEntity.members, member.semanticId); if (!finalMember) missing.push('members/' + entity.semanticId + '.' + member.semanticId); else if (!same(member, finalMember)) changed.push('members/' + entity.semanticId + '.' + member.semanticId); }); });
  var finalEvents = flattenEvents(finalSource && finalSource.events); flattenEvents(base.events).forEach(function(event) { var finalEvent = byId(finalEvents, event.semanticId); if (!finalEvent) missing.push('events/' + event.semanticId); else if (!same(event, finalEvent)) changed.push('events/' + event.semanticId); });
  return { passed: missing.length === 0 && changed.length === 0, missing: missing, changed: changed };
}
function countPass(actual, budget) { return (budget.exact === undefined || actual === budget.exact) && (budget.minimum === undefined || actual >= budget.minimum) && (budget.maximum === undefined || actual <= budget.maximum); }
function patternMatches(value, pattern) { return !pattern || new RegExp(pattern, 'i').test(value); }
function matchEntity(entity, specification) { return (!specification.semanticId || entity.semanticId === specification.semanticId) && patternMatches(entity.semanticId, specification.semanticIdPattern) && (!specification.kind || entity.kind === specification.kind) && (specification.rolesAll || []).every(function(role) { return entity.roles.indexOf(role) >= 0; }); }
function matchMember(item, specification) { return (!specification.entity || item.entity === specification.entity) && patternMatches(item.member.semanticId, specification.semanticIdPattern) && (specification.rolesAll || []).every(function(role) { return item.member.roles.indexOf(role) >= 0; }) && (specification.value === undefined || same(item.member.value, specification.value)); }
function check(checks, id, passed, evidence) { checks.push({ id: id, passed: !!passed, evidence: evidence }); }
function successfulCalls(trace) { return (trace || []).filter(function(entry) { return entry.protocolVersion && entry.result && entry.result.ok === true; }); }
function closedLoopPhases(trace, required) {
  var phases = successfulCalls(trace).map(function(entry) { return entry.kind; });
  return phases.length >= 2 && phases[0] === required[0] && phases.slice(1).every(function(phase) { return phase === required[1]; });
}
function closedLoopEvidence(execution) {
  var result = execution.result || null, ledger = result && result.runLedger || execution.error && execution.error.runLedger || null, state = result && result.runState || execution.error && execution.error.runState || null, plan = result && result.taskPlan || execution.error && execution.error.taskPlan || null;
  var events = ledger && ledger.events || [], planEvents = events.filter(function(event) { return event.type === 'PLAN_ACCEPTED'; }), retrieves = events.filter(function(event) { return event.type === 'TASK_RETRIEVED'; }), commits = events.filter(function(event) { return event.type === 'TASK_COMMITTED'; }), taskIds = plan && plan.tasks.map(function(task) { return task.semanticId; }) || [];
  function exactlyOnce(rows, taskId) { return rows.filter(function(event) { return event.payload.taskId === taskId; }).length === 1; }
  return {
    completed: !!(state && state.state === 'COMPLETED' && events.length && events[events.length - 1].type === 'RUN_COMPLETED'),
    planSealed: !!(plan && state && planEvents.length === 1 && planEvents[0].payload.planHash === plan.planHash && state.planHash === plan.planHash),
    taskReceipts: !!(taskIds.length && commits.length === taskIds.length && retrieves.length === taskIds.length && taskIds.every(function(taskId, index) { return exactlyOnce(retrieves, taskId) && exactlyOnce(commits, taskId) && commits[index].payload.taskId === taskId; })),
    taskIds: taskIds,
    retrieveTaskIds: retrieves.map(function(event) { return event.payload.taskId; }),
    commitTaskIds: commits.map(function(event) { return event.payload.taskId; })
  };
}
function protocolEvidence(trace) {
  var calls = successfulCalls(trace), planner = calls.filter(function(entry) { return entry.phase === 'planner'; }), executor = calls.filter(function(entry) { return entry.phase === 'task'; });
  return { planner: planner.length === 1 && planner.every(function(entry) { return entry.protocolVersion === contract.requiredProtocolVersions.planner; }), executor: executor.length >= 1 && executor.every(function(entry) { return entry.protocolVersion === contract.requiredProtocolVersions.executor; }), versions: calls.map(function(entry) { return entry.protocolVersion; }) };
}
function taskById(id) { return contract.tasks.find(function(task) { return task.id === id; }) || null; }
function evaluate(task, execution) {
  var checks = [], bindings = Object.create(null), finalDraft = execution.finalDraft || { entities: [], components: [], events: [], assetIntents: [], layoutIntents: [] }, delta = changes(execution.baseDraft, finalDraft);
  var finalSource = execution.result && execution.result.ok && execution.result.document && execution.result.document.source || null;
  var preserved = preservedSource(execution.source, finalSource);
  var loop = closedLoopEvidence(execution), protocols = protocolEvidence(execution.trace), cache = execution.report.cacheSummary || {}, parity = execution.report.recordedParity || {};
  check(checks, 'runtime.completed', !!(execution.result && execution.result.ok), execution.report.terminalCode);
  check(checks, 'runtime.closed-loop-phases', closedLoopPhases(execution.trace, contract.requiredRuntimePhases), successfulCalls(execution.trace).map(function(entry) { return entry.kind; }));
  check(checks, 'runtime.state-completed', loop.completed, loop);
  check(checks, 'runtime.plan-sealed', loop.planSealed, loop);
  check(checks, 'runtime.task-receipts', loop.taskReceipts, loop);
  check(checks, 'runtime.protocol-profiles', protocols.planner && protocols.executor, protocols);
  check(checks, 'runtime.first-pass-batches', execution.report.runtimeBatchAccepted === true, { accepted: execution.report.acceptedBatchCount, total: execution.report.batchCount });
  check(checks, 'runtime.atomic', execution.report.rollbackBatchCount ? execution.report.failedBatchRollbackVerified === true : loop.taskReceipts, { rollbackBatchCount: execution.report.rollbackBatchCount, verified: execution.report.failedBatchRollbackVerified, commits: loop.commitTaskIds });
  check(checks, 'runtime.cache', cache.passed === true && (cache.applicable === false || cache.cacheHitRate >= contract.minimumCacheHitRate), cache);
  check(checks, 'runtime.latency', execution.report.modelElapsedMs <= contract.hardTimeoutMs, { modelElapsedMs: execution.report.modelElapsedMs, hardTimeoutMs: contract.hardTimeoutMs });
  check(checks, 'runtime.replay-parity', parity.planHash === true && parity.taskReceipts === true && parity.sourceHash === true, parity);
  check(checks, 'draft.existing-source-preserved', !!finalSource && preserved.passed, preserved);
  Object.keys(task.changeBudget).forEach(function(collection) { check(checks, 'changes.' + collection, countPass(delta[collection].length, task.changeBudget[collection]), { actual: delta[collection].length, expected: task.changeBudget[collection] }); });
  (task.requiredEntities || []).forEach(function(specification, position) { var pool = specification.scope === 'added' ? delta.entities : finalDraft.entities; var found = pool.filter(function(entity) { return matchEntity(entity, specification); }); check(checks, 'entity.' + position, found.length === specification.count, found); if (specification.bind && found.length === 1) bindings[specification.bind] = found[0]; });
  (task.requiredMembers || []).forEach(function(specification, position) { var pool = specification.scope === 'added' ? delta.members : (finalDraft.entities || []).reduce(function(out, entity) { return out.concat((entity.members || []).map(function(member) { return { entity: entity.semanticId, member: member }; })); }, []); var found = pool.filter(function(item) { return matchMember(item, specification); }); check(checks, 'member.' + position, found.length === specification.count, found); if (specification.bind && found.length === 1) bindings[specification.bind] = found[0]; });
  (task.requiredEvents || []).forEach(function(specification, position) { var pool = specification.scope === 'added' ? delta.events : flattenEvents(finalDraft.events), matches = []; pool.forEach(function(event) { var local = eventMatches(event, specification, bindings); if (local) matches.push({ event: event, bindings: local }); }); check(checks, 'event.' + position, matches.length === specification.count, matches.map(function(item) { return item.event.semanticId; })); if (specification.bind && matches.length === 1) bindings[specification.bind] = matches[0].event; });
  (task.coverageOperations || []).forEach(function(specification, position) { var matches = []; delta.events.forEach(function(event) { (event[specification.channel] || []).forEach(function(operation) { if (operationMatch(operation, specification, bindings) && matchOperations(event.actions || [], specification.sameEventActions || [], cloneBindings(bindings))) matches.push(event.semanticId); }); }); check(checks, 'coverage.' + position, matches.length >= specification.minimum, matches); });
  (task.forbiddenOperations || []).forEach(function(specification, position) { var matches = []; delta.events.forEach(function(event) { (event[specification.channel] || []).forEach(function(operation) { if (operationMatch(operation, specification, bindings)) matches.push(event.semanticId + '/' + operation.use); }); }); check(checks, 'forbidden.' + position, matches.length === 0, matches); });
  (task.lifecycleRules || []).forEach(function(rule, position) { var event = bindings[rule.eventBinding], target = null; try { target = resolve(rule.target, bindings); } catch (error) { if (!/^Missing (entity|member|value) binding: /.test(error.message)) throw error; } var actions = event && event.actions || [], reset = actions.findIndex(function(operation) { return operation.use === rule.resetUse && valueAt(operation.arguments || {}, 'target') === target; }), deletion = actions.findIndex(function(operation) { return operation.use === rule.deleteUse && valueAt(operation.arguments || {}, 'target') === target; }), recreation = actions.findIndex(function(operation) { return operation.use === rule.recreateUse && valueAt(operation.arguments || {}, 'target') === target; }); var passed = target !== null && reset >= 0 && (deletion < 0 || recreation > deletion && recreation < reset); check(checks, 'lifecycle.' + position, passed, { event: event && event.semanticId || null, target: target, deletion: deletion, recreation: recreation, reset: reset }); });
  var semanticChecks = checks.filter(function(item) { return item.id.indexOf('runtime.') !== 0; }), runtimeChecks = checks.filter(function(item) { return item.id.indexOf('runtime.') === 0; });
  return { taskId: task.id, task: task.task, seedFile: task.seedFile, semanticPassed: semanticChecks.every(function(item) { return item.passed; }), runtimePassed: runtimeChecks.every(function(item) { return item.passed; }), passed: checks.every(function(item) { return item.passed; }), checks: checks };
}

if (contract.schemaVersion !== 2 || contract.benchmarkKind !== 'semantic-task-benchmark-contract' || !Array.isArray(contract.tasks) || contract.tasks.length !== 6) fail('Snake semantic benchmark contract is invalid.');
module.exports = { contract: contract, tasks: contract.tasks, taskById: taskById, evaluate: evaluate, changes: changes, preservedSource: preservedSource, closedLoopPhases: closedLoopPhases, closedLoopEvidence: closedLoopEvidence };
