var assert = require('assert').strict;
var fs = require('fs');
var path = require('path');

var workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'gamecastle-gates.yml'), 'utf8');
['npm run check:wp2', 'npm run check:cloud-library', 'npm run check:comfyui-local', 'node ai/check-project-weave-runtime.js', 'npm run check:module-artifact', 'npm run artifact:modules', 'actions/upload-artifact@v4'].forEach(function(required) { assert(workflow.indexOf(required) >= 0, 'delivery workflow missing required gate: ' + required); });
assert(workflow.indexOf("github.event_name == 'push' && github.ref == 'refs/heads/main'") >= 0, 'GHCR publishing must be main-only');
assert(workflow.indexOf('packages: write') >= 0, 'GHCR publishing must have packages permission only in publishing job');
assert(workflow.indexOf('docker/build-push-action@v6') >= 0, 'delivery workflow must build immutable GHCR module artifact');
console.log('[DeliveryGate] CI contract, provenance, module artifact, and main-only GHCR release gates passed');
