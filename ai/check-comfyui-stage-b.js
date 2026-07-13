var assert = require('assert');
var crypto = require('crypto');
var fs = require('fs');
var os = require('os');
var path = require('path');
var runtimeModule = require('./provider-runtime');
var comfy = require('./comfyui-local-provider');
var maskContract = require('./comfyui-mask-contract');

var parentPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADklEQVR4nGP4z8DwHwQBEPgD/U6VwW8AAAAASUVORK5CYII=', 'base64');
var maskPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADElEQVR4nGNggID/AAEIAQBNGY85AAAAAElFTkSuQmCC', 'base64');
var rewrittenPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADUlEQVR4nGNgYPgPBgAU9AX7uVYDfQAAAABJRU5ErkJggg==', 'base64');
function response(body, status) { var image = Buffer.isBuffer(body); return new Response(image ? body : JSON.stringify(body), { status: status === undefined ? 200 : status, headers: { 'Content-Type': image ? 'image/png' : 'application/json' } }); }
function digest(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function restore(saved) { Object.keys(saved).forEach(function(key) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }); }

(async function() {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-comfy-stage-b-')), names = ['ASSET_MODEL_PROVIDER', 'ASSET_IMAGE_MODEL', 'ASSET_VISION_MODEL', 'COMFYUI_ALLOW_LOCAL', 'COMFYUI_ENDPOINT', 'COMFYUI_MODEL_PATH', 'COMFYUI_MODEL_SHA256', 'COMFYUI_IMAGE_MODEL', 'COMFYUI_VISION_MODEL', 'COMFYUI_FLORENCE2_MODEL_PATH', 'COMFYUI_FLORENCE2_MODEL_SHA256', 'COMFYUI_ROOT', 'COMFYUI_TRANSIT_DIR', 'COMFYUI_POLL_MS'], saved = {}; names.forEach(function(name) { saved[name] = process.env[name]; });
  try {
    var model = path.join(root, 'model.safetensors'), florence = path.join(root, 'florence2-base'); fs.writeFileSync(model, Buffer.from('stage-b-test-model')); fs.mkdirSync(florence); fs.writeFileSync(path.join(florence, 'config.json'), '{}');
    process.env.ASSET_MODEL_PROVIDER = 'comfyui-local'; process.env.ASSET_IMAGE_MODEL = 'gamecastle.sprite-edit.dev-cpu.v1'; process.env.ASSET_VISION_MODEL = 'gamecastle.test-local-png-review.v1'; process.env.COMFYUI_ALLOW_LOCAL = 'true'; process.env.COMFYUI_ENDPOINT = 'http://127.0.0.1:8188'; process.env.COMFYUI_MODEL_PATH = model; process.env.COMFYUI_MODEL_SHA256 = digest(fs.readFileSync(model)); process.env.COMFYUI_IMAGE_MODEL = 'gamecastle.sprite-edit.dev-cpu.v1'; process.env.COMFYUI_VISION_MODEL = 'gamecastle.test-local-png-review.v1'; process.env.COMFYUI_FLORENCE2_MODEL_PATH = florence; process.env.COMFYUI_FLORENCE2_MODEL_SHA256 = comfy._hashPath(florence); process.env.COMFYUI_ROOT = path.resolve('.tools/ComfyUI'); process.env.COMFYUI_TRANSIT_DIR = path.join(root, 'transit'); process.env.COMFYUI_POLL_MS = '1';
    var prompts = [], fetchImpl = async function(url, init) { var text = String(url); if (text.endsWith('/system_stats')) return response({ system: {} }); if (text.endsWith('/upload/image')) return response({ name: 'safe-input.png', subfolder: '', type: 'input' }); if (text.endsWith('/prompt')) { var submitted = JSON.parse(init.body); prompts.push(submitted.prompt); return response({ prompt_id: submitted.prompt['6'] ? 'edit-job' : 'vision-job' }); } if (text.indexOf('/history/edit-job') >= 0) return response({ 'edit-job': { status: { status_str: 'success', completed: true }, outputs: { '8': { images: [{ filename: 'edited.png', type: 'output' }] } } } }); if (text.indexOf('/history/vision-job') >= 0) return response({ 'vision-job': { status: { status_str: 'success', completed: true }, outputs: { '4': { text: ['a small game hero'] } } } }); if (text.indexOf('/view?') >= 0) return response(parentPng); if (text.endsWith('/interrupt')) return response({}); return response({}, 404); };
    var parentHash = digest(parentPng), maskHash = digest(maskPng), runtime = runtimeModule.createProviderRuntime({ maxCost: 2, fetchImpl: fetchImpl }), slot = { slotId: 'hero', kind: 'sprite', styleId: 'gamecastle.style-dna.v1', semanticTags: ['hero'], styleTags: ['gamecastle.style-dna.v1'], constraints: { width: 2, height: 1, transparent: true } };
    var ports = comfy.createAssetProviderPorts(runtime, { provider: 'comfyui-local', estimatedCost: 0.1, timeoutMs: 1000, resolveAssetInput: async function(request) { var parent = request.kind === 'parent'; return { bytes: parent ? parentPng : maskPng, sha256: parent ? parentHash : maskHash, projectId: 'project-stage-b', revisionId: parent ? 'revision.parent' : 'mask.revision', scope: 'project-local', consent: true }; } });
    var state = { runId: 'stage-b', projectId: 'project-stage-b', slot: slot, projectAssetDir: path.join(root, 'assets'), source: { parentRevisionId: 'revision.parent', parentAssetRef: { refId: 'parent', revisionId: 'revision.parent', sha256: parentHash }, maskAssetRef: { refId: 'mask', revisionId: 'mask.revision', sha256: maskHash }, repairConstraint: 'repair the hero' } };
    var edited = await ports.edit(state); assert.equal(edited.source, 'imageEdit'); assert.equal(edited.status, 'variant'); assert.equal(edited.parentRevisionId, 'revision.parent');
    var review = await ports.review(Object.assign({}, state, { candidate: edited, source: { reviewPolicy: { requiredSemanticTags: ['hero'], minConfidence: 0.35 } } })); assert.equal(review.pass, true); assert.equal(review.reviewer, 'deterministic-local-png');
    assert.equal(prompts[0]['5'].class_type, 'VAEEncodeForInpaint'); assert.equal(prompts.length, 1, 'Stage B fixture isolates image editing; Florence is covered by the real loopback smoke.');
    assert.throws(function() { maskContract.assertMaskedEdit(parentPng, maskPng, rewrittenPng); }, function(error) { return error.code === 'COMFYUI_MASK_OUTSIDE_CHANGED'; });
    var missingMaskPorts = comfy.createAssetProviderPorts(runtime, { provider: 'comfyui-local', resolveAssetInput: async function() { throw Object.assign(new Error('stale parent or mask'), { code: 'COMFYUI_INPUT_REF_INVALID' }); } });
    await assert.rejects(function() { return missingMaskPorts.edit(state); }, function(error) { return error.code === 'COMFYUI_INPUT_REF_INVALID'; }, 'stale parent/mask references must fail closed');
    console.log('[ComfyUIStageB] typed parent/mask edit, immutable child provenance, local review handoff, protected pixels and stale refs passed');
  } finally { restore(saved); fs.rmSync(root, { recursive: true, force: true }); }
})().catch(function(error) { console.error(error); process.exit(1); });
