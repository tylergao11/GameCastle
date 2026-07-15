var assert = require('assert');
var crypto = require('crypto');
var fs = require('fs');
var os = require('os');
var path = require('path');
var runtimeModule = require('./provider-runtime');
var assetEngine = require('./asset-engine-langgraph');
var comfy = require('./comfyui-local-provider');
var libraryPorts = require('./test-asset-library-ports');
var pngPort = require('./local-derivation-port');

var raster = { width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4) };
for (var pixel = 0; pixel < 64; pixel++) { raster.data[pixel * 4] = 245; raster.data[pixel * 4 + 1] = 245; raster.data[pixel * 4 + 2] = 245; raster.data[pixel * 4 + 3] = 255; }
for (var y = 2; y < 6; y++) for (var x = 2; x < 6; x++) { var at = (y * 8 + x) * 4; raster.data[at] = 238; raster.data[at + 1] = 73; raster.data[at + 2] = 58; }
var masterPng = pngPort.encodePng(raster);
var patternRaster = { width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4) };
for (var patternPixel = 0; patternPixel < 64; patternPixel++) { var patternAt = patternPixel * 4, dark = patternPixel % 2 === 0; patternRaster.data[patternAt] = dark ? 20 : 245; patternRaster.data[patternAt + 1] = dark ? 90 : 245; patternRaster.data[patternAt + 2] = dark ? 220 : 245; patternRaster.data[patternAt + 3] = 255; }
var patternPng = pngPort.encodePng(patternRaster);
function response(body, status) { var image = Buffer.isBuffer(body); return new Response(image ? body : JSON.stringify(body), { status: status === undefined ? 200 : status, headers: { 'Content-Type': image ? 'image/png' : 'application/json' } }); }
function restore(saved) { Object.keys(saved).forEach(function(key) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }); }

