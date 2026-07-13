/* Self-hosted ComfyUI transport. It owns only protocol, ephemeral blobs, and workflow provenance. */
var crypto = require('crypto');
var fs = require('fs');
var os = require('os');
var path = require('path');
var zlib = require('zlib');
var registry = require('../shared/comfyui-workflow-registry.json');
var stageBInputs = require('./comfyui-stageb-inputs');
var extensions = require('./comfyui-extension-registry');
var maskContract = require('./comfyui-mask-contract');
var styleDNA = require('./style-dna');

var blobs = new Map();
function code(codeValue, message) { var error = new Error(message); error.code = codeValue; error.owner = 'ComfyUILocalProviderAdapter'; return error; }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function transitRoot() { var value = path.resolve(process.env.COMFYUI_TRANSIT_DIR || path.join(os.tmpdir(), 'gamecastle-comfy-transit')); fs.mkdirSync(value, { recursive: true }); return value; }
function blobIndexFile() { return path.join(transitRoot(), 'blob-index.json'); }
function readBlobIndex() { try { return JSON.parse(fs.readFileSync(blobIndexFile(), 'utf8')); } catch (_error) { return {}; } }
function writeBlobIndex(index) { fs.writeFileSync(blobIndexFile(), JSON.stringify(index, null, 2)); }
function rememberBlob(blobId, record) { blobs.set(blobId, record); var index = readBlobIndex(); index[blobId] = { filename: path.basename(record.path), sha256: record.sha256, info: record.info, projectId: record.projectId, scope: record.scope, expiresAt: record.expiresAt }; writeBlobIndex(index); }
function findBlob(ref) { if (!ref || !ref.blobId || !ref.sha256) throw code('COMFYUI_BLOB_MISSING', 'Candidate blob reference is invalid.'); var record = blobs.get(ref.blobId); if (!record) { var entry = readBlobIndex()[ref.blobId]; if (!entry || entry.expiresAt < Date.now()) throw code('COMFYUI_OUTPUT_LOST', 'Candidate blob has expired or is unavailable after restart.'); var file = path.resolve(transitRoot(), entry.filename); if (!file.startsWith(transitRoot() + path.sep) || !fs.existsSync(file)) throw code('COMFYUI_OUTPUT_LOST', 'Candidate blob is unavailable after restart.'); record = { path: file, sha256: entry.sha256, info: entry.info, projectId: entry.projectId, scope: entry.scope || 'project-local', expiresAt: entry.expiresAt }; blobs.set(ref.blobId, record); } if (record.sha256 !== ref.sha256 || !fs.existsSync(record.path) || sha256(fs.readFileSync(record.path)) !== record.sha256) throw code('COMFYUI_OUTPUT_LOST', 'Candidate blob integrity check failed.'); return record; }
function localEndpoint(value) {
  if (!value) throw code('COMFYUI_ENDPOINT_MISSING', 'COMFYUI_ENDPOINT is required for comfyui-local.');
  var url; try { url = new URL(value); } catch (_error) { throw code('COMFYUI_ENDPOINT_INVALID', 'COMFYUI_ENDPOINT must be an HTTP URL.'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw code('COMFYUI_ENDPOINT_INVALID', 'COMFYUI_ENDPOINT must use HTTP(S).');
  if (['127.0.0.1', 'localhost', '::1'].indexOf(url.hostname) < 0) throw code('COMFYUI_ENDPOINT_DENIED', 'comfyui-local only permits a loopback endpoint.');
  return url.toString().replace(/\/$/, '');
}
function pngInfo(bytes, limits) {
  limits = limits || {};
  if (!Buffer.isBuffer(bytes) || bytes.length < 45 || bytes.subarray(0, 8).compare(Buffer.from([137,80,78,71,13,10,26,10])) !== 0) throw code('COMFYUI_OUTPUT_INVALID', 'ComfyUI output is not a PNG.');
  if (limits.maxOutputBytes && bytes.length > limits.maxOutputBytes) throw code('COMFYUI_OUTPUT_INVALID', 'ComfyUI PNG exceeds the output byte limit.');
  var cursor = 8, width, height, bitDepth, colorType, interlace, idat = [], sawIhdr = false, sawIend = false;
  while (cursor + 12 <= bytes.length) {
    var length = bytes.readUInt32BE(cursor), type = bytes.subarray(cursor + 4, cursor + 8).toString('ascii'), start = cursor + 8, end = start + length;
    if (end + 4 > bytes.length) throw code('COMFYUI_OUTPUT_INVALID', 'ComfyUI PNG has a truncated chunk.');
    var expectedCrc = bytes.readUInt32BE(end), actualCrc = (zlib.crc32 ? zlib.crc32(bytes.subarray(cursor + 4, end)) : null);
    // Node has no portable crc32 API; validate CRC with the compact implementation below.
    if (actualCrc === null) actualCrc = crc32(bytes.subarray(cursor + 4, end));
    if ((actualCrc >>> 0) !== expectedCrc) throw code('COMFYUI_OUTPUT_INVALID', 'ComfyUI PNG has an invalid chunk checksum.');
    var data = bytes.subarray(start, end);
    if (type === 'IHDR') {
      if (sawIhdr || length !== 13) throw code('COMFYUI_OUTPUT_INVALID', 'ComfyUI PNG has an invalid IHDR.');
      sawIhdr = true; width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') { if (length !== 0) throw code('COMFYUI_OUTPUT_INVALID', 'ComfyUI PNG has an invalid IEND.'); sawIend = true; cursor = end + 4; break; }
    cursor = end + 4;
  }
  if (!sawIhdr || !sawIend || cursor !== bytes.length || !width || !height || bitDepth !== 8 || [0, 2, 4, 6].indexOf(colorType) < 0 || interlace !== 0 || !idat.length) throw code('COMFYUI_OUTPUT_INVALID', 'ComfyUI PNG uses an unsupported or incomplete encoding.');
  if ((limits.maxWidth && width > limits.maxWidth) || (limits.maxHeight && height > limits.maxHeight) || (limits.maxPixels && width * height > limits.maxPixels)) throw code('COMFYUI_OUTPUT_INVALID', 'ComfyUI PNG exceeds the pixel limit.');
  var channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 4 ? 2 : 4, rowBytes = width * channels, decoded;
  try { decoded = zlib.inflateSync(Buffer.concat(idat)); } catch (_error) { throw code('COMFYUI_OUTPUT_INVALID', 'ComfyUI PNG pixel data cannot be decoded.'); }
  if (decoded.length !== height * (rowBytes + 1)) throw code('COMFYUI_OUTPUT_INVALID', 'ComfyUI PNG decoded pixel data has an invalid size.');
  for (var row = 0; row < height; row++) if (decoded[row * (rowBytes + 1)] > 4) throw code('COMFYUI_OUTPUT_INVALID', 'ComfyUI PNG has an invalid scanline filter.');
  return { width: width, height: height, transparent: colorType === 4 || colorType === 6 };
}
var crcTable = null;
function crc32(bytes) {
  if (!crcTable) { crcTable = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; } }
  var value = 0xffffffff; for (var i = 0; i < bytes.length; i++) value = crcTable[(value ^ bytes[i]) & 255] ^ (value >>> 8); return (value ^ 0xffffffff) >>> 0;
}
function sha256File(file) {
  var hash = crypto.createHash('sha256'), descriptor = fs.openSync(file, 'r'), buffer = Buffer.allocUnsafe(4 * 1024 * 1024);
  try {
    var read;
    do { read = fs.readSync(descriptor, buffer, 0, buffer.length, null); if (read) hash.update(buffer.subarray(0, read)); } while (read);
  } finally { fs.closeSync(descriptor); }
  return hash.digest('hex');
}
function hashPath(modelPath) {
  var stat; try { stat = fs.statSync(modelPath); } catch (_error) { throw code('COMFYUI_MODEL_MISSING', 'Configured model path is unavailable.'); }
  if (stat.isFile()) return sha256File(modelPath);
  if (!stat.isDirectory()) throw code('COMFYUI_MODEL_MISSING', 'Configured model path is not a file or directory.');
  var files = [];
  function visit(dir) { fs.readdirSync(dir, { withFileTypes: true }).sort(function(a, b) { return a.name.localeCompare(b.name); }).forEach(function(entry) { var absolute = path.join(dir, entry.name); if (entry.isDirectory()) visit(absolute); else if (entry.isFile()) files.push(path.relative(modelPath, absolute).replace(/\\/g, '/') + ':' + sha256(fs.readFileSync(absolute))); }); }
  visit(modelPath); return sha256(files.join('\n'));
}
function hashTree(directory) { var files = []; function visit(current) { fs.readdirSync(current, { withFileTypes: true }).sort(function(a, b) { return a.name.localeCompare(b.name); }).forEach(function(entry) { if (entry.name === '.git' || entry.name === '__pycache__') return; var absolute = path.join(current, entry.name); if (entry.isDirectory()) visit(absolute); else if (entry.isFile()) files.push(path.relative(directory, absolute).replace(/\\/g, '/') + ':' + sha256(fs.readFileSync(absolute))); }); } visit(directory); return sha256(files.join('\n')); }
function verifyCustomNodes(item) {
  (item.customNodeAllowlist || []).forEach(function(id) {
    var node = registry.customNodes && registry.customNodes[id]; if (!node) throw code('COMFYUI_CUSTOM_NODE_UNREGISTERED', 'Workflow requests an unregistered custom node.');
    var root = process.env.COMFYUI_ROOT; if (!root) throw code('COMFYUI_CUSTOM_NODE_MISSING', 'COMFYUI_ROOT is required for registered custom-node verification.');
    var base = path.resolve(root), packageDirectory = path.resolve(base, node.relativeDirectory), file = path.resolve(base, node.relativePath); if (!packageDirectory.startsWith(base + path.sep) || !file.startsWith(packageDirectory + path.sep) || !fs.existsSync(file) || !fs.existsSync(packageDirectory)) throw code('COMFYUI_CUSTOM_NODE_MISSING', 'Registered custom-node file is unavailable.');
    if (sha256(fs.readFileSync(file)) !== node.sha256) throw code('COMFYUI_CUSTOM_NODE_HASH_MISMATCH', 'Registered custom-node hash does not match its allowlist record.');
    if (hashTree(packageDirectory) !== node.packageSha256) throw code('COMFYUI_CUSTOM_NODE_PACKAGE_HASH_MISMATCH', 'Registered custom-node package hash does not match its allowlist record.');
  });
}
function workflow(model, role) {
  var item = registry.workflows[model];
  if (!item) throw code('COMFYUI_WORKFLOW_UNREGISTERED', 'No registered ComfyUI workflow for model ' + model + '.');
  if (role && item.role !== role) throw code('COMFYUI_WORKFLOW_ROLE_MISMATCH', 'Registered workflow does not serve the requested role.');
  verifyCustomNodes(item);
  var file = path.resolve(__dirname, '..', item.workflowFile), bytes;
  try { bytes = fs.readFileSync(file); } catch (_error) { throw code('COMFYUI_WORKFLOW_MISSING', 'Registered workflow file is unavailable.'); }
  var actual = sha256(bytes);
  if (actual !== item.workflowSha256) throw code('COMFYUI_WORKFLOW_HASH_MISMATCH', 'Registered workflow hash does not match its file.');
  var modelPath = process.env[item.model.pathEnv], modelHash = process.env[item.model.sha256Env];
  if (!modelPath || !modelHash) throw code('COMFYUI_MODEL_PROVENANCE_MISSING', 'Model path and SHA-256 environment values are required.');
  if (hashPath(modelPath) !== modelHash) throw code('COMFYUI_MODEL_HASH_MISMATCH', 'Configured model SHA-256 does not match the local artifact.');
  if (item.backgroundRemovalModel) {
    var backgroundPath = process.env[item.backgroundRemovalModel.pathEnv], backgroundHash = process.env[item.backgroundRemovalModel.sha256Env];
    if (!backgroundPath || !backgroundHash) throw code('COMFYUI_MODEL_PROVENANCE_MISSING', 'Background removal model path and SHA-256 environment values are required.');
    if (hashPath(backgroundPath) !== backgroundHash) throw code('COMFYUI_MODEL_HASH_MISMATCH', 'Configured background removal model SHA-256 does not match the local artifact.');
  }
  Object.keys(item.supportingModels || {}).forEach(function(id) {
    var supporting = item.supportingModels[id], supportingPath = process.env[supporting.pathEnv], supportingHash = process.env[supporting.sha256Env];
    if (!supportingPath || !supportingHash) throw code('COMFYUI_MODEL_PROVENANCE_MISSING', 'Supporting model path and SHA-256 environment values are required.');
    if (hashPath(supportingPath) !== supportingHash) throw code('COMFYUI_MODEL_HASH_MISMATCH', 'Configured supporting model SHA-256 does not match the local artifact.');
  });
  return { id: model, item: item, graph: JSON.parse(bytes.toString('utf8')), modelHash: modelHash };
}
function bind(registration, graph, field, value) {
  var binding = registration.item.inputBindings && registration.item.inputBindings[field];
  if (!binding || !graph[binding.nodeId] || !graph[binding.nodeId].inputs) throw code('COMFYUI_BINDING_INVALID', 'Workflow registry does not bind ' + field + '.');
  graph[binding.nodeId].inputs[binding.input] = value;
}
function boundedNumber(value, fallback, minimum, maximum) {
  var number = Number(value); if (!Number.isFinite(number)) number = fallback;
  return Math.max(minimum, Math.min(maximum, number));
}
function bindAssetGeometry(registration, graph, input) {
  bind(registration, graph, 'alphaThreshold', boundedNumber(input.alphaThreshold !== undefined ? input.alphaThreshold : process.env.COMFYUI_ALPHA_THRESHOLD, 0.5, 0.05, 0.95));
  bind(registration, graph, 'trimPadding', Math.round(boundedNumber(input.trimPadding !== undefined ? input.trimPadding : process.env.COMFYUI_TRIM_PADDING, 16, 0, 128)));
}
function buildPrompt(item, graph, input) {
  var registration = { item: item }, result = clone(graph), prompt = String(input.prompt || 'game asset') + ', isolated full-body game sprite, no ground plane, no floor, no platform, no cast shadow';
  bind(registration, result, 'prompt', prompt);
  bind(registration, result, 'negativePrompt', String(input.negativePrompt || process.env.COMFYUI_NEGATIVE_PROMPT || 'text, watermark, logo') + ', multiple subjects, busy background, grain, noise, pixel art');
  bind(registration, result, 'width', Math.min(Number(item.generationWidth || input.width || process.env.COMFYUI_GENERATION_WIDTH || 256), item.maxWidth));
  bind(registration, result, 'height', Math.min(Number(item.generationHeight || input.height || process.env.COMFYUI_GENERATION_HEIGHT || process.env.COMFYUI_GENERATION_WIDTH || 256), item.maxHeight));
  bind(registration, result, 'seed', Number.isFinite(Number(input.seed)) ? Number(input.seed) : Number(process.env.COMFYUI_GENERATION_SEED || 1));
  // Four diffusion steps produced low-information fog rather than usable
  // GameCastle assets on the local SD1.5 CPU workflow. The production floor
  // is intentionally higher; callers may raise it, never lower it silently.
  bind(registration, result, 'steps', Math.max(20, Math.min(32, Number(input.steps || process.env.COMFYUI_GENERATION_STEPS || 24))));
  bind(registration, result, 'cfg', Math.max(1, Math.min(20, Number(input.cfg || process.env.COMFYUI_GENERATION_CFG || 7))));
  bind(registration, result, 'samplerName', String(input.samplerName || process.env.COMFYUI_GENERATION_SAMPLER || 'euler'));
  bind(registration, result, 'scheduler', String(input.scheduler || process.env.COMFYUI_GENERATION_SCHEDULER || 'normal'));
  bindAssetGeometry(registration, result, input);
  bind(registration, result, 'filenamePrefix', 'gamecastle-' + String(input.requestId || 'request').replace(/[^A-Za-z0-9_-]/g, '_'));
  return result;
}
function buildEditPrompt(item, graph, input) {
  var registration = { item: item }, result = clone(graph), prompt = String(input.prompt || 'repair game asset');
  bind(registration, result, 'sourceName', input.sourceName); bind(registration, result, 'maskName', input.maskName); bind(registration, result, 'prompt', prompt);
  bind(registration, result, 'seed', Number.isFinite(Number(input.seed)) ? Number(input.seed) : 1);
  bind(registration, result, 'steps', Math.max(1, Math.min(8, Number(input.steps || 4))));
  bind(registration, result, 'denoise', Math.max(0.05, Math.min(0.9, Number(input.denoise || 0.35))));
  bind(registration, result, 'filenamePrefix', 'gamecastle-edit-' + String(input.requestId || 'request').replace(/[^A-Za-z0-9_-]/g, '_'));
  return result;
}
function buildReferencePrompt(item, graph, input) {
  var registration = { item: item }, result = clone(graph), prompt = String(input.prompt || 'one readable game asset');
  bind(registration, result, 'sourceName', input.sourceName);
  bind(registration, result, 'prompt', prompt);
  bind(registration, result, 'negativePrompt', String(input.negativePrompt || 'text, watermark, logo, multiple subjects, busy background, grain, noise, pixel art'));
  bind(registration, result, 'seed', Number.isFinite(Number(input.seed)) ? Number(input.seed) : Number(process.env.COMFYUI_REFERENCE_SEED || 1));
  bind(registration, result, 'steps', Math.max(12, Math.min(32, Number(input.steps || process.env.COMFYUI_REFERENCE_STEPS || 24))));
  bind(registration, result, 'cfg', Math.max(1, Math.min(20, Number(input.cfg || process.env.COMFYUI_REFERENCE_CFG || 6))));
  bind(registration, result, 'denoise', Math.max(0.35, Math.min(0.75, Number(input.denoise || process.env.COMFYUI_REFERENCE_DENOISE || 0.55))));
  bindAssetGeometry(registration, result, input);
  bind(registration, result, 'filenamePrefix', 'gamecastle-reference-' + String(input.requestId || 'request').replace(/[^A-Za-z0-9_-]/g, '_'));
  return result;
}
function buildAnchoredPrompt(item, graph, input) {
  var registration = { item: item }, result = clone(graph), prompt = String(input.prompt || 'one readable game asset');
  bind(registration, result, 'styleName', input.styleName);
  bind(registration, result, 'lineartName', input.lineartName);
  bind(registration, result, 'prompt', prompt);
  bind(registration, result, 'negativePrompt', String(input.negativePrompt || 'text, watermark, logo, multiple subjects, busy background, grain, noise, pixel art'));
  bind(registration, result, 'seed', Number.isFinite(Number(input.seed)) ? Number(input.seed) : Number(process.env.COMFYUI_ANCHORED_SEED || 1));
  bind(registration, result, 'steps', Math.max(24, Math.min(40, Number(input.steps || process.env.COMFYUI_ANCHORED_STEPS || 30))));
  bind(registration, result, 'cfg', Math.max(1, Math.min(20, Number(input.cfg || process.env.COMFYUI_ANCHORED_CFG || 6))));
  bind(registration, result, 'styleWeight', Math.max(0, Math.min(1.5, Number(input.styleWeight || process.env.COMFYUI_ANCHORED_STYLE_WEIGHT || 0.8))));
  bind(registration, result, 'lineartStrength', Math.max(0, Math.min(2, Number(input.lineartStrength || process.env.COMFYUI_ANCHORED_LINEART_STRENGTH || 0.85))));
  bindAssetGeometry(registration, result, input);
  bind(registration, result, 'filenamePrefix', 'gamecastle-anchored-' + String(input.requestId || 'request').replace(/[^A-Za-z0-9_-]/g, '_'));
  return result;
}
function buildVisionPrompt(registration, graph, input) { var result = clone(graph); bind(registration, result, 'imageName', input.imageName); return result; }
function buildSegmentationPrompt(registration, graph, input) { var result = clone(graph); bind(registration, result, 'imageName', input.imageName); bind(registration, result, 'subjectText', input.subjectText); return result; }
async function json(fetchImpl, url, init) {
  var response = await fetchImpl(url, init);
  if (!response.ok) throw code('COMFYUI_HTTP_' + response.status, 'ComfyUI HTTP ' + response.status + '.');
  return response.json();
}
function sleep(ms) { return new Promise(function(resolve) { setTimeout(resolve, ms); }); }
async function health(context) {
  var endpoint = localEndpoint(context.config.endpoint), fetchImpl = context.fetchImpl || fetch;
  await json(fetchImpl, endpoint + '/system_stats', { method: 'GET', signal: context.signal });
  return { endpoint: endpoint, healthy: true };
}
async function uploadPng(context, bytes, sha) {
  var endpoint = localEndpoint(context.config.endpoint), fetchImpl = context.fetchImpl || fetch, form = new FormData();
  form.append('image', new Blob([bytes], { type: 'image/png' }), 'gamecastle-' + sha.slice(0, 24) + '.png'); form.append('type', 'input'); form.append('overwrite', 'false');
  var response = await fetchImpl(endpoint + '/upload/image', { method: 'POST', body: form, signal: context.signal });
  if (!response.ok) throw code('COMFYUI_INPUT_UPLOAD_FAILED', 'ComfyUI input upload failed.');
  var uploaded = await response.json();
  if (!uploaded || !uploaded.name || /[\\/]/.test(uploaded.name) || uploaded.subfolder) throw code('COMFYUI_INPUT_UPLOAD_INVALID', 'ComfyUI returned an unsafe input name.');
  return uploaded.name;
}
async function waitForRun(context, submitted, registration) {
  var endpoint = localEndpoint(context.config.endpoint), fetchImpl = context.fetchImpl || fetch, started = Date.now(), timeoutMs = Math.min(Number(context.timeoutMs || registration.item.maxTimeoutMs), registration.item.maxTimeoutMs), history;
  while (Date.now() - started < timeoutMs) {
    if (context.signal && context.signal.aborted) { await cancel({ config: context.config, fetchImpl: fetchImpl, signal: null }); throw code('PROVIDER_CANCELLED', 'ComfyUI request cancelled.'); }
    history = await json(fetchImpl, endpoint + '/history/' + encodeURIComponent(submitted.prompt_id), { method: 'GET', signal: context.signal });
    var run = history[submitted.prompt_id];
    var runStatus = run && run.status && (run.status.status || run.status.status_str);
    if (runStatus === 'error') throw code('COMFYUI_EXECUTION_FAILED', 'ComfyUI execution failed.');
    if (runStatus === 'success' || (run && run.status && run.status.completed === true)) return { endpoint: endpoint, run: run, jobId: submitted.prompt_id };
    await sleep(Number(process.env.COMFYUI_POLL_MS || 500));
  }
  await cancel({ config: context.config, fetchImpl: fetchImpl, signal: null }); throw code('COMFYUI_TIMEOUT', 'ComfyUI job timed out.');
}
function provenance(registration, jobId) { return { workflowId: registration.id, workflowRevision: 'v1', workflowSha256: registration.item.workflowSha256, modelId: registration.item.model.id, modelSha256: registration.modelHash, licenseId: registration.item.model.licenseId, customNodeAllowlistSha256: sha256(JSON.stringify(registration.item.customNodeAllowlist)), jobId: jobId }; }
async function submit(context, registration, prompt) {
  var endpoint = localEndpoint(context.config.endpoint), fetchImpl = context.fetchImpl || fetch;
  await health(context); var submitted = await json(fetchImpl, endpoint + '/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: prompt, client_id: context.request.requestId }), signal: context.signal });
  if (!submitted.prompt_id) throw code('COMFYUI_SUBMIT_INVALID', 'ComfyUI did not return prompt_id.'); return waitForRun(context, submitted, registration);
}
async function outputPng(context, registration, completed, scope) {
  var images = completed.run.outputs && completed.run.outputs[registration.item.outputNodeId] && completed.run.outputs[registration.item.outputNodeId].images;
  if (!images || !images.length) throw code('COMFYUI_OUTPUT_INVALID', 'ComfyUI did not return an image output.');
  var image = images[0]; if (!image.filename || /[\\/]/.test(image.filename) || image.subfolder) throw code('COMFYUI_OUTPUT_INVALID', 'ComfyUI returned an unsafe output name.');
  var view = await (context.fetchImpl || fetch)(completed.endpoint + '/view?filename=' + encodeURIComponent(image.filename) + '&type=' + encodeURIComponent(image.type || 'output'), { method: 'GET', signal: context.signal });
  if (!view.ok) throw code('COMFYUI_OUTPUT_FETCH_FAILED', 'ComfyUI output fetch failed.');
  var bytes = Buffer.from(await view.arrayBuffer()), info = pngInfo(bytes, { maxWidth: registration.item.maxWidth, maxHeight: registration.item.maxHeight, maxPixels: registration.item.maxWidth * registration.item.maxHeight, maxOutputBytes: registration.item.maxOutputBytes || 16777216 }), digest = sha256(bytes), transit = transitRoot();
  fs.mkdirSync(transit, { recursive: true }); var blobPath = path.join(transit, digest + '.png'); if (!fs.existsSync(blobPath)) fs.writeFileSync(blobPath, bytes);
  scope = scope || 'project-local'; var blobId = 'blob.' + digest.slice(0, 24); rememberBlob(blobId, { path: blobPath, sha256: digest, info: info, projectId: context.request.projectId, scope: scope, expiresAt: Date.now() + 3600000 });
  return { assetBlobRef: { blobId: blobId, sha256: digest, scope: scope, mediaType: 'image/png', byteLength: bytes.length, jobId: completed.jobId }, width: info.width, height: info.height, transparent: info.transparent };
}
async function generated(context) {
  var registration = workflow(context.model, 'image-generate'), input = Object.assign({}, context.request.input || {}, { requestId: context.request.requestId }), selectedExtensions = extensions.compile(input.extensions, Object.assign({ id: context.model }, registration.item), input.styleId || null);
  if (selectedExtensions.length) throw code('COMFYUI_EXTENSION_WORKFLOW_UNSUPPORTED', 'This pinned Stage B workflow has no approved extension injection points.');
  var prompt;
  if (registration.item.referenceInput) {
    if (!input.referenceAssetBlobRef) throw code('COMFYUI_REFERENCE_INPUT_MISSING', 'Reference generation requires a controlled source asset blob.');
    var reference = findBlob(input.referenceAssetBlobRef);
    if (reference.projectId !== context.request.projectId || (reference.scope !== 'project-local' && reference.scope !== 'private-local')) throw code('COMFYUI_INPUT_SCOPE_DENIED', 'Reference input is not authorized for this project.');
    input.sourceName = await uploadPng(context, fs.readFileSync(reference.path), reference.sha256);
    prompt = buildReferencePrompt(registration.item, registration.graph, input);
  } else if (registration.item.dualAnchorInput) {
    if (!input.styleAssetBlobRef || !input.lineartAssetBlobRef) throw code('COMFYUI_ANCHOR_INPUT_MISSING', 'Anchored generation requires controlled style and lineart asset blobs.');
    var style = findBlob(input.styleAssetBlobRef), lineart = findBlob(input.lineartAssetBlobRef);
    [style, lineart].forEach(function(record) { if (record.projectId !== context.request.projectId || (record.scope !== 'project-local' && record.scope !== 'private-local')) throw code('COMFYUI_INPUT_SCOPE_DENIED', 'Anchored input is not authorized for this project.'); });
    input.styleName = await uploadPng(context, fs.readFileSync(style.path), style.sha256);
    input.lineartName = await uploadPng(context, fs.readFileSync(lineart.path), lineart.sha256);
    prompt = buildAnchoredPrompt(registration.item, registration.graph, input);
  } else prompt = buildPrompt(registration.item, registration.graph, input);
  var completed = await submit(context, registration, prompt), output = await outputPng(context, registration, completed);
  return { output: output, usage: { jobId: completed.jobId }, cost: context.request.estimatedCost, provenance: provenance(registration, completed.jobId) };
}
function controlledInput(context, reference, kind) {
  var record = stageBInputs.lookup(reference, function(bytes) { return pngInfo(bytes, { maxWidth: 512, maxHeight: 512, maxPixels: 262144, maxOutputBytes: 16777216 }); });
  if (record.projectId !== context.request.projectId || (record.scope !== 'private-local' && record.scope !== 'project-local')) throw code('COMFYUI_INPUT_SCOPE_DENIED', kind + ' input is not authorized for this project.');
  return record;
}
async function edited(context) {
  var input = context.request.input || {}, registration = workflow(context.model, 'image-edit'), selectedExtensions = extensions.compile(input.extensions, Object.assign({ id: context.model }, registration.item), input.styleId || null);
  if (selectedExtensions.length) throw code('COMFYUI_EXTENSION_WORKFLOW_UNSUPPORTED', 'This pinned Stage B workflow has no approved extension injection points.');
  if (!input.parentRevisionId || !input.sourceAssetBlobRef || !input.maskAssetBlobRef) throw code('COMFYUI_EDIT_INPUT_MISSING', 'Image edit requires parentRevisionId, controlled source, and controlled mask.');
  var source = controlledInput(context, input.sourceAssetBlobRef, 'parent'), mask = controlledInput(context, input.maskAssetBlobRef, 'mask');
  if ((source.scope === 'private-local' || mask.scope === 'private-local') && registration.item.allowsPrivateLocal !== true) throw code('COMFYUI_PRIVATE_INPUT_DENIED', 'Workflow is not registered for private-local inputs.');
  if (source.revisionId !== input.parentRevisionId) throw code('COMFYUI_PARENT_REVISION_INVALID', 'Controlled source does not match parentRevisionId.');
  if (!mask.transparent || source.width !== mask.width || source.height !== mask.height) throw code('COMFYUI_MASK_INVALID', 'Mask must be alpha PNG with the parent image dimensions.');
  var sourceName = await uploadPng(context, source.bytes, source.sha256), maskName = await uploadPng(context, mask.bytes, mask.sha256);
  var completed = await submit(context, registration, buildEditPrompt(registration.item, registration.graph, Object.assign({}, input, { requestId: context.request.requestId, sourceName: sourceName, maskName: maskName })));
  var output = await outputPng(context, registration, completed, source.scope === 'private-local' || mask.scope === 'private-local' ? 'private-local' : 'project-local');
  var maskEvidence = maskContract.assertMaskedEdit(source.bytes, mask.bytes, fs.readFileSync(findBlob(output.assetBlobRef).path));
  return { output: output, usage: { jobId: completed.jobId }, cost: context.request.estimatedCost, provenance: Object.assign(provenance(registration, completed.jobId), { parentRevisionId: input.parentRevisionId, parentSha256: source.sha256, maskSha256: mask.sha256, privacyScope: output.assetBlobRef.scope, maskEvidence: maskEvidence }) };
}
function semanticCaption(run, nodeId) {
  var output = run.outputs && run.outputs[nodeId]; if (!output) throw code('FLORENCE_OUTPUT_INVALID', 'Florence workflow did not return review output.');
  var values = output.text || output.string || output.result || output.caption;
  var caption = Array.isArray(values) ? values[0] : values;
  if (typeof caption !== 'string' || !caption.trim() || caption.length > 4096) throw code('FLORENCE_OUTPUT_INVALID', 'Florence workflow did not return a bounded caption.');
  return caption.trim();
}
function semanticDecision(caption, policy) {
  policy = policy || {};
  var required = (policy.requiredSemanticTags || []).map(function(value) { return String(value).toLowerCase(); }), normalized = String(caption).toLowerCase(), aliases = policy.requiredAliases || {};
  function matchesTerms(terms) { return (terms || []).some(function(term) { return normalized.indexOf(String(term).toLowerCase()) >= 0; }); }
  var matched = required.filter(function(tag) { var words = tag.match(/[a-z0-9]+/g) || [], expected = words.filter(function(word) { return word.length > 2; }); return expected.some(function(word) { return matchesTerms(aliases[word] || [word]); }); });
  var forbidden = (policy.forbiddenSemanticGroups || []).filter(function(group) { return group && group.id && matchesTerms(group.terms); }).map(function(group) { return String(group.id); });
  var subjectPresent = String(caption).trim().length > 2, confidence = required.length ? matched.length / required.length : 0.5, issues = [];
  if (matched.length < required.length) issues.push('semantic_tags_unverified');
  forbidden.forEach(function(issue) { if (issues.indexOf(issue) < 0) issues.push(issue); });
  return { pass: subjectPresent && matched.length === required.length && !forbidden.length && confidence >= Number(policy.minConfidence || 0.35), repairable: subjectPresent && (matched.length < required.length || forbidden.length > 0), issues: issues, evidence: { captionSha256: sha256(String(caption)), matchedTags: matched, forbiddenGroups: forbidden, requiredTagCount: required.length, subjectPresent: subjectPresent, subjectCount: null, confidence: confidence } };
}
async function semanticReview(context) {
  var input = context.request.input || {}, registration = workflow(context.model, 'vision-review');
  if (!input.assetBlobRef) throw code('COMFYUI_BLOB_MISSING', 'Semantic review requires a materialized AssetBlobRef.');
  var record = findBlob(input.assetBlobRef); if (record.projectId !== context.request.projectId) throw code('COMFYUI_BLOB_MISSING', 'Semantic review input is unavailable or out of scope.'); if (record.scope === 'private-local' && registration.item.allowsPrivateLocal !== true) throw code('COMFYUI_PRIVATE_INPUT_DENIED', 'Workflow is not registered for private-local inputs.');
  var bytes = fs.readFileSync(record.path); pngInfo(bytes, { maxWidth: registration.item.maxWidth, maxHeight: registration.item.maxHeight, maxPixels: registration.item.maxWidth * registration.item.maxHeight, maxOutputBytes: registration.item.maxOutputBytes || 16777216 });
  var imageName = await uploadPng(context, bytes, record.sha256), completed = await submit(context, registration, buildVisionPrompt(registration, registration.graph, { imageName: imageName })), caption = semanticCaption(completed.run, registration.item.outputNodeId);
  var review = Object.assign(semanticDecision(caption, input.reviewPolicy), { reviewer: 'florence2-semantic-review', schemaVersion: 1 });
  return { output: { text: JSON.stringify(review) }, usage: { jobId: completed.jobId }, cost: context.request.estimatedCost, provenance: Object.assign(provenance(registration, completed.jobId), { assetSha256: record.sha256, reviewSchemaVersion: 1 }) };
}
async function segmentSubject(context) {
  var input = context.request.input || {}, registration = workflow(context.model, 'subject-segment');
  if (!input.assetBlobRef) throw code('COMFYUI_BLOB_MISSING', 'Subject segmentation requires a materialized AssetBlobRef.');
  var record = findBlob(input.assetBlobRef); if (record.projectId !== context.request.projectId) throw code('COMFYUI_BLOB_MISSING', 'Subject segmentation input is unavailable or out of scope.');
  var bytes = fs.readFileSync(record.path); pngInfo(bytes, { maxWidth: registration.item.maxWidth, maxHeight: registration.item.maxHeight, maxPixels: registration.item.maxWidth * registration.item.maxHeight, maxOutputBytes: registration.item.maxOutputBytes || 16777216 });
  var subjectText = String(input.subjectText || '').trim(); if (!subjectText) throw code('COMFYUI_SEGMENT_SUBJECT_MISSING', 'Subject segmentation requires declared subject text.');
  var imageName = await uploadPng(context, bytes, record.sha256), completed = await submit(context, registration, buildSegmentationPrompt(registration, registration.graph, { imageName: imageName, subjectText: subjectText })), output = await outputPng(context, registration, completed, record.scope);
  return { output: output, usage: { jobId: completed.jobId }, cost: context.request.estimatedCost, provenance: Object.assign(provenance(registration, completed.jobId), { assetSha256: record.sha256, subjectTextSha256: sha256(subjectText) }) };
}
async function cancel(context) { var endpoint = localEndpoint(context.config.endpoint), fetchImpl = context.fetchImpl || fetch; try { await json(fetchImpl, endpoint + '/interrupt', { method: 'POST', signal: context.signal }); } catch (error) { if (!String(error.code || '').match(/^COMFYUI_HTTP_404$/)) throw error; } return { cancelled: true }; }
function localReview(context) {
  var ref = (context.request.input || {}).assetBlobRef, record = findBlob(ref);
  var pass = record.info.width > 0 && record.info.height > 0;
  return { output: { text: JSON.stringify({ pass: pass, repairable: false, issues: pass ? [] : ['png_invalid'], reviewer: 'deterministic-local-png' }) }, usage: {}, cost: context.request.estimatedCost, provenance: { reviewer: 'deterministic-local-png', assetBlobId: ref.blobId } };
}
async function invokeComfyUI(context) {
  if (context.request.role === 'image-generate') return generated(context);
  if (context.request.role === 'image-edit') return edited(context);
  if (context.request.role === 'vision-review') return context.model === 'gamecastle.test-local-png-review.v1' ? localReview(context) : semanticReview(context);
  if (context.request.role === 'subject-segment') return segmentSubject(context);
  throw code('COMFYUI_ROLE_UNAVAILABLE', 'ComfyUI role is unavailable.');
}
function candidate(state, result, source) {
  if (!result.ok) throw code(result.debt.code, result.debt.code);
  var output = result.output || {}, slot = state.slot || {}, kind = source || 'imageGeneration';
  return { assetId: 'comfy.' + output.assetBlobRef.sha256.slice(0, 16), sha256: output.assetBlobRef.sha256, assetBlobRef: output.assetBlobRef, path: 'blob://' + output.assetBlobRef.blobId, format: 'png', width: output.width, height: output.height, transparent: output.transparent, styleId: slot.styleId || null, semanticTags: slot.semanticTags || [], styleTags: slot.styleTags || [], status: kind === 'imageEdit' ? 'variant' : 'generated', source: kind, parentRevisionId: kind === 'imageEdit' ? state.source.parentRevisionId : null, providerReceipt: result.receipt, publishability: { playable: true, publishable: true, blocksFinalExport: false } };
}
function createAssetProviderPorts(runtime, options) {
  options = options || {};
  function invoke(role, state, extra) { var model = role === 'image-generate' ? (options.imageModel || options.model) : role === 'image-edit' ? (options.editModel || options.model) : role === 'subject-segment' ? (options.segmentModel || options.visionModel || null) : (options.visionModel || null), slot = state.slot || {}, styledPrompt = slot.generationPrompt || styleDNA.generationPrompt(slot.styleId, (slot.semanticTags || []).join(', '), { transparent: ((slot.constraints || {}).transparent === true) }); return runtime.invokeRole({ requestId: state.runId + ':' + slot.slotId + ':' + role, projectId: state.projectId || state.runId, role: role, provider: 'comfyui-local', model: model, estimatedCost: options.estimatedCost, timeoutMs: options.timeoutMs, maxAttempts: 1, input: Object.assign({ prompt: styledPrompt, negativePrompt: slot.negativePrompt || styleDNA.negativePrompt(slot.styleId), width: slot.generationWidth || (slot.constraints || {}).width || 512, height: slot.generationHeight || (slot.constraints || {}).height || 512, styleId: slot.styleId || null, extensions: options.extensions || [] }, extra || {}) }); }
  return {
    generate: async function(state) { return candidate(state, await invoke('image-generate', state)); },
    edit: async function(state) { var source = await stageBInputs.resolve(options, state.source && state.source.parentAssetRef, state, 'parent', pngInfo), mask = await stageBInputs.resolve(options, state.source && state.source.maskAssetRef, state, 'mask', pngInfo); var result = await invoke('image-edit', state, { parentRevisionId: state.source.parentRevisionId, sourceAssetBlobRef: source, maskAssetBlobRef: mask, prompt: (state.source.repairConstraint || (state.slot.semanticTags || []).join(', ')) }); return candidate(state, result, 'imageEdit'); },
    review: async function(state) { var reviewPolicy = state.source && state.source.reviewPolicy || { requiredSemanticTags: (state.slot && state.slot.semanticTags) || [], minConfidence: 0.35 }; var result = await invoke('vision-review', state, { assetBlobRef: state.candidate && state.candidate.assetBlobRef, reviewPolicy: reviewPolicy }); if (!result.ok) return { pass: false, repairable: false, issues: [result.debt.code], providerReceipt: result.receipt }; try { return Object.assign(JSON.parse(result.output.text), { providerReceipt: result.receipt }); } catch (_error) { return { pass: false, repairable: false, issues: ['vision_review_invalid_json'], providerReceipt: result.receipt }; } },
    segment: async function(state) { var result = await invoke('subject-segment', state, { assetBlobRef: state.candidate && state.candidate.assetBlobRef, subjectText: ((state.slot && state.slot.semanticTags) || []).join(', ') }); if (!result.ok) throw code(result.debt.code, result.debt.code); return result.output; },
    registerDerivedCandidate: async function(state) { var candidate = state.candidate || {}, bytes = fs.readFileSync(candidate.path), info = pngInfo(bytes, { maxWidth: 512, maxHeight: 512, maxPixels: 262144, maxOutputBytes: 16777216 }), digest = sha256(bytes), transit = transitRoot(), blobPath = path.join(transit, digest + '.png'); fs.mkdirSync(transit, { recursive: true }); if (!fs.existsSync(blobPath)) fs.copyFileSync(candidate.path, blobPath); var blobId = 'blob.' + digest.slice(0, 24), scope = 'project-local'; rememberBlob(blobId, { path: blobPath, sha256: digest, info: info, projectId: state.projectId || state.runId, scope: scope, expiresAt: Date.now() + 3600000 }); return Object.assign({}, candidate, { assetBlobRef: { blobId: blobId, sha256: digest, scope: scope, mediaType: 'image/png', byteLength: bytes.length } }); },
    materializeCandidate: async function(state) { var ref = state.candidate && state.candidate.assetBlobRef, record = findBlob(ref); return Object.assign({}, state.candidate, { path: record.path, transientMaterialized: true }); },
    promoteCandidate: async function(state) { var ref = state.candidate && state.candidate.assetBlobRef, record = findBlob(ref); if (!state.projectAssetDir) throw code('COMFYUI_PROMOTION_UNAVAILABLE', 'Accepted candidate requires a project-local target.'); var dir = path.resolve(state.projectAssetDir), target = path.join(dir, 'comfy-' + record.sha256.slice(0, 16) + '.png'); fs.mkdirSync(dir, { recursive: true }); if (!fs.existsSync(target)) fs.copyFileSync(record.path, target); var next = Object.assign({}, state.candidate, { path: target, materialized: true, privacyScope: record.scope, assetBlobProvenance: { blobId: ref.blobId, sha256: ref.sha256, transitScope: ref.scope } }); delete next.assetBlobRef; return next; }
  };
}
module.exports = { invokeComfyUI: invokeComfyUI, health: health, cancel: cancel, createAssetProviderPorts: createAssetProviderPorts, _blobs: blobs, _pngInfo: pngInfo, _hashPath: hashPath, _hashTree: hashTree, _findBlob: findBlob, _semanticDecision: semanticDecision };
