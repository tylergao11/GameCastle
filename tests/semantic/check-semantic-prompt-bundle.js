var assert = require('assert');
var prompt = require('../../packages/semantic/src/semantic-llm2-prompt');
var contextApi = require('../../packages/semantic/src/semantic-commander-context');
var dictionary = require('../../packages/semantic/src/capability-semantic-dictionary');
var draftApi = require('../../packages/semantic/src/semantic-draft');
var referenceRuntime = require('../../packages/semantic/src/semantic-reference-runtime');
var taskPlan = require('../../packages/semantic/src/semantic-task-plan');
var promptBundle = require('../../packages/semantic/src/semantic-prompt-bundle');

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

assert.strictEqual(plannerA.protocolVersion, 'semantic-planner-prompt-v18');
assert.strictEqual(plannerA.system, plannerB.system);
assert.strictEqual(plannerA.hashes.stablePrefixHash, plannerB.hashes.stablePrefixHash);
assert(plannerA.system.indexOf('LANGUAGE|semantic-dsl-v9') >= 0);
assert(plannerA.system.indexOf('plan-event(') >= 0);
assert(plannerA.system.indexOf('facets=list(metadata,conditions,actions)') >= 0, 'FORMS projects plan-event.facets wire shape');
assert(plannerA.system.indexOf('EVENT|') >= 0 && plannerA.system.indexOf('facets=list(') >= 0, 'EVENT protocol states facets=list wire form');
assert(plannerA.system.indexOf('OPTIONAL|plan-task.after') >= 0);
assert(plannerA.system.indexOf('SLOTS|') >= 0);
assert(plannerA.system.indexOf('PLAN_USE|') >= 0);
assert(plannerA.system.indexOf('SCOPE|') >= 0);
assert(plannerA.system.indexOf('MEMBER|') >= 0 && plannerA.system.indexOf('invent no fields') >= 0);
assert(plannerA.system.indexOf('PLAN_USE|') >= 0 && plannerA.system.indexOf('Entity.member') >= 0);
assert(plannerA.system.indexOf('FORMS|') >= 0);
// Protocol stays compact: one PLAN_USE line, not a family of incident patches.
assert.strictEqual((plannerA.system.match(/PLAN_USE_/g) || []).length, 0);
assert((plannerContext.l1.operationIndex || []).some(function(row) { return /^use=[^|]+\|channel=[^|]+\|params=.+\|summary=/.test(row); }), 'Planner operation index is slot-first use|channel|params|summary');
assert((plannerContext.l1.operationIndex || []).some(function(row) { return /use=object\.place\.random-grid\|.*params=.*step=number or expression/.test(row); }), 'L1 params project dictionary number-or-expression for random-grid step');
assert((plannerContext.l1.operationIndex || []).some(function(row) { return /use=input\.key\.just-pressed\|.*params=key=text or expression/.test(row); }), 'L1 key fields project dictionary string-expression as text or expression');
assert(plannerA.system.indexOf('ROUND_TOKEN_LIMIT|8196') >= 0);
assert.strictEqual(plannerA.system.indexOf('plan-target('), -1);
assert.strictEqual(plannerA.system.indexOf('plan-catalog('), -1);
// Lean protocol prose (excluding generated FORMS) stays small; forms grow with the DSL registry.
var syntax = require('../../packages/semantic/src/semantic-dsl-syntax');
var plannerProtocolOnly = promptBundle.plannerProtocol();
var plannerProse = plannerProtocolOnly.length - syntax.PLAN_LINES.join('\n').length;
assert(plannerProse < 2400, 'Planner protocol prose must stay compact; got ' + plannerProse);
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

assert.strictEqual(executorA.protocolVersion, 'semantic-executor-prompt-v17');
assert(executorA.system.indexOf('foundation handle') >= 0 || executorA.system.indexOf('alias or foundation') >= 0 || executorA.system.indexOf('CAPABILITY|') >= 0, 'Executor CAPABILITY projects foundation handles');
assert.strictEqual(executorA.system, executorB.system);
assert(executorA.system.indexOf('then(slot=') >= 0);
assert(executorA.system.indexOf('event(slot=...event-metadata-target-slot, kind=...event-kind-handle)') >= 0, 'event form is closed metadata without open capability parameters');
assert(executorA.system.indexOf('event.locals') >= 0 || executorA.system.indexOf('OPTIONAL|') >= 0, 'event.locals is optional');
assert.strictEqual(executorA.system.indexOf('Optional'), -1, 'command forms do not suffix Optional into type placeholders');
assert(executorA.system.indexOf('WRITE|') >= 0);
assert(executorA.system.indexOf('SLOT|') >= 0);
assert(executorA.system.indexOf('CAPABILITY|') >= 0);
assert(executorA.system.indexOf('EXPRESSION|') >= 0);
assert(executorA.system.indexOf('FORMS|') >= 0);
assert.strictEqual((executorA.system.match(/SLOT_COVERAGE\|/g) || []).length, 0, 'coverage is Runtime-owned; not a long protocol patch');
assert.strictEqual((executorA.system.match(/NUMBER_OR_EXPRESSION\|/g) || []).length, 0);
assert.strictEqual((executorA.system.match(/DICTIONARY_TOKEN\|/g) || []).length, 0);
assert.strictEqual((executorA.system.match(/EVENT_METADATA\|/g) || []).length, 0);
assert.strictEqual((executorA.system.match(/MEMBER_REFERENCE\|/g) || []).length, 0);
assert.strictEqual((executorA.system.match(/LAYOUT_BOUNDS\|/g) || []).length, 0);
var executorProtocolOnly = promptBundle.executorProtocol();
var executorProse = executorProtocolOnly.length - syntax.WRITE_LINES.join('\n').length;
assert(executorProse < 1800, 'Executor protocol prose must stay compact; got ' + executorProse);
assert(executorA.system.indexOf('ROUND_TOKEN_LIMIT|8196') >= 0);
assert.strictEqual(executorA.system.indexOf('plan-task('), -1);
assert.strictEqual(executorA.system.indexOf('complete()'), -1);
assert(executorA.user.indexOf('advanceX|action|object.x.add|') >= 0, 'Executor receives capability alias bound to exact handle and parameters');
assert(executorA.user.indexOf('value=number or expression') >= 0, 'Executor L3 projects dictionary number-or-expression for object.x.add value');
assert(executorA.user.indexOf('object.y.add') < 0);
assert.strictEqual(/[\[\]{}]/.test(plannerA.user.replace(/\[[^\]]+\]/g, '')), false, 'Planner context is model-visible DSL facts rather than bracket syntax');
assert.strictEqual(/[\[\]{}]/.test(executorA.user.replace(/\[[^\]]+\]/g, '')), false, 'Executor context values are DSL facts rather than bracket syntax');
['json', 'never', 'do not', "don't", 'example'].forEach(function(term) { assert.strictEqual(executorA.system.toLowerCase().indexOf(term), -1, 'executor prompt remains positive and slot-oriented: ' + term); });

assert.strictEqual(Object.prototype.hasOwnProperty.call(contextApi, 'finalize'), false);
console.log('[SemanticPromptBundle] compact slot protocols, dictionary L1/L3 projections, stable profiles passed protocolBytes planner=' + plannerProtocolOnly.length + ' executor=' + executorProtocolOnly.length);
