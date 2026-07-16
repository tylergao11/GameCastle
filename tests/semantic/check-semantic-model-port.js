var assert = require('assert');
var modelPort = require('../../packages/semantic/src/semantic-model-port');

(async function() {
  var invocations = [];
  var adapter = modelPort.fromProviderRuntime({ invokeRole: async function(request) { invocations.push(request); return { ok: true }; } });
  await adapter.invoke({ phase: 'planner', requestId: 'p', projectId: 'x', messages: [], maxTokens: 8196, timeoutMs: 100 });
  await adapter.invoke({ phase: 'executor', requestId: 'e', projectId: 'x', messages: [], maxTokens: 8196, timeoutMs: 100 });
  assert.strictEqual(invocations[0].provider, 'llama-cpp-semantic');
  assert.strictEqual(invocations[0].model, 'Qwen/Qwen3.5-9B');
  assert.strictEqual(invocations[1].provider, 'llama-cpp-semantic');
  assert.strictEqual(invocations[1].model, 'Qwen/Qwen3.5-9B');
  assert(invocations[0].input.grammar.indexOf('"plan-task"') >= 0, 'Planner receives a phase-specific grammar.');
  assert(invocations[1].input.grammar.indexOf('"game"') >= 0, 'Executor receives a phase-specific grammar.');
  var routed = [];
  var router = modelPort.createRoleRouter({ planner: { invoke: async function() { routed.push('planner'); return {}; } }, executor: { invoke: async function() { routed.push('executor'); return {}; } } });
  await router.invoke({ phase: 'planner' }); await router.invoke({ phase: 'executor' });
  assert.deepStrictEqual(routed, ['planner', 'executor']);
  console.log('[SemanticModelPort] domain-owned model selection, separate Planner/Executor grammar, and role routing passed');
})().catch(function(error) { console.error(error); process.exit(1); });
