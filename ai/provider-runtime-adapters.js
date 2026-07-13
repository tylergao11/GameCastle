var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var governance = require('./ai-provider-governance');

function assetPrompt(state) {
  var slot = state.slot || {}; var constraints = slot.constraints || {};
  return [slot.kind || 'sprite', (slot.semanticTags || []).join(', '), (slot.styleTags || []).join(', '), constraints.transparent ? 'transparent background' : 'opaque background'].filter(Boolean).join('; ');
}
function outputFile(state, bytes) {
  var digest = crypto.createHash('sha256').update(bytes).digest('hex'); var directory = state.projectAssetDir || path.join(process.cwd(), 'output', 'assets', 'provider');
  fs.mkdirSync(directory, { recursive: true }); var file = path.join(directory, 'provider-' + digest.slice(0, 16) + '.png'); fs.writeFileSync(file, bytes); return { path: file, sha256: digest };
}
function candidate(state, result, source, parentRevisionId) {
  if (!result.ok) throw Object.assign(new Error(result.debt.code), { code: result.debt.code });
  var bytes = Buffer.from((result.output || {}).b64Json || '', 'base64'); if (!bytes.length) throw Object.assign(new Error('Provider image output missing PNG bytes'), { code: 'PROVIDER_IMAGE_OUTPUT_INVALID' });
  var file = outputFile(state, bytes); var slot = state.slot || {};
  return { assetId: 'provider.' + file.sha256.slice(0, 16), sha256: file.sha256, path: file.path, format: 'png', width: (slot.constraints || {}).width || 1, height: (slot.constraints || {}).height || 1, transparent: !!((slot.constraints || {}).transparent), styleId: slot.styleId || null, semanticTags: slot.semanticTags || [], styleTags: slot.styleTags || [], source: source, status: source === 'imageEdit' ? 'variant' : 'generated', parentRevisionId: parentRevisionId || null, providerReceipt: result.receipt, simulated: !!result.receipt.simulated, publishability: { playable: true, publishable: !result.receipt.simulated, blocksFinalExport: false } };
}
function createAssetProviderPorts(runtime, options) {
  options = options || {};
  if (governance.asset({ provider: options.provider }).provider === 'comfyui-local') return require('./comfyui-local-provider').createAssetProviderPorts(runtime, options);
  if (governance.asset({ provider: options.provider }).provider === 'comfyui-worker') return require('./comfyui-worker-provider').createAssetProviderPorts(runtime, options);
  function call(role, state, extra) { return runtime.invokeRole({ requestId: state.runId + ':' + state.slot.slotId + ':' + role, projectId: state.projectId || state.runId, role: role, provider: options.provider, estimatedCost: options.estimatedCost, timeoutMs: options.timeoutMs, maxAttempts: options.maxAttempts, input: Object.assign({ prompt: assetPrompt(state), size: options.size, transparent: !!((state.slot.constraints || {}).transparent) }, extra || {}) }); }
  return {
    generate: async function(state) { return candidate(state, await call('image-generate', state), 'imageGeneration'); },
    edit: async function(state) { return candidate(state, await call('image-edit', state, { imagePath: state.candidate && state.candidate.path }), 'imageEdit', state.source.parentRevisionId); },
    review: async function(state) { var result = await call('vision-review', state, { prompt: 'Review this game asset against its required semantic and style tags. Return only JSON: {"pass":boolean,"repairable":boolean,"issues":string[]}.', imagePath: state.candidate && state.candidate.path }); if (!result.ok) return { pass: false, repairable: false, providerReceipt: result.receipt }; try { var review = JSON.parse(result.output.text); return { pass: review.pass === true, repairable: review.repairable === true, issues: review.issues || [], providerReceipt: result.receipt }; } catch (_error) { return { pass: false, repairable: false, issues: ['vision_review_invalid_json'], providerReceipt: result.receipt }; } }
  };
}
function createTextProvider(runtime, role, options) {
  options = options || {};
  return { invoke: function(request) { return runtime.invokeRole({ requestId: request.requestId, projectId: request.projectId, role: role, provider: options.provider, estimatedCost: options.estimatedCost, timeoutMs: options.timeoutMs, maxAttempts: options.maxAttempts, input: { systemPrompt: request.systemPrompt, prompt: request.prompt, maxTokens: request.maxTokens } }); } };
}
module.exports = { createAssetProviderPorts: createAssetProviderPorts, createTextProvider: createTextProvider };
