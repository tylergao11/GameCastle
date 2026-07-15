var assert = require('assert');
var taskPlan = require('../../ai/semantic-task-plan');
var syntax = require('../../ai/semantic-dsl-syntax');

function planTask(overrides) {
  return Object.assign({
    type: 'plan-task',
    semanticId: 'state',
    goal: 'Create the shared state facts.',
    dependsOn: [],
    targets: [
      { kind: 'entity', semanticId: 'GameState', intent: 'create' },
      { kind: 'member', owner: 'GameState', semanticId: 'score', intent: 'create' }
    ],
    uses: [],
    catalogs: ['entity-kinds'],
    retrieves: []
  }, overrides || {});
}
function emptyDocument() { return { game: null, entities: [], components: [], events: [], assetIntents: [], layoutIntents: [], tuningPolicies: { relativeChange: {} } }; }

assert.strictEqual(taskPlan.LANGUAGE_ID, 'semantic-dsl-v2');
assert.strictEqual(taskPlan.PLAN_LINES.length, 1);
assert.strictEqual(syntax.LANGUAGE_ID, taskPlan.LANGUAGE_ID);
assert.strictEqual(syntax.PLAN_COMMANDS, taskPlan.PLAN_COMMANDS, 'syntax derives planner commands from TaskPlan without a second declaration');
assert.strictEqual(syntax.PLAN_LINES, taskPlan.PLAN_LINES, 'syntax derives planner forms from TaskPlan without a second declaration');
assert.strictEqual(Object.prototype.hasOwnProperty.call(syntax, 'READ_COMMANDS'), false, 'the deleted read-round command category is not exported');
assert.strictEqual(Object.prototype.hasOwnProperty.call(syntax, 'READ_LINES'), false, 'the deleted read-round syntax category is not exported');
assert.deepStrictEqual(taskPlan.PLANNER_CATALOGS, taskPlan.CATALOGS.concat([taskPlan.RETRIEVE_CATALOG]));
assert.strictEqual(taskPlan.RETRIEVE_CATALOG, 'extension-groups', 'planning sees the retrieve directory without making it an executor task catalog');
assert(taskPlan.PLAN_LINES[0].indexOf('uses=') >= 0 && taskPlan.PLAN_LINES[0].indexOf('catalogs=') >= 0 && taskPlan.PLAN_LINES[0].indexOf('retrieves=') >= 0, 'plan form is exported by the plan contract owner');

var commands = [
  planTask(),
  planTask({
    semanticId: 'score_event',
    goal: 'Display the current score.',
    dependsOn: ['state'],
    targets: [{ kind: 'event', semanticId: 'show_score', facets: ['actions', 'metadata', 'conditions'], intent: 'create' }],
    uses: ['text.display-number', 'always'],
    catalogs: ['event-kinds'],
    retrieves: [{ group: 'gAudio', kind: 'action' }]
  })
];
var plan = taskPlan.create(commands);
assert.strictEqual(plan.documentKind, 'semantic-task-plan');
assert.strictEqual(plan.tasks.length, 2);
assert(/^semantic-plan\.[a-f0-9]{24}$/.test(plan.planHash));
assert(Object.isFrozen(plan) && Object.isFrozen(plan.tasks[0]), 'sealed plans are immutable');
assert.deepStrictEqual(plan.tasks[1].targets[0].facets, ['metadata', 'conditions', 'actions']);
assert.deepStrictEqual(plan.tasks[1].uses, ['always', 'text.display-number']);
assert.deepStrictEqual(plan.tasks[1].catalogs, ['event-kinds']);

var reordered = taskPlan.create([
  planTask({ targets: [
    { kind: 'member', owner: 'GameState', semanticId: 'score', intent: 'create' },
    { kind: 'entity', semanticId: 'GameState', intent: 'create' }
  ] }),
  planTask({
    semanticId: 'score_event', goal: 'Display the current score.', dependsOn: ['state'],
    targets: [{ kind: 'event', semanticId: 'show_score', facets: ['conditions', 'actions', 'metadata'], intent: 'create' }],
    uses: ['always', 'text.display-number'], catalogs: ['event-kinds'], retrieves: [{ kind: 'action', group: 'gAudio' }]
  })
]);
assert.strictEqual(reordered.planHash, plan.planHash, 'unordered capability and target declarations normalize to one plan hash');

