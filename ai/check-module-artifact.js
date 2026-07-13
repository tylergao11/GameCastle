var assert = require('assert').strict;
var child = require('child_process');
var fs = require('fs');
var os = require('os');
var path = require('path');

var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-module-artifact-'));
try {
  child.execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'build-module-artifact.js'), '--out', root], { stdio: 'pipe' });
  var artifact = JSON.parse(fs.readFileSync(path.join(root, 'module-catalog.json'), 'utf8'));
  assert.equal(artifact.modules.length, 6, 'only internally authorized modules may enter a publishable artifact');
  assert.equal(artifact.unpublishedModules.length, 8, 'unreceipted catalog modules must be explicitly excluded');
  assert(artifact.modules.every(function(item) { return item.manifestSha256.length === 64 && item.originReceipt.authorization === 'internal-original-module'; }));
  assert(artifact.unpublishedModules.every(function(item) { return item.reason === 'origin-receipt-missing'; }));
  assert.equal(fs.readFileSync(path.join(root, 'module-catalog.sha256'), 'utf8').slice(0, 64), artifact.artifactSha256);
  console.log('[ModuleArtifact] authorized publishing boundary, exclusion ledger, and artifact hash passed');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
