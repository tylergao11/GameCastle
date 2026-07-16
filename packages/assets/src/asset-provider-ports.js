'use strict';

// Asset-owned provider ports. Depends on ProviderRuntime only as an injected invokeRole host.

var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var styleDNA = require('./style-dna');
var comfyui = require('./comfyui-local-provider');

function usesComfyuiLocal(provider) {
  return !provider || provider === 'comfyui-local';
}

function assetPrompt(state) {
  var slot = state.slot || {};
  var constraints = slot.constraints || {};
  return styleDNA.generationPrompt(
    slot.styleId,
    [slot.kind || 'sprite', (slot.semanticTags || []).join(', '), slot.animationState ? 'animation state ' + slot.animationState : null].filter(Boolean).join(', '),
    { transparent: constraints.transparent === true }
  );
}

function outputFile(state, bytes) {
  var digest = crypto.createHash('sha256').update(bytes).digest('hex');
  var directory = state.projectAssetDir || path.join(process.cwd(), '.gamecastle', 'output', 'assets', 'provider');
  fs.mkdirSync(directory, { recursive: true });
  var file = path.join(directory, 'provider-' + digest.slice(0, 16) + '.png');
  fs.writeFileSync(file, bytes);
  return { path: file, sha256: digest };
}

function candidate(state, result, source, parentRevisionId) {
  if (!result.ok) throw Object.assign(new Error(result.debt.code), { code: result.debt.code });
  var bytes = Buffer.from((result.output || {}).b64Json || '', 'base64');
  if (!bytes.length) throw Object.assign(new Error('Provider image output missing PNG bytes'), { code: 'PROVIDER_IMAGE_OUTPUT_INVALID' });
  var file = outputFile(state, bytes);
  var slot = state.slot || {};
  return {
    assetId: 'provider.' + file.sha256.slice(0, 16),
    sha256: file.sha256,
    path: file.path,
    format: 'png',
    width: (slot.constraints || {}).width || 1,
    height: (slot.constraints || {}).height || 1,
    transparent: !!((slot.constraints || {}).transparent),
    styleId: slot.styleId || null,
    semanticTags: slot.semanticTags || [],
    styleTags: slot.styleTags || [],
    source: source,
    status: source === 'imageEdit' ? 'variant' : 'generated',
    parentRevisionId: parentRevisionId || null,
    providerReceipt: result.receipt,
    simulated: !!result.receipt.simulated,
    publishability: { playable: true, publishable: !result.receipt.simulated, blocksFinalExport: false }
  };
}

function createAssetProviderPorts(runtime, options) {
  options = options || {};
  if (usesComfyuiLocal(options.provider)) {
    return comfyui.createAssetProviderPorts(runtime, options);
  }
  function call(role, state, extra) {
    return runtime.invokeRole({
      requestId: state.runId + ':' + state.slot.slotId + ':' + role,
      projectId: state.projectId || state.runId,
      role: role,
      provider: options.provider,
      estimatedCost: options.estimatedCost,
      timeoutMs: options.timeoutMs,
      maxAttempts: options.maxAttempts,
      input: Object.assign({
        prompt: assetPrompt(state),
        negativePrompt: styleDNA.negativePrompt(state.slot.styleId),
        size: options.size,
        transparent: !!((state.slot.constraints || {}).transparent)
      }, extra || {})
    });
  }
  return {
    productionFingerprint: function(state) {
      return crypto.createHash('sha256').update(JSON.stringify({
        provider: options.provider,
        model: options.imageModel || options.model || null,
        size: options.size || null,
        slot: state.slot
      })).digest('hex');
    },
    generateMaster: async function(state) {
      return candidate(state, await call('image-generate', state), 'masterImage');
    }
  };
}

module.exports = { createAssetProviderPorts: createAssetProviderPorts };
