var assert = require('assert');
var exporter = require('./html-exporter');
var manifest = exporter.buildHtmlExportManifest({ objects: [], layouts: [] }, { codeFiles: [], hasAssetRuntime: true, assetFiles: ['asset-runtime-bindings.json', 'assets/local/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png', 'assets/generated/simulated-0123456789abcdef.png'] });
assert(manifest.scriptFiles.indexOf('asset-runtime.js') >= 0);
assert(manifest.assetFiles.indexOf('asset-runtime-bindings.json') >= 0);
assert(manifest.assetFiles.some(function(file) { return file.indexOf('assets/local/') === 0; }));
assert(manifest.assetFiles.some(function(file) { return file.indexOf('assets/generated/') === 0; }));
console.log('[AssetExportManifest] runtime binding and PNG files are exportable');
