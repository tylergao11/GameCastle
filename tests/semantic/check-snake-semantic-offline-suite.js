var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var dictionary = require('../../packages/semantic/src/capability-semantic-dictionary');
var parser = require('../../packages/semantic/src/semantic-dsl-parser');
var draftApi = require('../../packages/semantic/src/semantic-draft');
var referencesApi = require('../../packages/semantic/src/semantic-reference-runtime');
var sourceContract = require('../../packages/semantic/src/game-semantic-source');
var semanticRuntime = require('../../packages/semantic/src/semantic-llm2-runtime');
var benchmark = require('../benchmarks/snake-semantic-benchmark');
var replaySuite = require('../../scripts/semantic/replay-semantic-live-suite');
var seedLoader = require('../../packages/semantic/src/semantic-seed-loader');

function safe(value) { return String(value).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, ''); }
function targetSlot(target) { return ['target', safe(target.kind), target.owner ? safe(target.owner) : null, safe(target.semanticId)].filter(Boolean).join('_'); }
function capabilitySlot(use) { return 'cap_' + safe(use); }
function targetCommand(kind) { return { game: 'plan-game', 'entity-record': 'plan-entity', member: 'plan-member', component: 'plan-component', event: 'plan-event', asset: 'plan-asset', layout: 'plan-layout', policy: 'plan-policy' }[kind]; }
function planTask(value) {
  var commands = ['plan-task(semanticId=' + value.semanticId + ',goal=' + parser.stringifyValue(value.goal) + ',after=list())'];
  value.targets.concat(value.reads || []).forEach(function(target) {
    commands.push(targetCommand(target.kind) + '(task=' + value.semanticId + ',slot=' + targetSlot(target) + ',semanticId=' + target.semanticId + ',intent=' + target.intent + (target.owner ? ',owner=' + target.owner : '') + (target.facets ? ',facets=list(' + target.facets.join(',') + ')' : '') + ')');
  });
  (value.uses || []).forEach(function(use) { commands.push('plan-use(task=' + value.semanticId + ',alias=' + capabilitySlot(use) + ',use=' + use + ')'); });
  return commands.join(';');
}