assert.throws(function() { taskPlan.create([]); }, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_EMPTY'; });
assert.throws(function() { taskPlan.create([planTask({ extra: true })]); }, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_UNKNOWN_FIELD'; });
assert.throws(function() { var value = planTask(); delete value.uses; taskPlan.create([value]); }, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_FIELD_REQUIRED'; });
assert.throws(function() { taskPlan.create([planTask(), planTask()]); }, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_DUPLICATE'; });
assert.throws(function() { taskPlan.create([planTask({ dependsOn: ['later'] }), planTask({ semanticId: 'later' })]); }, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_DEPENDENCY_INVALID'; });
assert.throws(function() { taskPlan.create([planTask({ catalogs: ['unknown-catalog'] })]); }, function(error) { return error.code === 'SEMANTIC_TASK_CATALOG_INVALID'; });
assert.throws(function() { taskPlan.create([planTask({ retrieves: [{ group: 'gAudio', kind: 'anything' }] })]); }, function(error) { return error.code === 'SEMANTIC_TASK_RETRIEVE_INVALID'; });
assert.throws(function() { taskPlan.create([planTask({ targets: [{ kind: 'member', semanticId: 'score', intent: 'create' }] })]); }, function(error) { return error.code === 'SEMANTIC_TASK_TARGET_INVALID'; });
assert.throws(function() { taskPlan.create([planTask({ targets: [{ kind: 'event', semanticId: 'show_score', intent: 'update' }] })]); }, function(error) { return error.code === 'SEMANTIC_TASK_TARGET_INVALID'; });
assert.throws(function() { taskPlan.create([planTask(), planTask({ semanticId: 'delete_state', dependsOn: ['state'], targets: [{ kind: 'entity', semanticId: 'GameState', intent: 'delete' }] })]); }, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_TARGET_CONFLICT'; }, 'entity deletion conflicts with an earlier member target');
assert.throws(function() {
  taskPlan.create([
    planTask({ semanticId: 'game_a', targets: [{ kind: 'game', semanticId: 'alpha', intent: 'create' }] }),
    planTask({ semanticId: 'game_b', dependsOn: ['game_a'], targets: [{ kind: 'game', semanticId: 'beta', intent: 'create' }] })
  ]);
}, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_TARGET_CONFLICT'; }, 'game identity is a singleton target even when semantic ids differ');

assert.deepStrictEqual(taskPlan.targetForCommand({ type: 'member', entity: 'GameState', semanticId: 'score' }), { kind: 'member', owner: 'GameState', semanticId: 'score', facet: null, operation: 'upsert', claim: 'member/GameState/score' });
assert.strictEqual(taskPlan.targetForCommand({ type: 'when', event: 'show_score', use: 'always' }).claim, 'event/show_score#conditions');
assert.strictEqual(taskPlan.targetForCommand({ type: 'remove', collection: 'events', semanticId: 'show_score' }).operation, 'delete');
assert.throws(function() { taskPlan.targetForCommand({ type: 'complete' }); }, function(error) { return error.code === 'SEMANTIC_TASK_COMMAND_UNMAPPED'; });

var stateCommands = [
  { type: 'entity', semanticId: 'GameState' },
  { type: 'member', entity: 'GameState', semanticId: 'score' }
];
assert.strictEqual(taskPlan.assertBatchScope(plan, 'state', stateCommands).length, 2);
assert.throws(function() { taskPlan.assertBatchScope(plan, 'state', [{ type: 'event', semanticId: 'unplanned' }]); }, function(error) { return error.code === 'SEMANTIC_TASK_SCOPE_VIOLATION'; });

var before = emptyDocument();
var after = emptyDocument();
after.entities.push({ semanticId: 'GameState', roles: ['state'], objectTypeRef: null, behaviorTypeRefs: [], members: [{ semanticId: 'score', roles: ['score'], value: 0, bindings: [] }] });
var receipt = taskPlan.verifyBatch(plan, 'state', stateCommands, before, after);
assert.strictEqual(receipt.taskId, 'state');
assert.deepStrictEqual(receipt.changedClaims, ['entity/GameState', 'member/GameState/score']);
assert(/^semantic-draft\.[a-f0-9]{24}$/.test(receipt.beforeDraftHash));
assert(Object.isFrozen(receipt));

var extra = JSON.parse(JSON.stringify(after));
extra.components.push({ semanticId: 'Unexpected', componentRef: 'x', target: null, config: {}, bindings: {} });
assert.throws(function() { taskPlan.verifyBatch(plan, 'state', stateCommands, before, extra); }, function(error) { return error.code === 'SEMANTIC_TASK_SCOPE_VIOLATION'; }, 'an undeclared semantic delta rejects the whole task batch');
assert.throws(function() { taskPlan.verifyBatch(plan, 'state', stateCommands, after, after); }, function(error) { return error.code === 'SEMANTIC_TASK_DELTA_EMPTY'; }, 'a successful task requires a real delta');

var conditionPlan = taskPlan.create([planTask({
  semanticId: 'condition', goal: 'Add the condition.',
  targets: [{ kind: 'event', semanticId: 'show_score', facets: ['conditions'], intent: 'create' }],
  uses: ['always'], catalogs: [], retrieves: []
})]);
var eventBefore = emptyDocument();
eventBefore.events.push({ semanticId: 'show_score', eventTypeRef: 'rule', arguments: {}, locals: {}, conditions: [], actions: [], children: [] });
var eventAfter = JSON.parse(JSON.stringify(eventBefore));
eventAfter.events[0].conditions.push({ semanticRef: 'always', arguments: {}, channel: 'conditions', operation: { use: 'always', slot: 'condition.0', part: 0, size: 1 }, inverted: false });
assert.strictEqual(taskPlan.verifyBatch(conditionPlan, 'condition', [{ type: 'when', event: 'show_score', use: 'always' }], eventBefore, eventAfter).changedClaims[0], 'event/show_score#conditions');
var eventWithAction = JSON.parse(JSON.stringify(eventAfter));
eventWithAction.events[0].actions.push({ semanticRef: 'show', arguments: {}, channel: 'actions', operation: { use: 'object.show', slot: 'action.0', part: 0, size: 1 }, awaited: false });
assert.throws(function() { taskPlan.verifyBatch(conditionPlan, 'condition', [{ type: 'when', event: 'show_score', use: 'always' }], eventBefore, eventWithAction); }, function(error) { return error.code === 'SEMANTIC_TASK_SCOPE_VIOLATION'; }, 'event facets remain separate mutation scopes');

var capabilityPlan = taskPlan.create([planTask({ semanticId: 'capability', uses: ['always'], catalogs: ['event-kinds'], retrieves: [{ group: 'gAudio', kind: 'action' }] })]);
assert.throws(function() { taskPlan.assertRetrievesSatisfied(capabilityPlan, 'capability', []); }, function(error) { return error.code === 'SEMANTIC_TASK_RETRIEVE_INCOMPLETE'; });
assert.strictEqual(taskPlan.assertRetrievesSatisfied(capabilityPlan, 'capability', [{ group: 'gAudio', kind: 'action' }]), true);
assert.strictEqual(taskPlan.assertDeclaredUses(capabilityPlan, 'capability', [{ type: 'when', event: 'rule', use: 'always' }], []), true);
assert.throws(function() { taskPlan.assertDeclaredUses(capabilityPlan, 'capability', [{ type: 'then', event: 'rule', use: 'object.hide' }], []); }, function(error) { return error.code === 'SEMANTIC_TASK_USE_UNDECLARED'; });
assert.strictEqual(taskPlan.assertDeclaredUses(capabilityPlan, 'capability', [{ type: 'then', event: 'rule', use: 'xAudio' }], ['xAudio']), true, 'retrieved operation handles are explicit task-local use facts');
assert.deepStrictEqual(taskPlan.commandUses([
  { type: 'member', bindings: ['state.number', 'always'] },
  { type: 'asset', bindings: ['object.show'] },
  { type: 'layout', bindings: ['state.number'] },
  { type: 'then', use: 'object.hide' }
]), ['always', 'object.hide', 'object.show', 'state.number'], 'member, asset, and layout binding arrays participate in active-task use authorization');

var entityCapabilityPlan = taskPlan.create([planTask({
  semanticId: 'entity_capabilities',
  targets: [{ kind: 'entity', semanticId: 'hero', intent: 'create' }],
  uses: [], catalogs: ['entity-kinds', 'behavior-kinds'], retrieves: []
})]);
var entityCapabilityFacts = { uses: {}, catalogs: { 'entity-kinds': ['sprite', 'text'], 'behavior-kinds': ['platformer'] }, retrieves: [] };
assert.strictEqual(taskPlan.assertCapabilityFacts(entityCapabilityPlan, 'entity_capabilities', [{ type: 'entity', semanticId: 'hero', kind: 'sprite', behaviors: ['platformer'] }], entityCapabilityFacts), true);
assert.throws(function() { taskPlan.assertCapabilityFacts(entityCapabilityPlan, 'entity_capabilities', [{ type: 'entity', semanticId: 'hero', kind: 'invented', behaviors: ['platformer'] }], entityCapabilityFacts); }, function(error) { return error.code === 'SEMANTIC_TASK_CAPABILITY_UNDECLARED'; });
assert.throws(function() { taskPlan.assertCapabilityFacts(entityCapabilityPlan, 'entity_capabilities', [{ type: 'entity', semanticId: 'hero', kind: 'sprite', behaviors: ['invented'] }], entityCapabilityFacts); }, function(error) { return error.code === 'SEMANTIC_TASK_CAPABILITY_UNDECLARED'; });

var guessedCapabilityPlan = taskPlan.create([planTask({ semanticId: 'guess', targets: [{ kind: 'entity', semanticId: 'hero', intent: 'create' }], catalogs: [], retrieves: [] })]);
assert.throws(function() { taskPlan.assertCapabilityFacts(guessedCapabilityPlan, 'guess', [{ type: 'entity', semanticId: 'hero', kind: 'sprite', behaviors: [] }], { uses: {}, catalogs: {}, retrieves: [] }); }, function(error) { return error.code === 'SEMANTIC_TASK_CAPABILITY_UNDECLARED'; }, 'an executor cannot guess sprite when its task declared no capability catalog');

var retrievedKindPlan = taskPlan.create([planTask({
  semanticId: 'retrieved_kinds',
  targets: [{ kind: 'entity', semanticId: 'hero', intent: 'create' }, { kind: 'event', semanticId: 'tick', facets: ['metadata'], intent: 'create' }],
  catalogs: [], retrieves: [{ group: 'gVisual', kind: 'object' }, { group: 'gVisual', kind: 'behavior' }, { group: 'gVisual', kind: 'event' }]
})]);
var retrievedKindFacts = {
  uses: {}, catalogs: {}, retrieves: [
    { group: 'gVisual', kind: 'object', facts: { group: 'gVisual', kind: 'object', entityKinds: ['xoHero|object|Hero'] } },
    { group: 'gVisual', kind: 'behavior', facts: { group: 'gVisual', kind: 'behavior', behaviorKinds: ['xbMove|behavior|Move'] } },
    { group: 'gVisual', kind: 'event', facts: { group: 'gVisual', kind: 'event', eventKinds: ['xeTick|event|Tick'] } }
  ]
};
assert.strictEqual(taskPlan.assertCapabilityFacts(retrievedKindPlan, 'retrieved_kinds', [
  { type: 'entity', semanticId: 'hero', kind: 'xoHero', behaviors: ['xbMove'] },
  { type: 'event', semanticId: 'tick', kind: 'xeTick' }
], retrievedKindFacts), true, 'declared retrieve facts authorize extension entity, behavior, and event handles');
assert.throws(function() { taskPlan.assertCapabilityFacts(retrievedKindPlan, 'retrieved_kinds', [{ type: 'entity', semanticId: 'hero', kind: 'xoOther', behaviors: [] }], retrievedKindFacts); }, function(error) { return error.code === 'SEMANTIC_TASK_CAPABILITY_UNDECLARED'; });
assert.throws(function() { var incomplete = JSON.parse(JSON.stringify(retrievedKindFacts)); incomplete.retrieves.pop(); taskPlan.assertCapabilityFacts(retrievedKindPlan, 'retrieved_kinds', [], incomplete); }, function(error) { return error.code === 'SEMANTIC_TASK_CAPABILITY_FACTS_INVALID'; }, 'declared retrieve facts are exact and complete');

var structuredCapabilityPlan = taskPlan.create([planTask({
  semanticId: 'structured_capabilities',
  targets: [
    { kind: 'event', semanticId: 'tick', facets: ['metadata'], intent: 'create' },
    { kind: 'component', semanticId: 'movement', intent: 'create' },
    { kind: 'asset', semanticId: 'hero_art', intent: 'create' },
    { kind: 'layout', semanticId: 'hero_layout', intent: 'create' }
  ],
  catalogs: ['event-kinds', 'layouts', 'asset-families', 'asset-styles', 'component-library'], retrieves: []
})]);
var structuredCapabilityFacts = { uses: {}, catalogs: {
  'event-kinds': ['rule|event|Rule'], layouts: ['l0|Center'], 'asset-families': ['f0|character'], 'asset-styles': ['s0|style|Default'], 'component-library': ['c0|component|Movement']
}, retrieves: [] };
var structuredCommands = [
  { type: 'event', semanticId: 'tick', kind: 'rule' },
  { type: 'component', semanticId: 'movement', kind: 'c0' },
  { type: 'asset', semanticId: 'hero_art', family: 'f0', style: 's0' },
  { type: 'layout', semanticId: 'hero_layout', relations: [{ semanticId: 'center', layout: 'l0', subjects: ['hero'] }] }
];
assert.strictEqual(taskPlan.assertCapabilityFacts(structuredCapabilityPlan, 'structured_capabilities', structuredCommands, structuredCapabilityFacts), true);
['event', 'component', 'family', 'style', 'layout'].forEach(function(field) {
  var changed = JSON.parse(JSON.stringify(structuredCommands));
  if (field === 'event') changed[0].kind = 'invented';
  if (field === 'component') changed[1].kind = 'invented';
  if (field === 'family') changed[2].family = 'invented';
  if (field === 'style') changed[2].style = 'invented';
  if (field === 'layout') changed[3].relations[0].layout = 'invented';
  assert.throws(function() { taskPlan.assertCapabilityFacts(structuredCapabilityPlan, 'structured_capabilities', changed, structuredCapabilityFacts); }, function(error) { return error.code === 'SEMANTIC_TASK_CAPABILITY_UNDECLARED'; }, field + ' capability must be present in exact task facts');
});

var feasibleNewPlan = taskPlan.create([planTask({
  semanticId: 'bootstrap',
  targets: [
    { kind: 'game', semanticId: 'demo', intent: 'create' },
    { kind: 'entity', semanticId: 'GameState', intent: 'create' },
    { kind: 'member', owner: 'GameState', semanticId: 'score', intent: 'create' }
  ]
})]);
assert.strictEqual(taskPlan.assertFeasible(feasibleNewPlan, emptyDocument(), { revision: false }), true, 'same-task entity creation satisfies member owner feasibility independent of normalized target order');
assert.throws(function() { taskPlan.assertFeasible(taskPlan.create([planTask()]), emptyDocument(), { revision: false }); }, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_INFEASIBLE'; }, 'a new source plan requires exactly one game create');
var existingEntity = emptyDocument();
existingEntity.entities.push({ semanticId: 'GameState', members: [] });
assert.throws(function() { taskPlan.assertFeasible(feasibleNewPlan, existingEntity, { revision: false }); }, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_INFEASIBLE'; }, 'create targets must be absent');
var missingUpdatePlan = taskPlan.create([planTask({ targets: [{ kind: 'game', semanticId: 'demo', intent: 'create' }, { kind: 'entity', semanticId: 'missing', intent: 'update' }] })]);
assert.throws(function() { taskPlan.assertFeasible(missingUpdatePlan, emptyDocument(), { revision: false }); }, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_INFEASIBLE'; }, 'update targets must exist');
var missingDeletePlan = taskPlan.create([planTask({ targets: [{ kind: 'game', semanticId: 'demo', intent: 'create' }, { kind: 'entity', semanticId: 'missing', intent: 'delete' }] })]);
assert.throws(function() { taskPlan.assertFeasible(missingDeletePlan, emptyDocument(), { revision: false }); }, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_INFEASIBLE'; }, 'delete targets must exist');
var orphanMemberPlan = taskPlan.create([planTask({ targets: [{ kind: 'game', semanticId: 'demo', intent: 'create' }, { kind: 'member', owner: 'missing', semanticId: 'score', intent: 'create' }] })]);
assert.throws(function() { taskPlan.assertFeasible(orphanMemberPlan, emptyDocument(), { revision: false }); }, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_INFEASIBLE'; }, 'member targets require an existing or same-task entity owner');
var orphanFacetPlan = taskPlan.create([planTask({ targets: [{ kind: 'game', semanticId: 'demo', intent: 'create' }, { kind: 'event', semanticId: 'tick', facets: ['actions'], intent: 'create' }], uses: ['object.show'], catalogs: ['event-kinds'] })]);
assert.throws(function() { taskPlan.assertFeasible(orphanFacetPlan, emptyDocument(), { revision: false }); }, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_INFEASIBLE'; }, 'event logic facets require event metadata');
var sameTaskEventPlan = taskPlan.create([planTask({ targets: [{ kind: 'game', semanticId: 'demo', intent: 'create' }, { kind: 'event', semanticId: 'tick', facets: ['metadata'], intent: 'create' }, { kind: 'event', semanticId: 'tick', facets: ['actions'], intent: 'create' }], uses: ['object.show'], catalogs: ['event-kinds'] })]);
assert.strictEqual(taskPlan.assertFeasible(sameTaskEventPlan, emptyDocument(), { revision: false }), true, 'same-task event metadata creation satisfies event facet feasibility independent of target order');
var revisionUpdatePlan = taskPlan.create([planTask({ targets: [{ kind: 'entity', semanticId: 'GameState', intent: 'update' }] })]);
assert.strictEqual(taskPlan.assertFeasible(revisionUpdatePlan, existingEntity, { revision: true }), true);
var revisionGamePlan = taskPlan.create([planTask({ targets: [{ kind: 'game', semanticId: 'demo', intent: 'update' }] })]);
assert.throws(function() { taskPlan.assertFeasible(revisionGamePlan, emptyDocument(), { revision: true }); }, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_INFEASIBLE'; }, 'revision plans cannot mutate game identity');
var revisionPolicyPlan = taskPlan.create([planTask({ targets: [{ kind: 'policy', semanticId: 'slight', intent: 'create' }] })]);
assert.throws(function() { taskPlan.assertFeasible(revisionPolicyPlan, emptyDocument(), { revision: true }); }, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_INFEASIBLE'; }, 'revision plans cannot mutate tuning policies');
var policyUpdatePlan = taskPlan.create([planTask({ targets: [{ kind: 'game', semanticId: 'demo', intent: 'create' }, { kind: 'policy', semanticId: 'slight', intent: 'update' }] })]);
assert.throws(function() { taskPlan.assertFeasible(policyUpdatePlan, emptyDocument(), { revision: false }); }, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_INFEASIBLE'; }, 'new source plans may only create tuning policies');
var policyCreatePlan = taskPlan.create([planTask({ targets: [{ kind: 'game', semanticId: 'demo', intent: 'create' }, { kind: 'policy', semanticId: 'slight', intent: 'create' }] })]);
assert.strictEqual(taskPlan.assertFeasible(policyCreatePlan, emptyDocument(), { revision: false }), true);

var noEntitySourcePlan = taskPlan.create([planTask({ targets: [{ kind: 'game', semanticId: 'demo', intent: 'create' }, { kind: 'entity', semanticId: 'hero', intent: 'create' }], catalogs: [], retrieves: [] })]);
assert.throws(function() { taskPlan.assertFeasible(noEntitySourcePlan, emptyDocument(), { revision: false }); }, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_INFEASIBLE'; }, 'entity create/update targets require an executable kind source before plan seal');
var retrievedEntitySourcePlan = taskPlan.create([planTask({ targets: [{ kind: 'game', semanticId: 'demo', intent: 'create' }, { kind: 'entity', semanticId: 'hero', intent: 'create' }], catalogs: [], retrieves: [{ group: 'gVisual', kind: 'object' }] })]);
assert.strictEqual(taskPlan.assertFeasible(retrievedEntitySourcePlan, emptyDocument(), { revision: false }), true, 'an object retrieve is a valid entity-kind source');
var noEventSourcePlan = taskPlan.create([planTask({ targets: [{ kind: 'game', semanticId: 'demo', intent: 'create' }, { kind: 'event', semanticId: 'tick', facets: ['metadata'], intent: 'create' }], catalogs: [], retrieves: [] })]);
assert.throws(function() { taskPlan.assertFeasible(noEventSourcePlan, emptyDocument(), { revision: false }); }, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_INFEASIBLE'; }, 'event creation requires an executable event-kind source before plan seal');
var retrievedEventSourcePlan = taskPlan.create([planTask({ targets: [{ kind: 'game', semanticId: 'demo', intent: 'create' }, { kind: 'event', semanticId: 'tick', facets: ['metadata'], intent: 'create' }], catalogs: [], retrieves: [{ group: 'gVisual', kind: 'event' }] })]);
assert.strictEqual(taskPlan.assertFeasible(retrievedEventSourcePlan, emptyDocument(), { revision: false }), true, 'an event retrieve is a valid event-kind source');
var noComponentSourcePlan = taskPlan.create([planTask({ targets: [{ kind: 'game', semanticId: 'demo', intent: 'create' }, { kind: 'component', semanticId: 'movement', intent: 'create' }], catalogs: [], retrieves: [] })]);
assert.throws(function() { taskPlan.assertFeasible(noComponentSourcePlan, emptyDocument(), { revision: false }); }, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_INFEASIBLE'; }, 'component create/update targets require component-library before plan seal');
var componentSourcePlan = taskPlan.create([planTask({ targets: [{ kind: 'game', semanticId: 'demo', intent: 'create' }, { kind: 'component', semanticId: 'movement', intent: 'create' }], catalogs: ['component-library'], retrieves: [] })]);
assert.strictEqual(taskPlan.assertFeasible(componentSourcePlan, emptyDocument(), { revision: false }), true);
var partialAssetSourcePlan = taskPlan.create([planTask({ targets: [{ kind: 'game', semanticId: 'demo', intent: 'create' }, { kind: 'asset', semanticId: 'hero_art', intent: 'create' }], catalogs: ['asset-families'], retrieves: [] })]);
assert.throws(function() { taskPlan.assertFeasible(partialAssetSourcePlan, emptyDocument(), { revision: false }); }, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_INFEASIBLE'; }, 'asset create/update targets require both family and style catalogs before plan seal');
var assetSourcePlan = taskPlan.create([planTask({ targets: [{ kind: 'game', semanticId: 'demo', intent: 'create' }, { kind: 'asset', semanticId: 'hero_art', intent: 'create' }], catalogs: ['asset-families', 'asset-styles'], retrieves: [] })]);
assert.strictEqual(taskPlan.assertFeasible(assetSourcePlan, emptyDocument(), { revision: false }), true);
var noLayoutSourcePlan = taskPlan.create([planTask({ targets: [{ kind: 'game', semanticId: 'demo', intent: 'create' }, { kind: 'layout', semanticId: 'hero_layout', intent: 'create' }], catalogs: [], retrieves: [] })]);
assert.throws(function() { taskPlan.assertFeasible(noLayoutSourcePlan, emptyDocument(), { revision: false }); }, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_INFEASIBLE'; }, 'layout create/update targets require the layouts catalog before plan seal');
var layoutSourcePlan = taskPlan.create([planTask({ targets: [{ kind: 'game', semanticId: 'demo', intent: 'create' }, { kind: 'layout', semanticId: 'hero_layout', intent: 'create' }], catalogs: ['layouts'], retrieves: [] })]);
assert.strictEqual(taskPlan.assertFeasible(layoutSourcePlan, emptyDocument(), { revision: false }), true);
var eventLogicBefore = emptyDocument();
eventLogicBefore.events.push({ semanticId: 'tick', conditions: [{ semanticRef: 'always' }], actions: [], children: [] });
var missingConditionSourcePlan = taskPlan.create([planTask({ targets: [{ kind: 'event', semanticId: 'tick', facets: ['conditions'], intent: 'update' }], uses: [], catalogs: [], retrieves: [] })]);
assert.throws(function() { taskPlan.assertFeasible(missingConditionSourcePlan, eventLogicBefore, { revision: true }); }, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_INFEASIBLE'; }, 'event conditions targets require a declared condition use or condition retrieve');
var logicOnlyUpdatePlan = taskPlan.create([planTask({ targets: [{ kind: 'event', semanticId: 'tick', facets: ['conditions'], intent: 'update' }], uses: ['always'], catalogs: [], retrieves: [] })]);
assert.strictEqual(taskPlan.assertFeasible(logicOnlyUpdatePlan, eventLogicBefore, { revision: true }), true, 'pure event condition/action update does not require an event-kind source');
var retrievedConditionPlan = taskPlan.create([planTask({ targets: [{ kind: 'event', semanticId: 'tick', facets: ['conditions'], intent: 'update' }], uses: [], catalogs: [], retrieves: [{ group: 'gLogic', kind: 'condition' }] })]);
assert.strictEqual(taskPlan.assertFeasible(retrievedConditionPlan, eventLogicBefore, { revision: true }), true, 'a condition retrieve is a valid event conditions source');
var eventActionBefore = JSON.parse(JSON.stringify(eventLogicBefore));
eventActionBefore.events[0].actions.push({ semanticRef: 'show' });
var missingActionSourcePlan = taskPlan.create([planTask({ targets: [{ kind: 'event', semanticId: 'tick', facets: ['actions'], intent: 'update' }], uses: ['always'], catalogs: [], retrieves: [] })]);
assert.throws(function() { taskPlan.assertFeasible(missingActionSourcePlan, eventActionBefore, { revision: true }); }, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_INFEASIBLE'; }, 'a condition use cannot satisfy an event actions source requirement');
var retrievedActionPlan = taskPlan.create([planTask({ targets: [{ kind: 'event', semanticId: 'tick', facets: ['actions'], intent: 'update' }], uses: [], catalogs: [], retrieves: [{ group: 'gLogic', kind: 'action' }] })]);
assert.strictEqual(taskPlan.assertFeasible(retrievedActionPlan, eventActionBefore, { revision: true }), true, 'an action retrieve is a valid event actions source');
var firstActionFacetPlan = taskPlan.create([planTask({ targets: [{ kind: 'event', semanticId: 'tick', facets: ['actions'], intent: 'create' }], uses: ['object.show'], catalogs: [], retrieves: [] })]);
assert.strictEqual(taskPlan.assertFeasible(firstActionFacetPlan, eventLogicBefore, { revision: true }), true, 'creating the first actions facet on existing event metadata needs an action source but no event-kind source');
var metadataUpdatePlan = taskPlan.create([planTask({ targets: [{ kind: 'event', semanticId: 'tick', facets: ['metadata'], intent: 'update' }], catalogs: [], retrieves: [] })]);
assert.throws(function() { taskPlan.assertFeasible(metadataUpdatePlan, eventLogicBefore, { revision: true }); }, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_INFEASIBLE'; }, 'event metadata update requires an event-kind source');
var deleteWithoutCapabilityPlan = taskPlan.create([planTask({ targets: [{ kind: 'entity', semanticId: 'GameState', intent: 'delete' }], catalogs: [], retrieves: [] })]);
assert.strictEqual(taskPlan.assertFeasible(deleteWithoutCapabilityPlan, existingEntity, { revision: true }), true, 'delete targets do not require construction capability catalogs');

var nestedEvents = emptyDocument();
nestedEvents.events.push({
  semanticId: 'root', conditions: [], actions: [], children: [{
    semanticId: 'child', conditions: [], actions: [], children: [{ semanticId: 'grandchild', conditions: [], actions: [], children: [] }]
  }]
});
var incompleteCascadePlan = taskPlan.create([planTask({
  semanticId: 'delete_tree', catalogs: [], retrieves: [],
  targets: [{ kind: 'event', semanticId: 'root', intent: 'delete' }, { kind: 'event', semanticId: 'child', intent: 'delete' }]
})]);
assert.throws(function() { taskPlan.assertFeasible(incompleteCascadePlan, nestedEvents, { revision: true }); }, function(error) { return error.code === 'SEMANTIC_TASK_PLAN_INFEASIBLE' && error.message.indexOf('grandchild') >= 0; }, 'parent event deletion must declare every nested descendant deletion in the same task');
var completeCascadePlan = taskPlan.create([planTask({
  semanticId: 'delete_tree', catalogs: [], retrieves: [],
  targets: [{ kind: 'event', semanticId: 'root', intent: 'delete' }, { kind: 'event', semanticId: 'child', intent: 'delete' }, { kind: 'event', semanticId: 'grandchild', intent: 'delete' }]
})]);
assert.strictEqual(taskPlan.assertFeasible(completeCascadePlan, nestedEvents, { revision: true }), true, 'a same-task full descendant cascade matches Draft parent deletion semantics');

var deletePlan = taskPlan.create([planTask({ semanticId: 'delete_rule', goal: 'Delete the obsolete rule.', targets: [{ kind: 'event', semanticId: 'obsolete', intent: 'delete' }], uses: [], catalogs: [], retrieves: [] })]);
var deleteBefore = emptyDocument();
deleteBefore.events.push({ semanticId: 'obsolete', eventTypeRef: 'rule', arguments: {}, locals: {}, conditions: [{ semanticRef: 'always', arguments: {}, channel: 'conditions', operation: { use: 'always', slot: 'condition.0', part: 0, size: 1 }, inverted: false }], actions: [], children: [] });
var deleteReceipt = taskPlan.verifyBatch(deletePlan, 'delete_rule', [{ type: 'remove', collection: 'events', semanticId: 'obsolete' }], deleteBefore, emptyDocument());
assert(deleteReceipt.changedClaims.indexOf('event/obsolete#metadata') >= 0 && deleteReceipt.changedClaims.indexOf('event/obsolete#conditions') >= 0, 'explicit event deletion owns that event node and its facets');

console.log('[SemanticTaskPlan] normalization, frozen-plan feasibility, exact capability facts, target scope, nested deletion, atomic delta, and hashing passed');
