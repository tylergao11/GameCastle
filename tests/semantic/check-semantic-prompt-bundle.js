var assert = require('assert');
var crypto = require('crypto');
var prompt = require('../../packages/semantic/src/semantic-llm2-prompt');
var contextApi = require('../../packages/semantic/src/semantic-commander-context');
var dictionary = require('../../packages/semantic/src/capability-semantic-dictionary');
var draftApi = require('../../packages/semantic/src/semantic-draft');
var referenceRuntime = require('../../packages/semantic/src/semantic-reference-runtime');
var taskPlan = require('../../packages/semantic/src/semantic-task-plan');

function hash(value) { return crypto.createHash('sha256').update(value, 'utf8').digest('hex'); }
function transition(sequence, state, mode, failure, activeTaskId) { return ['seq=' + sequence, 'event=TEST', 'state=' + state, 'mode=' + mode, 'task=' + (activeTaskId || '-'), 'code=' + (failure ? failure.code : '-'), 'failure=' + (failure ? failure.signature : '-')].join('|'); }
function projection(log, state, mode, failure, taskId) { return { state: state, activeTaskId: taskId, allowedMode: mode, completedTaskIds: [], lastFailure: failure, transitionLog: log }; }

function plannerContext(log, request) {
  return {
    phase: 'planner',
    l1: { sourceFingerprint: { dictionary: 'fixed' }, operationIndex: ['action|move|move target'], catalogs: { 'entity-kinds': ['sprite'], 'behavior-kinds': [], 'event-kinds': ['rule'], layouts: [], 'asset-families': [], 'asset-styles': [], 'component-library': [], 'extension-groups': ['g0|Extension|action'] } },
    l2: { request: request, creativeVision: '', baseDraftHash: 'base', baseDraftIndex: { entities: [] } },
    l4: { transitionLines: log.slice() },
  };
}
function executorContext(log, taskId, useRow) {
  var task = { semanticId: taskId, goal: 'Apply one semantic change', dependsOn: [], targets: [{ kind: 'event', semanticId: 'rule', facets: ['actions'], intent: 'upsert' }], uses: ['move'], catalogs: ['event-kinds'], retrieves: [] };
  return {
    phase: 'executor',
    l2: { plan: { schemaVersion: 1, documentKind: 'semantic-task-plan', languageId: 'semantic-dsl-v2', planHash: 'plan', tasks: [task] }, feedback: null },
    l3: { activeTask: task, facts: { uses: { move: useRow }, catalogs: { 'event-kinds': ['rule'] }, retrieves: [] }, draftSlice: { schemaVersion: 1, documentKind: 'semantic-task-draft-slice', taskId: taskId, baseDraftHash: 'base', structureHash: 'slice', facts: [] } },
    l4: { transitionLines: log.slice() },
  };
}