var fixtures = {
  'core-model': {
    plan: planTask({ semanticId: 'core_model', goal: 'Create only the core model.', targets: [
      { kind: 'game', semanticId: 'snakeProbe', intent: 'create' },
      { kind: 'entity-record', semanticId: 'snakeHead', intent: 'create' },
      { kind: 'entity-record', semanticId: 'food', intent: 'create' },
      { kind: 'entity-record', semanticId: 'GameState', intent: 'create' },
      { kind: 'entity-record', semanticId: 'scoreText', intent: 'create' }
    ], catalogs: ['entity-kinds'] }),
    write: [
      'game(slot=target_game_snakeProbe,name="Snake Probe")',
      'entity(slot=target_entity_record_snakeHead,roles=list(player,"snake-head"),kind=sprite,behaviors=list())',
      'entity(slot=target_entity_record_food,roles=list(food),kind=sprite,behaviors=list())',
      'entity(slot=target_entity_record_GameState,roles=list(state),kind=state,behaviors=list())',
      'entity(slot=target_entity_record_scoreText,roles=list(ui,score),kind=text,behaviors=list())'
    ].join(';')
  },
  'state-fields': {
    plan: planTask({ semanticId: 'state_fields', goal: 'Create the three state fields.', targets: [
      { kind: 'member', owner: 'GameState', semanticId: 'score', intent: 'create' },
      { kind: 'member', owner: 'GameState', semanticId: 'direction', intent: 'create' },
      { kind: 'member', owner: 'GameState', semanticId: 'step', intent: 'create' }
    ], reads: [{ kind: 'entity-record', semanticId: 'GameState', intent: 'read' }] }),
    write: [
      'member(slot=target_member_GameState_score,roles=list(score),value=0,bindings=list())',
      'member(slot=target_member_GameState_direction,roles=list("movement-direction"),value="right",bindings=list())',
      'member(slot=target_member_GameState_step,roles=list("grid-step"),value=32,bindings=list())'
    ].join(';')
  },
  'up-input': {
    plan: planTask({ semanticId: 'up_input', goal: 'Create only the Up input rule.', targets: [{ kind: 'event', semanticId: 'turn_up', intent: 'create', facets: ['metadata', 'conditions', 'actions'] }], reads: [{ kind: 'member', owner: 'GameState', semanticId: 'direction', intent: 'read' }], uses: ['input.key.just-pressed', 'state.text.set'], catalogs: ['event-kinds'] }),
    write: 'event(slot=target_event_turn_up,kind=rule,locals=record());when(slot=target_event_turn_up,capability=cap_input_key_just_pressed,key="Up");then(slot=target_event_turn_up,capability=cap_state_text_set,target=target_member_GameState_direction,value="up")'
  },
  'timed-right-movement': {
    plan: planTask({ semanticId: 'timed_right', goal: 'Create only timed right movement.', targets: [{ kind: 'event', semanticId: 'move_right', intent: 'create', facets: ['metadata', 'conditions', 'actions'] }], reads: [{ kind: 'entity-record', semanticId: 'snakeHead', intent: 'read' }, { kind: 'member', owner: 'GameState', semanticId: 'direction', intent: 'read' }, { kind: 'member', owner: 'GameState', semanticId: 'step', intent: 'read' }], uses: ['timer.elapsed', 'state.text.compare', 'timer.reset', 'object.x.add', 'state.number'], catalogs: ['event-kinds'] }),
    write: 'event(slot=target_event_move_right,kind=rule,locals=record());when(slot=target_event_move_right,capability=cap_timer_elapsed,timer=movementTimer,operator=">=",seconds=0.15);when(slot=target_event_move_right,capability=cap_state_text_compare,target=target_member_GameState_direction,operator="=",value="right");then(slot=target_event_move_right,capability=cap_timer_reset,timer=movementTimer);then(slot=target_event_move_right,capability=cap_object_x_add,target=target_entity_record_snakeHead,value=record(use=cap_state_number,target=target_member_GameState_step))'
  },
  'food-score-growth': {
    plan: planTask({ semanticId: 'food_growth', goal: 'Create only food scoring and pending growth.', targets: [
      { kind: 'member', owner: 'GameState', semanticId: 'pendingGrowth', intent: 'create' },
      { kind: 'event', semanticId: 'collect_food', intent: 'create', facets: ['metadata', 'conditions', 'actions'] }
    ], reads: [{ kind: 'entity-record', semanticId: 'snakeHead', intent: 'read' }, { kind: 'entity-record', semanticId: 'food', intent: 'read' }, { kind: 'member', owner: 'GameState', semanticId: 'score', intent: 'read' }, { kind: 'member', owner: 'GameState', semanticId: 'step', intent: 'read' }], uses: ['object.collides', 'state.number.add', 'object.place.random-grid', 'state.number'], catalogs: ['event-kinds'] }),
    write: 'member(slot=target_member_GameState_pendingGrowth,roles=list("pending-growth"),value=0,bindings=list());event(slot=target_event_collect_food,kind=rule,locals=record());when(slot=target_event_collect_food,capability=cap_object_collides,first=target_entity_record_snakeHead,second=target_entity_record_food);then(slot=target_event_collect_food,capability=cap_state_number_add,target=target_member_GameState_score,value=1);then(slot=target_event_collect_food,capability=cap_state_number_add,target=target_member_GameState_pendingGrowth,value=1);then(slot=target_event_collect_food,capability=cap_object_place_random_grid,target=target_entity_record_food,minX=0,maxX=640,minY=0,maxY=480,step=record(use=cap_state_number,target=target_member_GameState_step))'
  },
  'loss-restart': {
    plan: planTask({ semanticId: 'loss_restart', goal: 'Create only loss detection and restart.', targets: [
      { kind: 'entity-record', semanticId: 'snakeBody', intent: 'create' },
      { kind: 'member', owner: 'GameState', semanticId: 'gameOver', intent: 'create' },
      { kind: 'event', semanticId: 'boundary_left', intent: 'create', facets: ['metadata', 'conditions', 'actions'] },
      { kind: 'event', semanticId: 'boundary_right', intent: 'create', facets: ['metadata', 'conditions', 'actions'] },
      { kind: 'event', semanticId: 'boundary_top', intent: 'create', facets: ['metadata', 'conditions', 'actions'] },
      { kind: 'event', semanticId: 'boundary_bottom', intent: 'create', facets: ['metadata', 'conditions', 'actions'] },
      { kind: 'event', semanticId: 'self_collision', intent: 'create', facets: ['metadata', 'conditions', 'actions'] },
      { kind: 'event', semanticId: 'restart', intent: 'create', facets: ['metadata', 'conditions', 'actions'] }
    ], reads: [{ kind: 'entity-record', semanticId: 'snakeHead', intent: 'read' }, { kind: 'entity-record', semanticId: 'food', intent: 'read' }, { kind: 'member', owner: 'GameState', semanticId: 'score', intent: 'read' }, { kind: 'member', owner: 'GameState', semanticId: 'direction', intent: 'read' }, { kind: 'member', owner: 'GameState', semanticId: 'step', intent: 'read' }], uses: ['object.x.compare', 'object.y.compare', 'object.collides', 'input.key.just-pressed', 'state.boolean.is', 'state.boolean.set', 'state.number.set', 'state.text.set', 'object.delete', 'object.position.set', 'object.place.random-grid', 'state.number'], catalogs: ['entity-kinds', 'event-kinds'] }),
    write: [
      'entity(slot=target_entity_record_snakeBody,roles=list("snake-body"),kind=sprite,behaviors=list())',
      'member(slot=target_member_GameState_gameOver,roles=list("game-over"),value=false,bindings=list())',
      'event(slot=target_event_boundary_left,kind=rule,locals=record())',
      'when(slot=target_event_boundary_left,capability=cap_object_x_compare,target=target_entity_record_snakeHead,operator="<",value=0)',
      'then(slot=target_event_boundary_left,capability=cap_state_boolean_set,target=target_member_GameState_gameOver,value=true)',
      'event(slot=target_event_boundary_right,kind=rule,locals=record())',
      'when(slot=target_event_boundary_right,capability=cap_object_x_compare,target=target_entity_record_snakeHead,operator=">",value=640)',
      'then(slot=target_event_boundary_right,capability=cap_state_boolean_set,target=target_member_GameState_gameOver,value=true)',
      'event(slot=target_event_boundary_top,kind=rule,locals=record())',
      'when(slot=target_event_boundary_top,capability=cap_object_y_compare,target=target_entity_record_snakeHead,operator="<",value=0)',
      'then(slot=target_event_boundary_top,capability=cap_state_boolean_set,target=target_member_GameState_gameOver,value=true)',
      'event(slot=target_event_boundary_bottom,kind=rule,locals=record())',
      'when(slot=target_event_boundary_bottom,capability=cap_object_y_compare,target=target_entity_record_snakeHead,operator=">",value=480)',
      'then(slot=target_event_boundary_bottom,capability=cap_state_boolean_set,target=target_member_GameState_gameOver,value=true)',
      'event(slot=target_event_self_collision,kind=rule,locals=record())',
      'when(slot=target_event_self_collision,capability=cap_object_collides,first=target_entity_record_snakeHead,second=target_entity_record_snakeBody)',
      'then(slot=target_event_self_collision,capability=cap_state_boolean_set,target=target_member_GameState_gameOver,value=true)',
      'event(slot=target_event_restart,kind=rule,locals=record())',
      'when(slot=target_event_restart,capability=cap_input_key_just_pressed,key="Space")',
      'when(slot=target_event_restart,capability=cap_state_boolean_is,target=target_member_GameState_gameOver,value=true)',
      'then(slot=target_event_restart,capability=cap_state_number_set,target=target_member_GameState_score,value=0)',
      'then(slot=target_event_restart,capability=cap_state_text_set,target=target_member_GameState_direction,value="right")',
      'then(slot=target_event_restart,capability=cap_state_boolean_set,target=target_member_GameState_gameOver,value=false)',
      'then(slot=target_event_restart,capability=cap_object_delete,target=target_entity_record_snakeBody)',
      'then(slot=target_event_restart,capability=cap_object_position_set,target=target_entity_record_snakeHead,x=32,y=32)',
      'then(slot=target_event_restart,capability=cap_object_place_random_grid,target=target_entity_record_food,minX=0,maxX=640,minY=0,maxY=480,step=record(use=cap_state_number,target=target_member_GameState_step))'
    ].join(';')
  }
};

