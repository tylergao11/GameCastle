var crypto = require('crypto');
var frameSet = require('./frame-set');

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, {}); return value; }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0, 24); }
function fail(message) { throw new Error('SemanticAssetWorld: ' + message); }

function buildAssetWorld(assetManifest, previousWorld) {
  if (!assetManifest || assetManifest.sourceHash === undefined || !Array.isArray(assetManifest.assets)) fail('asset manifest requires sourceHash and assets');
  var slots = assetManifest.assets.map(function(asset) {
    if (!asset || !asset.slotId || !asset.targetVisualSlotId) fail('accepted asset manifest entry is incomplete');
    if (asset.frameSet) {
      var accepted = frameSet.validate(asset.frameSet);
      return { semanticId: asset.slotId, targetVisualSlotId: asset.targetVisualSlotId, assetId: asset.assetId || accepted.revisionId, revisionId: accepted.revisionId, frameSet: accepted, resourceKind: accepted.resourceKind, source: asset.source };
    }
    if (!asset.path || !asset.sha256) fail('accepted single-resource manifest entry is incomplete');
    return { semanticId: asset.slotId, targetVisualSlotId: asset.targetVisualSlotId, assetId: asset.assetId, revisionId: asset.revisionId || null, path: asset.path, sha256: asset.sha256, format: asset.format, resourceKind: asset.resourceKind || (String(asset.format || '').toLowerCase() === 'png' ? 'image' : null), width: asset.width, height: asset.height, transparent: asset.transparent === true, source: asset.source };
  }).sort(function(left, right) { return left.semanticId.localeCompare(right.semanticId); });
  var document = { schemaVersion: 2, documentKind: 'semantic-asset-world', sourceHash: assetManifest.sourceHash, productionSetId: assetManifest.productionSetId || null, slots: slots };
  document.contentHash = 'asset-world.' + hash(document);
  document.worldVersion = previousWorld && previousWorld.contentHash === document.contentHash ? previousWorld.worldVersion : ((previousWorld && previousWorld.worldVersion || 0) + 1);
  return document;
}

module.exports = { buildAssetWorld: buildAssetWorld };
