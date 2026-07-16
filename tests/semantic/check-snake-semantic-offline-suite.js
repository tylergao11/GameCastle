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

function planTask(value) {
  return 'plan-task(' + [
    'semanticId=' + value.semanticId,
    'goal=' + JSON.stringify(value.goal),
    'dependsOn=[]',
    'targets=' + JSON.stringify(value.targets),
    'uses=' + JSON.stringify(value.uses || []),
    'catalogs=' + JSON.stringify(value.catalogs || []),
    'retrieves=[]'
  ].join(',') + ')';
}

var fixtures = {
  'core-model': {
    plan: planTask({ semanticId: 'core_model', goal: 'Create only the core model.', targets: [
      { kind: 'game', semanticId: 'snakeProbe', intent: 'create' },
      { kind: 'entity', semanticId: 'snakeHead', intent: 'create' },
      { kind: 'entity', semanticId: 'food', intent: 'create' },
      { kind: 'entity', semanticId: 'GameState', intent: 'create' },
      { kind: 'entity', semanticId: 'scoreText', intent: 'create' }
    ], catalogs: ['entity-kinds'] }),
    write: [
      'game(semanticId=snakeProbe,name="Snake Probe")',
      'entity(semanticId=snakeHead,roles=["player","snake-head"],kind=sprite,behaviors=[])',
      'entity(semanticId=food,roles=["food"],kind=sprite,behaviors=[])',
      'entity(semanticId=GameState,roles=["state"],kind=state,behaviors=[])',
      'entity(semanticId=scoreText,roles=["ui","score"],kind=text,behaviors=[])'
    ].join(';')
  },
  'state-fields': {
    plan: planTask({ semanticId: 'state_fields', goal: 'Create the three state fields.', targets: [
      { kind: 'member', owner: 'GameState', semanticId: 'score', intent: 'create' },
      { kind: 'member', owner: 'GameState', semanticId: 'direction', intent: 'create' },
      { kind: 'member', owner: 'GameState', semanticId: 'step', intent: 'create' }
    ] }),
    write: [
      'member(entity=GameState,semanticId=score,roles=["score"],value=0,bindings=[])',
      'member(entity=GameState,semanticId=direction,roles=["movement-direction"],value="right",bindings=[])',
      'member(entity=GameState,semanticId=step,roles=["grid-step"],value=32,bindings=[])'
    ].join(';')
  },
  'up-input': {
    plan: planTask({ semanticId: 'up_input', goal: 'Create only the Up input rule.', targets: [{ kind: 'event', semanticId: 'turn_up', intent: 'create', facets: ['metadata', 'conditions', 'actions'] }], uses: ['input.key.just-pressed', 'state.text.set'], catalogs: ['event-kinds'] }),
    write: 'event(semanticId=turn_up,kind=rule);when(event=turn_up,use=input.key.just-pressed,key="Up");then(event=turn_up,use=state.text.set,target=GameState.direction,value="up")'
  },
  'timed-right-movement': {
    plan: planTask({ semanticId: 'timed_right', goal: 'Create only timed right movement.', targets: [{ kind: 'event', semanticId: 'move_right', intent: 'create', facets: ['metadata', 'conditions', 'actions'] }], uses: ['timer.elapsed', 'state.text.compare', 'timer.reset', 'object.x.add', 'state.number'], catalogs: ['event-kinds'] }),
    write: 'event(semanticId=move_right,kind=rule);when(event=move_right,use=timer.elapsed,timer=movementTimer,operator=">=",seconds=0.15);when(event=move_right,use=state.text.compare,target=GameState.direction,operator="=",value="right");then(event=move_right,use=timer.reset,timer=movementTimer);then(event=move_right,use=object.x.add,target=snakeHead,value={"use":"state.number","target":"GameState.step"})'
  },
  'food-score-growth': {
    plan: planTask({ semanticId: 'food_growth', goal: 'Create only food scoring and pending growth.', targets: [
      { kind: 'member', owner: 'GameState', semanticId: 'pendingGrowth', intent: 'create' },
      { kind: 'event', semanticId: 'collect_food', intent: 'create', facets: ['metadata', 'conditions', 'actions'] }
    ], uses: ['object.collides', 'state.number.add', 'object.place.random-grid', 'state.number'], catalogs: ['event-kinds'] }),
    write: 'member(entity=GameState,semanticId=pendingGrowth,roles=["pending-growth"],value=0,bindings=[]);event(semanticId=collect_food,kind=rule);when(event=collect_food,use=object.collides,first=snakeHead,second=food);then(event=collect_food,use=state.number.add,target=GameState.score,value=1);then(event=collect_food,use=state.number.add,target=GameState.pendingGrowth,value=1);then(event=collect_food,use=object.place.random-grid,target=food,minX=0,maxX=640,minY=0,maxY=480,step={"use":"state.number","target":"GameState.step"})'
  },
  'loss-restart': {
    plan: planTask({ semanticId: 'loss_restart', goal: 'Create only loss detection and restart.', targets: [
      { kind: 'entity', semanticId: 'snakeBody', intent: 'create' },
      { kind: 'member', owner: 'GameState', semanticId: 'gameOver', intent: 'create' },
      { kind: 'event', semanticId: 'boundary_left', intent: 'create', facets: ['metadata', 'conditions', 'actions'] },
      { kind: 'event', semanticId: 'boundary_right', intent: 'create', facets: ['metadata', 'conditions', 'actions'] },
      { kind: 'event', semanticId: 'boundary_top', intent: 'create', facets: ['metadata', 'conditions', 'actions'] },
      { kind: 'event', semanticId: 'boundary_bottom', intent: 'create', facets: ['metadata', 'conditions', 'actions'] },
      { kind: 'event', semanticId: 'self_collision', intent: 'create', facets: ['metadata', 'conditions', 'actions'] },
      { kind: 'event', semanticId: 'restart', intent: 'create', facets: ['metadata', 'conditions', 'actions'] }
    ], uses: ['object.x.compare', 'object.y.compare', 'object.collides', 'input.key.just-pressed', 'state.boolean.is', 'state.boolean.set', 'state.number.set', 'state.text.set', 'object.delete', 'object.position.set', 'object.place.random-grid', 'state.number'], catalogs: ['entity-kinds', 'event-kinds'] }),
    write: [
      'entity(semanticId=snakeBody,roles=["snake-body"],kind=sprite,behaviors=[])',
      'member(entity=GameState,semanticId=gameOver,roles=["game-over"],value=false,bindings=[])',
      'event(semanticId=boundary_left,kind=rule)',
      'when(event=boundary_left,use=object.x.compare,target=snakeHead,operator="<",value=0)',
      'then(event=boundary_left,use=state.boolean.set,target=GameState.gameOver,value=true)',
      'event(semanticId=boundary_right,kind=rule)',
      'when(event=boundary_right,use=object.x.compare,target=snakeHead,operator=">",value=640)',
      'then(event=boundary_right,use=state.boolean.set,target=GameState.gameOver,value=true)',
      'event(semanticId=boundary_top,kind=rule)',
      'when(event=boundary_top,use=object.y.compare,target=snakeHead,operator="<",value=0)',
      'then(event=boundary_top,use=state.boolean.set,target=GameState.gameOver,value=true)',
      'event(semanticId=boundary_bottom,kind=rule)',
      'when(event=boundary_bottom,use=object.y.compare,target=snakeHead,operator=">",value=480)',
      'then(event=boundary_bottom,use=state.boolean.set,target=GameState.gameOver,value=true)',
      'event(semanticId=self_collision,kind=rule)',
      'when(event=self_collision,use=object.collides,first=snakeHead,second=snakeBody)',
      'then(event=self_collision,use=state.boolean.set,target=GameState.gameOver,value=true)',
      'event(semanticId=restart,kind=rule)',
      'when(event=restart,use=input.key.just-pressed,key="Space")',
      'when(event=restart,use=state.boolean.is,target=GameState.gameOver,value=true)',
      'then(event=restart,use=state.number.set,target=GameState.score,value=0)',
      'then(event=restart,use=state.text.set,target=GameState.direction,value="right")',
      'then(event=restart,use=state.boolean.set,target=GameState.gameOver,value=false)',
      'then(event=restart,use=object.delete,target=snakeBody)',
      'then(event=restart,use=object.position.set,target=snakeHead,x=32,y=32)',
      'then(event=restart,use=object.place.random-grid,target=food,minX=0,maxX=640,minY=0,maxY=480,step={"use":"state.number","target":"GameState.step"})'
    ].join(';')
  }
};

