var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var repo = require('./asset-repository');

var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-project-asset-cache-'));
try {
  var source = path.join(root, 'input.png'); fs.writeFileSync(source, Buffer.from([137,80,78,71]));
  var library = repo.createAssetRepository(path.join(root, 'library'));
  var asset = library.importAsset(source, { bindings: ['asset.ui.custom'], semanticTags: ['hero'], styleId: 'gamecastle.style-dna.v1', styleTags: ['arcade'] });
  assert.equal(library.list().length, 1); assert.equal(library.importAsset(source).assetId, asset.assetId);
  var copy = library.materialize(asset.assetId, path.join(root, 'project-assets')); assert(copy.materialized && fs.existsSync(copy.path));
  assert.equal(library.publishAccepted, undefined); assert.equal(library.findExactForSpec, undefined);
  console.log('[AssetRepository] project-local cache import, hash dedupe, and materialization passed');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
