/* Test-only deterministic port. It is deliberately not selectable by runtime
 * governance and exists only to exercise AssetEngine owner boundaries. */
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var png = require('./local-derivation-port');

function createTestAssetEnginePorts(options) {
  var outputDir = path.resolve(options.outputDir);
  return {
    generateMaster: async function(state) {
      var slot = state.slot || {};
      var width = Number(slot.generationWidth || (slot.constraints || {}).width || 96);
      var height = Number(slot.generationHeight || (slot.constraints || {}).height || 96);
      var raster = { width: width, height: height, data: new Uint8ClampedArray(width * height * 4) };
      for (var y = Math.floor(height * 0.2); y < Math.ceil(height * 0.8); y++) for (var x = Math.floor(width * 0.2); x < Math.ceil(width * 0.8); x++) { var pixel = (y * width + x) * 4; raster.data[pixel] = 238; raster.data[pixel + 1] = 73; raster.data[pixel + 2] = 58; raster.data[pixel + 3] = 255; }
      var bytes = png.encodePng(raster), sha256 = crypto.createHash('sha256').update(bytes).digest('hex'), file = path.join(outputDir, sha256.slice(0, 16) + '.png');
      fs.mkdirSync(outputDir, { recursive: true }); fs.writeFileSync(file, bytes);
      return { assetId: 'test-master.' + sha256.slice(0, 16), revisionId: 'master-image.' + sha256, sha256: sha256, path: file, format: 'png', width: width, height: height, transparent: true, semanticTags: (slot.semanticTags || []).slice(), styleTags: (slot.styleTags || []).slice(), styleId: slot.styleId || 'gamecastle.style-dna.v1', status: 'master', provenance: 'test-only-master-provider', providerReceipt: { receiptId: 'test-provider.' + sha256.slice(0, 24) }, publishability: { playable: false, publishable: false, blocksFinalExport: true } };
    },
    materializeCandidate: async function(state) { return state.candidate; }
  };
}

module.exports = { createTestAssetEnginePorts: createTestAssetEnginePorts };
