var assert = require('assert');
var crypto = require('crypto');
var fs = require('fs');
var os = require('os');
var path = require('path');
var png = require('../../ai/local-derivation-port');
var rembg = require('../../ai/rembg-background-removal');

(async function() {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-rembg-check-'));
  try {
    var python = path.join(root, 'python.exe'), entrypoint = path.join(root, 'rembg-remove.py'), model = path.join(root, 'model.onnx');
    fs.writeFileSync(python, 'test'); fs.writeFileSync(entrypoint, 'test'); fs.writeFileSync(model, 'pinned-model');
    var source = { width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4) }; source.data.fill(255);
    var remover = rembg.createRembgBackgroundRemoval({ root: root, python: python, entrypoint: entrypoint, modelFile: model, modelSha256: crypto.createHash('sha256').update('pinned-model').digest('hex'), execute: async function(_python, args) { var output = { width: 8, height: 8, data: new Uint8ClampedArray(source.data) }; for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) if (x < 2 || x > 5 || y < 2 || y > 5) output.data[(y * 8 + x) * 4 + 3] = 0; fs.writeFileSync(args[args.indexOf('--output') + 1], png.encodePng(output)); } });
    var result = await remover.remove(source, { parentRevisionId: 'master.test' });
    assert.strictEqual(result.owner, 'RembgBackgroundRemoval'); assert.strictEqual(result.op, 'remove_background_birefnet'); assert.strictEqual(result.parentRevisionId, 'master.test'); assert(result.alpha.transparentRatio >= 0.7); assert(result.alpha.visibleRatio > 0);
    fs.writeFileSync(model, 'wrong-model'); await assert.rejects(function() { return rembg.createRembgBackgroundRemoval({ root: root, python: python, entrypoint: entrypoint, modelFile: model, modelSha256: '0'.repeat(64), execute: async function() {} }).remove(source); }, function(error) { return error.code === 'REMBG_MODEL_HASH_MISMATCH'; });
    console.log('[RembgBackgroundRemoval] pinned model verification, isolated execution, alpha validation, and receipts passed');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
})().catch(function(error) { console.error(error); process.exit(1); });
