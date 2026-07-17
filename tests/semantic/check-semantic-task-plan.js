var assert = require('assert');
var taskPlan = require('../../packages/semantic/src/semantic-task-plan');
var syntax = require('../../packages/semantic/src/semantic-dsl-syntax');

assert.strictEqual(taskPlan.LANGUAGE_ID, 'semantic-dsl-v9');
assert.strictEqual(taskPlan.SCHEMA_VERSION, 9);
assert.deepStrictEqual(syntax.PLAN_COMMANDS.slice().sort(), ['plan-complete', 'plan-task']);

var plan = taskPlan.create([
  { type: 'plan-task', semanticId: 'core', goal: '这里需要一个蛇', after: [] }
]);
assert(Object.isFrozen(plan));
assert.strictEqual(plan.tasks.length, 1);
assert.strictEqual(plan.tasks[0].goal, '这里需要一个蛇');
assert.strictEqual(plan.dispatchComplete, false);
assert.strictEqual(taskPlan.assertFeasible(plan, { game: null, entities: [] }, { revision: false }), true);

assert.throws(function() {
  taskPlan.create([
    { type: 'plan-task', semanticId: 'a', goal: 'a', after: [] },
    { type: 'plan-task', semanticId: 'b', goal: 'b', after: ['a'] }
  ]);
}, function(error) { return /exactly one plan-task/i.test(error.message); });

assert.throws(function() {
  taskPlan.create([
    { type: 'plan-task', semanticId: 'x', goal: 'x', after: [] },
    { type: 'plan-entity', task: 'x', slot: 'e', semanticId: 'Head', intent: 'create' }
  ]);
}, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_COMMAND_INVALID'; });

var done = taskPlan.create([{ type: 'plan-complete' }]);
assert.strictEqual(done.dispatchComplete, true);
assert.deepStrictEqual(done.tasks, []);
assert.strictEqual(taskPlan.assertFeasible(done, {}, { revision: false }), true);

var emptyDoc = { game: null, entities: [], components: [], events: [], assetIntents: [], layoutIntents: [], tuningPolicies: { relativeChange: {} } };
var resolved = taskPlan.authorizeWriteBatch(plan, 'core', [
  { type: 'game', slot: 'snake', name: 'Snake' },
  { type: 'entity', slot: 'snakeHead', roles: ['player'], kind: 'sprite', behaviors: [] },
  { type: 'member', slot: 'GameState.score', roles: ['score'], value: 0, bindings: [] }
], { beforeDocument: emptyDoc });
assert.strictEqual(resolved[0].semanticId, 'snake');
assert.strictEqual(resolved[2].entity, 'GameState');

console.log('[SemanticTaskPlan] one-task dispatch + plan-complete + free-write authorize passed');
