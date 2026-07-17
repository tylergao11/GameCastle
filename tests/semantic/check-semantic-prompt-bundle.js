var assert = require('assert');
var prompt = require('../../packages/semantic/src/semantic-llm2-prompt');
var contextApi = require('../../packages/semantic/src/semantic-commander-context');
var dictionary = require('../../packages/semantic/src/capability-semantic-dictionary');
var draftApi = require('../../packages/semantic/src/semantic-draft');
var referenceRuntime = require('../../packages/semantic/src/semantic-reference-runtime');
var taskPlan = require('../../packages/semantic/src/semantic-task-plan');
var promptBundle = require('../../packages/semantic/src/semantic-prompt-bundle');
var syntax = require('../../packages/semantic/src/semantic-dsl-syntax');

function transition(sequence, state, mode, failure, taskId) {
  return ['seq=' + sequence, 'event=TEST', 'state=' + state, 'mode=' + mode, 'task=' + (taskId || '-'), 'code=' + (failure ? failure.code : '-'), 'failure=' + (failure ? failure.signature : '-')].join('|');
}
function projection(log, state, mode, failure, taskId) {
  return {
    state: state,
    activeTaskId: taskId,
    allowedMode: mode,
    completedTaskIds: [],
    dispatchLog: [],
    lastFailure: failure,
    transitionLog: log
  };
}

var references = referenceRuntime.create(dictionary.loadIndex());
var draft = draftApi.create(references, null);
var plannerStart = projection([transition(1, 'PLANNING', 'plan', null, null)], 'PLANNING', 'plan', null, null);
var plannerContext = contextApi.planner(references, draft, 'Build a snake game', plannerStart);
var plannerA = prompt.buildPlannerBundle({ context: plannerContext });

assert.strictEqual(plannerA.protocolVersion, 'semantic-planner-prompt-v24');
assert(plannerA.system.indexOf('plan-task(') >= 0);
assert(plannerA.system.indexOf('plan-complete') >= 0);
assert.strictEqual(plannerA.system.indexOf('plan-entity('), -1);
assert(plannerA.system.indexOf('JOB|') >= 0, 'planner states job');
assert(plannerA.system.indexOf('WHEN_TASK|') >= 0 && plannerA.system.indexOf('WHEN_DONE|') >= 0, 'planner states when to task vs complete');
assert(plannerA.system.indexOf('DONE_SCOPE|') >= 0, 'planner defers assembly acceptance to outer loop');
assert(plannerA.system.indexOf('DISCIPLINE|') >= 0, 'planner states Hermes-style dispatch discipline');
assert(plannerA.system.indexOf('SETTLED|') >= 0, 'planner names settled ledger');
assert(plannerA.system.indexOf('GAP|') >= 0, 'planner schedules by remaining gap');
assert(plannerA.system.indexOf('TASK_GOAL|') >= 0, 'planner states how to write the work-order goal');
assert(plannerA.system.indexOf('ROUND|') >= 0 && plannerA.system.indexOf('exactly one command') >= 0);
assert(plannerA.user.indexOf('[L2-world]') >= 0);
assert(plannerA.user.indexOf('[L2-progress]') >= 0, 'planner user projects task progress');
assert(plannerA.user.indexOf('[L2-progress]') < plannerA.user.indexOf('[L2-world]'), 'progress before world so settled orders lead');
assert.strictEqual(plannerA.user.indexOf('receiptHash'), -1, 'progress omits receipt detail');
assert(plannerA.user.indexOf('semantic-coarse-world') >= 0 || plannerA.user.indexOf('viewKind') >= 0 || plannerContext.l2.world.viewKind === 'semantic-coarse-world');
assert.strictEqual(plannerContext.l2.world.viewKind, 'semantic-coarse-world');
assert.strictEqual(plannerContext.l2.world.summary, 'empty world');
assert.deepStrictEqual(plannerContext.l2.world.places, []);
assert.deepStrictEqual(plannerContext.l2.progress.open, []);
assert.deepStrictEqual(plannerContext.l2.board.placeIds, []);
assert.strictEqual(plannerA.user.indexOf('baseDraftIndex'), -1);
assert.strictEqual(plannerA.user.indexOf('stateOwners'), -1, 'coarse world omits fine stateOwners dump');
assert.strictEqual(plannerA.system.indexOf('L1-planner-operation-index'), -1, 'planner system has no L1 catalog dump');

