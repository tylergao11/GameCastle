/**
 * Production-set style cohesion and deterministic palette structure gates.
 * Complements per-asset CLIP styleMargin, which alone cannot prove family cohesion.
 */
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var sharp = require('sharp');
var styleDNA = require('./style-dna');
var frameSet = require('./frame-set');

var SPRITE_FAMILIES = {
  character: true,
  'character-part': true,
  'character-animation': true,
  prop: true,
  effect: true,
  'effect-animation': true,
  ui: true
};
var SCENE_FAMILIES = {
  background: true,
  'world-geometry': true
};

function fail(code, message) {
  var error = new Error(message);
  error.code = code;
  error.owner = 'StyleCohesion';
  throw error;
}

function sha256(value) {
  return crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value : Buffer.from(String(value))).digest('hex');
}

function cohesionPolicy(styleId) {
  var style = styleDNA.style(styleId);
  var prompt = style.promptContract || {};
  var policy = style.cohesionPolicy || {};
  var maxColorFamilies = Number(policy.maxColorFamilies || prompt.maxLocalColorFamilies || 5);
  return {
    maxColorFamilies: maxColorFamilies,
    // Soft SDXL anti-alias creates many fringe bins. Gate on concentration of the top-K bins
    // and a ceiling on major (mass-significant) families, not raw 90% coverage bin count.
    maxDominantColorFamilies: Number(policy.maxDominantColorFamilies || Math.max(10, maxColorFamilies * 2)),
    structureTopK: Number(policy.structureTopK || 8),
    // Soft SDXL toon ramps are intentionally not ultra-concentrated; only extreme
    // diffusion fails. Full-frame photo-like spreads use opaque+major-family gates.
    minTopKCoverage: policy.minTopKCoverage === undefined ? 0.55 : Number(policy.minTopKCoverage),
    majorMass: policy.majorMass === undefined ? 0.05 : Number(policy.majorMass),
    maxMajorColorFamilies: Number(policy.maxMajorColorFamilies || Math.max(8, maxColorFamilies + 3)),
    dominantCoverage: policy.dominantCoverage === undefined ? 0.9 : Number(policy.dominantCoverage),
    significantMass: policy.significantMass === undefined ? 0.03 : Number(policy.significantMass),
    minPairwisePaletteSimilarity: policy.minPairwisePaletteSimilarity === undefined ? 0.28 : Number(policy.minPairwisePaletteSimilarity),
    minAssetsForPairwise: Number(policy.minAssetsForPairwise || 2),
    minOpaquePixelRatio: policy.minOpaquePixelRatio === undefined ? 0.02 : Number(policy.minOpaquePixelRatio),
    maxOpaquePixelRatio: policy.maxOpaquePixelRatio === undefined ? 0.98 : Number(policy.maxOpaquePixelRatio),
    histogramBins: Number(policy.histogramBins || 6)
  };
}

function familyGroup(productionFamily) {
  if (SPRITE_FAMILIES[productionFamily]) return 'sprite';
  if (SCENE_FAMILIES[productionFamily]) return 'scene';
  return 'other';
}

function quantize(value, bins) {
  return Math.min(bins - 1, Math.max(0, Math.floor((value / 256) * bins)));
}