function seedSource(task, index) {
  if (!task.seedFile) return null;
  return seedLoader.load(fs.readFileSync(path.join(__dirname, '..', '..', task.seedFile), 'utf8'), index);
}

function provider(outputs) {
  var call = 0;
  return { invokeRole: async function() {
    var text = outputs[call++];
    if (text === undefined) throw new Error('Offline provider output exhausted.');
    return { ok: true, output: { text: text, finishReason: 'stop', diagnostics: { elapsedMs: 5, firstContentMs: 2, reasoningChars: 0, contentChars: text.length } }, receipt: { receiptId: 'offline-provider-' + call, usage: { prompt_cache_hit_tokens: call > 1 ? 90 : 0, prompt_cache_miss_tokens: call > 1 ? 10 : 100 } } };
  } };
}

(async function() {
  var index = dictionary.loadIndex(), directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-semantic-offline-')), results = [], evidence = [];
  try {
    for (var i = 0; i < benchmark.tasks.length; i++) {
      var task = benchmark.tasks[i], fixture = fixtures[task.id];
      assert(fixture, 'offline fixture missing for ' + task.id);
      var source = seedSource(task, index);
      var result = await semanticRuntime.create({ providerRuntime: provider([fixture.plan, fixture.write]) }).invoke({ requestId: 'offline-' + task.id, projectId: 'offline-suite', timeoutMs: semanticRuntime.HARD_TIMEOUT_MS, maxTokens: semanticRuntime.MAX_TOKENS, userRequest: task.task, source: source, index: index });
      var record = { probe: { benchmarkId: benchmark.contract.benchmarkId, benchmarkTaskId: task.id, task: task.task, seedFile: task.seedFile, semanticTimeoutMs: semanticRuntime.HARD_TIMEOUT_MS, semanticMaxTokens: semanticRuntime.MAX_TOKENS }, runTrace: result.runTrace, runLedger: result.runLedger, runState: result.runState, taskPlan: result.taskPlan, cacheSummary: result.cacheSummary, result: result };
      var file = path.join(directory, task.id + '.json');
      fs.writeFileSync(file, JSON.stringify(record), 'utf8');
      var execution = await replaySuite.replay({ absolutePath: file, locator: 'offline/' + task.id + '.json' }, index);
      var evaluated = benchmark.evaluate(task, execution);
      results.push(evaluated);
      evidence.push({ taskId: task.id, modelCalls: result.modelCalls, modelElapsedMs: execution.report.modelElapsedMs, cacheApplicable: execution.report.cacheSummary.applicable, cacheHitRate: execution.report.cacheSummary.cacheHitRate, replayParity: execution.report.recordedParity });
      assert.strictEqual(evaluated.passed, true, task.id + ' failed: ' + evaluated.checks.filter(function(check) { return !check.passed; }).map(function(check) { return check.id; }).join(', '));
    }
    assert.strictEqual(results.length, 6);
    assert.strictEqual(results.filter(function(result) { return result.semanticPassed; }).length, 6);
    assert.strictEqual(results.filter(function(result) { return result.runtimePassed; }).length, 6);
    assert(evidence.every(function(item) { return item.replayParity.planHash && item.replayParity.taskReceipts && item.replayParity.sourceHash; }));
    var applicableCacheRates = evidence.filter(function(item) { return item.cacheApplicable; }).map(function(item) { return item.cacheHitRate; });
    console.log('[SnakeSemanticOfflineSuite] ' + JSON.stringify({ tasks: 6, semanticPassed: 6, runtimePassed: 6, replayPassed: 6, minimumCacheHitRate: applicableCacheRates.length ? Math.min.apply(Math, applicableCacheRates) : null, maximumModelElapsedMs: Math.max.apply(Math, evidence.map(function(item) { return item.modelElapsedMs; })), modelCallsPerTask: Array.from(new Set(evidence.map(function(item) { return item.modelCalls; }))), evidence: evidence }));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
})().catch(function(error) { console.error(error); process.exit(1); });
