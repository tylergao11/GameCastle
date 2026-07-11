var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

function hashFile(filePath) { return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'); }
function readJson(filePath, fallback) { return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : fallback; }
function saveJson(filePath, value) { fs.mkdirSync(path.dirname(filePath), { recursive: true }); fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8'); }

function createAssetRepository(rootDir) {
  var manifestPath = path.join(rootDir, 'asset-repository.json');
  function manifest() { return readJson(manifestPath, { schemaVersion: 1, assets: [] }); }
  function importAsset(sourcePath, metadata) {
    if (!fs.existsSync(sourcePath)) throw new Error('Local asset source not found: ' + sourcePath);
    metadata = metadata || {};
    var sha256 = hashFile(sourcePath), current = manifest();
    var existing = current.assets.find(function(asset) { return asset.sha256 === sha256; });
    if (existing) return existing;
    var ext = path.extname(sourcePath).toLowerCase() || '.png';
    var assetId = 'local.' + sha256.slice(0, 16);
    var storedPath = path.join(rootDir, 'files', assetId + ext);
    fs.mkdirSync(path.dirname(storedPath), { recursive: true });
    fs.copyFileSync(sourcePath, storedPath);
    var asset = { assetId: assetId, sha256: sha256, path: storedPath, format: ext.slice(1), width: metadata.width || null, height: metadata.height || null, transparent: metadata.transparent === undefined ? null : metadata.transparent === true, source: metadata.source || 'localExplicit', license: metadata.license || 'owned', provenance: metadata.provenance || 'user-upload', styleId: metadata.styleId || null, semanticTags: metadata.semanticTags || [], styleTags: metadata.styleTags || [], status: metadata.status || 'local', createdAt: new Date().toISOString(), bindings: metadata.bindings || [] };
    current.assets.push(asset); saveJson(manifestPath, current); return asset;
  }
  function materialize(assetId, projectAssetDir) {
    var asset = manifest().assets.find(function(item) { return item.assetId === assetId; });
    if (!asset) throw new Error('Unknown local asset: ' + assetId);
    fs.mkdirSync(projectAssetDir, { recursive: true });
    var target = path.join(projectAssetDir, path.basename(asset.path)); fs.copyFileSync(asset.path, target);
    return Object.assign({}, asset, { path: target, materialized: true });
  }
  function approvedAssets() { return manifest().assets.filter(function(asset) { return asset.status === 'approved'; }); }
  function findExact(sha256) { return approvedAssets().find(function(asset) { return asset.sha256 === sha256; }) || null; }
  function findByTags(tags) { tags = tags || []; return approvedAssets().filter(function(asset) { return tags.every(function(tag) { return asset.semanticTags.indexOf(tag) >= 0 || asset.styleTags.indexOf(tag) >= 0; }); }); }
  function specTags(spec) { return [].concat(spec.semanticTags || [], spec.styleTags || []); }
  function findExactForSpec(spec) { return findByTags(specTags(spec))[0] || null; }
  function findNearForSpec(spec) {
    var tags = specTags(spec); if (!tags.length) return null;
    var ranked = approvedAssets().map(function(asset) { var assetTags = [].concat(asset.semanticTags || [], asset.styleTags || []); var shared = tags.filter(function(tag) { return assetTags.indexOf(tag) >= 0; }); return { asset: asset, score: shared.length / tags.length }; }).filter(function(match) { return match.score >= 0.5 && match.score < 1; }).sort(function(a, b) { return b.score - a.score; });
    return ranked.length ? Object.assign({}, ranked[0].asset, { matchScore: ranked[0].score }) : null;
  }
  function publishAccepted(sourceAsset, receipt) { if (!receipt || receipt.accepted !== true) throw new Error('Cloud promotion requires Acceptance receipt'); if (!sourceAsset || !sourceAsset.path || !sourceAsset.provenance || !sourceAsset.license) throw new Error('Cloud promotion requires provenance and license'); return importAsset(sourceAsset.path, Object.assign({}, sourceAsset, { source: 'cloudRepo', status: 'approved' })); }
  return { importAsset: importAsset, materialize: materialize, findExact: findExact, findByTags: findByTags, findExactForSpec: findExactForSpec, findNearForSpec: findNearForSpec, publishAccepted: publishAccepted, list: function() { return manifest().assets.slice(); } };
}
module.exports = { createAssetRepository: createAssetRepository, hashFile: hashFile };
