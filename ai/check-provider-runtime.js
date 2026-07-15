var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var runtimeModule = require('./provider-runtime');

function request(role, id, extra) { return Object.assign({ requestId: id, projectId: 'provider-check', role: role, provider: 'simulated-local', estimatedCost: 0.1, input: { prompt: 'safe prompt' } }, extra || {}); }

(async function() {
  var transportCalls = [];
  var runtime = runtimeModule.createProviderRuntime({ maxCost: 2, invokeTransport: async function(context) { transportCalls.push(context.request.role); return { output: { text: '{}' }, usage: { input_tokens: 1 }, cost: 0.1 }; } });
  for (var role of ['creative-text', 'semantic-design', 'vision-review', 'spatial-plan']) {
    var result = await runtime.invokeRole(request(role, 'role-' + role));
    assert(result.ok, role + ' should use the common runtime');
    assert.strictEqual(result.receipt.role, role);
    assert(JSON.stringify(result.receipt).indexOf('safe prompt') < 0, 'receipt must retain only a request hash');
  }
  assert.deepStrictEqual(transportCalls, ['creative-text', 'semantic-design', 'vision-review', 'spatial-plan']);
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
    var imageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-provider-spatial-'));
    try {
      var imagePath = path.join(imageRoot, 'fixture.png');
      fs.writeFileSync(imagePath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAF/gJ+CYJ8VQAAAABJRU5ErkJggg==', 'base64'));
      var spatial = await httpRuntime.invokeRole(request('spatial-plan', 'spatial-vision-shape', { provider: 'openai', input: { systemPrompt: 'Arrange', prompt: 'Place', imagePaths: [imagePath] } }));
      assert(spatial.ok);
      assert.strictEqual(captured.body.input[0].content[0].type, 'input_text');
      assert.strictEqual(captured.body.input[0].content[1].type, 'input_image');
      assert(captured.body.input[0].content[1].image_url.indexOf('data:image/png;base64,') === 0);
    } finally { fs.rmSync(imageRoot, { recursive: true, force: true }); }
  } finally { Object.keys(saved).forEach(function(key) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }); }
  var deepSeekSaved = { DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY, LLM_ALLOW_EXTERNAL: process.env.LLM_ALLOW_EXTERNAL, LLM_ENDPOINT: process.env.LLM_ENDPOINT, LLM_MODEL: process.env.LLM_MODEL };
  try {
    process.env.DEEPSEEK_API_KEY = 'provider-test-secret'; process.env.LLM_ALLOW_EXTERNAL = 'true'; process.env.LLM_ENDPOINT = 'https://provider.test/v1'; process.env.LLM_MODEL = 'deepseek-v4-flash';
    var deepSeekBodies = [];
    var deepSeekRuntime = runtimeModule.createProviderRuntime({ fetchImpl: async function(_url, init) {
      deepSeekBodies.push(JSON.parse(init.body));
      return new Response('data: {"choices":[{"delta":{"content":"{}"}}]}\n\ndata: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    } });
    assert((await deepSeekRuntime.invokeRole(request('creative-text', 'creative-policy', { provider: 'deepseek' }))).ok);
    assert((await deepSeekRuntime.invokeRole(request('semantic-design', 'semantic-policy', { provider: 'deepseek', input: { systemPrompt: 'JSON', prompt: 'write', jsonSchema: { name: 'semantic', schema: { type: 'object' } } } }))).ok);
    assert.deepStrictEqual(deepSeekBodies[0].thinking, { type: 'enabled' });
    assert.strictEqual(deepSeekBodies[0].reasoning_effort, 'medium');
    assert.strictEqual(deepSeekBodies[0].temperature, 1.5);
    assert.deepStrictEqual(deepSeekBodies[1].thinking, { type: 'enabled' });
    assert.strictEqual(deepSeekBodies[1].reasoning_effort, 'high');
    assert.strictEqual(deepSeekBodies[1].temperature, 0);
    assert.strictEqual(deepSeekBodies[1].response_format.type, 'json_object');
  } finally { Object.keys(deepSeekSaved).forEach(function(key) { if (deepSeekSaved[key] === undefined) delete process.env[key]; else process.env[key] = deepSeekSaved[key]; }); }
  console.log('[ProviderRuntime] semantic model profiles, transport authorization, receipts, and fail-closed provider policy passed');
})().catch(function(error) { console.error(error); process.exit(1); });