function analyzeRgba(width, height, data, styleId) {
  var policy = cohesionPolicy(styleId);
  var bins = policy.histogramBins;
  var histogram = new Float64Array(bins * bins * bins);
  var opaque = 0;
  var darkEdge = 0;
  var edgeSamples = 0;
  var total = width * height;
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      var i = (y * width + x) * 4;
      var a = data[i + 3];
      if (a < 16) continue;
      opaque++;
      var r = data[i];
      var g = data[i + 1];
      var b = data[i + 2];
      var qi = quantize(r, bins) * bins * bins + quantize(g, bins) * bins + quantize(b, bins);
      histogram[qi] += a / 255;
      var edge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      if (!edge) {
        for (var dy = -1; dy <= 1 && !edge; dy++) {
          for (var dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            var nx = x + dx;
            var ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height || data[(ny * width + nx) * 4 + 3] < 16) {
              edge = true;
            }
          }
        }
      }
      if (edge) {
        edgeSamples++;
        if ((r + g + b) / 3 < 72) darkEdge++;
      }
    }
  }
  var sum = 0;
  for (var h = 0; h < histogram.length; h++) sum += histogram[h];
  if (sum > 0) for (var n = 0; n < histogram.length; n++) histogram[n] /= sum;
  // Significant bins: intentional ramps + soft-edge bleed.
  // Major bins: mass >= majorMass (true local fills, not AA fringe).
  // topKCoverage: concentration of the strongest K bins (photo noise is diffuse).
  var significantMass = policy.significantMass;
  var majorMass = policy.majorMass;
  var families = 0;
  var majorFamilies = 0;
  var massList = [];
  for (var f = 0; f < histogram.length; f++) {
    if (histogram[f] >= significantMass) families++;
    if (histogram[f] >= majorMass) majorFamilies++;
    if (histogram[f] > 0) massList.push(histogram[f]);
  }
  massList.sort(function(left, right) { return right - left; });
  var coverageTarget = policy.dominantCoverage;
  var covered = 0;
  var dominantFamilies = 0;
  for (var d = 0; d < massList.length; d++) {
    covered += massList[d];
    dominantFamilies += 1;
    if (covered >= coverageTarget) break;
  }
  var topK = Math.max(1, policy.structureTopK || 8);
  var topKCoverage = 0;
  for (var t = 0; t < Math.min(topK, massList.length); t++) topKCoverage += massList[t];
  return {
    width: width,
    height: height,
    opaquePixels: opaque,
    opaqueRatio: total ? opaque / total : 0,
    colorFamilyCount: families,
    majorColorFamilyCount: majorFamilies,
    dominantColorFamilyCount: dominantFamilies,
    topKCoverage: Number(topKCoverage.toFixed(6)),
    structureTopK: topK,
    darkEdgeRatio: edgeSamples ? darkEdge / edgeSamples : 0,
    histogram: Array.from(histogram),
    policy: policy
  };
}

