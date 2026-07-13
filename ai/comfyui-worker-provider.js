/* Stage C cloud GPU worker adapter. The worker owns ComfyUI, models, and its temporary files. */
var crypto = require('crypto');
var fs = require('fs');
var os = require('os');
var path = require('path');
var registry = require('../shared/comfyui-worker-deployment-registry.json');
var contract = require('../shared/comfyui-worker-contract.json');
var approval = require('./comfyui-worker-deployment-approval');
var trust = require('../shared/comfyui-worker-trust-registry.json');
var workerAttestation = require('./comfyui-worker-attestation');
var pngInfo = require('./comfyui-local-provider')._pngInfo;

var blobs = new Map();
function error(code, message) { var value = new Error(message); value.code = code; value.owner = 'ComfyUIWorkerAdapter'; return value; }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function safeId(value) { return String(value || '').replace(/[^A-Za-z0-9_.-]/g, '_'); }
function root() { var value = path.resolve(process.env.COMFYUI_WORKER_TRANSIT_DIR || path.join(os.tmpdir(), 'gamecastle-comfy-worker-transit')); fs.mkdirSync(value, { recursive: true }); return value; }
function endpoint(value) {
  if (!value) throw error('COMFYUI_WORKER_ENDPOINT_MISSING', 'COMFYUI_WORKER_ENDPOINT is required for comfyui-worker.');
  var url; try { url = new URL(value); } catch (_error) { throw error('COMFYUI_WORKER_ENDPOINT_INVALID', 'COMFYUI_WORKER_ENDPOINT must be an HTTP(S) URL.'); }
  var loopback = ['127.0.0.1', 'localhost', '::1'].indexOf(url.hostname) >= 0;
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) throw error('COMFYUI_WORKER_ENDPOINT_DENIED', 'Cloud worker endpoint must use HTTPS (HTTP is test-loopback only).');
  return url.toString().replace(/\/$/, '');
}
function deployment(model, role) {
  var item = registry.deployments[model];
  if (!item) throw error('COMFYUI_WORKER_DEPLOYMENT_UNREGISTERED', 'Cloud worker deployment is unregistered.');
  if (!contract.executionBackend || item.executionBackend !== contract.executionBackend.selected) throw error('COMFYUI_WORKER_BACKEND_MISMATCH', 'Cloud worker deployment does not match the approved execution backend.');
  try { approval.assertApproved(item, { trustedKeys: trust.approvalKeys }); } catch (value) { throw error(value.code || 'COMFYUI_WORKER_APPROVAL_INVALID', value.message); }
  if ((item.roles || []).indexOf(role) < 0) throw error('COMFYUI_WORKER_ROLE_UNAVAILABLE', 'Cloud worker deployment does not serve this role.');
  return item;
}
function requestHeaders(context) { return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + context.config.apiKey }; }
async function fetchResponse(context, url, init, deadlineMs) {
  var timeout = Math.max(1, Number(deadlineMs || context.timeoutMs || 30000)), timer = AbortSignal.timeout(timeout), signal = context.signal ? AbortSignal.any([context.signal, timer]) : timer, request = Object.assign({}, init || {}, { signal: signal }), timeoutId;
  try { return await Promise.race([(context.fetchImpl || fetch)(url, request), new Promise(function(_resolve, reject) { timeoutId = setTimeout(function() { reject(error('COMFYUI_WORKER_TIMEOUT', 'Cloud worker request timed out.')); }, timeout); })]); } catch (value) { if (context.signal && context.signal.aborted) throw error('PROVIDER_CANCELLED', 'Cloud worker request cancelled.'); if (timer.aborted || value.name === 'TimeoutError') throw error('COMFYUI_WORKER_TIMEOUT', 'Cloud worker request timed out.'); throw value; } finally { clearTimeout(timeoutId); }
}
async function withinDeadline(context, promise, deadlineMs) { var timeout = Math.max(1, Number(deadlineMs || context.timeoutMs || 30000)), timeoutId; try { return await Promise.race([promise, new Promise(function(_resolve, reject) { timeoutId = setTimeout(function() { reject(error('COMFYUI_WORKER_TIMEOUT', 'Cloud worker response body timed out.')); }, timeout); })]); } catch (value) { if (context.signal && context.signal.aborted) throw error('PROVIDER_CANCELLED', 'Cloud worker request cancelled.'); throw value; } finally { clearTimeout(timeoutId); } }
async function json(context, url, init, deadlineMs) { var expiresAt = Date.now() + Math.max(1, Number(deadlineMs || context.timeoutMs || 30000)), response = await fetchResponse(context, url, init, Math.max(1, expiresAt - Date.now())); if (!response.ok) throw error('COMFYUI_WORKER_HTTP_' + response.status, 'Cloud worker HTTP ' + response.status + '.'); return withinDeadline(context, response.json(), Math.max(1, expiresAt - Date.now())); }
function attestation(item, value, request, jobId) {
  try { return workerAttestation.validate(value, { requestId: request.requestId, projectId: request.projectId, jobId: jobId, deploymentId: item.id, workflowId: item.workflowId, workflowRevision: item.workflowRevision, workflowSha256: item.workflowSha256, modelId: item.modelId, modelSha256: item.modelSha256, licenseId: item.licenseId }, trust.workerKeys); } catch (_error) { throw error('COMFYUI_WORKER_ATTESTATION_INVALID', 'Cloud worker attestation is invalid, untrusted, or does not bind this request.'); }
}
function inputFor(context, item) {
  var input = context.request.input || {};
  if (input.privacyScope === 'private-local' || (input.assetBlobRef && input.assetBlobRef.scope === 'private-local')) throw error('COMFYUI_WORKER_PRIVATE_INPUT_DENIED', 'private-local input cannot leave the local execution boundary.');
  if (context.request.role === 'image-generate') return { prompt: String(input.prompt || ''), width: Math.min(Number(input.width || 512), item.maxWidth), height: Math.min(Number(input.height || 512), item.maxHeight), transparent: input.transparent === true, seed: Number.isFinite(Number(input.seed)) ? Number(input.seed) : 1, styleId: input.styleId || null };
  if (context.request.role === 'vision-review') { if (!input.assetBlobRef || !input.assetBlobRef.blobId || !input.assetBlobRef.sha256) throw error('COMFYUI_WORKER_BLOB_MISSING', 'Vision review requires a worker AssetBlobRef.'); var record = blobs.get(input.assetBlobRef.blobId); if (!record || record.expiresAt < Date.now() || record.projectId !== context.request.projectId || record.sha256 !== input.assetBlobRef.sha256) throw error('COMFYUI_WORKER_BLOB_MISSING', 'Vision review AssetBlobRef is unavailable or outside this project.'); return { assetBlobRef: { blobId: safeId(input.assetBlobRef.blobId), sha256: String(input.assetBlobRef.sha256) }, reviewPolicy: input.reviewPolicy || {} }; }
  throw error('COMFYUI_WORKER_ROLE_UNAVAILABLE', 'Cloud worker role is unavailable.');
}
function safeUsage(value, jobId) { var output = { jobId: safeId(jobId) }; ['gpuMs', 'queueMs', 'inputTokens', 'outputTokens'].forEach(function(key) { if (value && Number.isFinite(Number(value[key])) && Number(value[key]) >= 0) output[key] = Number(value[key]); }); return output; }
function safeReview(value) { if (!value || typeof value.pass !== 'boolean' || typeof value.repairable !== 'boolean' || !Array.isArray(value.issues) || value.issues.length > 16 || value.issues.some(function(issue) { return typeof issue !== 'string' || !/^[a-z0-9_.-]{1,128}$/.test(issue); })) throw error('COMFYUI_WORKER_REVIEW_INVALID', 'Cloud worker review output is invalid.'); return { pass: value.pass, repairable: value.repairable, issues: value.issues.slice() }; }
async function health(context) { var base = endpoint(context.config.endpoint); await json(context, base + '/v1/health', { method: 'GET', headers: { Authorization: 'Bearer ' + context.config.apiKey } }, Math.min(Number(context.timeoutMs || 30000), 10000)); return { endpoint: base, healthy: true }; }
function sleep(ms) { return new Promise(function(resolve) { setTimeout(resolve, ms); }); }
async function cancel(context, jobId) { var base = endpoint(context.config.endpoint), controlContext = Object.assign({}, context, { signal: null }); try { await json(controlContext, base + '/v1/jobs/' + encodeURIComponent(jobId), { method: 'DELETE', headers: { Authorization: 'Bearer ' + context.config.apiKey } }, 5000); } catch (value) { if (!/^COMFYUI_WORKER_HTTP_404$/.test(value.code || '')) throw value; } return { cancelled: true }; }
async function submit(context, item) {
  var base = endpoint(context.config.endpoint), started = Date.now(); await health(context);
  var body = { requestId: context.request.requestId, projectId: context.request.projectId, role: context.request.role, deployment: { id: context.model, workflowId: item.workflowId, workflowRevision: item.workflowRevision, workflowSha256: item.workflowSha256, modelId: item.modelId, modelSha256: item.modelSha256, licenseId: item.licenseId }, input: inputFor(context, item) };
  var limit = Math.min(Number(context.timeoutMs || item.maxTimeoutMs), item.maxTimeoutMs), accepted = await json(context, base + '/v1/jobs', { method: 'POST', headers: requestHeaders(context), body: JSON.stringify(body) }, limit);
  if (!accepted.jobId || !/^[A-Za-z0-9_.-]+$/.test(accepted.jobId)) throw error('COMFYUI_WORKER_SUBMIT_INVALID', 'Cloud worker did not return a safe jobId.');
  var poll = Number(process.env.COMFYUI_WORKER_POLL_MS || 500);
  while (Date.now() - started < limit) {
    if (context.signal && context.signal.aborted) { await cancel(context, accepted.jobId); throw error('PROVIDER_CANCELLED', 'Cloud worker request cancelled.'); }
    var job; try { job = await json(context, base + '/v1/jobs/' + encodeURIComponent(accepted.jobId), { method: 'GET', headers: { Authorization: 'Bearer ' + context.config.apiKey } }, Math.max(1, limit - (Date.now() - started))); } catch (value) { if ((context.signal && context.signal.aborted) || value.code === 'COMFYUI_WORKER_TIMEOUT') { await cancel(context, accepted.jobId); if (context.signal && context.signal.aborted) throw error('PROVIDER_CANCELLED', 'Cloud worker request cancelled.'); } throw value; }
    if (job.status === 'failed') throw error('COMFYUI_WORKER_EXECUTION_FAILED', 'Cloud worker execution failed.');
    if (job.status === 'cancelled') throw error('PROVIDER_CANCELLED', 'Cloud worker execution was cancelled.');
    if (job.status === 'succeeded') return { endpoint: base, jobId: accepted.jobId, job: job, attestation: attestation(item, job.deploymentAttestation, context.request, accepted.jobId) };
    if (['queued', 'running'].indexOf(job.status) < 0) throw error('COMFYUI_WORKER_STATUS_INVALID', 'Cloud worker returned an invalid job status.');
    await sleep(poll);
  }
  await cancel(context, accepted.jobId); throw error('COMFYUI_WORKER_TIMEOUT', 'Cloud worker job timed out.');
}
async function imageOutput(context, item, completed) {
  var result = completed.job.output || {}, blobId = result.blobId, digest = result.sha256;
  if (!blobId || !/^[A-Za-z0-9_.-]+$/.test(blobId) || !/^[a-f0-9]{64}$/.test(digest || '')) throw error('COMFYUI_WORKER_OUTPUT_INVALID', 'Cloud worker image output is invalid.');
  var expiresAt = Date.now() + Math.min(Number(context.timeoutMs || item.maxTimeoutMs), item.maxTimeoutMs), response = await fetchResponse(context, completed.endpoint + '/v1/jobs/' + encodeURIComponent(completed.jobId) + '/output', { method: 'GET', headers: { Authorization: 'Bearer ' + context.config.apiKey } }, Math.max(1, expiresAt - Date.now()));
  if (!response.ok) throw error('COMFYUI_WORKER_OUTPUT_FETCH_FAILED', 'Cloud worker output fetch failed.');
  var bytes = Buffer.from(await withinDeadline(context, response.arrayBuffer(), Math.max(1, expiresAt - Date.now()))); if (sha256(bytes) !== digest) throw error('COMFYUI_WORKER_OUTPUT_INVALID', 'Cloud worker output hash mismatch.');
  var info; try { info = pngInfo(bytes, { maxWidth: item.maxWidth, maxHeight: item.maxHeight, maxPixels: item.maxWidth * item.maxHeight, maxOutputBytes: 16777216 }); } catch (_error) { throw error('COMFYUI_WORKER_OUTPUT_INVALID', 'Cloud worker output is not a valid bounded PNG.'); }
  var local = path.join(root(), digest + '.png'); if (!fs.existsSync(local)) fs.writeFileSync(local, bytes);
  blobs.set(blobId, { path: local, sha256: digest, projectId: context.request.projectId, scope: 'project-local', info: info, expiresAt: Date.now() + 3600000 });
  return { assetBlobRef: { blobId: blobId, sha256: digest, scope: 'project-local', mediaType: 'image/png', byteLength: bytes.length, jobId: completed.jobId }, width: info.width, height: info.height, transparent: info.transparent };
}
function provenance(completed) { return Object.assign({}, completed.attestation, { provider: 'comfyui-worker', jobId: completed.jobId }); }
async function invokeWorker(context) {
  var item = deployment(context.model, context.request.role), completed = await submit(context, item);
  if (context.request.role === 'image-generate') return { output: await imageOutput(context, item, completed), usage: safeUsage(completed.job.usage, completed.jobId), cost: context.request.estimatedCost, provenance: provenance(completed) };
  var review = safeReview(completed.job.output && completed.job.output.review);
  return { output: { text: JSON.stringify(Object.assign({}, review, { reviewer: 'comfyui-worker-vision' })) }, usage: safeUsage(completed.job.usage, completed.jobId), cost: context.request.estimatedCost, provenance: provenance(completed) };
}
function candidate(state, result) { if (!result.ok) throw error(result.debt.code, result.debt.code); var output = result.output || {}, slot = state.slot || {}; return { assetId: 'comfy-worker.' + output.assetBlobRef.sha256.slice(0, 16), sha256: output.assetBlobRef.sha256, assetBlobRef: output.assetBlobRef, path: 'blob://' + output.assetBlobRef.blobId, format: 'png', width: output.width, height: output.height, transparent: output.transparent, styleId: slot.styleId || null, semanticTags: slot.semanticTags || [], styleTags: slot.styleTags || [], status: 'generated', source: 'imageGeneration', providerReceipt: result.receipt, publishability: { playable: true, publishable: true, blocksFinalExport: false } }; }
function createAssetProviderPorts(runtime, options) {
  options = options || {};
  function invoke(role, state, extra) { return runtime.invokeRole({ requestId: state.runId + ':' + state.slot.slotId + ':' + role, projectId: state.projectId || state.runId, role: role, provider: 'comfyui-worker', model: role === 'vision-review' ? options.visionModel : options.imageModel, estimatedCost: options.estimatedCost, timeoutMs: options.timeoutMs, maxAttempts: 1, input: Object.assign({ prompt: (state.slot.semanticTags || []).join(', '), width: (state.slot.constraints || {}).width || 512, height: (state.slot.constraints || {}).height || 512, transparent: !!((state.slot.constraints || {}).transparent), styleId: state.slot.styleId || null }, extra || {}) }); }
  return { generate: async function(state) { return candidate(state, await invoke('image-generate', state)); }, review: async function(state) { var result = await invoke('vision-review', state, { assetBlobRef: state.candidate && state.candidate.assetBlobRef, reviewPolicy: { requiredSemanticTags: (state.slot && state.slot.semanticTags) || [] } }); if (!result.ok) return { pass: false, repairable: false, issues: [result.debt.code], providerReceipt: result.receipt }; return Object.assign(JSON.parse(result.output.text), { providerReceipt: result.receipt }); }, materializeCandidate: async function(state) { var record = blobs.get(state.candidate && state.candidate.assetBlobRef && state.candidate.assetBlobRef.blobId); if (!record || record.projectId !== state.projectId || !fs.existsSync(record.path)) throw error('COMFYUI_WORKER_OUTPUT_LOST', 'Cloud worker candidate is unavailable for materialization.'); return Object.assign({}, state.candidate, { path: record.path, transientMaterialized: true }); }, promoteCandidate: async function(state) { var ref = state.candidate && state.candidate.assetBlobRef, record = blobs.get(ref && ref.blobId); if (!record || !state.projectAssetDir) throw error('COMFYUI_WORKER_PROMOTION_UNAVAILABLE', 'Cloud worker candidate cannot be promoted.'); var target = path.join(path.resolve(state.projectAssetDir), 'comfy-worker-' + record.sha256.slice(0, 16) + '.png'); fs.mkdirSync(path.dirname(target), { recursive: true }); if (!fs.existsSync(target)) fs.copyFileSync(record.path, target); var next = Object.assign({}, state.candidate, { path: target, materialized: true, privacyScope: record.scope, assetBlobProvenance: { blobId: ref.blobId, sha256: ref.sha256, transitScope: record.scope } }); delete next.assetBlobRef; return next; } };
}
module.exports = { invokeWorker: invokeWorker, health: health, cancel: cancel, createAssetProviderPorts: createAssetProviderPorts, _blobs: blobs };
