var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var png = require('./local-derivation-port');
var frameSet = require('./frame-set');

function fail(code, message, owner) { var error = new Error(message); error.code = code; error.owner = owner || 'AssetResolver'; throw error; }
function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function descriptor(slot, asset, source) {
  if (!asset || !asset.path || !fs.existsSync(asset.path)) fail('ASSET_PRODUCTION_RESOLVED_RESOURCE_MISSING', 'Resolved asset must reference a local accepted resource.', 'AssetResolver');
  var resourceKind = slot.resourceKind || 'image';
  if (resourceKind !== 'image') {
    var externalBytes = fs.readFileSync(asset.path), externalFormat = String(asset.format || path.extname(asset.path).slice(1)).toLowerCase();
    if (asset.resourceKind !== resourceKind) fail('ASSET_PRODUCTION_RESOURCE_KIND_MISMATCH', 'Resolved resource kind does not satisfy the semantic requirement.', 'AssetResolver');
    if ((slot.acceptedFormats || []).indexOf(externalFormat) < 0) fail('ASSET_PRODUCTION_RESOURCE_FORMAT_MISMATCH', 'Resolved resource format does not satisfy the semantic requirement.', 'AssetResolver');
    if (asset.sha256 && asset.sha256 !== sha(externalBytes)) fail('ASSET_PRODUCTION_OUTPUT_HASH_MISMATCH', 'Resolved resource hash does not match its local file.', 'AssetResolver');
    return Object.assign({}, asset, { assetId: asset.assetId || source + '.' + sha(externalBytes).slice(0, 16), path: asset.path, sha256: sha(externalBytes), resourceKind: resourceKind, format: externalFormat, semanticTags: (slot.semanticTags || []).slice(), styleTags: (slot.styleTags || []).slice(), styleId: slot.styleId, source: source, status: 'accepted-external', publishability: Object.assign({ playable: true, publishable: true, blocksFinalExport: false }, asset.publishability || {}) });
  }
  var bytes = fs.readFileSync(asset.path), raster; try { raster = png.decodePng(bytes); } catch (error) { fail('ASSET_PRODUCTION_RESOLVED_PNG_INVALID', error.message, 'LocalDerivationKernel'); }
  return Object.assign({}, asset, { assetId: asset.assetId || source + '.' + sha(bytes).slice(0, 16), path: asset.path, sha256: sha(bytes), resourceKind: 'image', format: 'png', width: raster.width, height: raster.height, transparent: Array.prototype.some.call(raster.data, function(value, index) { return index % 4 === 3 && value < 255; }), semanticTags: (slot.semanticTags || []).slice(), styleTags: (slot.styleTags || []).slice(), styleId: slot.styleId, source: source, status: source === 'localExplicit' || source === 'assetLibrary' ? 'reused' : 'variant', publishability: Object.assign({ playable: true, publishable: true, blocksFinalExport: false }, asset.publishability || {}) });
}
function localize(candidate, outputDir) {
  var dir = path.resolve(outputDir), bytes = fs.readFileSync(candidate.path), digest = sha(bytes), extension = String(candidate.format || 'bin').replace(/[^A-Za-z0-9]/g, ''), target = path.join(dir, 'resolved-' + digest.slice(0, 16) + '.' + extension); fs.mkdirSync(dir, { recursive: true }); if (!fs.existsSync(target)) fs.copyFileSync(candidate.path, target); return Object.assign({}, candidate, { path: target, sha256: digest, materialized: true, privacyScope: candidate.privacyScope || 'project-local' });
}
async function materializeLibraryMatch(input, slot) {
  var record = input.libraryMatches && input.libraryMatches[input.workItem.slotId];
  if (!record) return null;
  if (!input.assetLibrary) fail('ASSET_LIBRARY_REQUIRED', 'AssetResolver received a library match without AssetLibrary.', 'AssetResolver');
  try {
    var asset = await input.assetLibrary.materialize(record, { projectId: input.projectId, targetDirectory: input.projectAssetDir });
    if (frameSet.isFrameSet(asset)) fail('ASSET_LIBRARY_ARTIFACT_KIND_MISMATCH', 'A FrameSetRevision cannot satisfy a single-resource work item.', 'AssetResolver');
    return localize(descriptor(slot, asset, 'assetLibrary'), input.projectAssetDir);
  } catch (error) {
    input.libraryFailures.push({ slotId: input.workItem.slotId, outcome: 'materialization-failed', code: error.code || 'ASSET_LIBRARY_MATERIALIZE_FAILED', owner: error.owner || 'AssetLibrary', message: error.message });
    return null;
  }
}
async function resolveWorkItem(input) {
  var item = input.workItem, slot = item.assetSpec, source = (input.sources || {})[item.slotId] || null, candidate = (input.localAssets || {})[item.slotId] || null;
  if (slot.artifactKind === 'frame-set') {
    candidate = (input.frameSets || {})[item.slotId] || (source && source.frameSet) || null;
    if (candidate) return Object.assign({}, frameSet.validate(candidate), { source: candidate.source || 'frameSetInput' });
    var record = input.libraryMatches && input.libraryMatches[item.slotId];
    if (record) {
      try {
        if (!input.assetLibrary) fail('ASSET_LIBRARY_REQUIRED', 'FrameSet resolution requires AssetLibrary.', 'AssetResolver');
        var materialized = await input.assetLibrary.materialize(record, { projectId: input.projectId, targetDirectory: input.projectAssetDir });
        return Object.assign({}, frameSet.validate(materialized), { source: 'assetLibrary' });
      } catch (error) {
        input.libraryFailures.push({ slotId: item.slotId, outcome: 'materialization-failed', code: error.code || 'ASSET_LIBRARY_MATERIALIZE_FAILED', owner: error.owner || 'AssetLibrary', message: error.message });
      }
    }
    return null;
  }
  if (!candidate && (input.localInputs || {})[item.slotId]) candidate = input.localInputs[item.slotId];
  if (candidate) return localize(descriptor(slot, candidate, 'localExplicit'), input.projectAssetDir);
  candidate = await materializeLibraryMatch(input, slot);
  if (candidate) return candidate;
  if (!source || !source.kind || source.kind === 'generation_required') return null;
  if (source.kind === 'local') return localize(descriptor(slot, source.asset, 'localExplicit'), input.projectAssetDir);
  fail('ASSET_PRODUCTION_RESOLUTION_KIND_INVALID', 'Unsupported asset resolution kind: ' + source.kind, 'AssetResolver');
}
async function resolveProductionSet(input) { var candidates = {}, debts = [], libraryFailures = []; for (var index = 0; index < input.plan.workItems.length; index++) { var item = input.plan.workItems[index]; try { var candidate = await resolveWorkItem(Object.assign({}, input, { workItem: item, libraryFailures: libraryFailures })); if (candidate) candidates[item.slotId] = candidate; } catch (error) { debts.push({ slotId: item.slotId, code: error.code || 'ASSET_PRODUCTION_RESOLVE_FAILED', owner: error.owner || 'AssetResolver', message: error.message }); } } return { candidates: candidates, debts: debts, libraryFailures: libraryFailures }; }

module.exports = { resolveWorkItem: resolveWorkItem, resolveProductionSet: resolveProductionSet };
