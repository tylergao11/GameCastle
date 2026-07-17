var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var runtime = require('../../packages/semantic/src/semantic-llm2-runtime');
var dictionary = require('../../packages/semantic/src/capability-semantic-dictionary');
var trainingLog = require('../../packages/semantic/src/semantic-training-log');

var PLAN = 'plan-task(semanticId=core,goal="Create the game and shared state",after=list())';
var WRITE = [
  'game(slot=demo,name="Demo")',
  'entity(slot=GameState,roles=list(state),kind=state,behaviors=list())',
  'member(slot=GameState.score,roles=list(score),value=0,bindings=list())',
  'event(slot=start,kind=rule,locals=record())',
  'when(slot=start,capability=always)',
  'then(slot=start,capability=state.number.set,target=GameState.score,value=0)'
].join(';');
var DONE = 'plan-complete()';

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
  var result = await invoke([PLAN, WRITE, DONE], {}, calls);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.modelCalls, 3);
  assert.strictEqual(calls[0].phase, 'planner');
  assert.strictEqual(calls[1].phase, 'executor');
  assert.strictEqual(calls[2].phase, 'planner');
  assert.strictEqual(result.taskPlan.languageId, 'semantic-dsl-v9');
  assert.strictEqual(result.taskPlan.schemaVersion, 9);
  assert.strictEqual(result.document.source.game.semanticId, 'demo');
  assert.strictEqual(result.document.source.entities[0].members[0].value, 0);
  assert.strictEqual(result.runState.state, 'COMPLETED');

  var externalCalls = [];
  var externallyPlanned = await invoke([WRITE], { planDsl: PLAN }, externalCalls);
  assert.strictEqual(externallyPlanned.ok, true);
  assert.strictEqual(externallyPlanned.modelCalls, 1, 'Dispatch planDsl bypasses planner model.');
  assert.strictEqual(externalCalls[0].phase, 'executor');

  var trainingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'semantic-training-'));
  try {
    var sinkCalls = [], sink = trainingLog.createFileSink({ directory: trainingDirectory, runId: 'snake' });
    var logged = await runtime.create({ modelPort: model([PLAN, WRITE, DONE], sinkCalls), trainingLogSink: sink, trainingProvenance: { provenanceKind: 'fixture-training-provenance', runId: 'snake' } }).invoke({ requestId: 'training', projectId: 'training', userRequest: 'Create a score game.', index: dictionary.loadIndex() });
    var lines = fs.readFileSync(sink.file, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
    assert.strictEqual(logged.ok, true);
    assert.strictEqual(lines.length, 3);
  } finally { fs.rmSync(trainingDirectory, { recursive: true, force: true }); }

  // Structure plan-* is rejected; next plan-task + write + complete succeeds.
  var repaired = await invoke([
    'plan-task(semanticId=core,goal="Create core",after=list());plan-entity(task=core,slot=e,semanticId=Head,intent=create)',
    PLAN,
    WRITE,
    DONE
  ]);
  assert.strictEqual(repaired.ok, true);
  assert.strictEqual(repaired.trainingRecords[0].accepted, false);

  console.log('[SemanticLLM2Runtime] dispatch-only planner + free-write executor path passed');
})().catch(function(error) { console.error(error); process.exit(1); });
