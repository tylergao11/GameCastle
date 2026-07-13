var assert = require('assert');
var fs = require('fs');
var http = require('http');
var os = require('os');
var path = require('path');
var runtimeModule = require('./local-runtime');

function port() { return new Promise(function(resolve) { var probe = http.createServer(); probe.listen(0, '127.0.0.1', function() { var value = probe.address().port; probe.close(function() { resolve(value); }); }); }); }
(async function() {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-local-asset-input-http-')), selectedPort = await port();
  var runtime = runtimeModule.createRuntime({ root: root, outputDir: path.join(root, 'output'), dataDir: path.join(root, '.data'), allowedUiOrigin: 'http://127.0.0.1:5173', runner: { start: function() { throw new Error('runner must not start'); } } });
  await new Promise(function(resolve) { runtime.server.listen(selectedPort, '127.0.0.1', resolve); });
  try {
    var png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLw0QAAAABJRU5ErkJggg==';
    var response = await fetch('http://127.0.0.1:' + selectedPort + '/api/runtime/assets/inputs', { method: 'POST', headers: { Origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: 'project-one', slotId: 'hero', asset: { png: png } }) });
    assert.equal(response.status, 201); var body = await response.json(); assert.equal(body.input.slotId, 'hero'); assert.equal(body.input.immutable, true); assert(fs.existsSync(body.input.path));
    var retiredBinding = await fetch('http://127.0.0.1:' + selectedPort + '/api/runtime/assets/bindings', { method: 'POST', headers: { Origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/json' }, body: '{}' });
    var retiredCloudResolve = await fetch('http://127.0.0.1:' + selectedPort + '/api/runtime/assets/cloud/resolve', { method: 'POST', headers: { Origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(retiredBinding.status, 404, 'direct runtime binding endpoint must be deleted'); assert.equal(retiredCloudResolve.status, 404, 'single-slot cloud resolve endpoint must be deleted');
    var rejected = await fetch('http://127.0.0.1:' + selectedPort + '/api/runtime/assets/inputs', { method: 'POST', headers: { Origin: 'http://evil.invalid', 'Content-Type': 'application/json' }, body: '{}' }); assert.equal(rejected.status, 403);
    console.log('[LocalAssetInputHttp] immutable input ingestion is separate from production-set acceptance and runtime binding');
  } finally { await new Promise(function(resolve) { runtime.server.close(resolve); }); fs.rmSync(root, { recursive: true, force: true }); }
})().catch(function(error) { console.error(error); process.exit(1); });