// Settled ledger: taskId|goal only (Hermes-style closed units).
var withProgress = projection([transition(1, 'PLANNING', 'plan', null, null)], 'PLANNING', 'plan', null, null);
withProgress.completedTaskIds = ['t1'];
withProgress.dispatchLog = [{ taskId: 't1', goal: 'Create shell', receiptHash: 'semantic.task-receipt.secret' }];
var progressContext = contextApi.planner(references, draft, 'Build a snake game', withProgress);
assert.deepStrictEqual(progressContext.l2.progress.settled, ['t1|Create shell']);
assert.deepStrictEqual(progressContext.l2.progress.completed, ['t1|Create shell']);
assert.strictEqual(progressContext.l2.progress.settledCount, 1);
assert.deepStrictEqual(progressContext.l2.progress.open, []);
var progressBundle = prompt.buildPlannerBundle({ context: progressContext });
assert(progressBundle.user.indexOf('t1|Create shell') >= 0);
assert(progressBundle.user.indexOf('settled') >= 0 || progressBundle.user.indexOf('settledCount') >= 0);
assert.strictEqual(progressBundle.user.indexOf('secret'), -1);
assert.strictEqual(progressBundle.user.indexOf('receiptHash'), -1);

// Coarse world lists places after seed load (revision).
var seedLoader = require('../../packages/semantic/src/semantic-seed-loader');
var fs = require('fs');
var path = require('path');
var revisionSource = seedLoader.load(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'semantic', 'semantic-snake-core-seed.dsl'), 'utf8'), dictionary.loadIndex());
var revisionDraft = draftApi.create(references, revisionSource);
var revisionContext = contextApi.planner(references, revisionDraft, 'Add movement', plannerStart);
assert.strictEqual(revisionContext.l2.world.mode, 'revision');
assert(revisionContext.l2.world.places.some(function(place) { return place.id === 'snakeHead'; }));
assert(revisionContext.l2.world.places.some(function(place) { return place.id === 'GameState'; }));
assert.strictEqual(Object.prototype.hasOwnProperty.call(revisionContext.l2.world.places[0], 'members'), false);
assert(revisionContext.l2.board.placeIds.indexOf('snakeHead') >= 0);
assert(revisionContext.l2.board.placeIds.indexOf('GameState') >= 0);
var revisionBundle = prompt.buildPlannerBundle({ context: revisionContext });
assert(revisionBundle.user.indexOf('placeIds') >= 0 || revisionBundle.user.indexOf('snakeHead') >= 0);

