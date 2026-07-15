var assert = require('assert');
var derivation = require('../../ai/asset-derivation-pipeline');

function raster(width, height, alpha) {
  var value = { width: width, height: height, data: new Uint8ClampedArray(width * height * 4) };
  for (var pixel = 0; pixel < width * height; pixel++) { value.data[pixel * 4] = 80; value.data[pixel * 4 + 1] = 150; value.data[pixel * 4 + 2] = 210; value.data[pixel * 4 + 3] = alpha; }
  return value;
}
function setAlpha(value, x, y, alpha) { value.data[(y * value.width + x) * 4 + 3] = alpha; }

var contaminated = raster(32, 32, 255); setAlpha(contaminated, 0, 0, 0);
assert.throws(function() { derivation._validateFinalAlpha(contaminated, { stage: 'synthetic-final' }); }, function(error) { return error.code === 'ASSET_DERIVATION_ALPHA_INVALID' && error.diagnostics.rejectionReasons.some(function(reason) { return reason.code === 'FINAL_ALPHA_TRANSPARENCY_TOO_LOW'; }) && error.diagnostics.rejectionReasons.some(function(reason) { return reason.code === 'FINAL_ALPHA_OPAQUE_PERIMETER_TOO_HIGH'; }); });

var cutout = raster(32, 32, 0);
for (var y = 7; y < 27; y++) for (var x = 8; x < 24; x++) setAlpha(cutout, x, y, 255);
var profile = derivation._validateFinalAlpha(cutout, { stage: 'synthetic-final' });
assert(profile.transparentRatio > 0.5); assert(profile.visibleRatio > 0.2); assert.strictEqual(profile.opaquePerimeterRatio, 0);

var runtimeEdgeSprite = raster(16, 16, 255);
for (var edgeY = 0; edgeY < 16; edgeY++) { setAlpha(runtimeEdgeSprite, 0, edgeY, 0); setAlpha(runtimeEdgeSprite, 15, edgeY, 0); }
for (var edgeX = 0; edgeX < 16; edgeX++) { setAlpha(runtimeEdgeSprite, edgeX, 0, 0); if (edgeX % 4 === 0) setAlpha(runtimeEdgeSprite, edgeX, 15, 0); }
assert.doesNotThrow(function() { derivation._validateFinalAlpha(runtimeEdgeSprite, { stage: 'synthetic-runtime-edge' }); });
console.log('[AssetDerivationAlpha] opaque-background contamination rejected and valid centered/edge-touching runtime cutouts accepted');
