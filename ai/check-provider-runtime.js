var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var runtimeModule = require('./provider-runtime');
var adapters = require('./provider-runtime-adapters');
var assetEngine = require('./asset-engine-langgraph');
var pngCodec = require('./local-derivation-port');

function request(role, id, extra) { return Object.assign({ requestId: id, projectId: 'provider-check', role: role, provider: 'simulated-local', estimatedCost: 0.1, input: { prompt: 'safe prompt' } }, extra || {}); }
function png() {
  var width = 6, height = 6, data = new Uint8ClampedArray(width * height * 4);
  for (var y = 1; y < height - 1; y++) for (var x = 1; x < width - 1; x++) { var offset = (y * width + x) * 4; data[offset] = 238; data[offset + 1] = 73; data[offset + 2] = 58; data[offset + 3] = 255; }
  return pngCodec.encodePng({ width: width, height: height, data: data });
}

async function main() {
  var transportCalls = [];
  var runtime = runtimeModule.createProviderRuntime({ maxCost: 2, invokeTransport: async function(context) {
    transportCalls.push(context.request.role);
    if (context.request.role === 'vision-review') return { output: { text: '{"pass":true,"repairable":false,"issues":[]}' }, usage: { input_tokens: 2 }, cost: 0.1 };
    if (context.request.role === 'image-generate' || context.request.role === 'image-edit') return { output: { b64Json: png().toString('base64') }, usage: {}, cost: 0.1 };
    return { output: { text: 'typed text', reasoningText: '' }, usage: { input_tokens: 1 }, cost: 0.1 };
  } });
  for (var role of ['creative-text', 'intent-text', 'image-generate', 'image-edit', 'vision-review']) {
    var result = await runtime.invokeRole(request(role, 'role-' + role));
    assert(result.ok, role + ' should use the common runtime');
    assert.strictEqual(result.receipt.status, 'succeeded');
    assert.strictEqual(result.receipt.role, role);
    assert.strictEqual(result.receipt.simulated, true);
    assert(JSON.stringify(result.receipt).indexOf('safe prompt') < 0, 'receipt must store hash, not raw prompt');
  }
  assert.deepStrictEqual(transportCalls, ['creative-text', 'intent-text', 'image-generate', 'image-edit', 'vision-review']);

  var denied = await runtimeModule.createProviderRuntime().invokeRole(request('intent-text', 'denied', { provider: 'openai' }));
  assert.strictEqual(denied.ok, false); assert(['PROVIDER_NOT_AUTHORIZED', 'PROVIDER_KEY_UNAVAILABLE'].indexOf(denied.debt.code) >= 0, 'real provider must fail closed without explicit environment authorization/key');
  var exhausted = await runtimeModule.createProviderRuntime({ maxCost: 0.05 }).invokeRole(request('intent-text', 'budget', { estimatedCost: 0.1 }));
  assert.strictEqual(exhausted.debt.code, 'PROVIDER_BUDGET_EXHAUSTED');
  var defaultBudget = await runtimeModule.createProviderRuntime({ maxCost: 0.03 }).invokeRole(request('image-generate', 'default-budget', { estimatedCost: undefined }));
  assert.strictEqual(defaultBudget.debt.code, 'PROVIDER_BUDGET_EXHAUSTED', 'roles must reserve a contract default cost when callers omit a cost');

  var cancelling = runtimeModule.createProviderRuntime({ invokeTransport: function(context) { return new Promise(function(_resolve, reject) { context.signal.addEventListener('abort', function() { reject(Object.assign(new Error('cancelled'), { code: 'AbortError' })); }); }); } });
  var pending = cancelling.invokeRole(request('intent-text', 'cancel'));
  assert.strictEqual(cancelling.cancel('provider.cancel').cancelled, true, 'cancel must address an active receipt');
  var cancelled = await pending; assert.strictEqual(cancelled.debt.code, 'PROVIDER_CANCELLED');

  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-adapter-'));
  try {
    var auditable = runtimeModule.createProviderRuntime({ receiptDir: path.join(root, 'receipts'), invokeTransport: async function() { return { output: { text: 'ok' }, usage: {}, cost: 0 }; } });
    var audited = await auditable.invokeRole(request('intent-text', 'receipt-persist'));
    assert(fs.existsSync(path.join(root, 'receipts', audited.receipt.receiptId + '.json')), 'receipt must persist as an auditable project-local artifact when a receipt directory is configured');
    var ports = adapters.createAssetProviderPorts(runtime, { provider: 'simulated-local', estimatedCost: 0.1 });
    var targetVisualSlotIds = { hero: 'test.hero.visual', enemy: 'test.enemy.visual', collectible: 'test.collectible.visual' };
    var slots = ['hero', 'enemy', 'collectible'].map(function(slotId) { return { slotId: slotId, kind: 'sprite', targetVisualSlotId: targetVisualSlotIds[slotId], semanticTags: [slotId], styleTags: ['gamecastle.style-dna.v1'], constraints: { width: 6, height: 6, transparent: true } }; });
    var state = { runId: 'adapter', projectId: 'provider-check', slot: slots[0], projectAssetDir: root, source: { parentRevisionId: 'source-1' } };
    var productionRequest = { requestId: 'provider-runtime-asset-production', projectId: 'provider-check', templateId: 'game.runner.v1', templateVersion: 2, styleId: 'gamecastle.style-dna.v1', requiredSlotIds: ['hero', 'enemy', 'collectible'], targetVisualSlotIds: targetVisualSlotIds };
    var generated = await ports.generate(state);
    assert(fs.existsSync(generated.path), 'image adapter must materialize provider bytes locally');
    assert.strictEqual(generated.publishability.publishable, false, 'simulated provider output must not publish');
    state.candidate = generated;
    assert.strictEqual((await ports.review(state)).pass, true, 'vision adapter must consume typed review JSON');
    assert.strictEqual((await ports.edit(state)).status, 'variant', 'edit adapter must keep parent revision semantics');
    var woven = await assetEngine.runAssetEngine({
      runId: 'provider-runtime-asset-production', projectId: 'provider-check',
      productionRequest: productionRequest,
      buildContract: { assetContract: { slots: slots } },
      sources: { hero: { kind: 'generation_required' }, enemy: { kind: 'generation_required' }, collectible: { kind: 'generation_required' } },
      providerRuntime: runtime, providerOptions: { provider: 'simulated-local', estimatedCost: 0.1 },
      projectAssetDir: root, modelPolicy: { simulated: true }
    });
    assert.strictEqual(woven.accepted, true, 'Asset Engine must consume ProviderRuntime ports through the canonical production loop: ' + JSON.stringify(woven.debts || []));
    assert.strictEqual(woven.assetManifest.assets[0].simulated, true, 'provider provenance must remain visible to the asset publish gate');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }

  var saved = { OPENAI_API_KEY: process.env.OPENAI_API_KEY, ASSET_MODEL_PROVIDER: process.env.ASSET_MODEL_PROVIDER, ASSET_ALLOW_EXTERNAL: process.env.ASSET_ALLOW_EXTERNAL, OPENAI_ENDPOINT: process.env.OPENAI_ENDPOINT };
  try {
    process.env.OPENAI_API_KEY = 'provider-test-secret'; process.env.ASSET_MODEL_PROVIDER = 'openai'; process.env.ASSET_ALLOW_EXTERNAL = 'true'; process.env.OPENAI_ENDPOINT = 'https://provider.test/v1';
    var urls = [];
    var httpRuntime = runtimeModule.createProviderRuntime({ fetchImpl: async function(url, init) { urls.push({ url: url, init: init }); return new Response(JSON.stringify({ data: [{ b64_json: png().toString('base64') }], usage: { total_tokens: 3 } }), { status: 200, headers: { 'Content-Type': 'application/json' } }); } });
    var liveShape = await httpRuntime.invokeRole(request('image-generate', 'http-shape', { provider: { provider: 'openai', apiKey: 'attacker-key', endpoint: 'https://attacker.invalid' }, input: { prompt: 'a tiny icon', transparent: true } }));
    assert(liveShape.ok, 'authorized HTTP adapter shape should return typed image output');
    assert.strictEqual(urls[0].url, 'https://provider.test/v1/images/generations');
    assert.strictEqual(urls[0].init.headers.Authorization, 'Bearer provider-test-secret');
    assert.strictEqual(urls[0].url, 'https://provider.test/v1/images/generations', 'request must not override environment-owned endpoint');
    assert(JSON.stringify(liveShape.receipt).indexOf('provider-test-secret') < 0, 'real-provider receipt must redact environment secrets');
  } finally { Object.keys(saved).forEach(function(key) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }); }
  console.log('[ProviderRuntime] roles, authorization, budget, cancellation, receipts, local image materialization, and simulated publish gate passed');
}
main().catch(function(error) { console.error(error); process.exit(1); });
