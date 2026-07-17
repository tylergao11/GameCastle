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

// plan-use.use is dictionary algebra truth, not free text or channel|handle rows.
assert.throws(function() {
  taskPlan.create([
    { type: 'plan-task', semanticId: 'badUse', goal: 'x', after: [] },
    { type: 'plan-event', task: 'badUse', slot: 'e', semanticId: 'e1', facets: ['metadata', 'conditions'], intent: 'create' },
    { type: 'plan-use', task: 'badUse', alias: 'cap', use: 'condition|input.key.just-pressed' }
  ]);
}, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_INVALID' && /operation handle|algebra/.test(error.message); });
assert.throws(function() {
  taskPlan.create([
    { type: 'plan-task', semanticId: 'unknownUse', goal: 'x', after: [] },
    { type: 'plan-event', task: 'unknownUse', slot: 'e', semanticId: 'e1', facets: ['metadata', 'conditions'], intent: 'create' },
    { type: 'plan-use', task: 'unknownUse', alias: 'cap', use: 'not.a.real.operation' }
  ]);
}, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_INVALID' && /algebra/.test(error.message); });

// Structure tasks cannot carry orphan plan-use; event ops need visible entity/member slots from dictionary field types.
assert.throws(function() {
  taskPlan.assertFeasible(taskPlan.create([
    { type: 'plan-task', semanticId: 'orphan', goal: 'entities only', after: [] },
    { type: 'plan-game', task: 'orphan', slot: 'g', semanticId: 'g1', intent: 'create' },
    { type: 'plan-entity', task: 'orphan', slot: 'h', semanticId: 'head', intent: 'create' },
    { type: 'plan-use', task: 'orphan', alias: 'alwaysCap', use: 'always' }
  ]), emptyDocument(), { revision: false });
}, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_INFEASIBLE' && /consume them/.test(error.message); });

assert.throws(function() {
  taskPlan.assertFeasible(taskPlan.create([
    { type: 'plan-task', semanticId: 'needMember', goal: 'set text without member slot', after: [] },
    { type: 'plan-game', task: 'needMember', slot: 'g', semanticId: 'g1', intent: 'create' },
    { type: 'plan-entity', task: 'needMember', slot: 'state', semanticId: 'GameState', intent: 'create' },
    { type: 'plan-event', task: 'needMember', slot: 'ev', semanticId: 'turn', facets: ['metadata', 'conditions', 'actions'], intent: 'create' },
    { type: 'plan-use', task: 'needMember', alias: 'press', use: 'input.key.just-pressed' },
    { type: 'plan-use', task: 'needMember', alias: 'setText', use: 'state.text.set' }
  ]), emptyDocument(), { revision: false });
}, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_INFEASIBLE' && /Entity\.member/.test(error.message); });

var memberReady = taskPlan.create([
  { type: 'plan-task', semanticId: 'ready', goal: 'set text with member slot', after: [] },
  { type: 'plan-game', task: 'ready', slot: 'g', semanticId: 'g1', intent: 'create' },
  { type: 'plan-entity', task: 'ready', slot: 'state', semanticId: 'GameState', intent: 'create' },
  { type: 'plan-member', task: 'ready', slot: 'dir', owner: 'GameState', semanticId: 'direction', intent: 'create' },
  { type: 'plan-event', task: 'ready', slot: 'ev', semanticId: 'turn', facets: ['metadata', 'conditions', 'actions'], intent: 'create' },
  { type: 'plan-use', task: 'ready', alias: 'press', use: 'input.key.just-pressed' },
  { type: 'plan-use', task: 'ready', alias: 'setText', use: 'state.text.set' }
]);
assert.strictEqual(taskPlan.assertFeasible(memberReady, emptyDocument(), { revision: false }), true);

var ordered = taskPlan.orderWriteBatch([
  { type: 'then', slot: 'ev', capability: 'setText', value: 'up' },
  { type: 'member', slot: 'dir', roles: ['d'], value: 'right', bindings: [] },
  { type: 'event', slot: 'ev', kind: 'rule', locals: {} },
  { type: 'when', slot: 'ev', capability: 'press', key: 'Up' }
]);
assert.deepStrictEqual(ordered.map(function(command) { return command.type; }), ['member', 'event', 'when', 'then']);
// Free executor may address write slots as Owner.slotId or Owner.semanticId.
var growthPlan = taskPlan.create([
  { type: 'plan-task', semanticId: 'food', goal: 'growth field', after: [] },
  { type: 'plan-game', task: 'food', slot: 'g', semanticId: 'g1', intent: 'create' },
  { type: 'plan-entity', task: 'food', slot: 'state', semanticId: 'GameState', intent: 'create' },
  { type: 'plan-member', task: 'food', slot: 'growth', owner: 'GameState', semanticId: 'pendingGrowth', intent: 'create' }
]);
var growthResolved = taskPlan.resolveBatch(growthPlan, 'food', [
  { type: 'game', slot: 'g', name: 'G' },
  { type: 'entity', slot: 'state', roles: ['state'], kind: 'state', behaviors: [] },
  { type: 'member', slot: 'GameState.growth', roles: ['growth'], value: 0, bindings: [] }
]);
assert.strictEqual(growthResolved[2].semanticId, 'pendingGrowth');
assert.strictEqual(growthResolved[2].entity, 'GameState');
assert.throws(function() {
  taskPlan.assertBatchSlotCoverage(memberReady, 'ready', [
    { type: 'event', slot: 'ev', kind: 'rule', locals: {} },
    { type: 'when', slot: 'ev', capability: 'press', key: 'Up' },
    { type: 'then', slot: 'ev', capability: 'setText', value: 'up' }
  ]);
}, function(error) { return error.code === 'SEMANTIC_TASK_SLOT_UNCOVERED' && /dir/.test(error.message); });
assert.strictEqual(taskPlan.assertBatchSlotCoverage(memberReady, 'ready', [
  { type: 'game', slot: 'g', name: 'G' },
  { type: 'entity', slot: 'state', roles: ['state'], kind: 'state', behaviors: [] },
  { type: 'member', slot: 'dir', roles: ['d'], value: 'right', bindings: [] },
  { type: 'event', slot: 'ev', kind: 'rule', locals: {} },
  { type: 'when', slot: 'ev', capability: 'press', key: 'Up' },
  { type: 'then', slot: 'ev', capability: 'setText', value: 'up' }
]), true);

var withReadNoise = taskPlan.create([
  { type: 'plan-task', semanticId: 'fields', goal: 'members only', after: [] },
  { type: 'plan-member', task: 'fields', slot: 'score', owner: 'GameState', semanticId: 'score', intent: 'create' },
  { type: 'plan-entity', task: 'fields', slot: 'stateRead', semanticId: 'GameState', intent: 'read' }
]);
var cleaned = taskPlan.dropReadSlotWrites(withReadNoise, 'fields', [
  { type: 'entity', slot: 'stateRead', roles: ['state'], kind: 'state', behaviors: [] },
  { type: 'member', slot: 'score', roles: ['score'], value: 0, bindings: [] }
]);
assert.deepStrictEqual(cleaned.map(function(command) { return command.type + ':' + command.slot; }), ['member:score']);

// Nested expressions select plan-use aliases with capability=; bare member slots sugar the unique reader.
var timedPlan = taskPlan.create([
  { type: 'plan-task', semanticId: 'move', goal: 'move', after: [] },
  { type: 'plan-entity', task: 'move', slot: 'head', semanticId: 'snakeHead', intent: 'read' },
  { type: 'plan-member', task: 'move', slot: 'step', owner: 'GameState', semanticId: 'step', intent: 'read' },
  { type: 'plan-event', task: 'move', slot: 'ev', semanticId: 'move_right', intent: 'create', facets: ['metadata', 'conditions', 'actions'] },
  { type: 'plan-use', task: 'move', alias: 'addX', use: 'object.x.add' },
  { type: 'plan-use', task: 'move', alias: 'num', use: 'state.number' },
  { type: 'plan-use', task: 'move', alias: 'timer', use: 'timer.elapsed' },
  { type: 'plan-use', task: 'move', alias: 'cmp', use: 'state.text.compare' },
  { type: 'plan-use', task: 'move', alias: 'reset', use: 'timer.reset' },
  { type: 'plan-member', task: 'move', slot: 'dir', owner: 'GameState', semanticId: 'direction', intent: 'read' }
]);
var resolvedExpr = taskPlan.resolveBatch(timedPlan, 'move', [
  { type: 'event', slot: 'ev', kind: 'rule', locals: {} },
  { type: 'when', slot: 'ev', capability: 'timer', timer: 't', operator: '>=', seconds: 0.15 },
  { type: 'when', slot: 'ev', capability: 'cmp', target: 'dir', operator: '=', value: 'right' },
  { type: 'then', slot: 'ev', capability: 'reset', timer: 't' },
  { type: 'then', slot: 'ev', capability: 'addX', target: 'head', value: { capability: 'num', target: 'step' } }
]);
assert.strictEqual(resolvedExpr[resolvedExpr.length - 1].value.use, 'state.number');
assert.strictEqual(resolvedExpr[resolvedExpr.length - 1].value.target, 'GameState.step');
assert.strictEqual(Object.prototype.hasOwnProperty.call(resolvedExpr[resolvedExpr.length - 1].value, 'capability'), false);
var resolvedBare = taskPlan.resolveBatch(timedPlan, 'move', [
  { type: 'event', slot: 'ev', kind: 'rule', locals: {} },
  { type: 'when', slot: 'ev', capability: 'timer', timer: 't', operator: '>=', seconds: 0.15 },
  { type: 'when', slot: 'ev', capability: 'cmp', target: 'dir', operator: '=', value: 'right' },
  { type: 'then', slot: 'ev', capability: 'reset', timer: 't' },
  { type: 'then', slot: 'ev', capability: 'addX', target: 'head', value: 'step' }
]);
assert.strictEqual(resolvedBare[resolvedBare.length - 1].value.use, 'state.number');
assert.strictEqual(resolvedBare[resolvedBare.length - 1].value.target, 'GameState.step');

// Entity.member address, unique entity semanticId, and slot#facet are normalized at resolve.
var resolvedAddress = taskPlan.resolveBatch(timedPlan, 'move', [
  { type: 'event', slot: 'ev', kind: 'rule', locals: {} },
  { type: 'when', slot: 'ev#conditions', capability: 'timer', timer: 't', operator: '>=', seconds: 0.15 },
  { type: 'when', slot: 'ev', capability: 'cmp', target: 'GameState.direction', operator: '=', value: 'right' },
  { type: 'then', slot: 'ev', capability: 'reset', timer: 't' },
  { type: 'then', slot: 'ev', capability: 'addX', target: 'snakeHead', value: 'GameState.step' }
]);
assert.strictEqual(resolvedAddress[1].event, 'move_right');
assert.strictEqual(resolvedAddress[2].target, 'GameState.direction');
assert.strictEqual(resolvedAddress[4].target, 'snakeHead');
assert.strictEqual(resolvedAddress[4].value.use, 'state.number');
assert.strictEqual(resolvedAddress[4].value.target, 'GameState.step');
var resolvedCapAsMember = taskPlan.resolveBatch(timedPlan, 'move', [
  { type: 'event', slot: 'ev', kind: 'rule', locals: {} },
  { type: 'when', slot: 'ev', capability: 'timer', timer: 't', operator: '>=', seconds: 0.15 },
  { type: 'when', slot: 'ev', capability: 'cmp', target: 'dir', operator: '=', value: 'right' },
  { type: 'then', slot: 'ev', capability: 'reset', timer: 't' },
  { type: 'then', slot: 'ev', capability: 'addX', target: 'head', value: { capability: 'step' } }
]);
assert.strictEqual(resolvedCapAsMember[4].value.use, 'state.number');
assert.strictEqual(resolvedCapAsMember[4].value.target, 'GameState.step');

assert.throws(function() {
  taskPlan.assertFeasible(taskPlan.create([
    { type: 'plan-task', semanticId: 'fields', goal: 'add fields', after: [] },
    { type: 'plan-entity', task: 'fields', slot: 'state', semanticId: 'GameState', intent: 'update' },
    { type: 'plan-member', task: 'fields', slot: 'score', owner: 'GameState', semanticId: 'score', intent: 'create' }
  ]), {
    game: { semanticId: 'g', name: 'G' },
    entities: [{ semanticId: 'GameState', roles: ['state'], objectTypeRef: null, behaviorTypeRefs: [], members: [] }],
    components: [], events: [], assetIntents: [], layoutIntents: [], tuningPolicies: { relativeChange: {} }
  }, { revision: true });
}, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_INFEASIBLE' && /plan-member owns field changes/.test(error.message); });

var revisionDoc = {
  game: { semanticId: 'g', name: 'G' },
  entities: [{ semanticId: 'GameState', roles: ['state'], objectTypeRef: null, behaviorTypeRefs: [], members: [{ semanticId: 'score', roles: ['score'], value: 0, bindings: [] }] }],
  components: [], events: [], assetIntents: [], layoutIntents: [], tuningPolicies: { relativeChange: {} }
};

// Read-only tasks cannot commit a delta.
assert.throws(function() {
  taskPlan.assertFeasible(taskPlan.create([
    { type: 'plan-task', semanticId: 'readonly', goal: 'only reads', after: [] },
    { type: 'plan-entity', task: 'readonly', slot: 'state', semanticId: 'GameState', intent: 'read' },
    { type: 'plan-member', task: 'readonly', slot: 'score', owner: 'GameState', semanticId: 'score', intent: 'read' }
  ]), revisionDoc, { revision: true });
}, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_INFEASIBLE' && /no mutation slots/.test(error.message); });

// Entity-update + member reads is the empty-progress free-plan shell (fields are plan-member work).
assert.throws(function() {
  taskPlan.assertFeasible(taskPlan.create([
    { type: 'plan-task', semanticId: 'shell', goal: 'pretend fields via entity update', after: [] },
    { type: 'plan-entity', task: 'shell', slot: 'state', semanticId: 'GameState', intent: 'update' },
    { type: 'plan-member', task: 'shell', slot: 'score', owner: 'GameState', semanticId: 'score', intent: 'read' }
  ]), revisionDoc, { revision: true });
}, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_INFEASIBLE' && /roles\|kind\|behaviors/.test(error.message); });

// Pure entity-record update (roles|kind|behaviors only) remains feasible.
assert.strictEqual(taskPlan.assertFeasible(taskPlan.create([
  { type: 'plan-task', semanticId: 'meta', goal: 'change entity metadata', after: [] },
  { type: 'plan-entity', task: 'meta', slot: 'state', semanticId: 'GameState', intent: 'update' }
]), revisionDoc, { revision: true }), true);

// Event actions + plan-member update of an existing member is a free-plan misfire.
assert.throws(function() {
  taskPlan.assertFeasible(taskPlan.create([
    { type: 'plan-task', semanticId: 'turn', goal: 'up input', after: [] },
    { type: 'plan-event', task: 'turn', slot: 'ev', semanticId: 'turn_up', intent: 'create', facets: ['metadata', 'conditions', 'actions'] },
    { type: 'plan-member', task: 'turn', slot: 'dir', owner: 'GameState', semanticId: 'score', intent: 'update' },
    { type: 'plan-use', task: 'turn', alias: 'press', use: 'input.key.just-pressed' },
    { type: 'plan-use', task: 'turn', alias: 'set', use: 'state.text.set' }
  ]), revisionDoc, { revision: true });
}, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_INFEASIBLE' && /must not plan-member update existing/.test(error.message); });

// New shell without events cannot invent field members (free core-model misfire).
assert.throws(function() {
  taskPlan.assertFeasible(taskPlan.create([
    { type: 'plan-task', semanticId: 'core', goal: 'entity shell only', after: [] },
    { type: 'plan-game', task: 'core', slot: 'g', semanticId: 'g1', intent: 'create' },
    { type: 'plan-entity', task: 'core', slot: 'state', semanticId: 'GameState', intent: 'create' },
    { type: 'plan-member', task: 'core', slot: 'score', owner: 'GameState', semanticId: 'score', intent: 'create' }
  ]), emptyDocument(), { revision: false });
}, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_INFEASIBLE' && /without event mutation cannot create member/.test(error.message); });
assert.strictEqual(taskPlan.assertFeasible(taskPlan.create([
  { type: 'plan-task', semanticId: 'core', goal: 'entity shell only', after: [] },
  { type: 'plan-game', task: 'core', slot: 'g', semanticId: 'g1', intent: 'create' },
  { type: 'plan-entity', task: 'core', slot: 'state', semanticId: 'GameState', intent: 'create' },
  { type: 'plan-member', task: 'core', slot: 'score', owner: 'GameState', semanticId: 'score', intent: 'create' }
]), emptyDocument(), { revision: false, allowShellMembers: true }), true);

// Revision: do not invent a new entity only to host members when draft already has scene state.
assert.throws(function() {
  taskPlan.assertFeasible(taskPlan.create([
    { type: 'plan-task', semanticId: 'loss', goal: 'loss', after: [] },
    { type: 'plan-entity', task: 'loss', slot: 'gos', semanticId: 'GameOverState', intent: 'create' },
    { type: 'plan-member', task: 'loss', slot: 'go', owner: 'GameOverState', semanticId: 'gameOver', intent: 'create' },
    { type: 'plan-event', task: 'loss', slot: 'ev', semanticId: 'hit', intent: 'create', facets: ['metadata', 'conditions', 'actions'] },
    { type: 'plan-use', task: 'loss', alias: 'set', use: 'state.boolean.set' },
    { type: 'plan-use', task: 'loss', alias: 'is', use: 'state.boolean.is' }
  ]), revisionDoc, { revision: true });
}, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_INFEASIBLE' && /existing draft state/.test(error.message); });

// object.x is a number-expression, not a plan-use top-level when/then (free food misfire).
var foodDoc = {
  game: { semanticId: 'g', name: 'G' },
  entities: [
    { semanticId: 'snakeHead', roles: ['player'], objectTypeRef: 'gdjs://object/Sprite::Sprite', behaviorTypeRefs: [], members: [] },
    { semanticId: 'food', roles: ['food'], objectTypeRef: 'gdjs://object/Sprite::Sprite', behaviorTypeRefs: [], members: [] },
    { semanticId: 'GameState', roles: ['state'], objectTypeRef: null, behaviorTypeRefs: [], members: [
      { semanticId: 'score', roles: ['score'], value: 0, bindings: [] },
      { semanticId: 'step', roles: ['step'], value: 32, bindings: [] }
    ] }
  ],
  components: [], events: [], assetIntents: [], layoutIntents: [], tuningPolicies: { relativeChange: {} }
};
assert.throws(function() {
  taskPlan.assertFeasible(taskPlan.create([
    { type: 'plan-task', semanticId: 'food', goal: 'collect food', after: [] },
    { type: 'plan-event', task: 'food', slot: 'ev', semanticId: 'collect', intent: 'create', facets: ['metadata', 'conditions', 'actions'] },
    { type: 'plan-use', task: 'food', alias: 'collides', use: 'object.collides' },
    { type: 'plan-use', task: 'food', alias: 'add', use: 'state.number.add' },
    { type: 'plan-use', task: 'food', alias: 'posX', use: 'object.x' }
  ]), foodDoc, { revision: true });
}, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_INFEASIBLE' && /not a plan-use Entity\.member expression/.test(error.message); });
// state.number remains a valid expression plan-use with action consumers.
assert.strictEqual(taskPlan.assertFeasible(taskPlan.create([
  { type: 'plan-task', semanticId: 'food', goal: 'collect food', after: [] },
  { type: 'plan-event', task: 'food', slot: 'ev', semanticId: 'collect', intent: 'create', facets: ['metadata', 'conditions', 'actions'] },
  { type: 'plan-use', task: 'food', alias: 'collides', use: 'object.collides' },
  { type: 'plan-use', task: 'food', alias: 'add', use: 'state.number.add' },
  { type: 'plan-use', task: 'food', alias: 'place', use: 'object.place.random-grid' },
  { type: 'plan-use', task: 'food', alias: 'num', use: 'state.number' }
]), foodDoc, { revision: true }), true);

// Entity metadata is not a member field.
assert.throws(function() {
  taskPlan.create([
    { type: 'plan-task', semanticId: 'core', goal: 'core', after: [] },
    { type: 'plan-game', task: 'core', slot: 'g', semanticId: 'g1', intent: 'create' },
    { type: 'plan-entity', task: 'core', slot: 'h', semanticId: 'head', intent: 'create' },
    { type: 'plan-member', task: 'core', slot: 'k', owner: 'head', semanticId: 'kind', intent: 'create' }
  ]);
}, function(error) { return error.code === 'SEMANTIC_TASK_TARGET_INVALID' && /entity-record property/.test(error.message); });
assert.throws(function() {
  taskPlan.create([
    { type: 'plan-task', semanticId: 'core', goal: 'core', after: [] },
    { type: 'plan-game', task: 'core', slot: 'g', semanticId: 'g1', intent: 'create' },
    { type: 'plan-entity', task: 'core', slot: 'h', semanticId: 'head', intent: 'create' },
    { type: 'plan-member', task: 'core', slot: 'k', owner: 'head', semanticId: 'Head.kind', intent: 'create' }
  ]);
}, function(error) { return error.code === 'SEMANTIC_TASK_TARGET_INVALID' && /cannot contain/.test(error.message); });

// Foundation-only plan-use does not need plan-retrieve noise.
assert.throws(function() {
  taskPlan.assertFeasible(taskPlan.create([
    { type: 'plan-task', semanticId: 'turn', goal: 'up input', after: [] },
    { type: 'plan-event', task: 'turn', slot: 'ev', semanticId: 'turn_up', intent: 'create', facets: ['metadata', 'conditions', 'actions'] },
    { type: 'plan-use', task: 'turn', alias: 'press', use: 'input.key.just-pressed' },
    { type: 'plan-use', task: 'turn', alias: 'set', use: 'state.text.set' },
    { type: 'plan-retrieve', task: 'turn', alias: 'r1', group: 'g13', kind: 'condition' }
  ]), revisionDoc, { revision: true });
}, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_INFEASIBLE' && /plan-retrieve while every plan-use is a foundation/.test(error.message); });

// state.number.compare with text-like direction member is a free-plan misfire.
assert.throws(function() {
  taskPlan.assertFeasible(taskPlan.create([
    { type: 'plan-task', semanticId: 'move', goal: 'move', after: [] },
    { type: 'plan-event', task: 'move', slot: 'ev', semanticId: 'move_right', intent: 'create', facets: ['metadata', 'conditions', 'actions'] },
    { type: 'plan-use', task: 'move', alias: 'timer', use: 'timer.elapsed' },
    { type: 'plan-use', task: 'move', alias: 'cmp', use: 'state.number.compare' },
    { type: 'plan-use', task: 'move', alias: 'reset', use: 'timer.reset' },
    { type: 'plan-use', task: 'move', alias: 'addX', use: 'object.x.add' }
  ]), {
    game: { semanticId: 'g', name: 'G' },
    entities: [
      { semanticId: 'snakeHead', roles: ['player'], objectTypeRef: 'gdjs://object/Sprite::Sprite', behaviorTypeRefs: [], members: [] },
      { semanticId: 'GameState', roles: ['state'], objectTypeRef: null, behaviorTypeRefs: [], members: [
        { semanticId: 'direction', roles: ['d'], value: 'right', bindings: [] },
        { semanticId: 'step', roles: ['s'], value: 32, bindings: [] }
      ] }
    ],
    components: [], events: [], assetIntents: [], layoutIntents: [], tuningPolicies: { relativeChange: {} }
  }, { revision: true });
}, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_INFEASIBLE' && /state\.text\.compare/.test(error.message); });

// Draft-world entities/members count as visible without plan-read slots.
assert.strictEqual(taskPlan.assertFeasible(taskPlan.create([
  { type: 'plan-task', semanticId: 'move', goal: 'move with draft world', after: [] },
  { type: 'plan-event', task: 'move', slot: 'ev', semanticId: 'move_right', intent: 'create', facets: ['metadata', 'conditions', 'actions'] },
  { type: 'plan-use', task: 'move', alias: 'timer', use: 'timer.elapsed' },
  { type: 'plan-use', task: 'move', alias: 'addX', use: 'object.x.add' },
  { type: 'plan-use', task: 'move', alias: 'num', use: 'state.number' }
]), {
  game: { semanticId: 'g', name: 'G' },
  entities: [
    { semanticId: 'snakeHead', roles: ['player'], objectTypeRef: 'gdjs://object/Sprite::Sprite', behaviorTypeRefs: [], members: [] },
    { semanticId: 'GameState', roles: ['state'], objectTypeRef: null, behaviorTypeRefs: [], members: [{ semanticId: 'step', roles: ['step'], value: 32, bindings: [] }] }
  ],
  components: [], events: [], assetIntents: [], layoutIntents: [], tuningPolicies: { relativeChange: {} }
}, { revision: true }), true);

// Free loss-restart: target=GameState.gameOverFlag uses plan slot id, not field semanticId isGameOver.
var flagPlan = taskPlan.create([
  { type: 'plan-task', semanticId: 'loss', goal: 'loss', after: [] },
  { type: 'plan-member', task: 'loss', slot: 'gameOverFlag', owner: 'GameState', semanticId: 'isGameOver', intent: 'create' },
  { type: 'plan-event', task: 'loss', slot: 'ev', semanticId: 'hit', intent: 'create', facets: ['metadata', 'conditions', 'actions'] },
  { type: 'plan-use', task: 'loss', alias: 'set', use: 'state.boolean.set' },
  { type: 'plan-use', task: 'loss', alias: 'always', use: 'always' }
]);
var flagResolved = taskPlan.resolveBatch(flagPlan, 'loss', [
  { type: 'member', slot: 'gameOverFlag', roles: ['flag'], value: false, bindings: [] },
  { type: 'event', slot: 'ev', kind: 'rule', locals: {} },
  { type: 'when', slot: 'ev', capability: 'always' },
  { type: 'then', slot: 'ev', capability: 'set', target: 'GameState.gameOverFlag', value: true }
], { beforeDocument: revisionDoc });
assert.strictEqual(flagResolved[3].target, 'GameState.isGameOver');
assert.strictEqual(flagResolved[3].use, 'state.boolean.set');

// Plan declares uses (for L3); executor may address foundation by handle; draft world fills references.
var draftWorldPlan = taskPlan.create([
  { type: 'plan-task', semanticId: 'move', goal: 'move', after: [] },
  { type: 'plan-event', task: 'move', slot: 'ev', semanticId: 'move_right', intent: 'create', facets: ['metadata', 'conditions', 'actions'] },
  { type: 'plan-use', task: 'move', alias: 'timer', use: 'timer.elapsed' },
  { type: 'plan-use', task: 'move', alias: 'cmp', use: 'state.text.compare' },
  { type: 'plan-use', task: 'move', alias: 'reset', use: 'timer.reset' },
  { type: 'plan-use', task: 'move', alias: 'addX', use: 'object.x.add' },
  { type: 'plan-use', task: 'move', alias: 'num', use: 'state.number' }
]);
var draftWorldDoc = {
  game: { semanticId: 'g', name: 'G' },
  entities: [
    { semanticId: 'snakeHead', roles: ['player'], objectTypeRef: 'gdjs://object/Sprite::Sprite', behaviorTypeRefs: [], members: [] },
    { semanticId: 'GameState', roles: ['state'], objectTypeRef: null, behaviorTypeRefs: [], members: [
      { semanticId: 'step', roles: ['step'], value: 32, bindings: [] },
      { semanticId: 'direction', roles: ['d'], value: 'right', bindings: [] }
    ] }
  ],
  components: [], events: [], assetIntents: [], layoutIntents: [], tuningPolicies: { relativeChange: {} }
};
assert.strictEqual(taskPlan.assertFeasible(draftWorldPlan, draftWorldDoc, { revision: true }), true);
var foundationResolved = taskPlan.authorizeWriteBatch(draftWorldPlan, 'move', [
  { type: 'event', slot: 'ev', kind: 'rule' },
  { type: 'when', slot: 'ev', capability: 'timer.elapsed', timer: 't', operator: '>=', seconds: 0.15 },
  { type: 'when', slot: 'ev', capability: 'state.text.compare', target: 'GameState.direction', operator: '=', value: 'right' },
  { type: 'then', slot: 'ev', capability: 'timer.reset', timer: 't' },
  { type: 'then', slot: 'ev', capability: 'object.x.add', target: 'snakeHead', value: 'GameState.step' }
], { beforeDocument: draftWorldDoc });
assert.strictEqual(foundationResolved[1].use, 'timer.elapsed');
assert.strictEqual(foundationResolved[4].target, 'snakeHead');
assert.strictEqual(foundationResolved[4].value.use, 'state.number');
assert.strictEqual(foundationResolved[4].value.target, 'GameState.step');

// Plan-scoped write failures: empty progress always; shell shape for structural misses.
assert.strictEqual(taskPlan.isPlanScopedWriteFailure(withReadNoise, 'fields', { code: 'SEMANTIC_TASK_DELTA_EMPTY' }), true);
assert.strictEqual(taskPlan.isPlanScopedWriteFailure(withReadNoise, 'fields', { code: 'SEMANTIC_TASK_BATCH_EMPTY' }), true);
assert.strictEqual(taskPlan.taskIsShellOnly(taskPlan.taskById(withReadNoise, 'fields')), false);
var shellPlan = taskPlan.create([
  { type: 'plan-task', semanticId: 'meta', goal: 'change entity metadata', after: [] },
  { type: 'plan-entity', task: 'meta', slot: 'state', semanticId: 'GameState', intent: 'update' }
]);
assert.strictEqual(taskPlan.taskIsShellOnly(taskPlan.taskById(shellPlan, 'meta')), true);
assert.strictEqual(taskPlan.isPlanScopedWriteFailure(shellPlan, 'meta', { code: 'SEMANTIC_TASK_SLOT_KIND_INVALID' }), true);
assert.strictEqual(taskPlan.isPlanScopedWriteFailure(memberReady, 'ready', { code: 'SEMANTIC_TASK_SLOT_KIND_INVALID' }), false);

// authorizeWriteBatch is the sole write pipeline (coverage → resolve → scope).
var authorized = taskPlan.authorizeWriteBatch(memberReady, 'ready', [
  { type: 'game', slot: 'g', name: 'G' },
  { type: 'entity', slot: 'state', roles: ['state'], kind: 'state', behaviors: [] },
  { type: 'member', slot: 'dir', roles: ['d'], value: 'right' },
  { type: 'event', slot: 'ev', kind: 'rule', locals: {} },
  { type: 'when', slot: 'ev', capability: 'press', key: 'Up' },
  { type: 'then', slot: 'ev', capability: 'setText', value: 'up' }
]);
assert.strictEqual(authorized[2].bindings.length, 0, 'member.bindings defaults to empty operation-tag list');
assert.strictEqual(authorized[4].use, 'input.key.just-pressed');
assert.strictEqual(authorized[5].use, 'state.text.set');

console.log('[SemanticTaskPlan] v9 typed target slots, dictionary-grounded plan-use design, task-local dependencies, capability aliases, and exact resolution passed');
