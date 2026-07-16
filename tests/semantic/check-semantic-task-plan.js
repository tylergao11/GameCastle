var assert = require('assert');
var taskPlan = require('../../packages/semantic/src/semantic-task-plan');
var syntax = require('../../packages/semantic/src/semantic-dsl-syntax');

function emptyDocument() { return { game: null, entities: [], components: [], events: [], assetIntents: [], layoutIntents: [], tuningPolicies: { relativeChange: {} } }; }
function baseCommands() {
  return [
    { type: 'plan-task', semanticId: 'core', goal: 'Create the game and shared state.', after: [] },
    { type: 'plan-game', task: 'core', slot: 'gameRoot', semanticId: 'snake', intent: 'create' },
    { type: 'plan-entity', task: 'core', slot: 'stateEntity', semanticId: 'GameState', intent: 'create' },
    { type: 'plan-member', task: 'core', slot: 'scoreMember', owner: 'GameState', semanticId: 'score', intent: 'create' },
    { type: 'plan-task', semanticId: 'movement', goal: 'Create timed movement.', after: ['core'] },
    { type: 'plan-event', task: 'movement', slot: 'moveEvent', semanticId: 'move_right', facets: ['metadata', 'conditions', 'actions'], intent: 'create' },
    { type: 'plan-use', task: 'movement', alias: 'timerReady', use: 'timer.elapsed' },
    { type: 'plan-use', task: 'movement', alias: 'advanceX', use: 'object.x.add' }
  ];
}

assert.strictEqual(taskPlan.LANGUAGE_ID, 'semantic-dsl-v9');
assert.strictEqual(taskPlan.SCHEMA_VERSION, 8);
assert.strictEqual(syntax.LANGUAGE_ID, taskPlan.LANGUAGE_ID);
assert.strictEqual(taskPlan.PLAN_COMMANDS, syntax.PLAN_COMMANDS);
assert.strictEqual(Object.prototype.hasOwnProperty.call(taskPlan, 'PLAN_LINES'), false, 'TaskPlan does not own wire syntax forms');

var plan = taskPlan.create(baseCommands());
assert(Object.isFrozen(plan));
assert.strictEqual(plan.tasks[0].slots.length, 3);
assert.strictEqual(plan.tasks[1].capabilities[0].alias, 'advanceX');
assert.deepStrictEqual(plan.tasks[1].catalogs, ['event-kinds']);
assert.deepStrictEqual(taskPlan.targetsForTask(plan.tasks[1])[0].facets, ['metadata', 'conditions', 'actions']);
assert.strictEqual(Object.prototype.hasOwnProperty.call(plan.tasks[0], 'targets'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(plan.tasks[1], 'uses'), false);

var coreResolved = taskPlan.resolveBatch(plan, 'core', [
  { type: 'game', slot: 'gameRoot', name: 'Snake' },
  { type: 'entity', slot: 'stateEntity', roles: ['state'], kind: 'state', behaviors: [] },
  { type: 'member', slot: 'scoreMember', roles: ['score'], value: 0, bindings: [] }
]);
assert.deepStrictEqual(coreResolved[0], { type: 'game', name: 'Snake', semanticId: 'snake' });
assert.deepStrictEqual(coreResolved[2], { type: 'member', roles: ['score'], value: 0, bindings: [], semanticId: 'score', entity: 'GameState' });
assert.strictEqual(taskPlan.assertBatchScope(plan, 'core', coreResolved).length, 3);

var movementResolved = taskPlan.resolveBatch(plan, 'movement', [
  { type: 'event', slot: 'moveEvent', kind: 'rule', locals: {} },
  { type: 'when', slot: 'moveEvent', capability: 'timerReady', timer: 'step', operator: '>=', seconds: 0.1 },
  { type: 'then', slot: 'moveEvent', capability: 'advanceX', target: 'stateEntity', value: 32 }
]);
assert.strictEqual(movementResolved[1].event, 'move_right');
assert.strictEqual(movementResolved[1].use, 'timer.elapsed');
assert.strictEqual(movementResolved[2].target, 'GameState');

assert.throws(function() { taskPlan.create([{ type: 'plan-task', semanticId: 'x', goal: 'x', after: [] }, { type: 'plan-target', task: 'x', kind: 'game', semanticId: 'x', intent: 'create' }]); }, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_COMMAND_INVALID'; });
assert.throws(function() { taskPlan.create(baseCommands().concat([{ type: 'plan-use', task: 'core', alias: 'gameRoot', use: 'always' }])); }, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_DUPLICATE'; });
assert.throws(function() { taskPlan.resolveBatch(plan, 'movement', [{ type: 'entity', slot: 'moveEvent', roles: ['state'], kind: 'state', behaviors: [] }]); }, function(error) { return error.code === 'SEMANTIC_TASK_SLOT_KIND_INVALID'; });
assert.throws(function() { taskPlan.resolveBatch(plan, 'movement', [{ type: 'then', slot: 'moveEvent', capability: 'missing' }]); }, function(error) { return error.code === 'SEMANTIC_TASK_CAPABILITY_ALIAS_MISSING'; });
assert.strictEqual(taskPlan.assertFeasible(plan, emptyDocument(), { revision: false }), true);

console.log('[SemanticTaskPlan] v9 typed target slots, task-local dependencies, capability aliases, and exact resolution passed');
