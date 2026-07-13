/* Real loopback smoke: proves a registered template can produce a verified PNG. */
var assert = require('assert');
var crypto = require('crypto');
var runtimeModule = require('./provider-runtime');
var comfy = require('./comfyui-local-provider');

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
      prompt: 'single small blue gem game icon, centered, flat vector game art, transparent background, no text',
      negativePrompt: process.env.COMFYUI_NEGATIVE_PROMPT || 'blurry, low quality, text, watermark',
      width: 512,
      height: 512,
      seed: Number(process.env.COMFYUI_GENERATION_SEED || 1),
      steps: Number(process.env.COMFYUI_GENERATION_STEPS || 24),
      cfg: Number(process.env.COMFYUI_GENERATION_CFG || 7)
    }
  });
  if (!result.ok) throw new Error('ComfyUI live generation failed: ' + (result.debt && result.debt.code || 'unknown'));
  var output = result.output || {}, record = comfy._findBlob(output.assetBlobRef);
  assert.equal(output.assetBlobRef.sha256, crypto.createHash('sha256').update(require('fs').readFileSync(record.path)).digest('hex'));
  assert(output.width > 0 && output.height > 0, 'ComfyUI returned an invalid image size');
  process.stdout.write('[ComfyUILiveSmoke] ' + JSON.stringify({ requestId: requestId, sha256: output.assetBlobRef.sha256, width: output.width, height: output.height, transparent: output.transparent, workflowId: result.receipt.provenance.workflowId, modelId: result.receipt.provenance.modelId }) + '\n');
})().catch(function(error) { console.error('[ComfyUILiveSmoke] ' + error.message); process.exit(1); });
