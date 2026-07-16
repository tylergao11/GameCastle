var assembly = require('./assembly');
var crypto = require('crypto');
var fs = require('fs');
var engineContract = assembly.contract;

function clone(value) { return assembly.clone(value); }
function hash(value) { return assembly.hash(value); }
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'SpatialEngine'; throw error; }
function object(value, label, code) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, label + ' must be an object'); return value; }
function array(value, label, code) { if (!Array.isArray(value)) fail(code, label + ' must be an array'); return value; }
function text(value, label, code) { if (typeof value !== 'string' || !value.trim()) fail(code, label + ' must be non-empty text'); return value.trim(); }
function layerName(value, label, code) { if (typeof value !== 'string') fail(code, label + ' must be text'); return value; }
function finite(value, label, code) { if (typeof value !== 'number' || !Number.isFinite(value)) fail(code, label + ' must be finite'); return value; }
function positive(value, label, code) { value = finite(value, label, code); if (value <= 0) fail(code, label + ' must be positive'); return value; }
function positiveInteger(value, label, code) { value = finite(value, label, code); if (value <= 0 || Math.floor(value) !== value) fail(code, label + ' must be a positive integer'); return value; }
function allowed(value, fields, label, code) { Object.keys(value).forEach(function(field) { if (fields.indexOf(field) < 0) fail(code, label + ' contains unknown field: ' + field); }); }
function same(left, right) { return JSON.stringify(assembly.stable(left)) === JSON.stringify(assembly.stable(right)); }
function verifyContentHash(value, prefix, label, code) {
  var contentHash = text(value.contentHash, label + '.contentHash', code), core = clone(value);
  delete core.contentHash;
  if (contentHash !== prefix + hash(core)) fail(code, label + '.contentHash does not bind its document content');
  return contentHash;
}
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }

function indexInput(input) {
  var intents = Object.create(null), subjects = Object.create(null), geometry = Object.create(null), planning = Object.create(null);
  input.layoutIntentSnapshot.intents.forEach(function(intent) { intents[intent.subject] = intent; });
  input.sceneSubjects.forEach(function(subject) { subjects[subject.subject] = subject; });
  input.geometryFacts.facts.forEach(function(fact) {
    if (!geometry[fact.subject]) geometry[fact.subject] = Object.create(null);
    geometry[fact.subject][fact.kind] = fact;
  });
  input.planningSpace.subjects.forEach(function(subject) { planning[subject.subject] = subject; });
  return { intents: intents, subjects: subjects, geometry: geometry, planning: planning };
}
function renderRect(placement, renderGeometry) {
  var scaleX = placement.width / renderGeometry.nativeSize.width, scaleY = placement.height / renderGeometry.nativeSize.height, drawable = renderGeometry.drawableBounds, radians = placement.angle * Math.PI / 180, cosine = Math.cos(radians), sine = Math.sin(radians);
  function point(x, y) { return { x: placement.x + x * cosine - y * sine, y: placement.y + x * sine + y * cosine }; }
  var corners = [point(drawable.left * scaleX, drawable.top * scaleY), point(drawable.right * scaleX, drawable.top * scaleY), point(drawable.left * scaleX, drawable.bottom * scaleY), point(drawable.right * scaleX, drawable.bottom * scaleY)], center = point((drawable.left + drawable.right) * scaleX / 2, (drawable.top + drawable.bottom) * scaleY / 2);
  return {
    left: Math.min.apply(null, corners.map(function(corner) { return corner.x; })),
    top: Math.min.apply(null, corners.map(function(corner) { return corner.y; })),
    right: Math.max.apply(null, corners.map(function(corner) { return corner.x; })),
    bottom: Math.max.apply(null, corners.map(function(corner) { return corner.y; })),
    centerX: center.x,
    centerY: center.y,
    scaleX: scaleX,
    scaleY: scaleY
  };
}
function inRect(rect, boundary, tolerance) {
  return rect.left >= boundary.left - tolerance && rect.top >= boundary.top - tolerance && rect.right <= boundary.right + tolerance && rect.bottom <= boundary.bottom + tolerance;
}
function overlaps(left, right) { return left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top; }