var plan = taskPlan.create([{ type: 'plan-task', semanticId: 'move', goal: '蛇需要会动', after: [] }]);
var activeTask = taskPlan.taskById(plan, 'move');
var facts = contextApi.taskFacts(references, activeTask);
var executorStart = projection([transition(1, 'TASK_ACTIVE', 'write', null, 'move')], 'TASK_ACTIVE', 'write', null, 'move');
var slice = { schemaVersion: 1, documentKind: 'semantic-task-draft-slice', taskId: 'move', workMode: 'new', goal: '蛇需要会动', baseDraftHash: 'base', structureHash: 'slice', counts: { entities: 0, members: 0, events: 0 }, index: { game: null, entities: [], events: [] }, facts: [] };
var executorContext = contextApi.task(slice, plan, executorStart, activeTask, facts, null, 'Build movement');
var executorA = prompt.buildExecutorBundle({ context: executorContext });
assert.strictEqual(executorA.protocolVersion, 'semantic-executor-prompt-v31');
assert(executorA.system.indexOf('BOARD|') >= 0, 'executor states board mode');
assert(executorA.system.indexOf('CHANNELS|') >= 0, 'executor declares CHANNELS');
assert(executorA.system.indexOf('CH_ENVELOPE|') >= 0, 'executor envelope channel');
assert(executorA.system.indexOf('CH_OP|') >= 0, 'executor op channel');
assert(executorA.system.indexOf('CH_EXPR|') >= 0, 'executor expression channel');
assert(executorA.system.indexOf('CH_STRUCT|') >= 0, 'executor structure channel');
assert(executorA.system.indexOf('CH_COMPONENT|') >= 0, 'executor component channel');
assert(executorA.system.indexOf('CH_ASSET|') >= 0, 'executor asset channel');
assert(executorA.system.indexOf('CH_LAYOUT|') >= 0, 'executor layout channel');
assert(executorA.system.indexOf('[L1-components]') >= 0, 'component library lives in system');
assert(executorA.system.indexOf('WIRE|') >= 0, 'executor open-field wire');
assert(executorA.system.indexOf('WORK_ORDER|') >= 0, 'executor sole checklist is work order');
assert(executorA.system.indexOf('PRODUCT|') >= 0, 'executor treats product request as background');
assert.strictEqual(executorA.system.indexOf('EVENT_KIND|'), -1, 'legacy EVENT_KIND patch line removed');
assert.strictEqual(executorA.system.indexOf('NESTED|'), -1, 'legacy NESTED patch line removed');
// User: work order + board only once; dictionary catalogs stay in system (cache).
assert(executorA.user.indexOf('[L3-work-order]') >= 0);
assert(executorA.user.indexOf('[L3-board]') >= 0);
assert.strictEqual(executorA.user.indexOf('[L3-draft-slice]'), -1, 'no bloated draft-slice dump in user');
assert.strictEqual(executorA.user.indexOf('[L3-active-task]'), -1, 'active-task renamed to work-order');
assert.strictEqual(executorA.user.indexOf('[L3-ops-condition]'), -1, 'ops tables not in user');
assert(executorA.system.indexOf('[L1-ops-condition]') >= 0, 'ops tables live in system');
assert(executorA.system.indexOf('[L1-structure-kinds]') >= 0, 'structure kinds live in system');
assert(executorA.system.indexOf('[L1-asset-families]') >= 0, 'asset family handle table lives in system');
assert(executorA.system.indexOf('[L1-asset-styles]') >= 0, 'asset style handle table lives in system');
assert(executorA.system.indexOf('[L1-layouts]') >= 0, 'layout handle table lives in system');
assert(executorA.system.indexOf('f1|character') >= 0, 'character family is handle f1 not bare character');
assert(executorA.system.indexOf('s0|') >= 0, 'style handle table exposes s0');
assert(executorA.system.indexOf('l0|') >= 0, 'layout handle table exposes l0');
assert.strictEqual(executorA.system.indexOf('family=character'), -1, 'no example-style family=character prose');
assert(facts.layouts.some(function(line) { return line.indexOf('l0|') === 0; }), 'layout handles projected in taskFacts');
assert(executorA.user.indexOf('蛇需要会动') >= 0);
assert.strictEqual((executorA.user.match(/蛇需要会动/g) || []).length, 1, 'goal appears once in user');
assert(executorA.user.indexOf('[L2-product]') >= 0, 'product request projected as L2-product background');
assert.strictEqual(executorA.user.indexOf('[L2-run]'), -1, 'executor must not dump L2-run as a second checklist');
assert.strictEqual(executorContext.l2.productRequest, 'Build movement');
assert.strictEqual(executorContext.l3.activeTask.goal, '蛇需要会动');
assert(executorA.user.indexOf('[L3-work-order]') < executorA.user.indexOf('[L2-product]'), 'work order before product background');
assert(facts.opsCondition.some(function(line) { return line.indexOf('handle=') === 0; }), 'condition op rows start with handle=');
assert(facts.entityKinds.indexOf('sprite') >= 0, 'entity kinds projected');
assert(facts.assetFamilies.some(function(line) { return line.indexOf('f1|') === 0; }), 'asset family handles projected in taskFacts');
assert(executorA.system.indexOf('topdown') >= 0, 'behavior kinds in system');

var plannerProse = promptBundle.plannerProtocol().length - syntax.PLAN_LINES.join('\n').length;
assert(plannerProse < 2400, 'Planner protocol prose must stay compact; got ' + plannerProse);
['json', 'never', 'do not', "don't", 'example'].forEach(function(term) {
  assert.strictEqual(plannerA.system.toLowerCase().indexOf(term), -1, 'planner prompt remains positive: ' + term);
  assert.strictEqual(executorA.system.toLowerCase().indexOf(term), -1, 'executor prompt remains positive: ' + term);
});

