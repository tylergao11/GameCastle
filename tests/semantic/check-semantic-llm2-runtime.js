var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var runtime = require('../../packages/semantic/src/semantic-llm2-runtime');
var dictionary = require('../../packages/semantic/src/capability-semantic-dictionary');
var trainingLog = require('../../packages/semantic/src/semantic-training-log');

var PLAN = [
  'plan-task(semanticId=core,goal="Create the game and shared state",after=list())',
  'plan-game(task=core,slot=gameRoot,semanticId=demo,intent=create)',
  'plan-entity(task=core,slot=stateEntity,semanticId=GameState,intent=create)',
  'plan-member(task=core,slot=scoreMember,semanticId=score,owner=GameState,intent=create)',
  'plan-event(task=core,slot=startEvent,semanticId=start,intent=create,facets=list(metadata,conditions,actions))',
  'plan-use(task=core,alias=always,use=always)',
  'plan-use(task=core,alias=setScore,use=state.number.set)'
].join(';');
var WRITE = [
  'game(slot=gameRoot,name="Demo")',
  'entity(slot=stateEntity,roles=list(state),kind=state,behaviors=list())',
  'member(slot=scoreMember,roles=list(score),value=0,bindings=list())',
  'event(slot=startEvent,kind=rule,locals=record())',
  'when(slot=startEvent,capability=always)',
  'then(slot=startEvent,capability=setScore,target=scoreMember,value=0)'
].join(';');

function model(outputs, calls) {
  return {
    invoke: async function(request) {
      calls.push(request);
      if (!outputs.length) throw Object.assign(new Error('Fixture outputs exhausted.'), { code: 'FIXTURE_EXHAUSTED' });
      return { ok: true, output: { text: outputs.shift(), finishReason: 'stop', reasoningText: '' }, receipt: { receiptId: 'fixture.' + calls.length, provider: 'fixture-open-model', model: 'distilled-dsl', usage: { prompt_tokens: 100, completion_tokens: 20 } } };
    }
  };
}
async function invoke(outputs, extra, calls) {
  calls = calls || [];
  return runtime.create({ modelPort: model(outputs.slice(), calls) }).invoke(Object.assign({ requestId: 'semantic-test', projectId: 'semantic-test', userRequest: 'Create a score game.', index: dictionary.loadIndex() }, extra || {}));
}

