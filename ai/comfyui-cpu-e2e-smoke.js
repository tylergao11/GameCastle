/* Explicit CPU shadow E2E: invokes real local ComfyUI only and never represents GPU production evidence. */
var child = require('child_process');
var fs = require('fs');
var path = require('path');

function required(name) { if (!process.env[name]) throw new Error('CPU E2E smoke requires ' + name + '.'); }
function run(script, label) {
  var startedAt = new Date().toISOString(), result = child.spawnSync(process.execPath, [path.join(__dirname, script)], { cwd: path.resolve(__dirname, '..'), env: process.env, encoding: 'utf8', timeout: Number(process.env.COMFYUI_CPU_E2E_TIMEOUT_MS || 1800000) });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(label + ' failed (exit ' + result.status + '): ' + String(result.stderr || result.stdout || '').slice(-1000));
  return { name: label, startedAt: startedAt, finishedAt: new Date().toISOString(), status: 'passed' };
}
function writeReport(report) {
  var target = process.env.COMFYUI_CPU_E2E_REPORT;
  if (target) { fs.mkdirSync(path.dirname(path.resolve(target)), { recursive: true }); fs.writeFileSync(target, JSON.stringify(report, null, 2)); }
  process.stdout.write('[ComfyUICpuE2E] ' + JSON.stringify(report) + '\n');
}
try {
  ['ASSET_MODEL_PROVIDER', 'COMFYUI_ALLOW_LOCAL', 'COMFYUI_ENDPOINT', 'COMFYUI_MODEL_PATH', 'COMFYUI_MODEL_SHA256', 'COMFYUI_FLORENCE2_MODEL_PATH', 'COMFYUI_FLORENCE2_MODEL_SHA256', 'COMFYUI_ROOT'].forEach(required);
  if (process.env.ASSET_MODEL_PROVIDER !== 'comfyui-local' || process.env.COMFYUI_ALLOW_LOCAL !== 'true') throw new Error('CPU E2E smoke requires explicit comfyui-local authorization.');
  var report = { schemaVersion: 1, kind: 'local-comfyui-cpu-shadow-e2e', productionEvidence: false, gpuEvidence: false, observedAt: new Date().toISOString(), stages: [run('comfyui-local-live-smoke.js', 'Stage A real generation/acceptance/revision/binding'), run('comfyui-stage-b-live-smoke.js', 'Stage B real parent/edit/review/child-revision/binding')] };
  writeReport(report);
} catch (error) { console.error('[ComfyUICpuE2E] ' + error.message); process.exit(1); }
