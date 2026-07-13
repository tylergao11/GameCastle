var assert = require('assert');
var crypto = require('crypto');
var fs = require('fs');
var os = require('os');
var path = require('path');
var runtimeModule = require('./provider-runtime');
var adapters = require('./provider-runtime-adapters');
var assetEngine = require('./asset-engine-langgraph');
var comfy = require('./comfyui-local-provider');

var png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64');
function response(body, status) { var image = Buffer.isBuffer(body); return new Response(image ? body : JSON.stringify(body), { status: status === undefined ? 200 : status, headers: { 'Content-Type': image ? 'image/png' : 'application/json' } }); }
function restore(saved) { Object.keys(saved).forEach(function(key) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }); }

(async function() {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-comfy-check-'));
  var saved = { ASSET_MODEL_PROVIDER: process.env.ASSET_MODEL_PROVIDER, COMFYUI_ALLOW_LOCAL: process.env.COMFYUI_ALLOW_LOCAL, COMFYUI_ENDPOINT: process.env.COMFYUI_ENDPOINT, COMFYUI_MODEL_PATH: process.env.COMFYUI_MODEL_PATH, COMFYUI_MODEL_SHA256: process.env.COMFYUI_MODEL_SHA256, COMFYUI_VISION_MODEL: process.env.COMFYUI_VISION_MODEL, COMFYUI_TRANSIT_DIR: process.env.COMFYUI_TRANSIT_DIR, COMFYUI_POLL_MS: process.env.COMFYUI_POLL_MS };
  try {
    var model = path.join(root, 'model.safetensors'); fs.writeFileSync(model, Buffer.from('stage-a-test-model'));
    process.env.ASSET_MODEL_PROVIDER = 'comfyui-local'; process.env.COMFYUI_ALLOW_LOCAL = 'true'; process.env.COMFYUI_ENDPOINT = 'http://127.0.0.1:8188'; process.env.COMFYUI_MODEL_PATH = model; process.env.COMFYUI_MODEL_SHA256 = crypto.createHash('sha256').update(fs.readFileSync(model)).digest('hex'); process.env.COMFYUI_VISION_MODEL = 'gamecastle.asset-review.dev-cpu.v1'; process.env.COMFYUI_TRANSIT_DIR = path.join(root, 'transit'); process.env.COMFYUI_POLL_MS = '1';
    var calls = [], submitted = 0;
    var fetchImpl = async function(url, init) {
      calls.push({ url: String(url), method: init && init.method });
      if (String(url).endsWith('/system_stats')) return response({ system: {} });
      if (String(url).endsWith('/prompt')) { submitted++; return response({ prompt_id: 'job-1' }); }
      if (String(url).indexOf('/history/job-1') >= 0) return response({ 'job-1': { status: { status_str: 'success', completed: true }, outputs: { '7': { images: [{ filename: 'safe.png', type: 'output' }] } } } });
      if (String(url).indexOf('/view?') >= 0) return response(png);
      if (String(url).endsWith('/interrupt')) return response({});
      return response({ error: 'missing' }, 404);
    };
    var runtime = runtimeModule.createProviderRuntime({ maxCost: 2, fetchImpl: fetchImpl });
    var corruptPng = Buffer.from(png); corruptPng[45] ^= 1;
    assert.throws(function() { comfy._pngInfo(corruptPng); }, function(error) { return error.code === 'COMFYUI_OUTPUT_INVALID'; }, 'PNG chunk checksums must be validated before materialization');
    assert.throws(function() { comfy._pngInfo(png, { maxWidth: 0, maxHeight: 0, maxPixels: 0, maxOutputBytes: 1 }); }, function(error) { return error.code === 'COMFYUI_OUTPUT_INVALID'; }, 'PNG output bytes must be bounded before materialization');
    var denied = await runtimeModule.createProviderRuntime({ fetchImpl: fetchImpl }).invokeRole({ requestId: 'local-denied', projectId: 'p', role: 'image-generate', provider: 'comfyui-local', input: {} });
    assert.equal(denied.ok, true, 'explicit COMFYUI_ALLOW_LOCAL authorizes self-hosted ComfyUI without API key');
    require('./comfyui-local-provider')._blobs.clear(); assert.equal(require('./comfyui-local-provider')._findBlob(denied.output.assetBlobRef).sha256, denied.output.assetBlobRef.sha256, 'transit index restores an unexpired candidate after adapter restart');
    var baselineSubmissions = submitted;
    var slot = { slotId: 'asset.comfy', kind: 'sprite', styleId: 'gamecastle.style-1', semanticTags: ['hero'], styleTags: ['gamecastle.style-1'], constraints: { width: 1, height: 1, transparent: true } };
    var persistedAssets = [];
    var engine = await assetEngine.runAssetEngine({ runId: 'comfy-stage-a', projectId: 'comfy-stage-a', buildContract: { assetContract: { slots: [slot] } }, sources: { 'asset.comfy': { kind: 'generation_required' } }, providerRuntime: runtime, providerOptions: { provider: 'comfyui-local', estimatedCost: 0.1, timeoutMs: 1000 }, projectAssetDir: path.join(root, 'project-assets'), modelPolicy: { provider: 'comfyui-local', localAllowed: true }, ledger: {}, persistAcceptedGeneratedAssets: true, persistenceMode: 'verification-staging', assetFamilyIds: { 'asset.comfy': 'asset-family.comfy-test' }, assetPersistenceBridge: { persistAcceptedGeneratedAsset: async function(input) { persistedAssets.push(input); return { revisionId: 'assetrev.comfy-test', familyId: input.familyId }; } } });
    assert.equal(engine.accepted, true, 'real Comfy transport shape must complete asset engine');
    var candidate = engine.assetManifest.assets[0];
    assert.equal(candidate.path.indexOf(path.join(root, 'project-assets')) === 0, true, 'only accepted candidate is promoted into project-local storage');
    assert.equal(fs.existsSync(candidate.path), true);
    assert.equal(candidate.assetBlobRef, undefined, 'project-local candidate must not retain ephemeral blob reference');
    assert.equal(candidate.providerReceipt.provenance.workflowSha256.length, 64);
    assert.equal(candidate.providerReceipt.provenance.modelSha256, process.env.COMFYUI_MODEL_SHA256);
    assert.equal(persistedAssets.length, 1, 'explicit persistence must receive the accepted materialized ComfyUI candidate'); assert.equal(persistedAssets[0].familyId, 'asset-family.comfy-test'); assert.equal(engine.cloudLibraryAssets[0].revisionId, 'assetrev.comfy-test');
    assert.equal(submitted, baselineSubmissions + 1, 'one generation produces one Comfy job');
    var before = submitted;
    await assetEngine.runAssetEngine({ runId: 'comfy-stage-a', projectId: 'comfy-stage-a', buildContract: { assetContract: { slots: [slot] } }, sources: { 'asset.comfy': { kind: 'generation_required' } }, providerRuntime: runtime, providerOptions: { provider: 'comfyui-local', estimatedCost: 0.1, timeoutMs: 1000 }, projectAssetDir: path.join(root, 'project-assets'), modelPolicy: { provider: 'comfyui-local', localAllowed: true }, ledger: engine.weaveResult.ledger });
    assert.equal(submitted, before, 'same run/slot/spec ledger must not submit another Comfy job');
    assert(calls.some(function(call) { return call.url.indexOf('/system_stats') >= 0; }));
    assert(calls.some(function(call) { return call.url.indexOf('/history/job-1') >= 0; }));
    var budget = await assetEngine.runAssetEngine({ runId: 'comfy-budget', buildContract: { assetContract: { slots: [slot] } }, sources: { 'asset.comfy': { kind: 'generation_required' } }, providerRuntime: runtime, providerOptions: { provider: 'comfyui-local', estimatedCost: 1 }, projectAssetDir: path.join(root, 'budget-assets'), modelPolicy: { provider: 'comfyui-local', localAllowed: true, maxCost: 0 }, maxCost: 0, ledger: {} });
    assert.equal(budget.debts[0].code, 'budget_exhausted');
    var bad = runtimeModule.createProviderRuntime({ fetchImpl: async function(url, init) { if (String(url).endsWith('/system_stats')) return response({}); if (String(url).endsWith('/prompt')) return response({ prompt_id: 'bad' }); if (String(url).indexOf('/history/bad') >= 0) return response({ bad: { status: { status: 'success' }, outputs: { '7': { images: [{ filename: 'bad.png', type: 'output' }] } } } }); if (String(url).indexOf('/view?') >= 0) return response('not-a-png'); return response({}); } });
    var badResult = await bad.invokeRole({ requestId: 'bad-output', projectId: 'p', role: 'image-generate', provider: 'comfyui-local', timeoutMs: 1000, input: {} });
    assert.equal(badResult.ok, false); assert.equal(badResult.debt.code, 'COMFYUI_OUTPUT_INVALID');
    var timeoutCalls = [];
    var timedOut = runtimeModule.createProviderRuntime({ fetchImpl: async function(url, init) { timeoutCalls.push(String(url)); if (String(url).endsWith('/system_stats')) return response({}); if (String(url).endsWith('/prompt')) return response({ prompt_id: 'slow' }); if (String(url).indexOf('/history/slow') >= 0) return response({ slow: { status: { status: 'running' }, outputs: {} } }); if (String(url).endsWith('/interrupt')) return response({}); return response({}, 404); } });
    var timeoutResult = await timedOut.invokeRole({ requestId: 'timeout', projectId: 'p', role: 'image-generate', provider: 'comfyui-local', timeoutMs: 2, input: {} });
    assert.equal(timeoutResult.ok, false); assert.equal(timeoutResult.debt.code, 'COMFYUI_TIMEOUT'); assert(timeoutCalls.some(function(url) { return url.endsWith('/interrupt'); }));
    var cancelCalls = [];
    var cancellable = runtimeModule.createProviderRuntime({ fetchImpl: async function(url, init) { cancelCalls.push(String(url)); if (String(url).endsWith('/system_stats')) return response({}); if (String(url).endsWith('/prompt')) return response({ prompt_id: 'cancelled' }); if (String(url).indexOf('/history/cancelled') >= 0) return new Promise(function(resolve) { setTimeout(function() { resolve(response({ cancelled: { status: { status: 'running' }, outputs: {} } })); }, 20); }); if (String(url).endsWith('/interrupt')) return response({}); return response({}, 404); } });
    var pending = cancellable.invokeRole({ requestId: 'cancel', projectId: 'p', role: 'image-generate', provider: 'comfyui-local', timeoutMs: 1000, input: {} });
    await new Promise(function(resolve) { setTimeout(resolve, 2); }); assert.equal(cancellable.cancel('provider.cancel').cancelled, true); var cancelResult = await pending;
    assert.equal(cancelResult.ok, false); assert.equal(cancelResult.debt.code, 'PROVIDER_CANCELLED'); assert(cancelCalls.some(function(url) { return url.endsWith('/interrupt'); }));
    var previousEndpoint = process.env.COMFYUI_ENDPOINT; delete process.env.COMFYUI_ENDPOINT;
    var unavailable = await runtimeModule.createProviderRuntime({ fetchImpl: fetchImpl }).invokeRole({ requestId: 'unavailable', projectId: 'p', role: 'image-generate', provider: 'comfyui-local', input: {} });
    process.env.COMFYUI_ENDPOINT = previousEndpoint;
    assert.equal(unavailable.ok, false); assert.equal(unavailable.debt.code, 'COMFYUI_ENDPOINT_MISSING');
    var offline = await runtimeModule.createProviderRuntime({ fetchImpl: async function() { return response({}, 503); } }).invokeRole({ requestId: 'offline', projectId: 'p', role: 'image-generate', provider: 'comfyui-local', input: {} });
    assert.equal(offline.ok, false); assert.equal(offline.debt.code, 'COMFYUI_HTTP_503');
    console.log('[ComfyUILocalProvider] loopback authorization, health, submit, history, transient materialization, promotion, receipt provenance, bad output, budget, and idempotency passed');
  } finally { restore(saved); fs.rmSync(root, { recursive: true, force: true }); }
})().catch(function(error) { console.error(error); process.exit(1); });
