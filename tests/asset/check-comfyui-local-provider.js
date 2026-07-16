var assert = require('assert');
var crypto = require('crypto');
var fs = require('fs');
var os = require('os');
var path = require('path');
var runtimeModule = require('../../packages/providers/src/provider-runtime');
var assetEngine = require('../../packages/assets/src/asset-engine-langgraph');
var comfy = require('../../packages/assets/src/comfyui-local-provider');
var semanticReviewer = require('../../packages/assets/src/clip-image-reviewer');
var libraryPorts = require('../fixtures/test-asset-library-ports');
var pngPort = require('../../packages/assets/src/local-derivation-port');
var rembg = require('../../packages/assets/src/rembg-background-removal');

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
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-master-image-check-')), names = ['ASSET_MODEL_PROVIDER', 'COMFYUI_ALLOW_LOCAL', 'COMFYUI_ENDPOINT', 'COMFYUI_MODEL_PATH', 'COMFYUI_MODEL_SHA256', 'COMFYUI_REFINER_PATH', 'COMFYUI_REFINER_SHA256', 'COMFYUI_IMAGE_MODEL', 'COMFYUI_TRANSIT_DIR', 'COMFYUI_POLL_MS'], saved = {}; names.forEach(function(name) { saved[name] = process.env[name]; });
  var savedReviewImages = semanticReviewer.reviewImages, savedFingerprint = semanticReviewer.fingerprint, savedReceipt = semanticReviewer.receipt;
  try {
    semanticReviewer.fingerprint = function() { return 'test-clip-reviewer-v1'; };
    semanticReviewer.receipt = function(imageBytes, result, phase) {
      var imageSha256 = crypto.createHash('sha256').update(imageBytes).digest('hex');
      return {
        receiptId: 'test-clip-review.' + crypto.createHash('sha256').update(JSON.stringify([imageSha256, result, phase])).digest('hex').slice(0, 24),
        owner: 'CLIPImageReviewer',
        phase: phase,
        modelRevision: semanticReviewer.contract.model.revision,
        modelFingerprint: 'test-clip-reviewer-v1',
        imageSha256: imageSha256,
        semanticSimilarity: result.semanticSimilarity,
        semanticMargin: result.semanticMargin,
        styleMargin: result.styleMargin,
        compositionChecks: result.compositionChecks || [],
        decision: 'accepted'
      };
    };
    semanticReviewer.reviewImages = async function(input) { return input.images.map(function(_image, index) { return { semanticSimilarity: 0.3 + index * 0.1, semanticMargin: 0.02 + index * 0.05, styleSimilarity: 0.3 + index * 0.1, styleMargin: 0.02 + index * 0.05, compositionChecks: (input.compositionChecks || []).map(function(check) { return { id: check.id, positiveSimilarity: 0.4, negativeSimilarity: 0.2, margin: 0.2 }; }) }; }); };
    var model = path.join(root, 'sdxl-base.safetensors'), refiner = path.join(root, 'sdxl-refiner.safetensors'), baseCheckpoint = Buffer.from('sdxl-base-test-checkpoint'), changedBaseCheckpoint = Buffer.from('sdxl-base-next-checkpoint'); assert.strictEqual(baseCheckpoint.length, changedBaseCheckpoint.length, 'cache invalidation probe keeps checkpoint size stable'); fs.writeFileSync(model, baseCheckpoint); fs.writeFileSync(refiner, Buffer.from('sdxl-refiner-test-checkpoint'));
    process.env.ASSET_MODEL_PROVIDER = 'comfyui-local'; process.env.COMFYUI_ALLOW_LOCAL = 'true'; process.env.COMFYUI_ENDPOINT = 'http://127.0.0.1:8188'; process.env.COMFYUI_MODEL_PATH = model; process.env.COMFYUI_MODEL_SHA256 = crypto.createHash('sha256').update(fs.readFileSync(model)).digest('hex'); process.env.COMFYUI_REFINER_PATH = refiner; process.env.COMFYUI_REFINER_SHA256 = crypto.createHash('sha256').update(fs.readFileSync(refiner)).digest('hex'); process.env.COMFYUI_IMAGE_MODEL = 'gamecastle.master-image.sdxl-base-refiner.v1'; process.env.COMFYUI_TRANSIT_DIR = path.join(root, 'transit'); process.env.COMFYUI_POLL_MS = '1';
    var calls = [], submissions = [], freeRequests = [], returnedImageCount = 2;
    var fetchImpl = async function(url, init) { calls.push(String(url)); if (String(url).endsWith('/system_stats')) return response({ system: { ram_free: 123456789 } }); if (String(url).endsWith('/free')) { freeRequests.push(JSON.parse(init.body)); return response({}); } if (String(url).endsWith('/prompt')) { var body = JSON.parse(init.body); submissions.push(body.prompt); return response({ prompt_id: 'job-' + submissions.length }); } var match = String(url).match(/\/history\/(job-\d+)/); if (match) { var value = {}, images = [{ filename: match[1] + '-pattern.png', type: 'output' }, { filename: match[1] + '-isolated.png', type: 'output' }, { filename: match[1] + '-extra.png', type: 'output' }, { filename: match[1] + '-extra-2.png', type: 'output' }].slice(0, returnedImageCount); value[match[1]] = { status: { status_str: 'success', completed: true }, outputs: { '11': { images: images } } }; return response(value); } if (String(url).indexOf('/view?') >= 0) return response(String(url).indexOf('-pattern.png') >= 0 ? patternPng : masterPng); if (String(url).endsWith('/interrupt')) return response({}); return response({}, 404); };
    var rembgPython = path.join(root, 'rembg-python.exe'), rembgEntrypoint = path.join(root, 'rembg-remove.py'), rembgModel = path.join(root, 'birefnet-test.onnx');
    fs.writeFileSync(rembgPython, 'test'); fs.writeFileSync(rembgEntrypoint, 'test'); fs.writeFileSync(rembgModel, 'pinned-birefnet-test-model');
    var backgroundRemoval = rembg.createRembgBackgroundRemoval({
      root: root,
      python: rembgPython,
      entrypoint: rembgEntrypoint,
      modelFile: rembgModel,
      modelSha256: crypto.createHash('sha256').update(fs.readFileSync(rembgModel)).digest('hex'),
      execute: async function(_python, args) {
        var inputFile = args[args.indexOf('--input') + 1], outputFile = args[args.indexOf('--output') + 1];
        var input = pngPort.decodePng(fs.readFileSync(inputFile)), output = { width: input.width, height: input.height, data: new Uint8ClampedArray(input.data) };
        for (var outputY = 0; outputY < output.height; outputY++) for (var outputX = 0; outputX < output.width; outputX++) if (outputX < 2 || outputX > output.width - 3 || outputY < 2 || outputY > output.height - 3) output.data[(outputY * output.width + outputX) * 4 + 3] = 0;
        fs.writeFileSync(outputFile, pngPort.encodePng(output));
      }
    });
    var runtime = runtimeModule.createProviderRuntime({ maxCost: 10, fetchImpl: fetchImpl });
    assert.deepStrictEqual(comfy._masterDimensions({ productionFamily: 'character-part', constraints: { width: 32, height: 32 } }), { width: 1024, height: 1024 });
    assert.deepStrictEqual(comfy._masterDimensions({ productionFamily: 'ui', constraints: { width: 192, height: 64 } }), { width: 1024, height: 512 });
    assert.deepStrictEqual(comfy._masterDimensions({ productionFamily: 'background', constraints: { width: 640, height: 640 } }), { width: 1024, height: 1024 });
    var missingPrompt = await runtime.invokeRole({ requestId: 'missing-prompt', projectId: 'p', role: 'image-generate', provider: 'comfyui-local', input: {} }); assert.strictEqual(missingPrompt.ok, false); assert.strictEqual(missingPrompt.debt.code, 'COMFYUI_PRODUCTION_INPUT_MISSING');
    comfy._resetCheckpointVerificationCache();
    var requirements = { schemaVersion: 2, documentKind: 'semantic-asset-requirements', sourceHash: 'semantic.master-image-check', requirements: [
      { semanticId: 'hero', subject: 'hero', description: 'Hero sprite', roles: ['hero'], productionFamily: 'character', recipeId: 'character-sprite.v1', styleId: 'gamecastle.style-dna.v1', constraints: { width: 16, height: 16, transparent: true }, gdjsBindings: [] },
      { semanticId: 'hero_idle', subject: 'hero', description: 'Hero idle animation', roles: ['hero'], productionFamily: 'character-animation', recipeId: 'character-frame-set.v1', styleId: 'gamecastle.style-dna.v1', constraints: { width: 16, height: 16, transparent: true }, animation: { initialStateId: 'idle', states: [{ stateId: 'idle', loop: true, frameCount: 4, frameDurationMs: 120, derivationProfileId: 'idle-bob' }] }, gdjsBindings: [] }
    ] };
    var ledgerPath = path.join(root, 'ledger.json'), result = await assetEngine.runAssetEngine({ runId: 'master-image-engine', projectId: 'master-image-engine', assetRequirementContract: requirements, sources: { hero: { kind: 'generation_required' }, hero_idle: { kind: 'generation_required' } }, ports: { backgroundRemoval: backgroundRemoval }, providerRuntime: runtime, providerOptions: { provider: 'comfyui-local' }, assetLibraryPort: libraryPorts.createTestAssetLibraryPort(), projectAssetDir: path.join(root, 'project-assets'), modelPolicy: { provider: 'comfyui-local', localAllowed: true }, ledgerPath: ledgerPath });
    assert.strictEqual(result.accepted, true, JSON.stringify({ debts: result.debts, calls: calls })); assert.strictEqual(submissions.length, 2, 'each library miss must run one official SDXL base-refiner workflow');
    submissions.forEach(function(graph) { assert.deepStrictEqual(Array.from(new Set(Object.keys(graph).map(function(id) { return graph[id].class_type; }))).sort(), ['CLIPTextEncode', 'CheckpointLoaderSimple', 'EmptyLatentImage', 'KSamplerAdvanced', 'SaveImage', 'VAEDecode'].sort()); assert.strictEqual(graph['4'].inputs.batch_size, 2); assert.strictEqual(graph['5'].inputs.end_at_step, 24); assert.strictEqual(graph['9'].inputs.start_at_step, 24); assert.strictEqual(graph['5'].inputs.return_with_leftover_noise, 'enable'); assert.strictEqual(graph['9'].inputs.add_noise, 'disable'); assert(graph['2'].inputs.text.length < 320); });
    assert.notStrictEqual(submissions[0]['5'].inputs.noise_seed, submissions[1]['5'].inputs.noise_seed, 'different requirements must not share one global seed');
    assert.strictEqual(result.assetManifest.assets[0].source, 'deterministicDerivation'); assert(result.assetManifest.assets[0].path.indexOf(path.join('project-assets', 'static')) >= 0); assert.strictEqual(result.assetManifest.assets[1].frameSet.documentKind, require('../../packages/assets/contracts/frame-set-contract.json').documentKind); assert(result.assetManifest.assets[1].frameSet.frames.every(function(frame) { return frame.path.indexOf(path.join('project-assets', 'frames')) >= 0; }));
    assert(result.assetProduction.workItems.every(function(item) { return item.masterImage && item.masterImage.status === 'master' && item.masterImage.publishability.publishable === false; }));
    assert(result.assetProduction.workItems.every(function(item) { return item.masterImage.providerReceipt.provenance.candidateSelection.selectedIndex === 1 && item.masterImage.providerReceipt.provenance.baseModelId === 'sd_xl_base_1.0.safetensors' && item.masterImage.providerReceipt.provenance.resourceRelease.verifiedHealthy === true; }));
    assert(calls.some(function(url) { return url.endsWith('/free'); }), 'every completed Comfy generation must cross the registered model-release barrier before derivation');
    assert(freeRequests.length && freeRequests.every(function(body) { return body.unload_models === true && body.free_memory === true; }), 'every `/free` request must unload models and free ComfyUI memory');
    var cacheAfterInitialProduction = comfy._checkpointVerificationMetrics();
    assert.deepStrictEqual(cacheAfterInitialProduction, { hits: 2, misses: 2, fullHashes: 2, failures: 0, entries: 2 }, 'one workflow per asset verifies each checkpoint once, then reuses the exact stat-bound verification cache');
    var releaseCallsBeforeMtimeOnlyChange = calls.filter(function(url) { return url.endsWith('/free'); }).length;
    fs.utimesSync(refiner, new Date(), new Date(Date.now() + 2000));
    var mtimeOnlyCheckpoint = await runtime.invokeRole({ requestId: 'checkpoint-mtime-only-change', projectId: 'checkpoint-mtime-only-change', role: 'image-generate', provider: 'comfyui-local', model: 'gamecastle.master-image.sdxl-base-refiner.v1', estimatedCost: 0, timeoutMs: 5000, maxAttempts: 1, input: { prompt: 'one blue gem', negativePrompt: 'photograph', reviewPositiveTexts: ['one blue gem'], reviewNegativeTexts: ['unrelated object'], stylePositiveTexts: ['raster-toon game asset'], styleNegativeTexts: ['photograph'], candidateRounds: 1 } });
    assert.strictEqual(mtimeOnlyCheckpoint.ok, true, 'a metadata-only checkpoint change must be fully reverified even when the expected SHA remains the same');
    assert.strictEqual(calls.filter(function(url) { return url.endsWith('/free'); }).length, releaseCallsBeforeMtimeOnlyChange + 1, 'a verification-cache hit must not bypass the registered /free release barrier');
    var cacheAfterMtimeOnlyChange = comfy._checkpointVerificationMetrics();
    assert.deepStrictEqual(cacheAfterMtimeOnlyChange, { hits: 3, misses: 3, fullHashes: 3, failures: 0, entries: 3 }, 'mtime change with the same expected SHA must force one complete checkpoint rehash');
    var releaseCallsBeforeFileChange = calls.filter(function(url) { return url.endsWith('/free'); }).length;
    fs.writeFileSync(model, changedBaseCheckpoint); fs.utimesSync(model, new Date(), new Date(Date.now() + 4000)); process.env.COMFYUI_MODEL_SHA256 = crypto.createHash('sha256').update(fs.readFileSync(model)).digest('hex');
    var changedCheckpoint = await runtime.invokeRole({ requestId: 'checkpoint-file-change', projectId: 'checkpoint-file-change', role: 'image-generate', provider: 'comfyui-local', model: 'gamecastle.master-image.sdxl-base-refiner.v1', estimatedCost: 0, timeoutMs: 5000, maxAttempts: 1, input: { prompt: 'one blue gem', negativePrompt: 'photograph', reviewPositiveTexts: ['one blue gem'], reviewNegativeTexts: ['unrelated object'], stylePositiveTexts: ['raster-toon game asset'], styleNegativeTexts: ['photograph'], candidateRounds: 1 } });
    assert.strictEqual(changedCheckpoint.ok, true, 'a changed checkpoint with a new expected hash must be fully reverified and remain usable');
    assert.strictEqual(calls.filter(function(url) { return url.endsWith('/free'); }).length, releaseCallsBeforeFileChange + 1, 'a checkpoint cache miss must still release ComfyUI model memory');
    var cacheAfterFileChange = comfy._checkpointVerificationMetrics();
    assert.deepStrictEqual(cacheAfterFileChange, { hits: 4, misses: 4, fullHashes: 4, failures: 0, entries: 4 }, 'same-size checkpoint content/mtime change must miss only its affected verification key');
    var cacheBeforeHashMismatch = comfy._checkpointVerificationMetrics(); process.env.COMFYUI_MODEL_SHA256 = '0'.repeat(64);
    var hashMismatch = await runtime.invokeRole({ requestId: 'checkpoint-hash-mismatch', projectId: 'checkpoint-hash-mismatch', role: 'image-generate', provider: 'comfyui-local', model: 'gamecastle.master-image.sdxl-base-refiner.v1', estimatedCost: 0, timeoutMs: 5000, maxAttempts: 1, input: { prompt: 'one blue gem', negativePrompt: 'photograph', reviewPositiveTexts: ['one blue gem'], reviewNegativeTexts: ['unrelated object'], stylePositiveTexts: ['raster-toon game asset'], styleNegativeTexts: ['photograph'], candidateRounds: 1 } });
    assert.strictEqual(hashMismatch.ok, false); assert.strictEqual(hashMismatch.debt.code, 'COMFYUI_MODEL_HASH_MISMATCH');
    var cacheAfterHashMismatch = comfy._checkpointVerificationMetrics();
    assert.deepStrictEqual(cacheAfterHashMismatch, { hits: cacheBeforeHashMismatch.hits, misses: cacheBeforeHashMismatch.misses + 1, fullHashes: cacheBeforeHashMismatch.fullHashes + 1, failures: cacheBeforeHashMismatch.failures + 1, entries: cacheBeforeHashMismatch.entries }, 'a hash mismatch must never populate a cache entry');
    var cacheBeforeMissingCheckpoint = comfy._checkpointVerificationMetrics(); process.env.COMFYUI_MODEL_PATH = path.join(root, 'missing-base.safetensors');
    var missingCheckpoint = await runtime.invokeRole({ requestId: 'checkpoint-file-missing', projectId: 'checkpoint-file-missing', role: 'image-generate', provider: 'comfyui-local', model: 'gamecastle.master-image.sdxl-base-refiner.v1', estimatedCost: 0, timeoutMs: 5000, maxAttempts: 1, input: { prompt: 'one blue gem', negativePrompt: 'photograph', reviewPositiveTexts: ['one blue gem'], reviewNegativeTexts: ['unrelated object'], stylePositiveTexts: ['raster-toon game asset'], styleNegativeTexts: ['photograph'], candidateRounds: 1 } });
    assert.strictEqual(missingCheckpoint.ok, false); assert.strictEqual(missingCheckpoint.debt.code, 'COMFYUI_MODEL_MISSING');
    var cacheAfterMissingCheckpoint = comfy._checkpointVerificationMetrics();
    assert.deepStrictEqual(cacheAfterMissingCheckpoint, { hits: cacheBeforeMissingCheckpoint.hits, misses: cacheBeforeMissingCheckpoint.misses, fullHashes: cacheBeforeMissingCheckpoint.fullHashes, failures: cacheBeforeMissingCheckpoint.failures + 1, entries: cacheBeforeMissingCheckpoint.entries }, 'missing checkpoint initialization must not mutate cached verification entries');
    process.env.COMFYUI_MODEL_PATH = path.join(root, '.', path.basename(model)); process.env.COMFYUI_MODEL_SHA256 = crypto.createHash('sha256').update(fs.readFileSync(model)).digest('hex');
    var restoredCheckpoint = await runtime.invokeRole({ requestId: 'checkpoint-cache-recovered', projectId: 'checkpoint-cache-recovered', role: 'image-generate', provider: 'comfyui-local', model: 'gamecastle.master-image.sdxl-base-refiner.v1', estimatedCost: 0, timeoutMs: 5000, maxAttempts: 1, input: { prompt: 'one blue gem', negativePrompt: 'photograph', reviewPositiveTexts: ['one blue gem'], reviewNegativeTexts: ['unrelated object'], stylePositiveTexts: ['raster-toon game asset'], styleNegativeTexts: ['photograph'], candidateRounds: 1 } });
    assert.strictEqual(restoredCheckpoint.ok, true, 'restoring an exact verified checkpoint must reuse only the valid cache entries');
    var cacheAfterRecovery = comfy._checkpointVerificationMetrics();
    assert.deepStrictEqual(cacheAfterRecovery, { hits: cacheAfterMissingCheckpoint.hits + 2, misses: cacheAfterMissingCheckpoint.misses, fullHashes: cacheAfterMissingCheckpoint.fullHashes, failures: cacheAfterMissingCheckpoint.failures, entries: cacheAfterMissingCheckpoint.entries }, 'canonical equivalent path and restored expected hash must hit the prior valid base/refiner entries');
    var before = submissions.length; await assetEngine.runAssetEngine({ runId: 'master-image-engine', projectId: 'master-image-engine', assetRequirementContract: requirements, ports: { backgroundRemoval: backgroundRemoval }, providerRuntime: runtime, providerOptions: { provider: 'comfyui-local' }, assetLibraryPort: libraryPorts.createTestAssetLibraryPort(), projectAssetDir: path.join(root, 'project-assets'), modelPolicy: { provider: 'comfyui-local', localAllowed: true }, ledgerPath: ledgerPath }); assert.strictEqual(submissions.length, before, 'durable accepted ledger must prevent duplicate master generation');
    semanticReviewer.reviewImages = async function(input) { return input.images.map(function() { return { semanticSimilarity: 0.1, semanticMargin: -0.1, styleSimilarity: 0.2, styleMargin: 0, compositionChecks: [] }; }); };
    var qualityDebt = await runtime.invokeRole({ requestId: 'quality-diagnostics', projectId: 'quality-diagnostics', role: 'image-generate', provider: 'comfyui-local', model: 'gamecastle.master-image.sdxl-base-refiner.v1', estimatedCost: 0, timeoutMs: 5000, maxAttempts: 1, input: { prompt: 'one blue gem', negativePrompt: 'photograph', reviewPositiveTexts: ['one blue gem'], reviewNegativeTexts: ['unrelated object'], stylePositiveTexts: ['raster-toon game asset'], styleNegativeTexts: ['photograph'], candidateRounds: 1 } });
    assert.strictEqual(qualityDebt.ok, false); assert.strictEqual(qualityDebt.debt.owner, 'MasterImageQuality'); assert.strictEqual(qualityDebt.debt.diagnostics.length, 2); assert.strictEqual(qualityDebt.debt.attemptDiagnostics.length, 1); assert.strictEqual(qualityDebt.debt.attemptDiagnostics[0].candidateDiagnostics.length, 2); assert(qualityDebt.debt.message.indexOf('MASTER_IMAGE_SEMANTIC_REJECTED') >= 0);
    var beforeRounds = submissions.length, multiRoundDebt = await runtime.invokeRole({ requestId: 'quality-round-history', projectId: 'quality-round-history', role: 'image-generate', provider: 'comfyui-local', model: 'gamecastle.master-image.sdxl-base-refiner.v1', estimatedCost: 0, timeoutMs: 5000, maxAttempts: 1, input: { prompt: 'one blue gem', negativePrompt: 'photograph', reviewPositiveTexts: ['one blue gem'], reviewNegativeTexts: ['unrelated object'], stylePositiveTexts: ['raster-toon game asset'], styleNegativeTexts: ['photograph'], candidateRounds: 2, seed: 10 } });
    assert.strictEqual(multiRoundDebt.ok, false); assert.strictEqual(submissions.length - beforeRounds, 2); assert.deepStrictEqual(multiRoundDebt.debt.attemptDiagnostics.map(function(item) { return item.round; }), [1, 2]); assert.notStrictEqual(multiRoundDebt.debt.attemptDiagnostics[0].seed, multiRoundDebt.debt.attemptDiagnostics[1].seed);
    for (var invalidCount of [1, 3, 4]) { returnedImageCount = invalidCount; var candidateCountDebt = await runtime.invokeRole({ requestId: 'candidate-count-mismatch-' + invalidCount, projectId: 'candidate-count-mismatch', role: 'image-generate', provider: 'comfyui-local', model: 'gamecastle.master-image.sdxl-base-refiner.v1', estimatedCost: 0, timeoutMs: 5000, maxAttempts: 1, input: { prompt: 'one blue gem', negativePrompt: 'photograph', reviewPositiveTexts: ['one blue gem'], reviewNegativeTexts: ['unrelated object'], stylePositiveTexts: ['raster-toon game asset'], styleNegativeTexts: ['photograph'], candidateRounds: 1, seed: 20 + invalidCount } }); assert.strictEqual(candidateCountDebt.ok, false); assert.strictEqual(candidateCountDebt.debt.code, 'COMFYUI_CANDIDATE_COUNT_MISMATCH'); }
    returnedImageCount = 2;
    var corrupt = Buffer.from(masterPng); corrupt[45] ^= 1; assert.throws(function() { comfy._pngInfo(corrupt); }, function(error) { return error.code === 'COMFYUI_OUTPUT_INVALID'; }); assert(calls.some(function(url) { return url.endsWith('/prompt'); })); assert(calls.some(function(url) { return url.indexOf('/history/') >= 0; })); assert(calls.some(function(url) { return url.indexOf('/view?') >= 0; }));
    console.log('[ComfyUIMasterImageProvider] official-core SDXL Base-Refiner workflow, reviewed deterministic static/FrameSet derivation, transit cleanup, and durable idempotency passed');
  } finally { comfy._resetCheckpointVerificationCache(); semanticReviewer.reviewImages = savedReviewImages; semanticReviewer.fingerprint = savedFingerprint; semanticReviewer.receipt = savedReceipt; restore(saved); fs.rmSync(root, { recursive: true, force: true }); }
})().catch(function(error) { console.error(error); process.exit(1); });
