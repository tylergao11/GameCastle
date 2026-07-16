var crypto = require('crypto');
var fs = require('fs');
var assetWorldApi = require('../../assets/src/asset-world');
var frameSetApi = require('../../assets/src/frame-set');
var png = require('../../assets/src/local-derivation-port');
var coordinateTruth = require('../../gdjs/generated/spatial-coordinate-truth.json');

var PRODUCER_REVISION = 'gamecastle.spatial-geometry.v1';
function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, {}); return value; }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0, 24); }
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'SpatialGeometryFactProducer'; throw error; }
function text(value, label) { if (typeof value !== 'string' || !value.trim()) fail('SPATIAL_GEOMETRY_PRODUCER_INVALID', label + ' must be non-empty text.'); return value.trim(); }
function alphaBounds(raster) {
  var left = raster.width, top = raster.height, right = -1, bottom = -1;
  for (var y = 0; y < raster.height; y++) for (var x = 0; x < raster.width; x++) if (raster.data[(y * raster.width + x) * 4 + 3] > 0) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
  if (right < 0) fail('SPATIAL_GEOMETRY_EMPTY_IMAGE', 'Accepted render asset has no drawable pixels.');
  return { left: left, top: top, right: right + 1, bottom: bottom + 1 };
}
function union(bounds) {
  return bounds.reduce(function(result, item) {
    if (!result) return clone(item);
    return { left: Math.min(result.left, item.left), top: Math.min(result.top, item.top), right: Math.max(result.right, item.right), bottom: Math.max(result.bottom, item.bottom) };
  }, null);
}
function decode(file, expectedHash, expectedWidth, expectedHeight, semanticId) {
  if (!file || !fs.existsSync(file)) fail('SPATIAL_GEOMETRY_ASSET_MISSING', 'Accepted asset bytes are unavailable for ' + semanticId + '.');
  var bytes = fs.readFileSync(file);
  if (sha256(bytes) !== expectedHash) fail('SPATIAL_GEOMETRY_ASSET_HASH_MISMATCH', 'Accepted asset bytes changed after AssetWorld acceptance: ' + semanticId + '.');
  var raster;
  try { raster = png.decodePng(bytes); } catch (error) { fail('SPATIAL_GEOMETRY_IMAGE_UNSUPPORTED', 'Canonical geometry currently requires accepted PNG pixels for ' + semanticId + ': ' + error.message); }
  if (expectedWidth && raster.width !== expectedWidth || expectedHeight && raster.height !== expectedHeight) fail('SPATIAL_GEOMETRY_SIZE_MISMATCH', 'Accepted asset dimensions do not match decoded pixels for ' + semanticId + '.');
  return raster;
}
function geometry(slot) {
  if (slot.frameSet) {
    var accepted = frameSetApi.validate(slot.frameSet), rasters = accepted.frames.map(function(frame) { return decode(frame.path, frame.sha256, accepted.canvas.width, accepted.canvas.height, slot.semanticId); });
    return { nativeSize: clone(accepted.canvas), drawableBounds: union(rasters.map(alphaBounds)), objectOrigin: { x: 0, y: 0 }, evidenceHash: accepted.contentHash };
  }
  if (slot.resourceKind !== 'image' || String(slot.format).toLowerCase() !== 'png') fail('SPATIAL_GEOMETRY_RESOURCE_UNSUPPORTED', 'Canonical geometry has no producer for non-PNG render asset ' + slot.semanticId + '.');
  var raster = decode(slot.path, slot.sha256, slot.width, slot.height, slot.semanticId);
  return { nativeSize: { width: raster.width, height: raster.height }, drawableBounds: alphaBounds(raster), objectOrigin: { x: 0, y: 0 }, evidenceHash: slot.sha256 };
}
function seal(value) { value.contentHash = 'spatial-geometry-fact-set.' + digest(value); return value; }

function produce(input) {
  input = input || {};
  var world = assetWorldApi.validateAcceptedAssetWorld(input.assetWorld), seed = input.assetBoundSeed;
  if (!seed || seed.documentKind !== 'gdjs-asset-bound-project-seed') fail('SPATIAL_GEOMETRY_SEED_INVALID', 'Geometry production requires an asset-bound GDJS project seed.');
  if (seed.sourceHash !== world.sourceHash || seed.assetWorldHash !== world.contentHash) fail('SPATIAL_GEOMETRY_SOURCE_MISMATCH', 'Geometry inputs do not bind the same Source and accepted AssetWorld.');
  var request = seed.spatialAssemblyRequest;
  if (!request || request.documentKind !== 'spatial-assembly-request' || request.sourceHash !== seed.sourceHash) fail('SPATIAL_GEOMETRY_REQUEST_INVALID', 'Asset-bound seed has no current spatial assembly request.');
  var slots = Object.create(null), requirementsBySubject = Object.create(null);
  world.slots.forEach(function(slot) { slots[slot.semanticId] = slot; });
  (seed.assetBindingRequirements || []).forEach(function(requirement) {
    if (!requirementsBySubject[requirement.subject]) requirementsBySubject[requirement.subject] = [];
    requirementsBySubject[requirement.subject].push(requirement);
  });
  var facts = [];
  request.subjects.slice().sort(function(left, right) { return left.subject.localeCompare(right.subject); }).forEach(function(subjectEntry) {
    var subject = text(subjectEntry.subject, 'spatial subject'), requirements = requirementsBySubject[subject] || [];
    if (requirements.length !== 1) fail('SPATIAL_GEOMETRY_ASSET_BINDING_REQUIRED', 'Spatial subject ' + subject + ' must resolve to exactly one accepted render asset; found ' + requirements.length + '.');
    var requirement = requirements[0], slot = slots[requirement.semanticId];
    if (!slot) fail('SPATIAL_GEOMETRY_ASSET_BINDING_REQUIRED', 'Spatial subject ' + subject + ' references no accepted AssetWorld slot: ' + requirement.semanticId + '.');
    var resolved = geometry(slot);
    facts.push({ subject: subject, kind: 'render-geometry', assetSemanticId: slot.semanticId, drawableBounds: resolved.drawableBounds, nativeSize: resolved.nativeSize, objectOrigin: resolved.objectOrigin, evidence: { documentKind: 'accepted-asset-geometry', contentHash: resolved.evidenceHash, producerRevision: PRODUCER_REVISION } });
    facts.push({ subject: subject, kind: 'gdjs-coordinate-contract', positionSemantic: coordinateTruth.coordinateModel.positionSemantic, sizeSemantic: coordinateTruth.coordinateModel.sizeSemantic, layerSemantic: coordinateTruth.coordinateModel.layerSemantic, evidence: { documentKind: coordinateTruth.documentKind, contentHash: coordinateTruth.contentHash, producerRevision: coordinateTruth.source.commit } });
  });
  return seal({ schemaVersion: 2, documentKind: 'spatial-geometry-fact-set', sourceHash: seed.sourceHash, assetWorldHash: world.contentHash, facts: facts });
}

module.exports = { PRODUCER_REVISION: PRODUCER_REVISION, produce: produce };
