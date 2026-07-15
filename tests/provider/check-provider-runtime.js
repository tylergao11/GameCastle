var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var runtimeModule = require('../../ai/provider-runtime');

function request(role, id, extra) { return Object.assign({ requestId: id, projectId: 'provider-check', role: role, provider: 'simulated-local', estimatedCost: 0.1, input: { prompt: 'safe prompt' } }, extra || {}); }

(async function() {
  var transportCalls = [];
  var runtime = runtimeModule.createProviderRuntime({ maxCost: 2, invokeTransport: async function(context) { transportCalls.push(context.request.role); return { output: { text: '{}' }, usage: { input_tokens: 1 }, cost: 0.1 }; } });
  assert.strictEqual(runtimeModule.createProviderRuntime({ maxCost: Infinity }).health().maxCost, Infinity, 'Explicit Infinity must remain an unlimited runtime budget.');
  for (var role of ['creative-text', 'semantic-design', 'vision-review', 'spatial-plan']) {
    var result = await runtime.invokeRole(request(role, 'role-' + role));
    assert(result.ok, role + ' should use the common runtime');
    assert.strictEqual(result.receipt.role, role);
    assert(JSON.stringify(result.receipt).indexOf('safe prompt') < 0, 'receipt must retain only a request hash');
  }
  assert.deepStrictEqual(transportCalls, ['creative-text', 'semantic-design', 'vision-review', 'spatial-plan']);
  var receiptRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-provider-receipts-'));
  try {
    var durable = runtimeModule.createProviderRuntime({ receiptDir: receiptRoot, maxCost: 1, invokeTransport: async function() { return { output: { text: '{}' }, cost: 0.1 }; } });
    assert((await durable.invokeRole(request('semantic-design', 'durable-receipt'))).ok);
    var reopenedDurable = runtimeModule.createProviderRuntime({ receiptDir: receiptRoot, maxCost: 1, invokeTransport: async function() { throw new Error('must not invoke'); } });
    assert.strictEqual(reopenedDurable.listReceipts().length, 1, 'Provider receipts survive process composition restart.');
    assert.strictEqual(reopenedDurable.health().spent, 0.1, 'Durable settled cost is restored into ProviderRuntime budget truth.');
    await assert.rejects(function() { return reopenedDurable.invokeRole(request('semantic-design', 'durable-receipt')); }, function(error) { return error.code === 'PROVIDER_REQUEST_ID_REUSED'; }, 'A durable provider receipt is immutable and its requestId cannot be replayed or overwritten.');
  } finally { fs.rmSync(receiptRoot, { recursive: true, force: true }); }
  var diagnosticRuntime = runtimeModule.createProviderRuntime({ invokeTransport: async function() { var error = new Error('candidate #0 semantic rejection'); error.code = 'MASTER_IMAGE_QUALITY_REJECTED'; error.owner = 'MasterImageQuality'; error.diagnostics = [{ index: 0, rejectionReasons: [{ code: 'MASTER_IMAGE_SEMANTIC_REJECTED' }] }]; error.attemptDiagnostics = [{ round: 1, seed: 7, candidateDiagnostics: error.diagnostics }]; throw error; } });
  var diagnosticFailure = await diagnosticRuntime.invokeRole(request('vision-review', 'diagnostic-failure'));
  assert.strictEqual(diagnosticFailure.ok, false); assert.strictEqual(diagnosticFailure.debt.message, 'candidate #0 semantic rejection'); assert.deepStrictEqual(diagnosticFailure.debt.diagnostics, [{ index: 0, rejectionReasons: [{ code: 'MASTER_IMAGE_SEMANTIC_REJECTED' }] }]); assert.strictEqual(diagnosticFailure.debt.attemptDiagnostics[0].seed, 7);
  var timeoutRuntime = runtimeModule.createProviderRuntime({ invokeTransport: function(context) { return new Promise(function(_resolve, reject) { context.signal.addEventListener('abort', function() { var error = new Error('aborted'); error.name = 'AbortError'; reject(error); }, { once: true }); }); } }), timeoutStarted = Date.now();
  var timeoutFailure = await timeoutRuntime.invokeRole(request('vision-review', 'profile-timeout', { timeoutMs: 20 }));
  assert.strictEqual(timeoutFailure.ok, false); assert.strictEqual(timeoutFailure.debt.code, 'PROVIDER_TIMEOUT'); assert(Date.now() - timeoutStarted < 1000, 'provider timeout must abort a hung transport promptly');
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
