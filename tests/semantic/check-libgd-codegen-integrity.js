'use strict';

var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var runtimeCodegen = require('../../packages/gdjs/src/runtime-codegen');
var binaryContract = require('../../packages/gdjs/contracts/gdevelop-codegen-binary-contract.json');

var resolved = runtimeCodegen.resolveLibGdPath();
assert.strictEqual(path.basename(resolved), 'libGD.js');
assert.doesNotThrow(function() { runtimeCodegen.assertPinnedLibGd(resolved); });

var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-libgd-integrity-'));
try {
  var fake = path.join(root, 'libGD.js');
  fs.writeFileSync(fake, 'forged-libgd');
  fs.writeFileSync(path.join(root, 'libGD.wasm'), 'forged-wasm');
  assert.throws(function() { runtimeCodegen.assertPinnedLibGd(fake); }, function(error) {
    return error.code === 'GDEVELOP_CODEGEN_HASH_MISMATCH';
  }, 'A caller-supplied libGD path must not bypass the pinned binary hashes.');

  var originalJsHash = binaryContract.files['libGD.js'];
  binaryContract.files['libGD.js'] = 'not-a-sha256';
  assert.throws(function() { runtimeCodegen.assertPinnedLibGd(resolved); }, function(error) {
    return error.code === 'GDEVELOP_CODEGEN_CONTRACT_INVALID';
  }, 'A malformed checked-in binary contract must fail before a compiler is used.');
  binaryContract.files['libGD.js'] = originalJsHash;
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log('[LibGDCodegenIntegrity] runtime and explicit overrides require the pinned JS/WASM hash pair');
