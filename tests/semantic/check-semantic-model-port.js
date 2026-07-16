var assert = require('assert');
var modelPort = require('../../packages/semantic/src/semantic-model-port');

(async function() {
  var invocations = [];
  var adapter = modelPort.fromProviderRuntime({ invokeRole: async function(request) { invocations.push(request); return { ok: true }; } }, { roles: { planner: { provider: 'local-a', model: 'planner-adapter' }, executor: { provider: 'local-a', model: 'executor-adapter' } } });
  await adapter.invoke({ phase: 'planner', requestId: 'p', projectId: 'x', messages: [], maxTokens: 8196, timeoutMs: 100 });
  await adapter.invoke({ phase: 'executor', requestId: 'e', projectId: 'x', messages: [], maxTokens: 8196, timeoutMs: 100 });
  assert.strictEqual(invocations[0].model, 'planner-adapter');
  assert.strictEqual(invocations[1].model, 'executor-adapter');
  assert(invocations[0].input.grammar.indexOf('"plan-task"') >= 0, 'Planner receives a phase-specific grammar.');
  assert(invocations[1].input.grammar.indexOf('"game"') >= 0, 'Executor receives a phase-specific grammar.');
  var routed = [];
  var router = modelPort.createRoleRouter({ planner: { invoke: async function() { routed.push('planner'); return {}; } }, executor: { invoke: async function() { routed.push('executor'); return {}; } } });
  await router.invoke({ phase: 'planner' }); await router.invoke({ phase: 'executor' });
  assert.deepStrictEqual(routed, ['planner', 'executor']);
  console.log('[SemanticModelPort] separate Planner/Executor adapters and provider-independent role routing passed');
})().catch(function(error) { console.error(error); process.exit(1); });