(async function() {
  var calls = [];
  var result = await invoke([PLAN, WRITE], {}, calls);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.modelCalls, 2);
  assert.strictEqual(calls[0].phase, 'planner');
  assert.strictEqual(calls[1].phase, 'executor');
  assert.strictEqual(calls[0].maxTokens, 8196);
  assert.strictEqual(calls[0].provider, undefined, 'Runtime does not own provider selection');
  assert.strictEqual(result.taskPlan.languageId, 'semantic-dsl-v9');
  assert.strictEqual(result.taskPlan.tasks[0].slots[0].slot, 'gameRoot');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(result.taskPlan.tasks[0], 'targets'), false);
  assert.strictEqual(result.document.source.game.semanticId, 'demo');
  assert.strictEqual(result.document.source.entities[0].members[0].value, 0);
  assert.strictEqual(result.runState.state, 'COMPLETED');
  assert.strictEqual(result.trainingRecords.length, 2);
  assert.strictEqual(result.trainingRecords[0].phase, 'planner');
  assert.strictEqual(result.trainingRecords[1].resolvedCommands[0].semanticId, 'demo');
  assert.strictEqual(result.trainingRecords.every(function(item) { return item.languageId === 'semantic-dsl-v9'; }), true);
  assert.strictEqual(calls.some(function(call) { return /complete\(\)/.test(call.messages[0].content); }), false, 'Runtime completion consumes no model output');

  var externalCalls = [];
  var externallyPlanned = await invoke([WRITE], { planDsl: PLAN }, externalCalls);
  assert.strictEqual(externallyPlanned.ok, true);
  assert.strictEqual(externallyPlanned.modelCalls, 1, 'A Director-supplied plan bypasses the semantic model Planner role.');
  assert.strictEqual(externalCalls[0].phase, 'executor');
  assert.strictEqual(externallyPlanned.trainingRecords.length, 1);
  assert.strictEqual(externallyPlanned.trainingRecords[0].phase, 'executor');

  var trainingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'semantic-training-'));
  try {
    var sinkCalls = [], sink = trainingLog.createFileSink({ directory: trainingDirectory, runId: 'snake' });
    var logged = await runtime.create({ modelPort: model([PLAN, WRITE], sinkCalls), trainingLogSink: sink, trainingProvenance: { provenanceKind: 'fixture-training-provenance', runId: 'snake' } }).invoke({ requestId: 'training', projectId: 'training', userRequest: 'Create a score game.', index: dictionary.loadIndex() });
    var lines = fs.readFileSync(sink.file, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
    assert.strictEqual(logged.ok, true);
    assert.strictEqual(lines.length, 2);
    assert.strictEqual(lines[0].recordKind, 'semantic-model-training-record');
    assert.strictEqual(lines[0].schemaVersion, 2);
    assert.strictEqual(lines[0].provenance.runId, 'snake');
    assert.strictEqual(lines[0].contract.grammarHash.length, 64);
    assert.strictEqual(lines[0].contract.dictionarySource.sourceCommit, dictionary.loadIndex().source.sourceCommit);
    assert.strictEqual(lines[1].resolvedCommands[0].semanticId, 'demo');
  } finally { fs.rmSync(trainingDirectory, { recursive: true, force: true }); }

  var repaired = await invoke([
    'plan-task(semanticId=core,goal="Create core",after=list());plan-target(task=core,kind=game,semanticId=demo,intent=create)',
    PLAN,
    WRITE
  ]);
  assert.strictEqual(repaired.ok, true);
  assert.strictEqual(repaired.modelCalls, 3);
  assert.strictEqual(repaired.trainingRecords[0].accepted, false);
  assert.strictEqual(repaired.trainingRecords[0].outcome.code, 'SEMANTIC_DSL_COMMAND_UNKNOWN');
  assert.strictEqual(repaired.trainingRecords[1].accepted, true);

  var writeRepaired = await invoke([
    PLAN,
    'entity(slot=gameRoot,roles=list(state),kind=state,behaviors=list())',
    WRITE
  ]);
  assert.strictEqual(writeRepaired.ok, true);
  assert.strictEqual(writeRepaired.modelCalls, 3);
  // entity(...) on a game slot fails kind coverage before missing-slot enumeration.
  assert.strictEqual(writeRepaired.trainingRecords[1].outcome.code, 'SEMANTIC_TASK_SLOT_KIND_INVALID');
  assert.strictEqual(writeRepaired.trainingRecords[1].resolvedCommands.length, 0);

  await assert.rejects(function() { return invoke([PLAN, WRITE], { timeoutMs: runtime.HARD_TIMEOUT_MS + 1 }); }, function(error) { return error.code === 'SEMANTIC_LLM2_TIMEOUT_INVALID'; });
  await assert.rejects(function() { return invoke([PLAN, WRITE], { maxTokens: runtime.MAX_TOKENS + 1 }); }, function(error) { return error.code === 'SEMANTIC_LLM2_TOKENS_INVALID'; });
  await assert.rejects(function() {
    return runtime.create({ modelPort: { invoke: function() { return new Promise(function() {}); } } }).invoke({ requestId: 'deadline', projectId: 'deadline', timeoutMs: 20, maxTokens: 64, userRequest: 'Create a game.', index: dictionary.loadIndex() });
  }, function(error) { return error.code === 'SEMANTIC_RUN_TIMEOUT' || error.code === 'SEMANTIC_RUN_EXPIRED'; });

  console.log('[SemanticLLM2Runtime] model port, v9 slot binding, deterministic completion, repair routing, 300-second ceiling, and distillation records passed');
})().catch(function(error) { console.error(error); process.exit(1); });
