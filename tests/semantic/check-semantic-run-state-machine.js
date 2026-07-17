var assert = require('assert');
var machine = require('../../packages/semantic/src/semantic-run-state-machine');

function projection(ledger) { return machine.project(ledger); }
function taskFailure(taskId, subjectHash, message) {
  return { phase: 'task', taskId: taskId, code: 'SEMANTIC_TASK_FAILURE', owner: 'StateMachineCheck', message: message || 'exact task failure', subjectHash: subjectHash };
}

var initial = machine.create('Build a generic rules-driven project.');
assert.strictEqual(projection(initial).state, machine.STATES.PLANNING);
var initialPromptProjection = machine.promptProjection(initial);
assert.deepStrictEqual(Object.keys(initialPromptProjection).sort(), machine.PROMPT_PROJECTION_FIELDS.slice().sort());
assert.deepStrictEqual(initialPromptProjection.dispatchLog, []);

// Exactly one task per accept.
assert.throws(function() {
  machine.transition.acceptPlan(initial, 'semantic.plan.001', ['model', 'rules']);
}, function(error) { return error.code === 'SEMANTIC_RUN_PLAN_INVALID'; });

var planned = machine.transition.acceptPlan(initial, 'semantic.plan.001', ['model']);
assert.strictEqual(projection(planned).state, machine.STATES.TASK_READY);
assert.strictEqual(projection(planned).activeTaskId, 'model');

var activeModel = machine.transition.startTask(planned, 'model');
var retrievedModel = machine.transition.recordRetrieve(activeModel, 'model', 'query.model', 'result.model');
var modelCommitted = machine.transition.commitTask(retrievedModel, 'model', 'receipt.model', 'draft.before.model', 'draft.after.model', '这里需要一个蛇');
var afterModel = projection(modelCommitted);
// After one work order: back to PLANNING for next dispatch (not FINALIZING).
assert.strictEqual(afterModel.state, machine.STATES.PLANNING);
assert.strictEqual(afterModel.activeTaskId, null);
assert.deepStrictEqual(afterModel.completedTaskIds, ['model']);
assert.strictEqual(afterModel.dispatchLog.length, 1);
assert.strictEqual(afterModel.dispatchLog[0].goal, '这里需要一个蛇');

// Second work order.
var planned2 = machine.transition.acceptPlan(modelCommitted, 'semantic.plan.002', ['rules']);
var activeRules = machine.transition.startTask(planned2, 'rules');
var rulesCommitted = machine.transition.commitTask(activeRules, 'rules', 'receipt.rules', 'draft.b1', 'draft.b2', '蛇需要会动');
assert.strictEqual(projection(rulesCommitted).state, machine.STATES.PLANNING);
assert.deepStrictEqual(projection(rulesCommitted).completedTaskIds, ['model', 'rules']);
assert.strictEqual(projection(rulesCommitted).dispatchLog.length, 2);

// Dispatch complete → FINALIZING → COMPLETED.
var finishing = machine.transition.completeDispatch(rulesCommitted);
assert.strictEqual(projection(finishing).state, machine.STATES.FINALIZING);
var done = machine.transition.completeRun(finishing, 'source.hash', 'receipt.done');
assert.strictEqual(projection(done).state, machine.STATES.COMPLETED);

// Task free-write fuses after three identical consecutive failures.
var p = machine.transition.acceptPlan(initial, 'semantic.plan.f', ['only']);
var a = machine.transition.startTask(p, 'only');
var f1 = machine.transition.recordFailure(a, taskFailure('only', 'h1', 'same err'));
assert.strictEqual(projection(f1).state, machine.STATES.TASK_REPAIR);
var r1 = machine.transition.retryTask(f1, 'only');
var f2 = machine.transition.recordFailure(r1, taskFailure('only', 'h2', 'same err'));
assert.strictEqual(projection(f2).state, machine.STATES.TASK_REPAIR);
var r2 = machine.transition.retryTask(f2, 'only');
var fused = machine.transition.recordFailure(r2, taskFailure('only', 'h3', 'same err'));
assert.strictEqual(projection(fused).state, machine.STATES.FUSED);

console.log('[SemanticRunStateMachine] one-task dispatch, progress log, dispatch-complete finalize passed');
