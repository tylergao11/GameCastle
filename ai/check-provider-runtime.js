var assert = require('assert');
var runtimeModule = require('./provider-runtime');

function request(role, id, extra) { return Object.assign({ requestId: id, projectId: 'provider-check', role: role, provider: 'simulated-local', estimatedCost: 0.1, input: { prompt: 'safe prompt' } }, extra || {}); }

(async function() {
  var transportCalls = [];
  var runtime = runtimeModule.createProviderRuntime({ maxCost: 2, invokeTransport: async function(context) { transportCalls.push(context.request.role); return { output: { text: '{}' }, usage: { input_tokens: 1 }, cost: 0.1 }; } });
  for (var role of ['creative-text', 'semantic-design', 'vision-review']) {
    var result = await runtime.invokeRole(request(role, 'role-' + role));
    assert(result.ok, role + ' should use the common runtime');
    assert.strictEqual(result.receipt.role, role);
    assert(JSON.stringify(result.receipt).indexOf('safe prompt') < 0, 'receipt must retain only a request hash');
  }
  assert.deepStrictEqual(transportCalls, ['creative-text', 'semantic-design', 'vision-review']);
  var denied = await runtimeModule.createProviderRuntime().invokeRole(request('semantic-design', 'denied', { provider: 'openai' }));
  assert.strictEqual(denied.ok, false);
  assert(['PROVIDER_NOT_AUTHORIZED', 'PROVIDER_KEY_UNAVAILABLE'].indexOf(denied.debt.code) >= 0);

  var saved = { OPENAI_API_KEY: process.env.OPENAI_API_KEY, LLM_ALLOW_EXTERNAL: process.env.LLM_ALLOW_EXTERNAL, OPENAI_ENDPOINT: process.env.OPENAI_ENDPOINT };
  try {
    process.env.OPENAI_API_KEY = 'provider-test-secret'; process.env.LLM_ALLOW_EXTERNAL = 'true'; process.env.OPENAI_ENDPOINT = 'https://provider.test/v1';
    var captured;
    var httpRuntime = runtimeModule.createProviderRuntime({ fetchImpl: async function(url, init) {
      captured = { url: url, body: JSON.parse(init.body) };
      return new Response(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: '{"schemaVersion":2}' }] }], usage: { total_tokens: 3 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } });
    var live = await httpRuntime.invokeRole(request('semantic-design', 'json-shape', { provider: 'openai', input: { systemPrompt: 'JSON only', prompt: 'write', jsonSchema: { name: 'game_semantic_document', schema: { type: 'object' } } } }));
    assert(live.ok);
    assert.strictEqual(captured.url, 'https://provider.test/v1/responses');
    assert.strictEqual(captured.body.text.format.type, 'json_schema');
    assert.strictEqual(captured.body.text.format.strict, true);
    assert.strictEqual(captured.body.text.format.name, 'game_semantic_document');
  } finally { Object.keys(saved).forEach(function(key) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }); }
  console.log('[ProviderRuntime] semantic-design JSON schema transport, authorization, receipts, and fail-closed provider policy passed');
})().catch(function(error) { console.error(error); process.exit(1); });
