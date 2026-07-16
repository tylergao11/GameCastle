var assert = require('assert');
var domainApi = require('../../packages/product/src/planner-domain-api');
var directorApi = require('../../packages/product/src/director-planner-langgraph');
var prompt = require('../../packages/product/src/director-planner-prompt');

var PROGRAM = [
  'CALL id=semantic operation=semantic.design after=none',
  'CALL id=asset operation=asset.realize after=semantic',
  'CALL id=assembly operation=assembly.verify after=asset',
  'REPAIR from=assembly.verify to=semantic.design'
].join('\n');

function makeSession(label, accepted) {
  return {
    sourceMode: function() { return 'new'; },
    feedbackPending: function() { return false; },
    inputFor: function(task) { return { label: label, operation: task.operation }; },
    onSuccess: function(task, output) {
      assert.strictEqual(output.label, label, 'A cached graph cannot retain a different run session.');
      if (task.operation === 'semantic.design') return { kind: 'dispatch', taskId: 'asset' };
      if (task.operation === 'asset.realize') return { kind: 'dispatch', taskId: 'assembly' };
      accepted.push(label);
      return { kind: 'end', status: 'accepted' };
    },
    onFailure: function(_task, error) { throw error; },
    summarize: function(task, output) { return { operation: task.operation, label: output.label }; }
  };
}

(async function() {
  var calls = [], accepted = [], modelCalls = [];
  var domains = domainApi.create({
    semantic: { invoke: async function(input) { calls.push(input.operation); return { label: input.label }; } },
    asset: { invoke: async function(input) { calls.push(input.operation); return { label: input.label }; } },
    assembly: { invoke: async function(input) { calls.push(input.operation); return { label: input.label }; } }
  });
  var director = directorApi.create({
    domains: domains,
    modelPort: { invoke: async function(input) {
      modelCalls.push(input);
      return { ok: true, output: { text: PROGRAM }, receipt: { receiptId: 'fixture.' + modelCalls.length, provider: 'fixture', model: 'director-fixture', status: 'succeeded' } };
    } }
  });

  var runs = await Promise.all([
    director.run({ requestId: 'director-a', projectId: 'project-a', userRequest: 'Build a small game.', session: makeSession('a', accepted) }),
    director.run({ requestId: 'director-b', projectId: 'project-b', userRequest: 'Build another game.', session: makeSession('b', accepted) })
  ]);
  assert.deepStrictEqual(calls.sort(), ['assembly.verify', 'assembly.verify', 'asset.realize', 'asset.realize', 'semantic.design', 'semantic.design']);
  assert.deepStrictEqual(accepted.sort(), ['a', 'b']);
  assert(runs.every(function(run) { return run.status === 'accepted' && run.languageId === 'director-dsl-v1' && run.plan.calls.length === 3; }));
  assert(runs.every(function(run) { return run.trace.every(function(entry) { return !Object.prototype.hasOwnProperty.call(entry, 'input') && !Object.prototype.hasOwnProperty.call(entry, 'output'); }); }), 'Director trace must retain only orchestration evidence, never domain internals.');
  assert.strictEqual(director.metrics().graphInitializations, 1, 'Concurrent Director sessions share one compiled LangGraph.');
  assert.strictEqual(director.metrics().activeSessions, 0, 'Completed Director sessions release their ephemeral callback state.');
  assert.strictEqual(modelCalls.length, 2);
  assert.strictEqual(modelCalls.every(function(call) { return call.prompt.indexOf('{"') < 0 && call.prompt.indexOf('"}') < 0; }), true, 'Director model context is deterministic FACT DSL rather than JSON.');

  var resumedAccepted = [];
  var resumed = await director.run({ requestId: 'director-resume', projectId: 'project-resume', userRequest: 'Resume without re-planning.', frozenPlan: { languageId: 'director-dsl-v1', program: PROGRAM, planHash: runs[0].planHash, receiptId: 'persisted.director', provider: 'fixture', model: 'director-fixture' }, session: makeSession('resume', resumedAccepted) });
  assert.strictEqual(resumed.trace[0].stage, 'director-plan-reused');
  assert.deepStrictEqual(resumedAccepted, ['resume']);
  assert.strictEqual(modelCalls.length, 2, 'A persisted canonical DSL plan resumes without a second model call.');

  var built = prompt.build({ requestId: 'prompt', projectId: 'project', userRequest: 'Compose it.' });
  assert.strictEqual(built.systemPrompt.indexOf('JSON') >= 0, true, 'Director explicitly rejects JSON model output.');
  assert.strictEqual(built.prompt.indexOf('fact(path=') >= 0, true, 'Director model context is emitted as FACT rows.');

  var rejectingDirector = directorApi.create({
    domains: domains,
    modelPort: { invoke: async function() { return { ok: true, output: { text: '{"calls":[]}' }, receipt: null }; } }
  });
  await assert.rejects(function() { return rejectingDirector.run({ requestId: 'director-json', projectId: 'project-json', userRequest: 'Never JSON.', session: makeSession('json', []) }); }, function(error) { return error.code === 'DIRECTOR_DSL_JSON_FORBIDDEN'; });
  console.log('[DirectorPlannerLangGraph] unified domain API sequencing, DSL-only model protocol, concurrent session isolation, and compiled graph reuse passed');
})().catch(function(error) { console.error(error); process.exit(1); });
