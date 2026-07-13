var assert = require('assert');
var child = require('child_process');
var path = require('path');
var result = child.spawnSync(process.execPath, [path.join(__dirname, 'comfyui-cpu-e2e-smoke.js')], { cwd: path.resolve(__dirname, '..'), env: {}, encoding: 'utf8' });
assert.notEqual(result.status, 0); assert.match(result.stderr, /CPU E2E smoke requires ASSET_MODEL_PROVIDER/);
console.log('[ComfyUICpuE2E] explicit authorization and real local model paths are required; regular tests cannot start ComfyUI');