function main() {
  var planFailure = { code: 'PLAN_INVALID', signature: 'failure.plan' };
  var planStart = [transition(1, 'PLANNING', 'plan', null, null)];
  var planRepair = planStart.concat([transition(2, 'PLAN_REPAIR', 'plan', planFailure, null)]);
  var plannerA = prompt.buildPlannerBundle({ context: plannerContext(planStart, 'Build a game system') });
  var plannerB = prompt.buildPlannerBundle({ context: plannerContext(planRepair, 'Build a game system') });
  var plannerOther = prompt.buildPlannerBundle({ context: plannerContext(planStart, 'Build another game system') });
  assert.strictEqual(plannerA.phase, 'planner');
  assert.strictEqual(plannerA.system, plannerB.system, 'planner repair must preserve stable system bytes');
  assert.strictEqual(plannerA.system, plannerOther.system, 'planner request must not enter stable system');
  assert.strictEqual(plannerA.hashes.stablePrefixHash, plannerB.hashes.stablePrefixHash);
  assert.strictEqual(plannerA.hashes.systemHash, hash(plannerA.system));
  assert.strictEqual(plannerA.bytes.system, Buffer.byteLength(plannerA.system, 'utf8'));
  assert(plannerB.user.indexOf(plannerA.user) === 0, 'planner repair must append one transition line');
  assert(plannerA.system.indexOf('plan-task(') >= 0, 'planner grammar must come from TaskPlan PLAN_LINES');
  assert(plannerA.system.indexOf('g0|Extension|action') >= 0, 'planner must receive the retrieve group directory');

  var writeFailure = { code: 'WRITE_INVALID', signature: 'failure.write' };
  var executeStart = [transition(1, 'TASK_ACTIVE', 'write', null, 'task-a')];
  var executeRepair = executeStart.concat([transition(2, 'TASK_REPAIR', 'write', writeFailure, 'task-a')]);
  var executorA = prompt.buildExecutorBundle({ context: executorContext(executeStart, 'task-a', 'action|move|target=entity|move target') });
  var executorB = prompt.buildExecutorBundle({ context: executorContext(executeRepair, 'task-a', 'action|move|target=entity|move target') });
  var executorOther = prompt.buildExecutorBundle({ context: executorContext([transition(1, 'TASK_ACTIVE', 'write', null, 'task-b')], 'task-b', 'action|jump|target=entity|jump target') });
  assert.strictEqual(executorA.phase, 'executor');
  assert.strictEqual(executorA.system, executorB.system, 'executor state must not change stable system');
  assert.strictEqual(executorA.system, executorOther.system, 'executor task must not change stable system');
  assert.strictEqual(executorA.hashes.stablePrefixHash, executorOther.hashes.stablePrefixHash);
  assert.strictEqual(executorA.system.indexOf('retrieve('), -1, 'executor must not emit capability retrieval commands');
  assert.strictEqual(executorA.system.indexOf('plan-task('), -1, 'executor must not contain Planner command forms');
  assert(executorB.user.indexOf(executorA.user) === 0, 'same-task repair must append one transition line');
  assert(executorA.user.indexOf('[L2-run]') < executorA.user.indexOf('[L3-active-task]'));
  assert(executorA.user.indexOf('[L3-active-task]') < executorA.user.indexOf('[L4-transition-log]'));
  assert(executorA.user.indexOf('jump target') < 0, 'executor must not broadcast unrelated task capabilities');
  ['change-scope', '[draft]', '[applied]', '[task-ledger]'].forEach(function(retired) { assert.strictEqual(executorA.system.indexOf(retired), -1, 'retired prompt path: ' + retired); assert.strictEqual(executorA.user.indexOf(retired), -1, 'retired context path: ' + retired); });
  assert.strictEqual(executorA.bytes.total, Buffer.byteLength(executorA.system, 'utf8') + Buffer.byteLength(executorA.user, 'utf8'));
  assert.notStrictEqual(plannerA.hashes.protocolHash, executorA.hashes.protocolHash, 'two phases own separate stable protocols');

  var references = referenceRuntime.create(dictionary.loadIndex());
  var draft = draftApi.create(references, null);
  draftApi.execute(draft, { type: 'game', semanticId: 'game', name: 'Game' });
  draftApi.execute(draft, { type: 'entity', semanticId: 'actor', roles: ['actor'], kind: 'sprite', behaviors: [] });
  var plannerProjection = projection([transition(1, 'PLANNING', 'plan', null, null)], 'PLANNING', 'plan', null, null);
  var builtPlannerContext = contextApi.planner(references, draft, 'Create a movement rule', '', plannerProjection);
  var builtPlanner = prompt.buildPlannerBundle({ context: builtPlannerContext });
  assert.strictEqual(builtPlannerContext.l2.baseDraftIndex.entities[0].semanticId, 'actor', 'planner receives a compact Draft index');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(builtPlannerContext.l2.baseDraftIndex.entities[0], 'value'), false, 'planner must not receive the full Draft');
  assert(builtPlanner.system.indexOf('object.x.add') >= 0, 'planner stable catalog includes compact operation discovery');

  var plan = taskPlan.create([{ type: 'plan-task', semanticId: 'move-task', goal: 'Create one movement rule', dependsOn: [], targets: [{ kind: 'event', semanticId: 'move-rule', intent: 'create', facets: ['metadata', 'actions'] }], uses: ['object.x.add'], catalogs: ['event-kinds'], retrieves: [] }]);
  var activeTask = taskPlan.taskById(plan, 'move-task');
  var exactFacts = contextApi.taskFacts(references, activeTask, []);
  var executorProjection = projection([transition(1, 'TASK_ACTIVE', 'write', null, 'move-task')], 'TASK_ACTIVE', 'write', null, 'move-task');
  var draftSlice = { schemaVersion: 1, documentKind: 'semantic-task-draft-slice', taskId: 'move-task', baseDraftHash: builtPlannerContext.l2.baseDraftHash, structureHash: 'semantic-slice.fixed', facts: [{ kind: 'event', semanticId: 'move-rule', exists: false }] };
  var builtExecutorContext = contextApi.task(draftSlice, plan, executorProjection, activeTask, exactFacts, null, 'Create a movement rule', 'responsive movement');
  var builtExecutor = prompt.buildExecutorBundle({ context: builtExecutorContext });
  assert(builtExecutor.user.indexOf('object.x.add') >= 0, 'active task exact use is present');
  assert.strictEqual(builtExecutor.user.indexOf('object.y.add'), -1, 'unrelated foundation use is absent');
  assert.strictEqual(builtExecutor.user.indexOf('[L1-planner-operation-index]'), -1, 'executor does not receive the planner catalog');
  assert.strictEqual(builtExecutorContext.l2.request, 'Create a movement rule');
  assert.strictEqual(builtExecutorContext.l2.creativeVision, 'responsive movement');
  assert.throws(function() { contextApi.task(draftSlice, plan, executorProjection, activeTask, { uses: exactFacts.uses, catalogs: exactFacts.catalogs, retrieves: [{ group: 'g0', kind: 'action', facts: {} }] }, null, 'Create a movement rule', 'responsive movement'); }, /outside the active task|unplanned retrieval/, 'executor rejects cumulative or unrelated retrieval facts');

  var finalLine = transition(2, 'FINALIZING', 'completion', null, null);
  var finalProjection = projection([transition(1, 'TASK_ACTIVE', 'write', null, 'move-task'), finalLine], 'FINALIZING', 'completion', null, null);
  finalProjection.completedTaskIds = ['move-task'];
  var finalContext = contextApi.finalize(plan, finalProjection, { request: 'Create a movement rule', creativeVision: 'responsive movement', feedback: null }, { draftHash: 'semantic-draft.final', sourceHash: 'semantic-source.final', taskReceiptHashes: ['semantic-receipt.move-task'] });
  var finalBundle = prompt.buildExecutorBundle({ context: finalContext });
  assert.strictEqual(finalBundle.system, builtExecutor.system, 'finalization reuses the Executor stable system');
  assert(finalBundle.user.indexOf('[L3-final-candidate]') >= 0, 'finalization receives only the final candidate projection');
  assert.strictEqual(finalBundle.user.indexOf('[L3-active-task]'), -1, 'finalization does not receive an active task projection');
  console.log('[SemanticPromptBundle] planner/executor profiles, L2-L4 order, runtime hashes, exact task facts, and append-only repair tail passed');
}

main();
