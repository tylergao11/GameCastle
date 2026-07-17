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
function meanChroma(data, mask, width, height) {
  var sum = 0, count = 0;
  for (var pixel = 0; pixel < mask.length; pixel++) {
    if (!mask[pixel]) continue;
    var at = pixel * 4, red = data[at], green = data[at + 1], blue = data[at + 2];
    sum += Math.max(red, green, blue) - Math.min(red, green, blue);
    count += 1;
  }
  return count ? sum / count : 0;
}

function analyze(bytes, profile) {
  profile = profile || {}; var raster = png.decodePng(bytes), samples = borderSamples(raster), bg = background(samples), borderDeviation = samples.reduce(function(sum, value) { return sum + distance(value[0], value[1], value[2], bg); }, 0) / samples.length;
  var mask = new Uint8Array(raster.width * raster.height), visible = 0, sumX = 0, sumY = 0, data = raster.data;
  for (var y = 0; y < raster.height; y++) for (var x = 0; x < raster.width; x++) { var pixel = y * raster.width + x, at = pixel * 4, foreground = data[at + 3] > 16 && distance(data[at], data[at + 1], data[at + 2], bg) > 52; if (foreground) { mask[pixel] = 1; visible += 1; sumX += x; sumY += y; } }
  var total = raster.width * raster.height, coverage = visible / total, areas = componentAreas(mask, raster.width, raster.height), significantFloor = Math.max(4, Math.round(total * 0.002)), significantComponents = areas.filter(function(area) { return area >= significantFloor; }).length;
  var centerDistance = visible ? Math.sqrt(((sumX / visible) / Math.max(1, raster.width - 1) - 0.5) ** 2 + ((sumY / visible) / Math.max(1, raster.height - 1) - 0.5) ** 2) : 1;
  var chroma = meanChroma(data, mask, raster.width, raster.height);
  var pass = coverage >= 0.005;
  // Prefer single centered subject, uniform removable background, colorful flat fills,
  // and coverage near a sprite-friendly fraction. Gray sketch masters rank down hard.
  var score = 100
    - Math.abs(coverage - (profile.transparent === true ? 0.34 : 0.5)) * 80
    - Math.max(0, significantComponents - 1) * 14
    - centerDistance * 50
    - borderDeviation * 0.24
    + Math.min(40, chroma * 0.35);
  return { pass: pass, score: Number(score.toFixed(6)), coverage: Number(coverage.toFixed(6)), significantComponents: significantComponents, centerDistance: Number(centerDistance.toFixed(6)), borderDeviation: Number(borderDeviation.toFixed(6)), meanChroma: Number(chroma.toFixed(6)), sha256: hash(bytes) };
}
function select(candidates, profile, semanticReviews) {
  if (!Array.isArray(candidates) || !candidates.length) fail('MASTER_IMAGE_CANDIDATES_MISSING', 'ComfyUI returned no master-image candidates.');
  if (!Array.isArray(semanticReviews) || semanticReviews.length !== candidates.length) fail('MASTER_IMAGE_SEMANTIC_REVIEW_MISSING', 'Every master-image candidate requires semantic review.');
  var threshold = require('../contracts/asset-semantic-review-contract.json').thresholds.candidateSemanticMargin;
  var reports = candidates.map(function(candidate, index) {
    var semantic = semanticReviews[index], checks = semantic.compositionChecks || [], compositionMargin = checks.length ? Math.min.apply(null, checks.map(function(check) { return check.margin; })) : Infinity, structural = analyze(candidate.bytes, profile), reasons = [];
    if (!structural.pass) reasons.push({ code: 'MASTER_IMAGE_CONTENT_EMPTY', actual: structural.coverage, requiredMinimum: 0.005 });
    // Character masters must keep a clear removable background and one silhouette.
    // Gray-filled turnarounds read as one huge component (~full coverage) and must fail.
    var multiFigureFamilies = { character: true, 'character-animation': true, 'character-part': true };
    var colorfulFamilies = { character: true, 'character-animation': true, 'character-part': true, prop: true, effect: true, 'effect-animation': true, ui: true };
    if (multiFigureFamilies[profile.productionFamily]) {
      // Allow a couple of disconnected accessory masses (hat/weapon). True turnaround
      // sheets and multi-pose grids land at 4+ significant components.
      if (structural.significantComponents >= 4) {
        reasons.push({ code: 'MASTER_IMAGE_MULTI_FIGURE', actual: structural.significantComponents, requiredMaximum: 3 });
      }
      // Near-full-frame masters (turnarounds, edge-to-edge fills) lack a removable bg.
      // Soft threshold 0.88 keeps large blob subjects that still leave corner margins.
      if (profile.transparent === true && structural.coverage > 0.88) {
        reasons.push({ code: 'MASTER_IMAGE_NO_CLEAR_BACKGROUND', actual: structural.coverage, requiredMaximum: 0.88 });
      }
    }
    // GameCastle Style DNA is full-color raster-toon. Reject near-monochrome sketch masters.
    if (colorfulFamilies[profile.productionFamily] && structural.meanChroma < 18) {
      reasons.push({ code: 'MASTER_IMAGE_TOO_GRAY', actual: structural.meanChroma, requiredMinimum: 18 });
    }
    if (semantic.semanticMargin < threshold) reasons.push({ code: 'MASTER_IMAGE_SEMANTIC_REJECTED', actual: semantic.semanticMargin, requiredMinimum: threshold });
    checks.forEach(function(check) { if (check.margin < threshold) reasons.push({ code: 'MASTER_IMAGE_COMPOSITION_REJECTED', checkId: check.id, actual: check.margin, requiredMinimum: threshold }); });
    // Style margin is a weak absolute gate at master phase, but among eligible candidates
    // it should rank stronger so raster-toon language wins over photographic clutter.
    var score = structural.score
      + semantic.semanticMargin * 260
      + semantic.styleMargin * 200
      + (Number.isFinite(compositionMargin) ? compositionMargin * 240 : 0);
    return Object.assign({ index: index, candidate: candidate, semanticReview: semantic, compositionMargin: compositionMargin, eligible: reasons.length === 0, rejectionReasons: reasons }, structural, { score: score });
  });
  var ranked = reports.filter(function(item) { return item.eligible; }).sort(function(left, right) { return right.score - left.score || left.sha256.localeCompare(right.sha256); });
  if (!ranked.length) { var error = new Error('No master-image candidate passed: ' + reports.map(function(report) { return '#' + report.index + ' ' + report.rejectionReasons.map(function(reason) { return reason.code + (reason.checkId ? ':' + reason.checkId : ''); }).join('|'); }).join(', ') + '.'); error.code = 'MASTER_IMAGE_QUALITY_REJECTED'; error.owner = 'MasterImageQuality'; error.diagnostics = reports.map(function(report) { return { index: report.index, sha256: report.sha256, coverage: report.coverage, significantComponents: report.significantComponents, centerDistance: report.centerDistance, borderDeviation: report.borderDeviation, semanticMargin: report.semanticReview.semanticMargin, styleMargin: report.semanticReview.styleMargin, compositionChecks: report.semanticReview.compositionChecks || [], rejectionReasons: report.rejectionReasons }; }); throw error; }
  ranked[0].candidateDiagnostics = reports.map(function(report) { return { index: report.index, sha256: report.sha256, eligible: report.eligible, score: report.score, coverage: report.coverage, significantComponents: report.significantComponents, centerDistance: report.centerDistance, borderDeviation: report.borderDeviation, semanticMargin: report.semanticReview.semanticMargin, styleMargin: report.semanticReview.styleMargin, compositionChecks: report.semanticReview.compositionChecks || [], rejectionReasons: report.rejectionReasons }; });
  return ranked[0];
}

module.exports = { analyze: analyze, select: select };
