/* Real loopback smoke for the registered Florence semantic-review path. */
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var runtimeModule = require('./provider-runtime');
var comfy = require('./comfyui-local-provider');

var imagePath = process.argv[2] && path.resolve(process.argv[2]);
if (!imagePath || !fs.existsSync(imagePath)) throw new Error('Usage: node ai/comfyui-florence-live-smoke.js <png-path>');
['COMFYUI_ENDPOINT', 'COMFYUI_ALLOW_LOCAL', 'COMFYUI_FLORENCE2_MODEL_PATH', 'COMFYUI_FLORENCE2_MODEL_SHA256'].forEach(function(name) {
  if (!process.env[name]) throw new Error('Florence live smoke requires ' + name + '.');
});
if (process.env.COMFYUI_ALLOW_LOCAL !== 'true') throw new Error('Florence live smoke requires COMFYUI_ALLOW_LOCAL=true.');

(async function() {
  var runtime = runtimeModule.createProviderRuntime({ maxCost: 2 });
  var ports = comfy.createAssetProviderPorts(runtime, {
    provider: 'comfyui-local',
    visionModel: 'gamecastle.florence2.review.cpu.v1',
    estimatedCost: 0,
    timeoutMs: 600000
  });
  var state = {
    runId: 'comfy-florence-live-' + Date.now(),
    projectId: 'gamecastle-florence-live-smoke',
    slot: { slotId: 'semantic-review', semanticTags: [] },
    candidate: { path: imagePath }
  };
  var registered = await ports.registerDerivedCandidate(state);
  var review = await ports.review(Object.assign({}, state, {
    candidate: registered,
    source: { reviewPolicy: { requiredSemanticTags: [], minConfidence: 0.35 } }
  }));
  if (review.reviewer !== 'florence2-semantic-review') {
    throw new Error('Florence semantic review did not return its typed receipt: ' + JSON.stringify({
      pass: review.pass,
      repairable: review.repairable,
      issues: review.issues,
      reviewer: review.reviewer,
      providerReceipt: review.providerReceipt || null
    }));
  }
  assert.equal(review.reviewer, 'florence2-semantic-review');
  assert.equal(review.pass, true);
  assert(review.providerReceipt && review.providerReceipt.provenance);
  process.stdout.write('[ComfyUIFlorenceLiveSmoke] ' + JSON.stringify({
    pass: review.pass,
    reviewer: review.reviewer,
    workflowId: review.providerReceipt.provenance.workflowId,
    modelId: review.providerReceipt.provenance.modelId,
    jobId: review.providerReceipt.provenance.jobId
  }) + '\n');
})().catch(function(error) { console.error('[ComfyUIFlorenceLiveSmoke] ' + error.message); process.exit(1); });
