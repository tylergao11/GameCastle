var assert = require('assert');
var quality = require('./master-image-quality');
var png = require('./local-derivation-port');

function raster(width, height, color) { var data = new Uint8ClampedArray(width * height * 4); for (var pixel = 0; pixel < width * height; pixel++) { data[pixel * 4] = color[0]; data[pixel * 4 + 1] = color[1]; data[pixel * 4 + 2] = color[2]; data[pixel * 4 + 3] = 255; } return { width: width, height: height, data: data }; }
function paint(value, left, top, right, bottom, color) { for (var y = top; y < bottom; y++) for (var x = left; x < right; x++) { var at = (y * value.width + x) * 4; value.data[at] = color[0]; value.data[at + 1] = color[1]; value.data[at + 2] = color[2]; } return value; }

var isolated = png.encodePng(paint(raster(32, 32, [248, 248, 248]), 9, 8, 23, 24, [40, 120, 235]));
var pattern = raster(32, 32, [248, 248, 248]); for (var y = 0; y < 32; y += 2) for (var x = 0; x < 32; x += 2) paint(pattern, x, y, x + 1, y + 1, [40, 120, 235]); pattern = png.encodePng(pattern);
var good = quality.analyze(isolated, { transparent: true, productionFamily: 'prop' }), bad = quality.analyze(pattern, { transparent: true, productionFamily: 'prop' });
assert.strictEqual(good.pass, true, JSON.stringify(good));
assert.strictEqual(bad.pass, false, JSON.stringify(bad));
assert.strictEqual(quality.select([{ bytes: pattern }, { bytes: isolated }], { transparent: true, productionFamily: 'prop' }).index, 1);
assert.throws(function() { quality.select([{ bytes: pattern }], { transparent: true, productionFamily: 'prop' }); }, function(error) { return error.code === 'MASTER_IMAGE_QUALITY_REJECTED'; });
console.log('[MasterImageQuality] isolated-subject selection and pattern rejection passed');