function normalizePlacement(raw, label, code, includeObjectName) {
  object(raw, label, code);
  var fields = ['subject', 'x', 'y', 'width', 'height', 'angle', 'layer', 'zOrder'];
  if (includeObjectName) fields.push('objectName');
  allowed(raw, fields, label, code);
  var result = {
    subject: text(raw.subject, label + '.subject', code),
    x: finite(raw.x, label + '.x', code),
    y: finite(raw.y, label + '.y', code),
    width: positive(raw.width, label + '.width', code),
    height: positive(raw.height, label + '.height', code),
    angle: finite(raw.angle, label + '.angle', code),
    layer: layerName(raw.layer, label + '.layer', code),
    zOrder: finite(raw.zOrder, label + '.zOrder', code)
  };
  if (includeObjectName) result.objectName = text(raw.objectName, label + '.objectName', code);
  return result;
}
function validatePlacementSet(inputValue, placements, options) {
  var input = assembly.validateAssemblyInput(inputValue), code = options && options.code || 'SPATIAL_CANDIDATE_INVALID', indexed = indexInput(input), expected = input.sceneSubjects, seen = Object.create(null), tolerance = Number(engineContract.validation.alignmentTolerancePixels);
  if (!Number.isFinite(tolerance) || tolerance < 0) fail(code, 'Spatial Engine contract has invalid alignment tolerance');
  array(placements, options && options.label || 'Spatial placements', code);
  var normalized = placements.map(function(raw, index) {
    var placement = normalizePlacement(raw, (options && options.label || 'Spatial placements') + '[' + index + ']', code, !!(options && options.includeObjectName));
    var sceneSubject = indexed.subjects[placement.subject], intent = indexed.intents[placement.subject], planning = indexed.planning[placement.subject], geometry = indexed.geometry[placement.subject] && indexed.geometry[placement.subject]['render-geometry'];
    if (!sceneSubject || !intent || !planning) fail('SPATIAL_CANDIDATE_SCOPE_INVALID', 'Spatial placement targets a subject outside the scene-instance declaration: ' + placement.subject);
    if (!geometry) fail('SPATIAL_CANDIDATE_GEOMETRY_MISSING', 'Spatial placement is missing native render geometry: ' + placement.subject);
    if (seen[placement.subject]) fail('SPATIAL_CANDIDATE_DUPLICATE', 'Spatial placement duplicates subject: ' + placement.subject); seen[placement.subject] = true;
    if (placement.layer !== planning.layer.name) fail('SPATIAL_CANDIDATE_LAYER_INVALID', 'Spatial placement must use the dictionary-derived planning layer for ' + placement.subject);
    if (!input.sceneCanvas.layers.some(function(layer) { return layer.name === placement.layer; })) fail('SPATIAL_CANDIDATE_LAYER_INVALID', 'Spatial placement targets a missing GDJS layer: ' + placement.layer);
    var zOrderRange = planning.zOrderRange;
    if (!zOrderRange || placement.zOrder < zOrderRange.minimum || placement.zOrder > zOrderRange.maximum) fail('SPATIAL_CANDIDATE_ZORDER_INVALID', 'Spatial placement zOrder must remain in the dictionary-declared range for ' + placement.subject);
    if (placement.width < planning.reservation.width || placement.height < planning.reservation.height) fail('SPATIAL_CANDIDATE_RESERVATION_INVALID', 'Spatial placement display size must reserve the semantic layout bounds for ' + placement.subject);
    if (options && options.includeObjectName && placement.objectName !== sceneSubject.objectName) fail('SPATIAL_CANDIDATE_OBJECT_INVALID', 'Spatial placement objectName does not match the declared GDJS object for ' + placement.subject);
    var rect = renderRect(placement, geometry), safe = planning.legalRegion.rect, relation = planning;
    if (!inRect(rect, safe, tolerance)) fail('SPATIAL_CANDIDATE_BOUNDS_INVALID', 'Spatial placement drawable bounds leave its dictionary safe area: ' + placement.subject);
    var gridCell = null;
    if (relation.mode === 'region') {
      // Anchor preferences guide the visual planner. Runtime proves the candidate stays
      // inside the dictionary safe area without solving its design coordinates.
    } else if (relation.mode === 'grid') {
      var grid = relation.grid;
      if (!grid || !Number.isInteger(grid.columns) || !Number.isInteger(grid.rows) || grid.columns <= 0 || grid.rows <= 0) fail(code, 'Dictionary grid relation is invalid: ' + intent.relation.semanticRef);
      gridCell = { column: Math.min(grid.columns - 1, Math.max(0, Math.floor((rect.centerX - safe.left) / (safe.width / grid.columns)))), row: Math.min(grid.rows - 1, Math.max(0, Math.floor((rect.centerY - safe.top) / (safe.height / grid.rows)))) };
    } else {
      fail(code, 'Spatial planner does not materialize unknown placement mode: ' + relation.mode);
    }
    return { placement: placement, intent: intent, planning: planning, objectName: sceneSubject.objectName, visualRect: rect, safeRect: safe, gridCell: gridCell };
  });
  if (normalized.length !== expected.length || expected.some(function(subject) { return !seen[subject.subject]; })) fail('SPATIAL_CANDIDATE_COMPLETENESS_INVALID', 'Spatial candidate must contain all and only declared scene-instance subjects');
  for (var left = 0; left < normalized.length; left++) {
    for (var right = left + 1; right < normalized.length; right++) {
      var leftPolicy = normalized[left].planning.overlap, rightPolicy = normalized[right].planning.overlap;
      if (leftPolicy && rightPolicy && leftPolicy.group === rightPolicy.group && (leftPolicy.policy === 'reject' || rightPolicy.policy === 'reject') && overlaps(normalized[left].visualRect, normalized[right].visualRect)) fail('SPATIAL_CANDIDATE_OVERLAP_INVALID', 'Spatial candidate overlaps two subjects in a reject-overlap group: ' + normalized[left].placement.subject + ', ' + normalized[right].placement.subject);
    }
  }
  return { input: input, placements: normalized };
}

