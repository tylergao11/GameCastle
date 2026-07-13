/* Real loopback smoke for the registered Florence referring-expression mask path. */
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var runtimeModule = require('./provider-runtime');
var comfy = require('./comfyui-local-provider');
var png = require('./local-derivation-port');

var imagePath = process.argv[2] && path.resolve(process.argv[2]);
var subjectText = process.argv[3] || 'face';
if (!imagePath || !fs.existsSync(imagePath)) throw new Error('Usage: node ai/comfyui-florence-segment-live-smoke.js <png-path> [subject-text]');
['COMFYUI_ENDPOINT', 'COMFYUI_ALLOW_LOCAL', 'COMFYUI_FLORENCE2_MODEL_PATH', 'COMFYUI_FLORENCE2_MODEL_SHA256'].forEach(function(name) {
  if (!process.env[name]) throw new Error('Florence segmentation live smoke requires ' + name + '.');
});
if (process.env.COMFYUI_ALLOW_LOCAL !== 'true') throw new Error('Florence segmentation live smoke requires COMFYUI_ALLOW_LOCAL=true.');

(async function() {
  var runtime = runtimeModule.createProviderRuntime({ maxCost: 2 });
  var ports = comfy.createAssetProviderPorts(runtime, { provider: 'comfyui-local', estimatedCost: 0, timeoutMs: 600000 });
  var state = { runId: 'comfy-florence-segment-live-' + Date.now(), projectId: 'gamecastle-florence-segment-live-smoke', slot: { slotId: 'subject-segment', semanticTags: [subjectText] }, candidate: { path: imagePath } };
  var registered = await ports.registerDerivedCandidate(state), output = await ports.segment(Object.assign({}, state, { candidate: registered }));
  var record = comfy._findBlob(output.assetBlobRef), raster = png.decodePng(fs.readFileSync(record.path)), alpha = [];
  for (var index = 0; index < raster.width * raster.height; index++) alpha.push(raster.data[index * 4 + 3]);
  assert(alpha.some(function(value) { return value < 128; }), 'segmentation output must preserve unselected pixels as transparent');
  assert(alpha.some(function(value) { return value >= 128; }), 'segmentation output must preserve a selected subject');
  process.stdout.write('[ComfyUIFlorenceSegmentLiveSmoke] ' + JSON.stringify({ width: raster.width, height: raster.height, subjectText: subjectText, workflowId: 'gamecastle.florence2.segment.cpu.v1' }) + '\n');
})().catch(function(error) { console.error('[ComfyUIFlorenceSegmentLiveSmoke] ' + error.message); process.exit(1); });
