var childProcess = require('child_process');
var crypto = require('crypto');
var fs = require('fs');
var os = require('os');
var path = require('path');
var readline = require('readline');
var contract = require('../shared/asset-semantic-review-contract.json');

var worker = null, ready = null, pending = new Map(), stderr = '';
function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'CLIPImageReviewer'; throw error; }
function modelDirectory() { return path.resolve(__dirname, '..', contract.model.localDirectory); }
function fingerprint() {
  var root = modelDirectory(), files = contract.model.files, identity = { contractId: contract.contractId, schemaVersion: contract.schemaVersion, repository: contract.model.repository, revision: contract.model.revision, files: {} };
  Object.keys(files).sort().forEach(function(name) { var file = path.join(root, name); if (!fs.existsSync(file) || sha(fs.readFileSync(file)) !== files[name]) fail('ASSET_REVIEW_MODEL_HASH_MISMATCH', 'CLIP review model file is missing or changed: ' + name); identity.files[name] = files[name]; });
  return sha(Buffer.from(JSON.stringify(identity)));
}
function pythonPath() { return process.env.COMFYUI_PYTHON || 'C:\\Ai\\ComfyUI_windows_portable\\python_embeded\\python.exe'; }
function refWorker() { if (!worker) return; worker.ref(); if (worker.stdout.ref) worker.stdout.ref(); if (worker.stderr.ref) worker.stderr.ref(); if (worker.stdin.ref) worker.stdin.ref(); }
function unrefWorker() { if (!worker) return; worker.unref(); if (worker.stdout.unref) worker.stdout.unref(); if (worker.stderr.unref) worker.stderr.unref(); if (worker.stdin.unref) worker.stdin.unref(); }
function start() {
  if (worker) return ready;
  fingerprint(); var resolveReady, rejectReady; ready = new Promise(function(resolve, reject) { resolveReady = resolve; rejectReady = reject; });
  worker = childProcess.spawn(pythonPath(), ['-u', path.join(__dirname, 'clip-image-review-worker.py'), modelDirectory()], { cwd: path.resolve(__dirname, '..'), env: Object.assign({}, process.env, { TRANSFORMERS_OFFLINE: '1', HF_HUB_OFFLINE: '1', PYTHONUTF8: '1' }), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  worker.stderr.on('data', function(chunk) { stderr = (stderr + chunk.toString()).slice(-8000); });
  readline.createInterface({ input: worker.stdout }).on('line', function(line) { var value; try { value = JSON.parse(line); } catch (_error) { return; } if (value.ready) { resolveReady(value); return; } var entry = pending.get(value.requestId); if (!entry) return; pending.delete(value.requestId); if (value.ok) entry.resolve(value.results); else entry.reject(Object.assign(new Error(value.error), { code: 'ASSET_SEMANTIC_REVIEW_FAILED', owner: 'CLIPImageReviewer' })); });
  worker.on('error', function(error) { rejectReady(error); }); worker.on('exit', function(code) { var error = new Error('CLIP review worker exited ' + code + ': ' + stderr); error.code = 'ASSET_REVIEW_WORKER_EXITED'; pending.forEach(function(entry) { entry.reject(error); }); pending.clear(); worker = null; });
  return ready;
}
async function reviewImages(input) {
  if (!input || !Array.isArray(input.images) || !input.images.length) fail('ASSET_REVIEW_INPUT_INVALID', 'CLIP review requires image bytes.');
  ['positiveTexts', 'negativeTexts', 'stylePositiveTexts', 'styleNegativeTexts'].forEach(function(name) { if (!Array.isArray(input[name]) || !input[name].length) fail('ASSET_REVIEW_INPUT_INVALID', 'CLIP review requires ' + name + '.'); });
  var compositionChecks = input.compositionChecks || [];
  compositionChecks.forEach(function(check) { if (!check || !check.id || !Array.isArray(check.positiveTexts) || !check.positiveTexts.length || !Array.isArray(check.negativeTexts) || !check.negativeTexts.length) fail('ASSET_REVIEW_INPUT_INVALID', 'Every CLIP composition check requires id, positiveTexts, and negativeTexts.'); });
  if (worker) refWorker(); await start(); refWorker(); var directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-clip-review-')), requestId = crypto.randomUUID(), imagePaths = input.images.map(function(bytes, index) { var file = path.join(directory, index + '.png'); fs.writeFileSync(file, bytes); return file; });
  try { return await new Promise(function(resolve, reject) { var timer = setTimeout(function() { pending.delete(requestId); reject(Object.assign(new Error('CLIP review timed out'), { code: 'ASSET_REVIEW_TIMEOUT' })); }, Number(input.timeoutMs || 120000)); pending.set(requestId, { resolve: function(value) { clearTimeout(timer); resolve(value); }, reject: function(error) { clearTimeout(timer); reject(error); } }); worker.stdin.write(JSON.stringify({ requestId: requestId, imagePaths: imagePaths, preprocessing: contract.preprocessing, positiveTexts: input.positiveTexts, negativeTexts: input.negativeTexts, stylePositiveTexts: input.stylePositiveTexts, styleNegativeTexts: input.styleNegativeTexts, compositionChecks: compositionChecks }) + '\n'); }); }
  finally { fs.rmSync(directory, { recursive: true, force: true }); if (pending.size === 0) unrefWorker(); }
}
function receipt(imageBytes, result, phase) { var imageSha = sha(imageBytes), value = { receiptId: 'asset-review.' + sha(Buffer.from(JSON.stringify([imageSha, result, phase]))).slice(0, 24), owner: 'CLIPImageReviewer', phase: phase, modelRevision: contract.model.revision, modelFingerprint: fingerprint(), imageSha256: imageSha, semanticSimilarity: result.semanticSimilarity, semanticMargin: result.semanticMargin, styleMargin: result.styleMargin, compositionChecks: result.compositionChecks || [], decision: 'accepted' }; return value; }

module.exports = { contract: contract, fingerprint: fingerprint, reviewImages: reviewImages, receipt: receipt };
