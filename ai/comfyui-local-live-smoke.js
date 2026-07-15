/* Real loopback smoke: proves the registered core workflow can produce one immutable master PNG. */
var assert = require('assert');
var crypto = require('crypto');
var runtimeModule = require('./provider-runtime');
var comfy = require('./comfyui-local-provider');
var styleDNA = require('./style-dna');

['COMFYUI_ENDPOINT', 'COMFYUI_ALLOW_LOCAL', 'COMFYUI_MODEL_PATH', 'COMFYUI_MODEL_SHA256'].forEach(function(name) {
  if (!process.env[name]) throw new Error('ComfyUI live smoke requires ' + name + '.');
});
if (process.env.COMFYUI_ALLOW_LOCAL !== 'true') throw new Error('ComfyUI live smoke requires COMFYUI_ALLOW_LOCAL=true.');

(async function() {
  var requestId = 'comfy-live-' + Date.now();
  var runtime = runtimeModule.createProviderRuntime({ maxCost: 2 });
  var result = await runtime.invokeRole({
    requestId: requestId,
    projectId: 'gamecastle-comfy-live-smoke',
    role: 'image-generate',
    provider: 'comfyui-local',
    estimatedCost: 0,
    timeoutMs: 600000,
    input: {
      prompt: styleDNA.generationPrompt('gamecastle.style-dna.v1', 'one small blue gem collectible', { transparent: true, productionFamily: 'prop' }),
      negativePrompt: styleDNA.negativePrompt('gamecastle.style-dna.v1', [], { productionFamily: 'prop' }),
      width: 512,
      height: 512,
      batchSize: 4,
      seed: 424242,
      transparent: true,
      productionFamily: 'prop',
    }
  });
  if (!result.ok) throw new Error('ComfyUI live generation failed: ' + (result.debt && result.debt.code || 'unknown'));
  var output = result.output || {}, record = comfy._findBlob(output.assetBlobRef);
  assert.equal(output.assetBlobRef.sha256, crypto.createHash('sha256').update(require('fs').readFileSync(record.path)).digest('hex'));
  assert(output.width > 0 && output.height > 0, 'ComfyUI returned an invalid image size');
  process.stdout.write('[ComfyUILiveSmoke] ' + JSON.stringify({ requestId: requestId, sha256: output.assetBlobRef.sha256, width: output.width, height: output.height, transparent: output.transparent, workflowId: result.receipt.provenance.workflowId, modelId: result.receipt.provenance.modelId }) + '\n');
})().catch(function(error) { console.error('[ComfyUILiveSmoke] ' + error.message); process.exit(1); });