function validateLayoutCandidate(inputValue, value) {
  var input = assembly.validateAssemblyInput(inputValue), code = 'SPATIAL_CANDIDATE_INVALID';
  object(value, 'SpatialLayoutCandidate', code);
  allowed(value, ['schemaVersion', 'documentKind', 'sourceHash', 'assetWorldHash', 'spatialAssemblyInputHash', 'sceneName', 'round', 'placements', 'contentHash'], 'SpatialLayoutCandidate', code);
  if (value.schemaVersion !== 1 || value.documentKind !== 'spatial-layout-candidate') fail(code, 'SpatialLayoutCandidate has an invalid kind or version');
  if (text(value.sourceHash, 'SpatialLayoutCandidate.sourceHash', code) !== input.sourceHash || text(value.assetWorldHash, 'SpatialLayoutCandidate.assetWorldHash', code) !== input.assetWorldHash || text(value.spatialAssemblyInputHash, 'SpatialLayoutCandidate.spatialAssemblyInputHash', code) !== input.contentHash || text(value.sceneName, 'SpatialLayoutCandidate.sceneName', code) !== input.sceneCanvas.sceneName) fail(code, 'SpatialLayoutCandidate does not bind the active spatial assembly input');
  positiveInteger(value.round, 'SpatialLayoutCandidate.round', code);
  var checked = validatePlacementSet(input, value.placements, { code: code, label: 'SpatialLayoutCandidate.placements' });
  verifyContentHash(value, 'spatial-layout-candidate.', 'SpatialLayoutCandidate', code);
  return { candidate: clone(value), input: checked.input, placements: checked.placements };
}
function createLayoutCandidate(inputValue, value) {
  var input = assembly.validateAssemblyInput(inputValue), code = 'SPATIAL_CANDIDATE_INVALID';
  object(value, 'Spatial planner candidate input', code); allowed(value, ['round', 'placements'], 'Spatial planner candidate input', code);
  var result = {
    schemaVersion: 1,
    documentKind: 'spatial-layout-candidate',
    sourceHash: input.sourceHash,
    assetWorldHash: input.assetWorldHash,
    spatialAssemblyInputHash: input.contentHash,
    sceneName: input.sceneCanvas.sceneName,
    round: positiveInteger(value.round, 'Spatial planner candidate input.round', code),
    placements: clone(value.placements)
  };
  result.contentHash = 'spatial-layout-candidate.' + hash(result);
  return validateLayoutCandidate(input, result).candidate;
}

