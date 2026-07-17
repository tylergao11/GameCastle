var assert = require('assert');
var modelPort = require('../../packages/semantic/src/semantic-model-port');
var modelPolicy = require('../../packages/semantic/src/semantic-model-policy');

(async function() {
  var savedMode = process.env.GAMECASTLE_RUNTIME_MODE;
  try {
    delete process.env.GAMECASTLE_RUNTIME_MODE;
    assert.strictEqual(modelPolicy.resolveMode(), 'production');
    assert.strictEqual(modelPolicy.MODEL.provider, 'llama-cpp-semantic');
    assert.strictEqual(modelPolicy.MODEL.model, 'Qwen/Qwen3.5-9B');
    assert.strictEqual(modelPolicy.MODEL.allowExternal, false);

    process.env.GAMECASTLE_RUNTIME_MODE = 'development';
    assert.strictEqual(modelPolicy.resolveMode(), 'development');
    assert.strictEqual(modelPolicy.MODEL.provider, 'deepseek');
    assert.strictEqual(modelPolicy.MODEL.model, 'deepseek-v4-flash');
    assert.strictEqual(modelPolicy.MODEL.allowExternal, true);

    process.env.GAMECASTLE_RUNTIME_MODE = 'production';
    var invocations = [];
    var adapter = modelPort.fromProviderRuntime({ invokeRole: async function(request) { invocations.push(request); return { ok: true }; } });
    await adapter.invoke({ phase: 'planner', requestId: 'p', projectId: 'x', messages: [], maxTokens: 8196, timeoutMs: 100 });
    await adapter.invoke({ phase: 'executor', requestId: 'e', projectId: 'x', messages: [], maxTokens: 8196, timeoutMs: 100 });
    assert.strictEqual(invocations[0].provider, 'llama-cpp-semantic');
    assert.strictEqual(invocations[0].model, 'Qwen/Qwen3.5-9B');
    assert.strictEqual(invocations[0].allowExternal, false);
    assert.strictEqual(invocations[1].provider, 'llama-cpp-semantic');
    assert.strictEqual(invocations[1].model, 'Qwen/Qwen3.5-9B');
    assert(invocations[0].input.grammar.indexOf('"plan-task"') >= 0, 'Planner receives a phase-specific grammar.');
    assert(invocations[1].input.grammar.indexOf('"game"') >= 0, 'Executor receives a phase-specific grammar.');

    var devCalls = [];
    var devAdapter = modelPort.fromProviderRuntime({ invokeRole: async function(request) { devCalls.push(request); return { ok: true }; } }, { mode: 'development' });
    await devAdapter.invoke({ phase: 'planner', requestId: 'pd', projectId: 'x', messages: [], maxTokens: 8196, timeoutMs: 100 });
    assert.strictEqual(devCalls[0].provider, 'deepseek');
    assert.strictEqual(devCalls[0].model, 'deepseek-v4-flash');
    assert.strictEqual(devCalls[0].allowExternal, true);

    var routed = [];
    var router = modelPort.createRoleRouter({ planner: { invoke: async function() { routed.push('planner'); return {}; } }, executor: { invoke: async function() { routed.push('executor'); return {}; } } });
    await router.invoke({ phase: 'planner' }); await router.invoke({ phase: 'executor' });
    assert.deepStrictEqual(routed, ['planner', 'executor']);
    console.log('[SemanticModelPort] runtime modes, domain-owned model selection, Planner/Executor grammar, and role routing passed');
  } finally {
    if (savedMode === undefined) delete process.env.GAMECASTLE_RUNTIME_MODE;
    else process.env.GAMECASTLE_RUNTIME_MODE = savedMode;
  }
})().catch(function(error) { console.error(error); process.exit(1); });
