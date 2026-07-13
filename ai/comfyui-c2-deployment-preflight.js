/* Explicit C-2 GPU-host preflight. It gathers facts only; it cannot approve or deploy a Worker. */
var child = require('child_process');
var crypto = require('crypto');
var fs = require('fs');

function required(name) { var value = process.env[name]; if (!value) throw new Error(name + ' is required on the controlled GPU host'); return value; }
function sha256File(file, label) { if (!fs.existsSync(file)) throw new Error(label + ' does not exist: ' + file); return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function gpu() {
  var output;
  try { output = child.execFileSync('nvidia-smi', ['--query-gpu=name,memory.total,driver_version', '--format=csv,noheader,nounits'], { encoding: 'utf8', timeout: 10000 }).trim(); } catch (_error) { throw new Error('NVIDIA_SMI_UNAVAILABLE: run this only on the controlled NVIDIA Worker host'); }
  var lines = output.split(/\r?\n/).filter(Boolean); if (lines.length !== 1) throw new Error('C-2 requires exactly one GPU for the first controlled Worker deployment');
  var fields = lines[0].split(',').map(function(value) { return value.trim(); }), vramMiB = Number(fields[1]);
  if (!fields[0] || !Number.isFinite(vramMiB) || vramMiB < 16384 || !fields[2]) throw new Error('C-2 requires a named NVIDIA GPU with at least 16384 MiB VRAM and a driver version');
  return { gpuName: fields[0], vramMiB: vramMiB, driverVersion: fields[2] };
}
function main() {
  var hardware = gpu(), workflow = required('COMFYUI_C2_WORKFLOW_FILE'), model = required('COMFYUI_C2_MODEL_FILE'), sbom = required('COMFYUI_C2_SBOM_FILE');
  var imageRepository = required('COMFYUI_C2_IMAGE_REPOSITORY'), imageDigest = required('COMFYUI_C2_IMAGE_DIGEST');
  if (!/^sha256:[a-f0-9]{64}$/.test(imageDigest) || /^sha256:0{64}$/.test(imageDigest)) throw new Error('COMFYUI_C2_IMAGE_DIGEST must be a non-zero sha256 digest');
  var result = { schemaVersion: 1, source: 'controlled-gpu-host-preflight', observedAt: new Date().toISOString(), executionImage: { repository: imageRepository, digest: imageDigest, sbomSha256: sha256File(sbom, 'SBOM') }, model: { path: model, sha256: sha256File(model, 'model') }, workflow: { path: workflow, sha256: sha256File(workflow, 'workflow') }, hardware: hardware, cudaVersion: required('COMFYUI_C2_CUDA_VERSION'), upstreamRevision: required('COMFYUI_C2_UPSTREAM_REVISION') };
  if (!/^[a-f0-9]{40,64}$/.test(result.upstreamRevision)) throw new Error('COMFYUI_C2_UPSTREAM_REVISION must be a pinned commit hash');
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
if (require.main === module) main();
module.exports = { gpu: gpu, main: main };
