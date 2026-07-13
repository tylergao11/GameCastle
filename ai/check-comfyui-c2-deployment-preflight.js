var assert = require('assert');
var child = require('child_process');
var path = require('path');
var result = child.spawnSync(process.execPath, [path.join(__dirname, 'comfyui-c2-deployment-preflight.js')], { encoding: 'utf8', env: {} });
assert.notEqual(result.status, 0); assert.match(result.stderr, /NVIDIA_SMI_UNAVAILABLE/);
console.log('[ComfyUIC2Preflight] non-GPU hosts fail closed before any approval or deployment mutation');