assert(syntax.WRITE_LINES.some(function(line) { return line.indexOf('entity(') === 0 && line.indexOf('behaviors=') < 0; }), 'entity form omits empty-ceremony behaviors from required FORMS');
assert(syntax.optionalFieldNames('executor').indexOf('entity.behaviors') >= 0, 'entity.behaviors is optional ceremony');
var entityBare = require('../../packages/semantic/src/semantic-dsl-parser').parse(
  'entity(slot=food,roles=list(food),kind=sprite)',
  { phase: 'executor' }
);
assert.deepStrictEqual(entityBare.commands[0].behaviors, [], 'omitted entity.behaviors defaults to empty list');

var algebra = require('../../packages/semantic/src/semantic-event-algebra');
assert.strictEqual(algebra.isMemberPath('GameState.step'), true);
assert.strictEqual(algebra.isMemberPath('movement'), false);
var rolesEmpty = syntax.validateCommand({ type: 'member', slot: 'GameState.score', roles: [], value: 0 }, 'executor');
assert.deepStrictEqual(rolesEmpty.roles, ['score'], 'empty member.roles defaults from field id');

// Revision FORMS must not advertise game/policy (illegal on seeded board).
var revDraft = draftApi.create(references, revisionSource);
var revPlan = taskPlan.create([{ type: 'plan-task', semanticId: 'loss', goal: 'Add only loss detection and restart on the existing board.', after: [] }]);
var revTask = taskPlan.taskById(revPlan, 'loss');
var revFacts = contextApi.taskFacts(references, revTask);
var revSlice = require('../../packages/semantic/src/semantic-task-draft-slice').create(revDraft, revPlan, 'loss');
var revMachine = projection([transition(1, 'TASK_ACTIVE', 'write', null, 'loss')], 'TASK_ACTIVE', 'write', null, 'loss');
var revContext = contextApi.task(revSlice, revPlan, revMachine, revTask, revFacts, null, 'Add loss on board');
var revBundle = prompt.buildExecutorBundle({ context: revContext });
assert.strictEqual(revBundle.system.indexOf('WORK_MODE|revision') >= 0, true);
assert.strictEqual(revBundle.system.indexOf('\ngame('), -1, 'revision FORMS omits game(');
assert.strictEqual(revBundle.system.indexOf('\npolicy('), -1, 'revision FORMS omits policy(');
assert(revBundle.system.indexOf('\nentity(') >= 0, 'revision FORMS still has entity');
assert(revBundle.user.indexOf('[L3-board]') >= 0);
assert(revBundle.user.indexOf('workMode') >= 0 || revBundle.user.indexOf('revision') >= 0);
assert.strictEqual((revBundle.user.match(/Add only loss detection and restart on the existing board\./g) || []).length, 1, 'goal once on revision user');
assert.strictEqual(revBundle.user.indexOf('documentKind'), -1, 'board projection drops ceremony fields');
assert.strictEqual(revBundle.user.indexOf('structureHash'), -1, 'board projection drops structureHash');
assert(syntax.writeLinesForMode('new').some(function(line) { return line.indexOf('game(') === 0; }), 'new mode still has game');
assert.strictEqual(syntax.writeLinesForMode('revision').some(function(line) { return line.indexOf('game(') === 0; }), false);
// Cache-shaped: system holds catalogs; user is small task board.
assert(revBundle.bytes.system > revBundle.bytes.user, 'system catalogs dominate; user is task-local');

// Failure feedback must teach handle catalogs, not mis-route family errors to component advice.
var handleFb = taskPlan.buildFailureFeedback({
  code: 'SEMANTIC_REFERENCE_HANDLE_INVALID',
  message: 'family requires a handle from [param-context] or [retrieve]: character'
}, []);
assert.strictEqual(handleFb.class, 'handle-catalog');
assert(handleFb.repair.some(function(line) { return line.indexOf('[L1-asset-families]') >= 0; }), 'handle repair points at asset family catalog');
assert.strictEqual(handleFb.repair.some(function(line) { return line.indexOf('omit component for shell') >= 0; }), false, 'family handle errors must not get component shell repair');

console.log('[SemanticPromptBundle] v31 layout+cache shape+asset catalogs passed systemBytes=' + revBundle.bytes.system + ' userBytes=' + revBundle.bytes.user);
