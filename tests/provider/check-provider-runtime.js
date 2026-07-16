var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var runtimeModule = require('../../packages/providers/src/provider-runtime');

function request(role, id, extra) { return Object.assign({ requestId: id, projectId: 'provider-check', role: role, provider: 'simulated-local', estimatedCost: 0.1, input: { systemPrompt: 'Emit DSL only.', prompt: 'safe prompt' } }, extra || {}); }

(async function() {
  var transportCalls = [];
  var runtime = runtimeModule.createProviderRuntime({ maxCost: 2, invokeTransport: async function(context) { transportCalls.push(context.request.role); return { output: { text: 'ACCEPT' }, usage: { input_tokens: 1 }, cost: 0.1 }; } });
  assert.strictEqual(runtimeModule.createProviderRuntime({ maxCost: Infinity }).health().maxCost, Infinity, 'Explicit Infinity must remain an unlimited runtime budget.');
  for (var role of ['director-plan', 'semantic-design', 'image-generate', 'vision-review', 'spatial-plan']) {
    var result = await runtime.invokeRole(request(role, 'role-' + role));
    assert(result.ok, role + ' should use the common runtime');
    assert.strictEqual(result.receipt.role, role);
    assert(JSON.stringify(result.receipt).indexOf('safe prompt') < 0, 'receipt must retain only a request hash');
  }
  assert.deepStrictEqual(transportCalls, ['director-plan', 'semantic-design', 'image-generate', 'vision-review', 'spatial-plan']);
  var protocolDenied = await runtime.invokeRole(request('semantic-design', 'json-protocol-denied', { input: { systemPrompt: 'Emit DSL only.', prompt: 'semantic()', jsonSchema: { type: 'object' } } }));
  assert.strictEqual(protocolDenied.ok, false);
  assert.strictEqual(protocolDenied.debt.code, 'MODEL_JSON_PROTOCOL_FORBIDDEN', 'Text-model roles fail closed when callers request a JSON model protocol.');
  var legacyDenied = await runtime.invokeRole(request('creative-text', 'legacy-role-denied'));
  assert.strictEqual(legacyDenied.ok, false);
  assert.strictEqual(legacyDenied.debt.code, 'ROLE_UNSUPPORTED', 'The legacy creative-text role is removed from the runtime contract.');

  var receiptRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-provider-receipts-'));
  try {
    var durable = runtimeModule.createProviderRuntime({ receiptDir: receiptRoot, maxCost: 1, invokeTransport: async function() { return { output: { text: 'ACCEPT' }, cost: 0.1 }; } });
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
  assert.strictEqual(denied.debt.code, 'OPEN_SOURCE_TEXT_PROVIDER_REQUIRED', 'Director and semantic roles cannot silently fall back to a proprietary text provider.');

  var ollamaSaved = { OLLAMA_ALLOW_LOCAL: process.env.OLLAMA_ALLOW_LOCAL, OLLAMA_ENDPOINT: process.env.OLLAMA_ENDPOINT, OLLAMA_TEXT_MODEL: process.env.OLLAMA_TEXT_MODEL };
  try {
    process.env.OLLAMA_ALLOW_LOCAL = 'true'; process.env.OLLAMA_ENDPOINT = 'http://127.0.0.1:11434/v1'; process.env.OLLAMA_TEXT_MODEL = 'qwen3:8b';
    var captured;
    var httpRuntime = runtimeModule.createProviderRuntime({ fetchImpl: async function(url, init) {
      captured = { url: url, body: JSON.parse(init.body) };
      return new Response('data: {"choices":[{"delta":{"content":"CALL id=semantic operation=semantic.design after=none"}}]}\n\ndata: {"usage":{"total_tokens":3},"choices":[]}\n\ndata: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    } });
    var live = await httpRuntime.invokeRole(request('director-plan', 'ollama-director-dsl', { provider: 'ollama', input: { systemPrompt: 'Director DSL only.', prompt: 'fact(path="director.request",value="build")' } }));
    assert(live.ok);
    assert.strictEqual(captured.url, 'http://127.0.0.1:11434/v1/chat/completions');
    assert.strictEqual(captured.body.model, 'qwen3:8b');
    assert.deepStrictEqual(captured.body.thinking, { type: 'disabled' });
    assert.strictEqual(captured.body.temperature, 0);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(captured.body, 'response_format'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(captured.body, 'json_schema'), false);
    assert.strictEqual(live.output.text.indexOf('CALL id=semantic') === 0, true);
  } finally { Object.keys(ollamaSaved).forEach(function(key) { if (ollamaSaved[key] === undefined) delete process.env[key]; else process.env[key] = ollamaSaved[key]; }); }

  var llamaSaved = { LLAMA_CPP_SEMANTIC_ALLOW_LOCAL: process.env.LLAMA_CPP_SEMANTIC_ALLOW_LOCAL, LLAMA_CPP_SEMANTIC_ENDPOINT: process.env.LLAMA_CPP_SEMANTIC_ENDPOINT, SEMANTIC_DSL_MODEL: process.env.SEMANTIC_DSL_MODEL };
  try {
    process.env.LLAMA_CPP_SEMANTIC_ALLOW_LOCAL = 'true'; process.env.LLAMA_CPP_SEMANTIC_ENDPOINT = 'http://127.0.0.1:8002/v1'; process.env.SEMANTIC_DSL_MODEL = 'Qwen/Qwen3.5-9B';
    var llamaCaptured;
    var llamaRuntime = runtimeModule.createProviderRuntime({ fetchImpl: async function(url, init) {
      llamaCaptured = { url: url, body: JSON.parse(init.body) };
      return new Response('data: {"choices":[{"delta":{"content":"project(gameId=\"grammar-test\")"}}]}\n\ndata: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    } });
    var grammar = 'root ::= "project"';
    var llamaResult = await llamaRuntime.invokeRole(request('semantic-design', 'llama-semantic-dsl', { provider: 'llama-cpp-semantic', input: { systemPrompt: 'Semantic DSL only.', prompt: 'Build.', grammar: grammar } }));
    assert(llamaResult.ok);
    assert.strictEqual(llamaCaptured.url, 'http://127.0.0.1:8002/v1/chat/completions');
    assert.strictEqual(llamaCaptured.body.model, 'Qwen/Qwen3.5-9B');
    assert.deepStrictEqual(llamaCaptured.body.chat_template_kwargs, { enable_thinking: false });
    assert.strictEqual(llamaCaptured.body.grammar, grammar);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(llamaCaptured.body, 'thinking'), false, 'llama.cpp receives Qwen chat-template arguments, not a vendor thinking object.');
  } finally { Object.keys(llamaSaved).forEach(function(key) { if (llamaSaved[key] === undefined) delete process.env[key]; else process.env[key] = llamaSaved[key]; }); }

  var visionSaved = { OPENAI_API_KEY: process.env.OPENAI_API_KEY, OPENAI_ENDPOINT: process.env.OPENAI_ENDPOINT, LLM_ALLOW_EXTERNAL: process.env.LLM_ALLOW_EXTERNAL };
  try {
    process.env.OPENAI_API_KEY = 'provider-test-secret'; process.env.LLM_ALLOW_EXTERNAL = 'true'; process.env.OPENAI_ENDPOINT = 'https://provider.test/v1';
    var visionCaptured;
    var visionRuntime = runtimeModule.createProviderRuntime({ fetchImpl: async function(url, init) {
      visionCaptured = { url: url, body: JSON.parse(init.body) };
      return new Response(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'ACCEPT' }] }], usage: { total_tokens: 3 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } });
    var imageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-provider-spatial-'));
    try {
      var imagePath = path.join(imageRoot, 'fixture.png');
      fs.writeFileSync(imagePath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAF/gJ+CYJ8VQAAAABJRU5ErkJggg==', 'base64'));
      var spatial = await visionRuntime.invokeRole(request('spatial-plan', 'spatial-dsl-shape', { provider: 'openai', input: { systemPrompt: 'Spatial DSL only.', prompt: 'fact(path="spatial.round",value=1)', imagePaths: [imagePath] } }));
      assert(spatial.ok);
      assert.strictEqual(visionCaptured.url, 'https://provider.test/v1/responses');
      assert.strictEqual(visionCaptured.body.input[0].content[0].type, 'input_text');
      assert.strictEqual(visionCaptured.body.input[0].content[1].type, 'input_image');
      assert(visionCaptured.body.input[0].content[1].image_url.indexOf('data:image/png;base64,') === 0);
      assert.strictEqual(Object.prototype.hasOwnProperty.call(visionCaptured.body, 'text'), false, 'Vision DSL transport has no JSON response schema.');
    } finally { fs.rmSync(imageRoot, { recursive: true, force: true }); }
  } finally { Object.keys(visionSaved).forEach(function(key) { if (visionSaved[key] === undefined) delete process.env[key]; else process.env[key] = visionSaved[key]; }); }
  console.log('[ProviderRuntime] open-source director and semantic DSL transport, receipts, authorization, and fail-closed JSON protocol passed');
})().catch(function(error) { console.error(error); process.exit(1); });
