var assert = require('assert');
var prompt = require('../../packages/semantic/src/semantic-llm2-prompt');
var contextApi = require('../../packages/semantic/src/semantic-commander-context');
var dictionary = require('../../packages/semantic/src/capability-semantic-dictionary');
var draftApi = require('../../packages/semantic/src/semantic-draft');
var referenceRuntime = require('../../packages/semantic/src/semantic-reference-runtime');
var taskPlan = require('../../packages/semantic/src/semantic-task-plan');

function transition(sequence, state, mode, failure, taskId) { return ['seq=' + sequence, 'event=TEST', 'state=' + state, 'mode=' + mode, 'task=' + (taskId || '-'), 'code=' + (failure ? failure.code : '-'), 'failure=' + (failure ? failure.signature : '-')].join('|'); }
function projection(log, state, mode, failure, taskId) { return { state: state, activeTaskId: taskId, allowedMode: mode, completedTaskIds: [], lastFailure: failure, transitionLog: log }; }

var references = referenceRuntime.create(dictionary.loadIndex());
var draft = draftApi.create(references, null);
var plannerStart = projection([transition(1, 'PLANNING', 'plan', null, null)], 'PLANNING', 'plan', null, null);
var plannerRepair = projection(plannerStart.transitionLog.concat([transition(2, 'PLAN_REPAIR', 'plan', { code: 'PLAN_INVALID', signature: 'plan.invalid' }, null)]), 'PLAN_REPAIR', 'plan', { code: 'PLAN_INVALID', signature: 'plan.invalid' }, null);
var plannerContext = contextApi.planner(references, draft, 'Build a snake game', plannerStart);
var plannerA = prompt.buildPlannerBundle({ context: plannerContext });
var plannerB = prompt.buildPlannerBundle({ context: contextApi.planner(references, draft, 'Build a snake game', plannerRepair) });

assert.strictEqual(Object.prototype.hasOwnProperty.call(plannerContext.l2, 'creativeVision'), false, 'Creative-model input is absent from semantic planner context.');

assert.strictEqual(plannerA.protocolVersion, 'semantic-planner-prompt-v12');
assert.strictEqual(plannerA.system, plannerB.system);
assert.strictEqual(plannerA.hashes.stablePrefixHash, plannerB.hashes.stablePrefixHash);
assert(plannerA.system.indexOf('LANGUAGE|semantic-dsl-v9') >= 0);
assert(plannerA.system.indexOf('plan-event(') >= 0);
assert(plannerA.system.indexOf('CAPABILITY_ALIAS|') >= 0);
assert(plannerA.system.indexOf('ROUND_TOKEN_LIMIT|8196') >= 0);
assert.strictEqual(plannerA.system.indexOf('plan-target('), -1);
assert.strictEqual(plannerA.system.indexOf('plan-catalog('), -1);
['json', 'never', 'do not', "don't", 'example'].forEach(function(term) { assert.strictEqual(plannerA.system.toLowerCase().indexOf(term), -1, 'planner prompt remains positive and slot-oriented: ' + term); });

var plan = taskPlan.create([
  { type: 'plan-task', semanticId: 'move', goal: 'Create one movement rule.', after: [] },
  { type: 'plan-event', task: 'move', slot: 'moveEvent', semanticId: 'move_rule', intent: 'create', facets: ['metadata', 'actions'] },
  { type: 'plan-use', task: 'move', alias: 'advanceX', use: 'object.x.add' }
]);
var activeTask = taskPlan.taskById(plan, 'move');
var facts = contextApi.taskFacts(references, activeTask, []);
var executorStart = projection([transition(1, 'TASK_ACTIVE', 'write', null, 'move')], 'TASK_ACTIVE', 'write', null, 'move');
var executorRepair = projection(executorStart.transitionLog.concat([transition(2, 'TASK_REPAIR', 'write', { code: 'WRITE_INVALID', signature: 'write.invalid' }, 'move')]), 'TASK_REPAIR', 'write', { code: 'WRITE_INVALID', signature: 'write.invalid' }, 'move');
var slice = { schemaVersion: 1, documentKind: 'semantic-task-draft-slice', taskId: 'move', baseDraftHash: 'base', structureHash: 'slice', facts: [] };
var executorContext = contextApi.task(slice, plan, executorStart, activeTask, facts, null, 'Build movement');
var executorA = prompt.buildExecutorBundle({ context: executorContext });
var executorB = prompt.buildExecutorBundle({ context: contextApi.task(slice, plan, executorRepair, activeTask, facts, null, 'Build movement') });

assert.strictEqual(Object.prototype.hasOwnProperty.call(executorContext.l2, 'creativeVision'), false, 'Creative-model input is absent from semantic executor context.');

assert.strictEqual(executorA.protocolVersion, 'semantic-executor-prompt-v9');
assert.strictEqual(executorA.system, executorB.system);
assert(executorA.system.indexOf('then(slot=') >= 0);
assert(executorA.system.indexOf('CAPABILITY_ALIAS|') >= 0);
assert(executorA.system.indexOf('ROUND_TOKEN_LIMIT|8196') >= 0);
assert.strictEqual(executorA.system.indexOf('plan-task('), -1);
assert.strictEqual(executorA.system.indexOf('complete()'), -1);
assert(executorA.user.indexOf('advanceX|action|object.x.add|') >= 0, 'Executor receives capability alias bound to exact handle and parameters');
assert(executorA.user.indexOf('object.y.add') < 0);
assert.strictEqual(/[\[\]{}]/.test(plannerA.user.replace(/\[[^\]]+\]/g, '')), false, 'Planner context is model-visible DSL facts rather than bracket syntax');
assert.strictEqual(/[\[\]{}]/.test(executorA.user.replace(/\[[^\]]+\]/g, '')), false, 'Executor context values are DSL facts rather than bracket syntax');
['json', 'never', 'do not', "don't", 'example'].forEach(function(term) { assert.strictEqual(executorA.system.toLowerCase().indexOf(term), -1, 'executor prompt remains positive and slot-oriented: ' + term); });

assert.strictEqual(Object.prototype.hasOwnProperty.call(contextApi, 'finalize'), false);
console.log('[SemanticPromptBundle] generated v9 syntax, DSL-only context facts, stable role profiles, and 8196-token contract passed');
