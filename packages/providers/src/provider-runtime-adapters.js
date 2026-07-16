var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var governance = require('./ai-provider-governance');
var styleDNA = require('../../assets/src/style-dna');

function assetPrompt(state) {
  var slot = state.slot || {}; var constraints = slot.constraints || {};
  return styleDNA.generationPrompt(slot.styleId, [slot.kind || 'sprite', (slot.semanticTags || []).join(', '), slot.animationState ? 'animation state ' + slot.animationState : null].filter(Boolean).join(', '), { transparent: constraints.transparent === true });
}
function outputFile(state, bytes) {
  var digest = crypto.createHash('sha256').update(bytes).digest('hex'); var directory = state.projectAssetDir || path.join(process.cwd(), '.gamecastle', 'output', 'assets', 'provider');
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
  if (governance.asset({ provider: options.provider }).provider === 'comfyui-local') return require('../../assets/src/comfyui-local-provider').createAssetProviderPorts(runtime, options);
  function call(role, state, extra) { return runtime.invokeRole({ requestId: state.runId + ':' + state.slot.slotId + ':' + role, projectId: state.projectId || state.runId, role: role, provider: options.provider, estimatedCost: options.estimatedCost, timeoutMs: options.timeoutMs, maxAttempts: options.maxAttempts, input: Object.assign({ prompt: assetPrompt(state), negativePrompt: styleDNA.negativePrompt(state.slot.styleId), size: options.size, transparent: !!((state.slot.constraints || {}).transparent) }, extra || {}) }); }
  return {
    productionFingerprint: function(state) { return crypto.createHash('sha256').update(JSON.stringify({ provider: options.provider, model: options.imageModel || options.model || null, size: options.size || null, slot: state.slot })).digest('hex'); },
    generateMaster: async function(state) { return candidate(state, await call('image-generate', state), 'masterImage'); }
  };
}
function createTextProvider(runtime, role, options) {
  options = options || {};
  return { invoke: function(request) { return runtime.invokeRole({ requestId: request.requestId, projectId: request.projectId, role: role, provider: options.provider, estimatedCost: options.estimatedCost, timeoutMs: options.timeoutMs, maxAttempts: options.maxAttempts, input: { systemPrompt: request.systemPrompt, prompt: request.prompt, maxTokens: request.maxTokens } }); } };
}
function createSpatialPlannerPort(runtime, options) {
  options = options || {};
  if (!runtime || typeof runtime.invokeRole !== 'function') throw new Error('SpatialPlanner requires ProviderRuntime.invokeRole.');
  return { invoke: function(request) {
    return runtime.invokeRole({ requestId: request.requestId, projectId: request.projectId, role: 'spatial-plan', provider: options.provider, estimatedCost: options.estimatedCost, timeoutMs: options.timeoutMs, maxAttempts: options.maxAttempts, input: { systemPrompt: request.systemPrompt, prompt: request.prompt, imagePaths: request.imagePaths, maxTokens: request.maxTokens } });
  } };
}
module.exports = { createAssetProviderPorts: createAssetProviderPorts, createTextProvider: createTextProvider, createSpatialPlannerPort: createSpatialPlannerPort };