function validateSpatialResolution(inputValue, value) {
  var input = assembly.validateAssemblyInput(inputValue), code = 'SPATIAL_RESOLUTION_INVALID';
  object(value, 'SpatialLayoutResolution', code);
  allowed(value, ['schemaVersion', 'documentKind', 'sourceHash', 'assetWorldHash', 'spatialAssemblyInputHash', 'acceptedCandidateHash', 'acceptedAtRound', 'candidateProjectionHash', 'previewHash', 'sceneName', 'placements', 'contentHash'], 'SpatialLayoutResolution', code);
  if (value.schemaVersion !== 1 || value.documentKind !== 'spatial-layout-resolution') fail(code, 'SpatialLayoutResolution has an invalid kind or version');
  if (text(value.sourceHash, 'SpatialLayoutResolution.sourceHash', code) !== input.sourceHash || text(value.assetWorldHash, 'SpatialLayoutResolution.assetWorldHash', code) !== input.assetWorldHash || text(value.spatialAssemblyInputHash, 'SpatialLayoutResolution.spatialAssemblyInputHash', code) !== input.contentHash || text(value.sceneName, 'SpatialLayoutResolution.sceneName', code) !== input.sceneCanvas.sceneName) fail(code, 'SpatialLayoutResolution does not bind the active spatial assembly input');
  text(value.acceptedCandidateHash, 'SpatialLayoutResolution.acceptedCandidateHash', code); positiveInteger(value.acceptedAtRound, 'SpatialLayoutResolution.acceptedAtRound', code); text(value.candidateProjectionHash, 'SpatialLayoutResolution.candidateProjectionHash', code); text(value.previewHash, 'SpatialLayoutResolution.previewHash', code);
  var checked = validatePlacementSet(input, value.placements, { code: code, label: 'SpatialLayoutResolution.placements', includeObjectName: true });
  verifyContentHash(value, 'spatial-layout-resolution.', 'SpatialLayoutResolution', code);
  return { resolution: clone(value), input: checked.input, placements: checked.placements };
}
function expectedProjectionInstances(checked) {
  return checked.placements.map(function(item) { return Object.assign({ subject: item.placement.subject, objectName: item.objectName }, clone(item.placement)); });
}
function validateCandidateProjectionEvidence(input, checked, assetBoundSeed, value) {
  var projection;
  try { projection = require('./gdjs-projection').validateProjection(input, assetBoundSeed, value); }
  catch (error) { fail('SPATIAL_ACCEPTANCE_PROJECTION_INVALID', 'Spatial acceptance requires a valid candidate GDJS projection: ' + String(error.message || error)); }
  if (projection.basis.documentKind !== 'spatial-layout-candidate' || projection.basis.contentHash !== checked.candidate.contentHash) fail('SPATIAL_ACCEPTANCE_PROJECTION_INVALID', 'Spatial acceptance projection must derive from the exact candidate it promotes.');
  if (!same(projection.instances, expectedProjectionInstances(checked))) fail('SPATIAL_ACCEPTANCE_PROJECTION_INVALID', 'Spatial acceptance projection instances must exactly match the validated candidate.');
  return projection;
}
function validatePreviewEvidence(input, projection, value) {
  var code = 'SPATIAL_ACCEPTANCE_PREVIEW_INVALID';
  object(value, 'Spatial acceptance preview', code);
  allowed(value, ['schemaVersion', 'documentKind', 'sourceHash', 'assetWorldHash', 'spatialAssemblyInputHash', 'candidateProjectionHash', 'imagePath', 'imageHash', 'pixelSize', 'contentHash'], 'Spatial acceptance preview', code);
  if (value.schemaVersion !== 1 || value.documentKind !== 'gdjs-spatial-preview') fail(code, 'Spatial acceptance preview has an invalid kind or version.');
  if (text(value.sourceHash, 'Spatial acceptance preview.sourceHash', code) !== input.sourceHash || text(value.assetWorldHash, 'Spatial acceptance preview.assetWorldHash', code) !== input.assetWorldHash || text(value.spatialAssemblyInputHash, 'Spatial acceptance preview.spatialAssemblyInputHash', code) !== input.contentHash || text(value.candidateProjectionHash, 'Spatial acceptance preview.candidateProjectionHash', code) !== projection.contentHash) fail(code, 'Spatial acceptance preview does not bind the exact candidate projection.');
  var imagePath = text(value.imagePath, 'Spatial acceptance preview.imagePath', code);
  if (!fs.existsSync(imagePath)) fail(code, 'Spatial acceptance preview image is unavailable.');
  if (text(value.imageHash, 'Spatial acceptance preview.imageHash', code) !== sha256(fs.readFileSync(imagePath))) fail(code, 'Spatial acceptance preview imageHash does not bind its image bytes.');
  object(value.pixelSize, 'Spatial acceptance preview.pixelSize', code); allowed(value.pixelSize, ['width', 'height'], 'Spatial acceptance preview.pixelSize', code);
  if (!Number.isInteger(value.pixelSize.width) || !Number.isInteger(value.pixelSize.height) || value.pixelSize.width !== input.sceneCanvas.width || value.pixelSize.height !== input.sceneCanvas.height) fail(code, 'Spatial acceptance preview pixel size must equal the active GDJS scene canvas.');
  verifyContentHash(value, 'gdjs-spatial-preview.', 'Spatial acceptance preview', code);
  return clone(value);
}
function acceptCandidate(inputValue, candidateValue, acceptance) {
  var checked = validateLayoutCandidate(inputValue, candidateValue), input = checked.input, code = 'SPATIAL_ACCEPTANCE_INVALID';
  object(acceptance, 'Spatial acceptance', code); allowed(acceptance, ['acceptanceRound', 'assetBoundSeed', 'candidateProjection', 'preview'], 'Spatial acceptance', code);
  var acceptanceRound = positiveInteger(acceptance.acceptanceRound, 'Spatial acceptance.acceptanceRound', code);
  if (acceptanceRound <= checked.candidate.round) fail(code, 'Spatial acceptance must occur in a later round than the candidate it promotes');
  var projection = validateCandidateProjectionEvidence(input, checked, acceptance.assetBoundSeed, acceptance.candidateProjection), preview = validatePreviewEvidence(input, projection, acceptance.preview);
  var result = {
    schemaVersion: 1,
    documentKind: 'spatial-layout-resolution',
    sourceHash: input.sourceHash,
    assetWorldHash: input.assetWorldHash,
    spatialAssemblyInputHash: input.contentHash,
    acceptedCandidateHash: checked.candidate.contentHash,
    acceptedAtRound: acceptanceRound,
    candidateProjectionHash: projection.contentHash,
    previewHash: preview.contentHash,
    sceneName: input.sceneCanvas.sceneName,
    placements: checked.placements.map(function(item) { return Object.assign({ objectName: item.objectName }, clone(item.placement)); })
  };
  result.contentHash = 'spatial-layout-resolution.' + hash(result);
  return validateSpatialResolution(input, result).resolution;
}

module.exports = {
  createLayoutCandidate: createLayoutCandidate,
  validateLayoutCandidate: validateLayoutCandidate,
  validateSpatialResolution: validateSpatialResolution,
  acceptCandidate: acceptCandidate,
  validatePlacementSet: validatePlacementSet,
  validatePreviewEvidence: validatePreviewEvidence,
  renderRect: renderRect
};
