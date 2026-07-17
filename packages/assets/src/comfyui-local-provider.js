/* ComfyUI is the master-image provider. Asset processing belongs to AssetDerivationPipeline. */
var crypto = require('crypto');
var fs = require('fs');
var os = require('os');
var path = require('path');
var registry = require('../contracts/comfyui-workflow-registry.json');
var styleDNA = require('./style-dna');
var masterImageQuality = require('./master-image-quality');
var semanticReviewer = require('./clip-image-reviewer');

var blobs = new Map();
var checkpointVerificationCache = new Map();
var checkpointVerificationCounters = { hits: 0, misses: 0, fullHashes: 0, failures: 0 };
function code(value, message) { var error = new Error(message); error.code = value; error.owner = 'ComfyUIMasterImageProvider'; return error; }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function remainingTimeout(deadlineAt, fallback) { if (deadlineAt === undefined || deadlineAt === null) return Number(fallback); var value = Math.floor(Number(deadlineAt) - Date.now()); if (!Number.isFinite(value) || value < 1) throw code('ASSET_ENGINE_DEADLINE_EXCEEDED', 'AssetEngine execution profile deadline expired.'); return Math.min(value, Number(fallback)); }
function transitRoot() { var value = path.resolve(process.env.COMFYUI_TRANSIT_DIR || path.join(os.tmpdir(), 'gamecastle-comfy-master-images')); fs.mkdirSync(value, { recursive: true }); return value; }
function blobIndexFile() { return path.join(transitRoot(), 'blob-index.json'); }
function readBlobIndex() { try { return JSON.parse(fs.readFileSync(blobIndexFile(), 'utf8')); } catch (_error) { return {}; } }
function writeBlobIndex(index) { fs.writeFileSync(blobIndexFile(), JSON.stringify(index, null, 2)); }
function rememberBlob(blobId, record) { blobs.set(blobId, record); var index = readBlobIndex(); index[blobId] = { filename: path.basename(record.path), sha256: record.sha256, info: record.info, projectId: record.projectId, scope: record.scope, expiresAt: record.expiresAt }; writeBlobIndex(index); }
function findBlob(ref) { if (!ref || !ref.blobId || !ref.sha256) throw code('COMFYUI_BLOB_MISSING', 'Master-image blob reference is invalid.'); var record = blobs.get(ref.blobId); if (!record) { var entry = readBlobIndex()[ref.blobId]; if (!entry || entry.expiresAt < Date.now()) throw code('COMFYUI_OUTPUT_LOST', 'Master image expired or is unavailable.'); var file = path.resolve(transitRoot(), entry.filename); if (!file.startsWith(transitRoot() + path.sep) || !fs.existsSync(file)) throw code('COMFYUI_OUTPUT_LOST', 'Master image is unavailable after restart.'); record = { path: file, sha256: entry.sha256, info: entry.info, projectId: entry.projectId, scope: entry.scope, expiresAt: entry.expiresAt }; blobs.set(ref.blobId, record); } if (record.sha256 !== ref.sha256 || sha256(fs.readFileSync(record.path)) !== record.sha256) throw code('COMFYUI_OUTPUT_LOST', 'Master-image integrity check failed.'); return record; }
function discardBlob(ref) { if (!ref || !ref.blobId) return; var index = readBlobIndex(), entry = index[ref.blobId], record = blobs.get(ref.blobId), file = record && record.path || (entry && path.join(transitRoot(), entry.filename)); if (file) { var resolved = path.resolve(file), root = transitRoot(); if (resolved.startsWith(root + path.sep) && fs.existsSync(resolved)) fs.rmSync(resolved, { force: true }); } blobs.delete(ref.blobId); delete index[ref.blobId]; writeBlobIndex(index); }
function localEndpoint(value) { if (!value) throw code('COMFYUI_ENDPOINT_MISSING', 'COMFYUI_ENDPOINT is required.'); var parsed; try { parsed = new URL(value); } catch (_error) { throw code('COMFYUI_ENDPOINT_INVALID', 'ComfyUI endpoint is invalid.'); } if (parsed.protocol !== 'http:' || ['127.0.0.1', 'localhost', '::1'].indexOf(parsed.hostname) < 0 || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw code('COMFYUI_ENDPOINT_NOT_LOCAL', 'ComfyUI endpoint must be a loopback HTTP origin.'); return parsed.origin; }
function crc32(buffer) { var value = 0xffffffff; for (var index = 0; index < buffer.length; index++) { value ^= buffer[index]; for (var bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (0xedb88320 & -(value & 1)); } return (value ^ 0xffffffff) >>> 0; }
function pngInfo(bytes, limits) { limits = limits || {}; if (!Buffer.isBuffer(bytes) || bytes.length < 33 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw code('COMFYUI_OUTPUT_INVALID', 'ComfyUI output is not a PNG.'); if (limits.maxOutputBytes && bytes.length > limits.maxOutputBytes) throw code('COMFYUI_OUTPUT_INVALID', 'ComfyUI PNG exceeds the byte limit.'); var cursor = 8, width = 0, height = 0, colorType = 0, ended = false; while (cursor + 12 <= bytes.length) { var length = bytes.readUInt32BE(cursor), end = cursor + 12 + length; if (end > bytes.length) throw code('COMFYUI_OUTPUT_INVALID', 'ComfyUI PNG chunk is truncated.'); var type = bytes.toString('ascii', cursor + 4, cursor + 8), data = bytes.subarray(cursor + 8, cursor + 8 + length), expected = bytes.readUInt32BE(cursor + 8 + length), actual = crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])); if (expected !== actual) throw code('COMFYUI_OUTPUT_INVALID', 'ComfyUI PNG checksum is invalid.'); if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); colorType = data[9]; } if (type === 'IEND') { ended = true; break; } cursor = end; } if (!ended || !width || !height || (limits.maxWidth && width > limits.maxWidth) || (limits.maxHeight && height > limits.maxHeight) || (limits.maxPixels && width * height > limits.maxPixels)) throw code('COMFYUI_OUTPUT_INVALID', 'ComfyUI PNG dimensions are invalid.'); return { width: width, height: height, transparent: colorType === 4 || colorType === 6 }; }
function hashPath(modelPath) { var resolved = path.resolve(modelPath); if (!fs.existsSync(resolved)) throw code('COMFYUI_MODEL_MISSING', 'Configured model artifact is unavailable.'); if (!fs.statSync(resolved).isFile()) throw code('COMFYUI_MODEL_INVALID', 'Master-image checkpoint must be a file.'); var digest = crypto.createHash('sha256'), file = fs.openSync(resolved, 'r'), buffer = Buffer.allocUnsafe(8 * 1024 * 1024), position = 0; try { for (;;) { var read = fs.readSync(file, buffer, 0, buffer.length, position); if (!read) break; digest.update(buffer.subarray(0, read)); position += read; } } finally { fs.closeSync(file); } return digest.digest('hex'); }
function checkpointMetadata(modelPath) {
  var resolved = path.resolve(modelPath);
  if (!fs.existsSync(resolved)) throw code('COMFYUI_MODEL_MISSING', 'Configured model artifact is unavailable.');
  var canonical = (fs.realpathSync.native || fs.realpathSync)(resolved), stat = fs.statSync(canonical);
  if (!stat.isFile()) throw code('COMFYUI_MODEL_INVALID', 'Master-image checkpoint must be a file.');
  return { canonicalPath: canonical, size: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs, dev: stat.dev, ino: stat.ino };
}
function checkpointCacheKey(workflowId, checkpointRole, metadata, expectedHash) {
  return JSON.stringify([workflowId, checkpointRole, metadata.canonicalPath, metadata.size, metadata.mtimeMs, metadata.ctimeMs, metadata.dev, metadata.ino, String(expectedHash).toLowerCase()]);
}
function sameCheckpointMetadata(left, right) {
  return left.canonicalPath === right.canonicalPath && left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs && left.dev === right.dev && left.ino === right.ino;
}
function verifiedCheckpointHash(workflowId, checkpointRole, modelPath, expectedHash) {
  var before, key, cached;
  try {
    before = checkpointMetadata(modelPath);
    key = checkpointCacheKey(workflowId, checkpointRole, before, expectedHash);
    cached = checkpointVerificationCache.get(key);
  } catch (error) {
    checkpointVerificationCounters.failures += 1;
    throw error;
  }
  if (cached) { checkpointVerificationCounters.hits += 1; return cached.sha256; }
  checkpointVerificationCounters.misses += 1;
  var actual;
  try {
    checkpointVerificationCounters.fullHashes += 1;
    actual = hashPath(before.canonicalPath);
    var after = checkpointMetadata(before.canonicalPath);
    if (!sameCheckpointMetadata(before, after)) throw code('COMFYUI_MODEL_CHANGED_DURING_VERIFICATION', 'Master-image checkpoint changed during SHA-256 verification.');
  } catch (error) {
    checkpointVerificationCounters.failures += 1;
    throw error;
  }
  if (actual !== String(expectedHash).toLowerCase()) { checkpointVerificationCounters.failures += 1; return actual; }
  checkpointVerificationCache.set(key, { sha256: actual });
  return actual;
}
function checkpointVerificationMetrics() { return { hits: checkpointVerificationCounters.hits, misses: checkpointVerificationCounters.misses, fullHashes: checkpointVerificationCounters.fullHashes, failures: checkpointVerificationCounters.failures, entries: checkpointVerificationCache.size }; }
function resetCheckpointVerificationCache() { checkpointVerificationCache.clear(); checkpointVerificationCounters = { hits: 0, misses: 0, fullHashes: 0, failures: 0 }; }
function workflow(model) {
  var item = registry.workflows[model];
  if (!item || item.role !== 'master-image-generate') throw code('COMFYUI_WORKFLOW_UNREGISTERED', 'No registered master-image workflow for ' + model + '.');
  var file = path.resolve(__dirname, '..', '..', '..', item.workflowFile), bytes;
  try { bytes = fs.readFileSync(file); } catch (_error) { throw code('COMFYUI_WORKFLOW_MISSING', 'Registered master-image workflow is unavailable.'); }
  if (sha256(bytes) !== item.workflowSha256) throw code('COMFYUI_WORKFLOW_HASH_MISMATCH', 'Master-image workflow hash does not match the registry.');
  var graph = JSON.parse(bytes.toString('utf8')), classes = Object.keys(graph).map(function(id) { return graph[id].class_type; });
  if (classes.some(function(name) { return item.officialCoreNodeClasses.indexOf(name) < 0; }) || classes.indexOf('SaveImage') < 0) throw code('COMFYUI_WORKFLOW_NOT_CORE', 'Master-image workflow must contain only registered ComfyUI core nodes.');
  var basePath = process.env[item.baseModel.pathEnv], baseHash = process.env[item.baseModel.sha256Env], refinerPath = process.env[item.refinerModel.pathEnv], refinerHash = process.env[item.refinerModel.sha256Env];
  if (!basePath || !baseHash || !refinerPath || !refinerHash) throw code('COMFYUI_MODEL_PROVENANCE_MISSING', 'SDXL base and refiner paths and SHA-256 values are required.');
  if (verifiedCheckpointHash(model, 'base', basePath, baseHash) !== String(baseHash).toLowerCase()) throw code('COMFYUI_MODEL_HASH_MISMATCH', 'Configured SDXL base SHA-256 does not match the checkpoint.');
  if (verifiedCheckpointHash(model, 'refiner', refinerPath, refinerHash) !== String(refinerHash).toLowerCase()) throw code('COMFYUI_REFINER_HASH_MISMATCH', 'Configured SDXL refiner SHA-256 does not match the checkpoint.');
  return { id: model, item: item, graph: graph, baseHash: baseHash, refinerHash: refinerHash };
}
function bind(registration, graph, field, value) { var bindings = registration.item.inputBindings[field]; if (!Array.isArray(bindings) || !bindings.length) throw code('COMFYUI_BINDING_INVALID', 'Master-image workflow does not bind ' + field + '.'); bindings.forEach(function(binding) { if (!graph[binding.nodeId] || !graph[binding.nodeId].inputs) throw code('COMFYUI_BINDING_INVALID', 'Master-image workflow has an invalid ' + field + ' binding.'); graph[binding.nodeId].inputs[binding.input] = value; }); }
function prompt(registration, input) { var graph = clone(registration.graph), profile = registration.item.productionProfile; Object.keys(profile).forEach(function(field) { var definition = profile[field], value = input[field]; if (value === undefined) value = definition.default; if (definition.required && (value === undefined || value === null || String(value).trim() === '')) throw code('COMFYUI_PRODUCTION_INPUT_MISSING', 'Master-image workflow requires ' + field + '.'); if (definition.type === 'integer') value = Math.round(Number(value)); else if (definition.type === 'number') value = Number(value); else value = String(value); if (definition.minimum !== undefined) value = Math.max(definition.minimum, value); if (definition.maximum !== undefined) value = Math.min(definition.maximum, value); bind(registration, graph, field, value); }); bind(registration, graph, 'filenamePrefix', 'gamecastle-sdxl-' + String(input.requestId).replace(/[^A-Za-z0-9_-]/g, '_') + '-' + String(input.outputNonce).replace(/[^A-Za-z0-9_-]/g, '_')); return graph; }
function request(context, route, options) { var endpoint = localEndpoint(context.config.endpoint), fetchImpl = context.fetchImpl || fetch; return fetchImpl(endpoint + route, Object.assign({}, options || {}, { signal: context.signal })); }
async function health(context) { var response = await request(context, '/system_stats'); if (!response.ok) throw code('COMFYUI_HTTP_' + response.status, 'ComfyUI health request failed.'); return { endpoint: localEndpoint(context.config.endpoint), healthy: true }; }
async function interrupt(context) { try { await request(context, '/interrupt', { method: 'POST' }); } catch (_error) {} }
async function releaseGenerationResources(context, registration) {
  var policy = registration.item.resourceReleasePolicy;
  if (!policy || policy.route !== '/free' || policy.healthRoute !== '/system_stats' || policy.unloadModels !== true || policy.freeMemory !== true || !Number.isInteger(policy.settleMs) || policy.settleMs < 0 || policy.settleMs > 10000) throw code('COMFYUI_RESOURCE_RELEASE_POLICY_INVALID', 'Registered workflow requires a valid post-generation resource release policy.');
  var response = await request(context, policy.route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unload_models: true, free_memory: true }) });
  if (!response.ok) throw code('COMFYUI_RESOURCE_RELEASE_FAILED', 'ComfyUI refused to release generation models.');
  if (policy.settleMs) await new Promise(function(resolve) { setTimeout(resolve, policy.settleMs); });
  var healthResponse = await request(context, policy.healthRoute); if (!healthResponse.ok) throw code('COMFYUI_RESOURCE_RELEASE_UNVERIFIED', 'ComfyUI became unavailable after its release barrier.');
  var stats = await healthResponse.json(), ramFree = stats && stats.system && stats.system.ram_free;
  return { owner: 'ComfyUIMasterImageProvider', route: policy.route, unloadModels: true, freeMemory: true, verifiedHealthy: true, ramFree: Number.isFinite(Number(ramFree)) ? Number(ramFree) : null };
}
async function submit(context, registration, graph) {
  var submitted = await request(context, '/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: graph, client_id: context.request.requestId }) });
  if (!submitted.ok) throw code('COMFYUI_HTTP_' + submitted.status, 'ComfyUI rejected the master-image workflow.');
  var queued = await submitted.json(), jobId = queued.prompt_id; if (!jobId) throw code('COMFYUI_OUTPUT_INVALID', 'ComfyUI returned no prompt id.');
  var deadline = Date.now() + Math.min(Number(context.timeoutMs || registration.item.maxTimeoutMs), registration.item.maxTimeoutMs), pollMs = Math.max(1, Number(process.env.COMFYUI_POLL_MS || 250));
  while (Date.now() < deadline) {
    if (context.signal && context.signal.aborted) { await interrupt(context); throw code('PROVIDER_CANCELLED', 'ComfyUI master-image request cancelled.'); }
    var response = await request(context, '/history/' + encodeURIComponent(jobId));
    if (response.ok) { var history = await response.json(), job = history[jobId]; if (job && job.status && (job.status.completed === true || job.status.status_str === 'success')) { var outputs = job.outputs || {}, declared = outputs[registration.item.outputNodeId]; if (!declared) throw code('COMFYUI_OUTPUT_INVALID', 'ComfyUI completed without the declared output node.'); return { run: { outputs: outputs }, jobId: jobId }; } if (job && job.status && (job.status.status_str === 'error' || job.status.status_str === 'failed')) throw code('COMFYUI_EXECUTION_FAILED', 'ComfyUI SDXL workflow failed.'); }
    await new Promise(function(resolve) { setTimeout(resolve, pollMs); });
  }
  await interrupt(context); throw code('COMFYUI_TIMEOUT', 'ComfyUI master-image job timed out.');
}
async function output(context, registration, completed) {
  var images = completed.run.outputs[registration.item.outputNodeId] && completed.run.outputs[registration.item.outputNodeId].images;
  if (!images || images.length !== registration.item.candidatePolicy.candidatesPerRound) throw code('COMFYUI_CANDIDATE_COUNT_MISMATCH', 'Master-image workflow must return exactly ' + registration.item.candidatePolicy.candidatesPerRound + ' candidates.');
  var candidates = [];
  for (var index = 0; index < images.length; index++) {
    var image = images[index]; if (!image.filename || /[\\/]/.test(image.filename) || image.subfolder) throw code('COMFYUI_OUTPUT_INVALID', 'ComfyUI returned an unsafe master-image filename.');
    var response = await request(context, '/view?' + new URLSearchParams({ filename: image.filename, type: image.type || 'output', subfolder: '' }).toString()); if (!response.ok) throw code('COMFYUI_OUTPUT_FETCH_FAILED', 'ComfyUI master-image fetch failed.');
    var bytes = Buffer.from(await response.arrayBuffer()), info = pngInfo(bytes, { maxWidth: registration.item.maxWidth, maxHeight: registration.item.maxHeight, maxPixels: registration.item.maxWidth * registration.item.maxHeight, maxOutputBytes: registration.item.maxOutputBytes }); candidates.push({ bytes: bytes, info: info, image: image });
  }
  var reviewInput = context.request.input || {}, semanticReviews;
  ['reviewPositiveTexts', 'reviewNegativeTexts', 'stylePositiveTexts', 'styleNegativeTexts'].forEach(function(field) { if (!Array.isArray(reviewInput[field]) || !reviewInput[field].length) throw code('ASSET_REVIEW_POLICY_MISSING', 'Style truth source must provide ' + field + '.'); });
  try { semanticReviews = await semanticReviewer.reviewImages({ images: candidates.map(function(candidate) { return candidate.bytes; }), positiveTexts: reviewInput.reviewPositiveTexts, negativeTexts: reviewInput.reviewNegativeTexts, stylePositiveTexts: reviewInput.stylePositiveTexts, styleNegativeTexts: reviewInput.styleNegativeTexts, compositionChecks: reviewInput.compositionChecks || [], timeoutMs: remainingTimeout(reviewInput.deadlineAt, 120000) }); } catch (error) { throw code(error.code || 'ASSET_SEMANTIC_REVIEW_FAILED', error.message); }
  var selected; try { selected = masterImageQuality.select(candidates, { transparent: reviewInput.transparent === true, productionFamily: reviewInput.productionFamily }, semanticReviews); } catch (error) { var selectionError = code(error.code || 'MASTER_IMAGE_QUALITY_REJECTED', error.message); selectionError.owner = error.owner || selectionError.owner; if (error.diagnostics) selectionError.diagnostics = clone(error.diagnostics); throw selectionError; }
  var chosen = selected.candidate, digest = sha256(chosen.bytes), file = path.join(transitRoot(), digest + '.png'); if (!fs.existsSync(file)) fs.writeFileSync(file, chosen.bytes); var blobId = 'master-blob.' + digest.slice(0, 24); rememberBlob(blobId, { path: file, sha256: digest, info: chosen.info, projectId: context.request.projectId, scope: 'project-local-transit', expiresAt: Date.now() + 3600000 });
  return { assetBlobRef: { blobId: blobId, sha256: digest, scope: 'project-local-transit', mediaType: 'image/png', byteLength: chosen.bytes.length, jobId: completed.jobId }, width: chosen.info.width, height: chosen.info.height, transparent: chosen.info.transparent, candidateSelection: { candidateCount: candidates.length, selectedIndex: selected.index, score: selected.score, coverage: selected.coverage, significantComponents: selected.significantComponents, semanticSimilarity: selected.semanticReview.semanticSimilarity, semanticMargin: selected.semanticReview.semanticMargin, styleMargin: selected.semanticReview.styleMargin, compositionChecks: selected.semanticReview.compositionChecks || [], candidateDiagnostics: selected.candidateDiagnostics } };
}
function provenance(registration, completed, selected) { return { workflowId: registration.id, workflowRevision: registration.item.revision, workflowOwner: 'ComfyUI-core', workflowSource: registration.item.workflowSource, workflowSha256: registration.item.workflowSha256, jobId: completed.jobId, candidateSelection: selected.candidateSelection, baseModelId: registration.item.baseModel.id, baseModelSha256: registration.baseHash, baseModelLicenseId: registration.item.baseModel.licenseId, refinerModelId: registration.item.refinerModel.id, refinerModelSha256: registration.refinerHash, refinerModelLicenseId: registration.item.refinerModel.licenseId }; }
async function generateMaster(context) {
  var registration = workflow(context.model), policy = registration.item.candidatePolicy;
  if (!policy || !Number.isInteger(policy.defaultRounds) || policy.defaultRounds < 1 || !Number.isInteger(policy.maxRounds) || policy.maxRounds < policy.defaultRounds || !Number.isInteger(policy.candidatesPerRound) || policy.candidatesPerRound !== 2 || !Number.isInteger(policy.seedStride) || !Array.isArray(policy.retryableReviewCodes)) throw code('COMFYUI_CANDIDATE_POLICY_INVALID', 'Registered master-image workflow requires a deterministic two-candidate policy.');
  var baseInput = Object.assign({}, context.request.input || {}), baseSeed = Number(baseInput.seed), requestedRounds = Number(baseInput.candidateRounds === undefined ? policy.defaultRounds : baseInput.candidateRounds), maximumRounds = Math.max(1, Math.min(policy.maxRounds, Math.floor(requestedRounds))), lastError, result, primaryError, releaseReceipt, roundDiagnostics = [];
  try {
    for (var round = 0; round < maximumRounds; round++) {
      var roundSeed = (baseSeed + round * policy.seedStride) % 4294967295; if (roundSeed < 1) roundSeed += 1;
      try {
        var input = Object.assign({}, baseInput, { requestId: context.request.requestId, outputNonce: crypto.randomUUID(), seed: roundSeed, batchSize: policy.candidatesPerRound }), completed = await submit(context, registration, prompt(registration, input));
        var selected = await output(context, registration, completed); selected.candidateSelection.round = round + 1; selected.candidateSelection.seed = roundSeed;
        result = { output: selected, usage: { jobId: completed.jobId, candidateCount: selected.candidateSelection.candidateCount, candidateRound: round + 1 }, cost: context.request.estimatedCost, provenance: Object.assign(provenance(registration, completed, selected), { candidateRoundDiagnostics: clone(roundDiagnostics) }) }; break;
      } catch (error) {
        lastError = error; roundDiagnostics.push({ round: round + 1, seed: roundSeed, code: error.code || 'MASTER_IMAGE_ROUND_FAILED', owner: error.owner || 'ComfyUIMasterImageProvider', message: error.message, candidateDiagnostics: error.diagnostics ? clone(error.diagnostics) : [] });
        if (policy.retryableReviewCodes.indexOf(error.code) < 0 || round + 1 >= maximumRounds) throw error;
      }
    }
    if (!result) throw lastError || code('MASTER_IMAGE_QUALITY_REJECTED', 'No candidate round produced an acceptable master image.');
  } catch (error) { primaryError = error; primaryError.attemptDiagnostics = clone(roundDiagnostics); }
  try { releaseReceipt = await releaseGenerationResources(context, registration); }
  catch (error) { if (!primaryError) primaryError = error; else primaryError.resourceReleaseFailure = { code: error.code, owner: error.owner, message: error.message }; }
  if (primaryError) throw primaryError;
  result.provenance.resourceRelease = releaseReceipt; return result;
}
async function invokeComfyUI(context) { if (context.request.role !== 'image-generate') throw code('COMFYUI_ROLE_UNAVAILABLE', 'ComfyUI is restricted to master-image generation.'); return generateMaster(context); }
async function cancel(context) { await interrupt(context); return { cancelled: true }; }
function deterministicSeed(slot, productionAttempt, candidatePolicy) { var digest = sha256(Buffer.from(JSON.stringify({ description: slot.description || slot.subject || '', productionFamily: slot.productionFamily || '', styleId: slot.styleId || '', constraints: slot.constraints || {}, animation: slot.animation || null }))), seed = parseInt(digest.slice(0, 8), 16), attempt = Math.max(1, Number(productionAttempt || 1)), offset = candidatePolicy ? (attempt - 1) * candidatePolicy.seedStride * candidatePolicy.maxRounds : 0; seed = (seed + offset) % 4294967295; return seed === 0 ? 1 : seed; }
// Master canvas ceiling is 512 (registry max). Runtime sprites stay at constraint size
// after deterministic derivation; only the transient SDXL master is upscaled.
var MASTER_MAX_EDGE = 512;
var MASTER_MIN_EDGE = 512;
function multipleOf64(value) { return Math.max(64, Math.min(MASTER_MAX_EDGE, Math.round(value / 64) * 64)); }
function masterDimensions(slot) {
  slot = slot || {};
  if (slot.generationWidth && slot.generationHeight) {
    return {
      width: Math.max(MASTER_MIN_EDGE, multipleOf64(Number(slot.generationWidth))),
      height: Math.max(MASTER_MIN_EDGE, multipleOf64(Number(slot.generationHeight)))
    };
  }
  var constraints = slot.constraints || {};
  var targetWidth = Math.max(1, Number(constraints.width || 1));
  var targetHeight = Math.max(1, Number(constraints.height || 1));
  var scale = MASTER_MAX_EDGE / Math.max(targetWidth, targetHeight);
  return {
    width: Math.max(MASTER_MIN_EDGE, multipleOf64(targetWidth * scale)),
    height: Math.max(MASTER_MIN_EDGE, multipleOf64(targetHeight * scale))
  };
}
function createAssetProviderPorts(runtime, options) {
  options = options || {};
  function reviewTexts(slot, phase) {
    return styleDNA.reviewTexts(slot.styleId, slot, phase);
  }
  function invoke(state) {
    var slot = state.slot || {}, constraints = slot.constraints || {}, dimensions = masterDimensions(slot), subject = slot.description || slot.subject || (slot.semanticTags || []).join(', '), promptOptions = { transparent: constraints.transparent === true, productionFamily: slot.productionFamily }, reviews = reviewTexts(slot, 'master-candidate'), steps = Number(options.steps || 30), handoff = Math.max(1, Math.floor(steps * 0.8)), model = options.imageModel || options.model || process.env.ASSET_IMAGE_MODEL || process.env.COMFYUI_IMAGE_MODEL || Object.keys(registry.workflows)[0], item = registry.workflows[model];
    return runtime.invokeRole({ requestId: state.runId + ':' + slot.slotId + ':master-image:production-' + Number(state.productionAttempt || 1), projectId: state.projectId || state.runId, role: 'image-generate', provider: 'comfyui-local', model: model, estimatedCost: options.estimatedCost, timeoutMs: remainingTimeout(state.deadlineAt, options.timeoutMs), maxAttempts: 1, input: Object.assign({ prompt: slot.generationPrompt || styleDNA.generationPrompt(slot.styleId, subject, promptOptions), negativePrompt: slot.negativePrompt || styleDNA.negativePrompt(slot.styleId, [], promptOptions), width: dimensions.width, height: dimensions.height, candidateRounds: options.candidateRounds, seed: options.seed === undefined ? deterministicSeed(slot, state.productionAttempt, item && item.candidatePolicy) : options.seed, steps: steps, cfg: options.cfg, samplerName: options.samplerName, scheduler: options.scheduler, baseEndStep: handoff, refinerStartStep: handoff, transparent: constraints.transparent === true, productionFamily: slot.productionFamily, deadlineAt: state.deadlineAt }, reviews) });
  }
  async function reviewCandidate(state) {
    var slot = state.slot || {}, candidate = state.candidate || {}, files = candidate.frames ? candidate.frames.map(function(frame) { return frame.path; }) : [candidate.path];
    if (!files.length || files.some(function(file) { return !file || !fs.existsSync(file); })) throw code('ASSET_FINAL_REVIEW_INPUT_MISSING', 'Final semantic review requires every derived image file.');
    var bytes = files.map(function(file) { return fs.readFileSync(file); }), texts = reviewTexts(slot, state.phase), results = await semanticReviewer.reviewImages({ images: bytes, positiveTexts: texts.reviewPositiveTexts, negativeTexts: texts.reviewNegativeTexts, stylePositiveTexts: texts.stylePositiveTexts, styleNegativeTexts: texts.styleNegativeTexts, compositionChecks: texts.compositionChecks, timeoutMs: remainingTimeout(state.deadlineAt, 120000) });
    var threshold = semanticReviewer.contract.thresholds, diagnostics = results.map(function(result, index) { var reasons = []; if (result.semanticMargin < threshold.finalSemanticMargin) reasons.push({ code: 'FINAL_SEMANTIC_MARGIN_REJECTED', actual: result.semanticMargin, requiredMinimum: threshold.finalSemanticMargin }); if (result.styleMargin < threshold.finalStyleMargin) reasons.push({ code: 'FINAL_STYLE_MARGIN_REJECTED', actual: result.styleMargin, requiredMinimum: threshold.finalStyleMargin }); (result.compositionChecks || []).forEach(function(check) { if (check.margin < threshold.finalSemanticMargin) reasons.push({ code: 'FINAL_COMPOSITION_MARGIN_REJECTED', checkId: check.id, actual: check.margin, requiredMinimum: threshold.finalSemanticMargin }); }); return { index: index, imageSha256: sha256(bytes[index]), semanticMargin: result.semanticMargin, styleMargin: result.styleMargin, compositionChecks: result.compositionChecks || [], rejectionReasons: reasons }; }), rejected = diagnostics.some(function(item) { return item.rejectionReasons.length > 0; });
    if (rejected) { var minimumRejectedSemantic = Math.min.apply(null, results.map(function(result) { return result.semanticMargin; })), minimumRejectedStyle = Math.min.apply(null, results.map(function(result) { return result.styleMargin; })), compositionMargins = results.flatMap(function(result) { return (result.compositionChecks || []).map(function(check) { return check.margin; }); }), minimumComposition = compositionMargins.length ? Math.min.apply(null, compositionMargins) : null, reviewError = code('ASSET_FINAL_REVIEW_REJECTED', 'Final derived pixels failed review: semanticMargin=' + minimumRejectedSemantic.toFixed(6) + ' required>=' + threshold.finalSemanticMargin + ', styleMargin=' + minimumRejectedStyle.toFixed(6) + ' required>=' + threshold.finalStyleMargin + (minimumComposition === null ? '' : ', compositionMargin=' + minimumComposition.toFixed(6) + ' required>=' + threshold.finalSemanticMargin) + '.'); reviewError.diagnostics = diagnostics; throw reviewError; }
    var receipts = results.map(function(result, index) { return semanticReviewer.receipt(bytes[index], result, state.phase); }), identity = receipts.map(function(receipt) { return receipt.receiptId; }), reviewIdentity = { workItemPlanId: state.workItem && state.workItem.workItemPlanId, targetVisualSlotId: slot.targetVisualSlotId, reviewPolicy: texts, imageReceipts: identity }, minimumSemantic = Math.min.apply(null, results.map(function(result) { return result.semanticMargin; })), minimumStyle = Math.min.apply(null, results.map(function(result) { return result.styleMargin; }));
    return { receiptId: 'asset-final-review.' + sha256(Buffer.from(JSON.stringify(reviewIdentity))).slice(0, 24), owner: 'CLIPImageReviewer', phase: state.phase, workItemPlanId: reviewIdentity.workItemPlanId, targetVisualSlotId: reviewIdentity.targetVisualSlotId, reviewPolicyFingerprint: styleDNA.reviewPolicyFingerprint(slot.styleId, slot, state.phase), modelRevision: receipts[0].modelRevision, modelFingerprint: receipts[0].modelFingerprint, imageSha256s: receipts.map(function(receipt) { return receipt.imageSha256; }), semanticMargin: minimumSemantic, styleMargin: minimumStyle, decisions: receipts, decision: 'accepted' };
  }
  return {
    productionFingerprint: function(state) { var model = options.imageModel || options.model || process.env.ASSET_IMAGE_MODEL || process.env.COMFYUI_IMAGE_MODEL || Object.keys(registry.workflows)[0], item = registry.workflows[model], reviewPolicies = { masterCandidate: reviewTexts(state.slot || {}, 'master-candidate'), finalDerived: reviewTexts(state.slot || {}, 'final-derived-asset') }; if (!item || !item.workflowSha256 || !item.baseModel || !item.refinerModel || !item.candidatePolicy || !item.resourceReleasePolicy) throw code('COMFYUI_PRODUCTION_FINGERPRINT_INVALID', 'Registered SDXL workflow requires base, refiner, candidate, and resource-release identity.'); return sha256(Buffer.from(JSON.stringify({ workflowId: model, revision: item.revision, workflowSha256: item.workflowSha256, baseModelSha256: process.env[item.baseModel.sha256Env] || null, refinerModelSha256: process.env[item.refinerModel.sha256Env] || null, candidatePolicy: Object.assign({}, item.candidatePolicy, { effectiveMaxRounds: Math.max(1, Math.min(item.candidatePolicy.maxRounds, Math.floor(Number(options.candidateRounds === undefined ? item.candidatePolicy.defaultRounds : options.candidateRounds)))) }), executionProfileId: options.executionProfileId || null, executionProfileHash: options.executionProfileHash || null, resourceReleasePolicy: item.resourceReleasePolicy, semanticReviewerFingerprint: semanticReviewer.fingerprint(), reviewPolicies: reviewPolicies, slot: state.slot, settings: { steps: options.steps || 30, cfg: options.cfg || null, samplerName: options.samplerName || null, scheduler: options.scheduler || null, handoffRatio: 0.8 } }))); },
    generateMaster: async function(state) { var result = await invoke(state); if (!result.ok) { var error = code(result.debt.code, result.debt.message || result.debt.code); error.owner = result.debt.owner || error.owner; if (result.debt.diagnostics) error.diagnostics = clone(result.debt.diagnostics); if (result.debt.attemptDiagnostics) error.attemptDiagnostics = clone(result.debt.attemptDiagnostics); throw error; } var output = result.output; return { assetId: 'master-image.' + output.assetBlobRef.sha256.slice(0, 24), sha256: output.assetBlobRef.sha256, assetBlobRef: output.assetBlobRef, path: 'blob://' + output.assetBlobRef.blobId, format: 'png', width: output.width, height: output.height, transparent: output.transparent, status: 'master', source: 'comfyuiMasterImage', providerReceipt: result.receipt, publishability: { playable: false, publishable: false, blocksFinalExport: true } }; },
    materializeCandidate: async function(state) { var record = findBlob(state.candidate.assetBlobRef); if (record.projectId !== (state.projectId || state.runId)) throw code('COMFYUI_INPUT_SCOPE_DENIED', 'Master image belongs to another project.'); return Object.assign({}, state.candidate, { path: record.path, transientMaterialized: true }); },
    discardCandidate: async function(state) { if (state.candidate && state.candidate.assetBlobRef) discardBlob(state.candidate.assetBlobRef); return { discarded: true }; },
    reviewCandidate: reviewCandidate
  };
}

module.exports = { invokeComfyUI: invokeComfyUI, health: health, cancel: cancel, createAssetProviderPorts: createAssetProviderPorts, _blobs: blobs, _pngInfo: pngInfo, _hashPath: hashPath, _findBlob: findBlob, _masterDimensions: masterDimensions, _checkpointVerificationMetrics: checkpointVerificationMetrics, _resetCheckpointVerificationCache: resetCheckpointVerificationCache };
