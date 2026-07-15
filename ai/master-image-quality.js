var crypto = require('crypto');
var png = require('./local-derivation-port');

function hash(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function distance(red, green, blue, background) { return Math.sqrt((red - background[0]) ** 2 + (green - background[1]) ** 2 + (blue - background[2]) ** 2); }
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'MasterImageQuality'; throw error; }

function borderSamples(raster) {
  var samples = [], width = raster.width, height = raster.height, data = raster.data;
  function push(x, y) { var at = (y * width + x) * 4; samples.push([data[at], data[at + 1], data[at + 2]]); }
  for (var x = 0; x < width; x++) { push(x, 0); if (height > 1) push(x, height - 1); }
  for (var y = 1; y + 1 < height; y++) { push(0, y); if (width > 1) push(width - 1, y); }
  return samples;
}
function background(samples) { var total = samples.reduce(function(sum, value) { sum[0] += value[0]; sum[1] += value[1]; sum[2] += value[2]; return sum; }, [0, 0, 0]); return total.map(function(value) { return value / samples.length; }); }
function componentAreas(mask, width, height) {
  var visited = new Uint8Array(mask.length), areas = [], queue = new Int32Array(mask.length);
  for (var start = 0; start < mask.length; start++) {
    if (!mask[start] || visited[start]) continue;
    var head = 0, tail = 0, area = 0; queue[tail++] = start; visited[start] = 1;
    while (head < tail) {
      var current = queue[head++], x = current % width, y = Math.floor(current / width); area += 1;
      var neighbors = [x > 0 ? current - 1 : -1, x + 1 < width ? current + 1 : -1, y > 0 ? current - width : -1, y + 1 < height ? current + width : -1];
      for (var index = 0; index < neighbors.length; index++) { var next = neighbors[index]; if (next >= 0 && mask[next] && !visited[next]) { visited[next] = 1; queue[tail++] = next; } }
    }
    areas.push(area);
  }
  return areas.sort(function(left, right) { return right - left; });
}
function analyze(bytes, profile) {
  profile = profile || {}; var raster = png.decodePng(bytes), samples = borderSamples(raster), bg = background(samples), borderDeviation = samples.reduce(function(sum, value) { return sum + distance(value[0], value[1], value[2], bg); }, 0) / samples.length;
  var mask = new Uint8Array(raster.width * raster.height), visible = 0, sumX = 0, sumY = 0, data = raster.data;
  for (var y = 0; y < raster.height; y++) for (var x = 0; x < raster.width; x++) { var pixel = y * raster.width + x, at = pixel * 4, foreground = data[at + 3] > 16 && distance(data[at], data[at + 1], data[at + 2], bg) > 52; if (foreground) { mask[pixel] = 1; visible += 1; sumX += x; sumY += y; } }
  var total = raster.width * raster.height, coverage = visible / total, areas = componentAreas(mask, raster.width, raster.height), significantFloor = Math.max(4, Math.round(total * 0.002)), significantComponents = areas.filter(function(area) { return area >= significantFloor; }).length;
  var centerDistance = visible ? Math.sqrt(((sumX / visible) / Math.max(1, raster.width - 1) - 0.5) ** 2 + ((sumY / visible) / Math.max(1, raster.height - 1) - 0.5) ** 2) : 1;
  var isolated = coverage >= 0.015 && coverage <= 0.82 && significantComponents >= 1 && significantComponents <= 6 && centerDistance <= 0.42 && borderDeviation <= 90;
  var pass = profile.transparent === true ? isolated : coverage > 0.01;
  var score = 100 - Math.abs(coverage - (profile.transparent === true ? 0.34 : 0.5)) * 80 - Math.max(0, significantComponents - 1) * 8 - centerDistance * 45 - borderDeviation * 0.18;
  return { pass: pass, score: Number(score.toFixed(6)), coverage: Number(coverage.toFixed(6)), significantComponents: significantComponents, centerDistance: Number(centerDistance.toFixed(6)), borderDeviation: Number(borderDeviation.toFixed(6)), sha256: hash(bytes) };
}
function select(candidates, profile) {
  if (!Array.isArray(candidates) || !candidates.length) fail('MASTER_IMAGE_CANDIDATES_MISSING', 'ComfyUI returned no master-image candidates.');
  var ranked = candidates.map(function(candidate, index) { return Object.assign({ index: index, candidate: candidate }, analyze(candidate.bytes, profile)); }).filter(function(item) { return item.pass; }).sort(function(left, right) { return right.score - left.score || left.sha256.localeCompare(right.sha256); });
  if (!ranked.length) fail('MASTER_IMAGE_QUALITY_REJECTED', 'No ComfyUI master-image candidate passed deterministic quality checks.');
  return ranked[0];
}

module.exports = { analyze: analyze, select: select };