function seedSource(task, index) {
  if (!task.seedFile) return null;
  var parsed = parser.parse(fs.readFileSync(path.join(__dirname, '..', '..', task.seedFile), 'utf8'));
  assert.deepStrictEqual(parsed.warnings, []);
  var draft = draftApi.create(referencesApi.create(index), null);
  parsed.commands.forEach(function(command) { draftApi.execute(draft, command); });
  return sourceContract.validateSource(draftApi.materialize(draft), { index: index });
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
      var result = await semanticRuntime.create({ providerRuntime: provider([fixture.plan, fixture.write, 'complete()']) }).invoke({ requestId: 'offline-' + task.id, projectId: 'offline-suite', timeoutMs: 120000, maxTokens: 4096, userRequest: task.task, creativeVision: '', source: source, index: index });
      var record = { probe: { benchmarkId: benchmark.contract.benchmarkId, benchmarkTaskId: task.id, task: task.task, seedFile: task.seedFile, semanticMaxTokens: 4096 }, creativeVision: '', runTrace: result.runTrace, runLedger: result.runLedger, runState: result.runState, taskPlan: result.taskPlan, cacheSummary: result.cacheSummary, result: result };
      var file = path.join(directory, task.id + '.json');
      fs.writeFileSync(file, JSON.stringify(record), 'utf8');
      var execution = await replaySuite.replay({ absolutePath: file, locator: 'offline/' + task.id + '.json' }, index);
      var evaluated = benchmark.evaluate(task, execution);
      results.push(evaluated);
      evidence.push({ taskId: task.id, modelCalls: result.modelCalls, modelElapsedMs: execution.report.modelElapsedMs, cacheHitRate: execution.report.cacheSummary.cacheHitRate, replayParity: execution.report.recordedParity });
      assert.strictEqual(evaluated.passed, true, task.id + ' failed: ' + evaluated.checks.filter(function(check) { return !check.passed; }).map(function(check) { return check.id; }).join(', '));
    }
    assert.strictEqual(results.length, 6);
    assert.strictEqual(results.filter(function(result) { return result.semanticPassed; }).length, 6);
    assert.strictEqual(results.filter(function(result) { return result.runtimePassed; }).length, 6);
    assert(evidence.every(function(item) { return item.replayParity.planHash && item.replayParity.taskReceipts && item.replayParity.sourceHash; }));
    console.log('[SnakeSemanticOfflineSuite] ' + JSON.stringify({ tasks: 6, semanticPassed: 6, runtimePassed: 6, replayPassed: 6, minimumCacheHitRate: Math.min.apply(Math, evidence.map(function(item) { return item.cacheHitRate; })), maximumModelElapsedMs: Math.max.apply(Math, evidence.map(function(item) { return item.modelElapsedMs; })), modelCallsPerTask: Array.from(new Set(evidence.map(function(item) { return item.modelCalls; }))), evidence: evidence }));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
})().catch(function(error) { console.error(error); process.exit(1); });