async function analyzeImageFile(file, styleId) {
  if (!file || !fs.existsSync(file)) fail('ASSET_STYLE_COHESION_INPUT_MISSING', 'Style cohesion requires an existing image file.');
  var bytes = fs.readFileSync(file);
  var image = sharp(bytes, { failOn: 'none' });
  var meta = await image.metadata();
  var raw = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  var analysis = analyzeRgba(raw.info.width, raw.info.height, raw.data, styleId);
  analysis.path = path.resolve(file);
  analysis.sha256 = sha256(bytes);
  analysis.width = meta.width || raw.info.width;
  analysis.height = meta.height || raw.info.height;
  return analysis;
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length || !a.length) return 0;
  var dot = 0;
  var na = 0;
  var nb = 0;
  for (var i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function imagePathsFromResult(result) {
  if (!result || !result.accepted || !result.candidate) return [];
  if ((result.workItem.assetSpec.resourceKind || 'image') !== 'image') return [];
  if (frameSet.isFrameSet(result.candidate)) {
    return (result.candidate.frames || []).map(function(frame) { return frame.path; }).filter(Boolean);
  }
  return result.candidate.path ? [result.candidate.path] : [];
}

function evaluateStructure(analysis) {
  var policy = analysis.policy;
  var reasons = [];
  if (analysis.opaqueRatio < policy.minOpaquePixelRatio) {
    reasons.push({ code: 'STYLE_STRUCTURE_EMPTY', actual: analysis.opaqueRatio, requiredMinimum: policy.minOpaquePixelRatio });
  }
  // Extreme diffusion only (soft toon ramps commonly land 0.55-0.75 top-8 coverage).
  if (analysis.topKCoverage < policy.minTopKCoverage) {
    reasons.push({
      code: 'STYLE_STRUCTURE_PALETTE_TOO_DIFFUSE',
      actual: analysis.topKCoverage,
      requiredMinimum: policy.minTopKCoverage,
      topK: analysis.structureTopK || policy.structureTopK
    });
  }
  // Major family ceiling: true solid fills / ramps, not AA fringe bins under majorMass.
  if (analysis.majorColorFamilyCount > policy.maxMajorColorFamilies) {
    reasons.push({
      code: 'STYLE_STRUCTURE_TOO_MANY_COLOR_FAMILIES',
      actual: analysis.majorColorFamilyCount,
      colorFamilyCount: analysis.colorFamilyCount,
      majorColorFamilyCount: analysis.majorColorFamilyCount,
      dominantColorFamilyCount: analysis.dominantColorFamilyCount,
      requiredMaximum: policy.maxMajorColorFamilies
    });
  }
  // Full-frame multi-major palettes are photo/noise-like, not isolated toon sprites.
  if (analysis.opaqueRatio > 0.95 && analysis.majorColorFamilyCount >= 6) {
    reasons.push({
      code: 'STYLE_STRUCTURE_PHOTO_LIKE',
      actual: analysis.opaqueRatio,
      majorColorFamilyCount: analysis.majorColorFamilyCount,
      topKCoverage: analysis.topKCoverage,
      colorFamilyCount: analysis.colorFamilyCount
    });
  }
  return { accepted: reasons.length === 0, reasons: reasons };
}

async function evaluateProductionSet(results, options) {
  options = options || {};
  var workItems = Array.isArray(results) ? results : [];
  var acceptedImageItems = workItems.filter(function(result) {
    return result && result.accepted && imagePathsFromResult(result).length > 0;
  });
  if (!acceptedImageItems.length) {
    return {
      receiptId: 'style-cohesion.empty',
      owner: 'StyleCohesion',
      decision: 'accepted',
      reason: 'no-image-assets',
      groups: [],
      pairwise: [],
      structure: [],
      styleId: options.styleId || null,
      styleFingerprint: options.styleId ? styleDNA.styleFingerprint(options.styleId) : null
    };
  }

  var styleId = options.styleId || acceptedImageItems[0].workItem.assetSpec.styleId;
  var styleFingerprint = styleDNA.styleFingerprint(styleId);
  var policy = cohesionPolicy(styleId);
  var structureReports = [];
  var groupMembers = { sprite: [], scene: [], other: [] };
  var debts = [];

  for (var i = 0; i < acceptedImageItems.length; i++) {
    var item = acceptedImageItems[i];
    var itemStyleId = item.workItem.assetSpec.styleId;
    if (itemStyleId !== styleId) {
      debts.push({ code: 'ASSET_STYLE_ID_MISMATCH', slotId: item.workItem.slotId, expected: styleId, actual: itemStyleId });
      continue;
    }
    var paths = imagePathsFromResult(item);
    // Use the first frame / primary static image as the cohesion representative.
    var analysis = await analyzeImageFile(paths[0], styleId);
    var structure = evaluateStructure(analysis);
    structureReports.push({
      slotId: item.workItem.slotId,
      targetVisualSlotId: item.workItem.targetVisualSlotId,
      productionFamily: item.workItem.productionFamily,
      sha256: analysis.sha256,
      colorFamilyCount: analysis.colorFamilyCount,
      majorColorFamilyCount: analysis.majorColorFamilyCount,
      dominantColorFamilyCount: analysis.dominantColorFamilyCount,
      topKCoverage: analysis.topKCoverage,
      opaqueRatio: analysis.opaqueRatio,
      darkEdgeRatio: analysis.darkEdgeRatio,
      accepted: structure.accepted,
      reasons: structure.reasons
    });
    if (!structure.accepted) {
      debts.push({
        code: 'ASSET_STYLE_STRUCTURE_REJECTED',
        slotId: item.workItem.slotId,
        reasons: structure.reasons
      });
    }
    groupMembers[familyGroup(item.workItem.productionFamily)].push({
      slotId: item.workItem.slotId,
      targetVisualSlotId: item.workItem.targetVisualSlotId,
      productionFamily: item.workItem.productionFamily,
      analysis: analysis
    });
  }

  var pairwise = [];
  Object.keys(groupMembers).forEach(function(group) {
    var members = groupMembers[group];
    if (members.length < policy.minAssetsForPairwise) return;
    for (var a = 0; a < members.length; a++) {
      for (var b = a + 1; b < members.length; b++) {
        var similarity = cosineSimilarity(members[a].analysis.histogram, members[b].analysis.histogram);
        var pair = {
          group: group,
          leftSlotId: members[a].slotId,
          rightSlotId: members[b].slotId,
          paletteSimilarity: similarity,
          requiredMinimum: policy.minPairwisePaletteSimilarity,
          accepted: similarity >= policy.minPairwisePaletteSimilarity
        };
        pairwise.push(pair);
        if (!pair.accepted) {
          debts.push({
            code: 'ASSET_STYLE_COHESION_PAIR_REJECTED',
            group: group,
            leftSlotId: pair.leftSlotId,
            rightSlotId: pair.rightSlotId,
            actual: similarity,
            requiredMinimum: policy.minPairwisePaletteSimilarity
          });
        }
      }
    }
  });

  var receiptIdentity = {
    styleId: styleId,
    styleFingerprint: styleFingerprint,
    structure: structureReports.map(function(item) { return [item.slotId, item.sha256, item.colorFamilyCount, item.majorColorFamilyCount, item.topKCoverage, item.accepted]; }),
    pairwise: pairwise.map(function(item) { return [item.leftSlotId, item.rightSlotId, Number(item.paletteSimilarity.toFixed(6)), item.accepted]; }),
    policy: policy
  };
  var decision = debts.length ? 'debt' : 'accepted';
  return {
    receiptId: 'style-cohesion.' + sha256(JSON.stringify(receiptIdentity)).slice(0, 24),
    owner: 'StyleCohesion',
    decision: decision,
    styleId: styleId,
    styleFingerprint: styleFingerprint,
    policy: policy,
    structure: structureReports,
    pairwise: pairwise,
    groups: Object.keys(groupMembers).map(function(group) {
      return { group: group, slotIds: groupMembers[group].map(function(member) { return member.slotId; }) };
    }),
    debts: debts,
    styleAnchor: options.styleAnchor || null
  };
}

function pickStyleAnchor(results) {
  var preferred = ['character', 'character-animation', 'character-part', 'prop', 'ui', 'effect', 'effect-animation', 'background', 'world-geometry'];
  var accepted = (results || []).filter(function(result) {
    return result && result.accepted && imagePathsFromResult(result).length;
  });
  accepted.sort(function(left, right) {
    var li = preferred.indexOf(left.workItem.productionFamily);
    var ri = preferred.indexOf(right.workItem.productionFamily);
    return (li < 0 ? 99 : li) - (ri < 0 ? 99 : ri);
  });
  if (!accepted.length) return null;
  var item = accepted[0];
  var file = imagePathsFromResult(item)[0];
  return {
    slotId: item.workItem.slotId,
    targetVisualSlotId: item.workItem.targetVisualSlotId,
    productionFamily: item.workItem.productionFamily,
    styleId: item.workItem.assetSpec.styleId,
    path: file,
    sha256: item.currentRevision && item.currentRevision.sha256 || item.candidate.sha256 || null
  };
}

module.exports = {
  SPRITE_FAMILIES: SPRITE_FAMILIES,
  SCENE_FAMILIES: SCENE_FAMILIES,
  cohesionPolicy: cohesionPolicy,
  familyGroup: familyGroup,
  analyzeImageFile: analyzeImageFile,
  cosineSimilarity: cosineSimilarity,
  evaluateProductionSet: evaluateProductionSet,
  pickStyleAnchor: pickStyleAnchor,
  imagePathsFromResult: imagePathsFromResult
};
