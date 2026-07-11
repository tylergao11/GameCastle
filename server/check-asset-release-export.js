var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var artifactStoreModule = require('./local-runtime/artifact-store');
var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-asset-release-'));
var output = path.join(root, 'output');
var releases = path.join(root, 'releases');
try {
  fs.mkdirSync(path.join(output, 'assets', 'local'), { recursive: true });
  fs.writeFileSync(path.join(output, 'game.html'), '<script src="asset-runtime.js"></script>');
  fs.writeFileSync(path.join(output, 'project.json'), '{}');
  fs.writeFileSync(path.join(output, 'project-world.json'), JSON.stringify({ worldVersion: 1, semanticHash: 'asset-export' }));
  fs.writeFileSync(path.join(output, 'execution-ledger.json'), JSON.stringify({ runs: [{ summary: { nextAction: 'done' } }] }));
  fs.writeFileSync(path.join(output, 'data.js'), 'gdjs.projectData = {};');
  fs.writeFileSync(path.join(output, 'asset-runtime.js'), 'window.assetRuntime = true;');
  fs.writeFileSync(path.join(output, 'asset-runtime-bindings.json'), JSON.stringify({ bindings: [] }));
  fs.writeFileSync(path.join(output, 'assets', 'local', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png'), Buffer.from([137,80,78,71,13,10,26,10]));
  fs.writeFileSync(path.join(output, 'html-export-manifest.json'), JSON.stringify({ schemaVersion: 1, target: 'html', scriptFiles: ['data.js', 'asset-runtime.js'], assetFiles: ['asset-runtime-bindings.json', 'assets/local/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png'] }));
  var store = artifactStoreModule.createArtifactStore({ outputDir: output, releasesDir: releases });
  var release = store.commitRelease('asset-release', null);
  assert.equal(release.semanticHash, 'asset-export');
  ['asset-runtime.js', 'asset-runtime-bindings.json', 'assets/local/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png'].forEach(function(file) { assert(fs.existsSync(path.join(releases, 'asset-release', file)), file + ' must enter immutable release'); });
  console.log('[AssetReleaseExport] binding manifest, overlay, and PNG enter immutable release');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
