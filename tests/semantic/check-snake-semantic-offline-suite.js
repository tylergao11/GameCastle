var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var dictionary = require('../../packages/semantic/src/capability-semantic-dictionary');
var semanticRuntime = require('../../packages/semantic/src/semantic-llm2-runtime');
var benchmark = require('../benchmarks/snake-semantic-benchmark');
var replaySuite = require('../../scripts/semantic/replay-semantic-live-suite');
var seedLoader = require('../../packages/semantic/src/semantic-seed-loader');

function planTask(semanticId, goal) {
  return 'plan-task(semanticId=' + semanticId + ',goal="' + goal + '",after=list())';
}

// Dispatch-only plan + free-write fixtures (slot = semantic id / Owner.field; capability = foundation handle).
var fixtures = {
  'core-model': {
    plan: planTask('core_model', 'Create only the core model.'),
    write: [
      'game(slot=snakeProbe,name="Snake Probe")',
      'entity(slot=snakeHead,roles=list(player,"snake-head"),kind=sprite,behaviors=list())',
      'entity(slot=food,roles=list(food),kind=sprite,behaviors=list())',
      'entity(slot=GameState,roles=list(state),kind=state,behaviors=list())',
      'entity(slot=scoreText,roles=list(ui,score),kind=text,behaviors=list())'
    ].join(';')
  },
  'state-fields': {
    plan: planTask('state_fields', 'Add the three state fields on the existing GameState.'),
    write: [
      'member(slot=GameState.score,roles=list(score),value=0,bindings=list())',
      'member(slot=GameState.direction,roles=list("movement-direction"),value="right",bindings=list())',
      'member(slot=GameState.step,roles=list("grid-step"),value=32,bindings=list())'
    ].join(';')
  },
  'up-input': {
    plan: planTask('up_input', 'Add only the Up input rule on the existing board.'),
    write: 'event(slot=turn_up,kind=rule,locals=record());when(slot=turn_up,capability=input.key.just-pressed,key="Up");then(slot=turn_up,capability=state.text.set,target=GameState.direction,value="up")'
  },
  'timed-right-movement': {
    plan: planTask('timed_right', 'Add only timed right movement on the existing board.'),
    write: 'event(slot=move_right,kind=rule,locals=record());when(slot=move_right,capability=timer.elapsed,timer=movementTimer,operator=">=",seconds=0.15);when(slot=move_right,capability=state.text.compare,target=GameState.direction,operator="=",value="right");then(slot=move_right,capability=timer.reset,timer=movementTimer);then(slot=move_right,capability=object.x.add,target=snakeHead,value=record(capability=state.number,target=GameState.step))'
  },
  'food-score-growth': {
    plan: planTask('food_growth', 'Add only food scoring and pending growth on the existing board.'),
    write: 'member(slot=GameState.pendingGrowth,roles=list("pending-growth"),value=0,bindings=list());event(slot=collect_food,kind=rule,locals=record());when(slot=collect_food,capability=object.collides,first=snakeHead,second=food);then(slot=collect_food,capability=state.number.add,target=GameState.score,value=1);then(slot=collect_food,capability=state.number.add,target=GameState.pendingGrowth,value=1);then(slot=collect_food,capability=object.place.random-grid,target=food,minX=0,maxX=640,minY=0,maxY=480,step=record(capability=state.number,target=GameState.step))'
  },
  'loss-restart': {
    plan: planTask('loss_restart', 'Add only loss detection and restart on the existing board.'),
    write: [
      'entity(slot=snakeBody,roles=list("snake-body"),kind=sprite,behaviors=list())',
      'member(slot=GameState.gameOver,roles=list("game-over"),value=false,bindings=list())',
      'event(slot=boundary_left,kind=rule,locals=record())',
      'when(slot=boundary_left,capability=object.x.compare,target=snakeHead,operator="<",value=0)',
      'then(slot=boundary_left,capability=state.boolean.set,target=GameState.gameOver,value=true)',
      'event(slot=boundary_right,kind=rule,locals=record())',
      'when(slot=boundary_right,capability=object.x.compare,target=snakeHead,operator=">",value=640)',
      'then(slot=boundary_right,capability=state.boolean.set,target=GameState.gameOver,value=true)',
      'event(slot=boundary_top,kind=rule,locals=record())',
      'when(slot=boundary_top,capability=object.y.compare,target=snakeHead,operator="<",value=0)',
      'then(slot=boundary_top,capability=state.boolean.set,target=GameState.gameOver,value=true)',
      'event(slot=boundary_bottom,kind=rule,locals=record())',
      'when(slot=boundary_bottom,capability=object.y.compare,target=snakeHead,operator=">",value=480)',
      'then(slot=boundary_bottom,capability=state.boolean.set,target=GameState.gameOver,value=true)',
      'event(slot=self_collision,kind=rule,locals=record())',
      'when(slot=self_collision,capability=object.collides,first=snakeHead,second=snakeBody)',
      'then(slot=self_collision,capability=state.boolean.set,target=GameState.gameOver,value=true)',
      'event(slot=restart,kind=rule,locals=record())',
      'when(slot=restart,capability=input.key.just-pressed,key="Space")',
      'when(slot=restart,capability=state.boolean.is,target=GameState.gameOver,value=true)',
      'then(slot=restart,capability=state.number.set,target=GameState.score,value=0)',
      'then(slot=restart,capability=state.text.set,target=GameState.direction,value="right")',
      'then(slot=restart,capability=state.boolean.set,target=GameState.gameOver,value=false)',
      'then(slot=restart,capability=object.delete,target=snakeBody)',
      'then(slot=restart,capability=object.position.set,target=snakeHead,x=32,y=32)',
      'then(slot=restart,capability=object.place.random-grid,target=food,minX=0,maxX=640,minY=0,maxY=480,step=record(capability=state.number,target=GameState.step))'
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
      // One work order → write → plan-complete (dispatch loop).
      var result = await semanticRuntime.create({ providerRuntime: provider([fixture.plan, fixture.write, 'plan-complete()']) }).invoke({ requestId: 'offline-' + task.id, projectId: 'offline-suite', timeoutMs: semanticRuntime.HARD_TIMEOUT_MS, maxTokens: semanticRuntime.MAX_TOKENS, userRequest: task.task, source: source, index: index });
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