(async function() {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-master-image-check-')), names = ['ASSET_MODEL_PROVIDER', 'COMFYUI_ALLOW_LOCAL', 'COMFYUI_ENDPOINT', 'COMFYUI_MODEL_PATH', 'COMFYUI_MODEL_SHA256', 'COMFYUI_IMAGE_MODEL', 'COMFYUI_TRANSIT_DIR', 'COMFYUI_POLL_MS'], saved = {}; names.forEach(function(name) { saved[name] = process.env[name]; });
  try {
    var model = path.join(root, 'sd15.safetensors'); fs.writeFileSync(model, Buffer.from('sd15-test-checkpoint'));
    process.env.ASSET_MODEL_PROVIDER = 'comfyui-local'; process.env.COMFYUI_ALLOW_LOCAL = 'true'; process.env.COMFYUI_ENDPOINT = 'http://127.0.0.1:8188'; process.env.COMFYUI_MODEL_PATH = model; process.env.COMFYUI_MODEL_SHA256 = crypto.createHash('sha256').update(fs.readFileSync(model)).digest('hex'); process.env.COMFYUI_IMAGE_MODEL = 'gamecastle.master-image.sd15.v1'; process.env.COMFYUI_TRANSIT_DIR = path.join(root, 'transit'); process.env.COMFYUI_POLL_MS = '1';
    var calls = [], submissions = [];
    var fetchImpl = async function(url, init) { calls.push(String(url)); if (String(url).endsWith('/system_stats')) return response({ system: {} }); if (String(url).endsWith('/prompt')) { var body = JSON.parse(init.body); submissions.push(body.prompt); return response({ prompt_id: 'job-' + submissions.length }); } var match = String(url).match(/\/history\/(job-\d+)/); if (match) { var value = {}; value[match[1]] = { status: { status_str: 'success', completed: true }, outputs: { '7': { images: [{ filename: match[1] + '-pattern.png', type: 'output' }, { filename: match[1] + '-isolated.png', type: 'output' }] } } }; return response(value); } if (String(url).indexOf('/view?') >= 0) return response(String(url).indexOf('-pattern.png') >= 0 ? patternPng : masterPng); if (String(url).endsWith('/interrupt')) return response({}); return response({}, 404); };
    var runtime = runtimeModule.createProviderRuntime({ maxCost: 10, fetchImpl: fetchImpl });
    var missingPrompt = await runtime.invokeRole({ requestId: 'missing-prompt', projectId: 'p', role: 'image-generate', provider: 'comfyui-local', input: {} }); assert.strictEqual(missingPrompt.ok, false); assert.strictEqual(missingPrompt.debt.code, 'COMFYUI_PRODUCTION_INPUT_MISSING');
    var requirements = { schemaVersion: 2, documentKind: 'semantic-asset-requirements', sourceHash: 'semantic.master-image-check', requirements: [
      { semanticId: 'hero', subject: 'hero', description: 'Hero sprite', roles: ['hero'], productionFamily: 'character', recipeId: 'character-sprite.v1', styleId: 'gamecastle.style-dna.v1', constraints: { width: 16, height: 16, transparent: true }, gdjsBindings: [] },
      { semanticId: 'hero_idle', subject: 'hero', description: 'Hero idle animation', roles: ['hero'], productionFamily: 'character-animation', recipeId: 'character-frame-set.v1', styleId: 'gamecastle.style-dna.v1', constraints: { width: 16, height: 16, transparent: true }, animation: { initialStateId: 'idle', states: [{ stateId: 'idle', loop: true, frameCount: 4, frameDurationMs: 120, derivationProfileId: 'idle-bob' }] }, gdjsBindings: [] }
    ] };
    var ledgerPath = path.join(root, 'ledger.json'), result = await assetEngine.runAssetEngine({ runId: 'master-image-engine', projectId: 'master-image-engine', assetRequirementContract: requirements, sources: { hero: { kind: 'generation_required' }, hero_idle: { kind: 'generation_required' } }, providerRuntime: runtime, providerOptions: { provider: 'comfyui-local', timeoutMs: 1000 }, assetLibraryPort: libraryPorts.createTestAssetLibraryPort(), projectAssetDir: path.join(root, 'project-assets'), modelPolicy: { provider: 'comfyui-local', localAllowed: true }, ledgerPath: ledgerPath });
    assert.strictEqual(result.accepted, true, JSON.stringify({ debts: result.debts, calls: calls })); assert.strictEqual(submissions.length, 2, 'one master image must be generated per library miss');
    submissions.forEach(function(graph) { assert.deepStrictEqual(Array.from(new Set(Object.keys(graph).map(function(id) { return graph[id].class_type; }))).sort(), ['CLIPTextEncode', 'CheckpointLoaderSimple', 'EmptyLatentImage', 'KSampler', 'SaveImage', 'VAEDecode'].sort()); assert.deepStrictEqual(graph['7'].inputs.images, ['6', 0], 'SaveImage must expose the raw VAEDecode master image'); assert.strictEqual(graph['4'].inputs.batch_size, 4); assert.strictEqual(graph['5'].inputs.sampler_name, 'dpmpp_2m'); assert.strictEqual(graph['5'].inputs.scheduler, 'karras'); assert.strictEqual(graph['5'].inputs.steps, 30); assert.notStrictEqual(graph['5'].inputs.seed, 1, 'asset requirement must derive its own deterministic seed'); assert(graph['2'].inputs.text.length < 320); assert(graph['2'].inputs.text.indexOf('outline rule:') < 0); });
    assert.notStrictEqual(submissions[0]['5'].inputs.seed, submissions[1]['5'].inputs.seed, 'different requirements must not share one global seed');
    assert.strictEqual(result.assetManifest.assets[0].source, 'deterministicDerivation'); assert(result.assetManifest.assets[0].path.indexOf(path.join('project-assets', 'static')) >= 0); assert.strictEqual(result.assetManifest.assets[1].frameSet.documentKind, require('../shared/frame-set-contract.json').documentKind); assert(result.assetManifest.assets[1].frameSet.frames.every(function(frame) { return frame.path.indexOf(path.join('project-assets', 'frames')) >= 0; }));
    assert(result.assetProduction.workItems.every(function(item) { return item.masterImage && item.masterImage.status === 'master' && item.masterImage.publishability.publishable === false; }));
    assert(result.assetProduction.workItems.every(function(item) { return item.masterImage.providerReceipt.provenance.candidateSelection.candidateCount === 2 && item.masterImage.providerReceipt.provenance.candidateSelection.selectedIndex === 1; }));
    var before = submissions.length; await assetEngine.runAssetEngine({ runId: 'master-image-engine', projectId: 'master-image-engine', assetRequirementContract: requirements, providerRuntime: runtime, providerOptions: { provider: 'comfyui-local', timeoutMs: 1000 }, assetLibraryPort: libraryPorts.createTestAssetLibraryPort(), projectAssetDir: path.join(root, 'project-assets'), modelPolicy: { provider: 'comfyui-local', localAllowed: true }, ledgerPath: ledgerPath }); assert.strictEqual(submissions.length, before, 'durable accepted ledger must prevent duplicate master generation');
    var corrupt = Buffer.from(masterPng); corrupt[45] ^= 1; assert.throws(function() { comfy._pngInfo(corrupt); }, function(error) { return error.code === 'COMFYUI_OUTPUT_INVALID'; }); assert(calls.some(function(url) { return url.endsWith('/prompt'); })); assert(calls.some(function(url) { return url.indexOf('/history/') >= 0; })); assert(calls.some(function(url) { return url.indexOf('/view?') >= 0; }));
    console.log('[ComfyUIMasterImageProvider] core-only master workflow, deterministic static/FrameSet derivation, transit isolation, and durable idempotency passed');
  } finally { restore(saved); fs.rmSync(root, { recursive: true, force: true }); }
})().catch(function(error) { console.error(error); process.exit(1); });
