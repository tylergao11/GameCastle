var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var png = require('./local-derivation-port');

function fail(code, message, owner) { var error = new Error(message); error.code = code; error.owner = owner || 'AssetResolver'; throw error; }
function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function approved(asset) { return !!asset && (asset.status === 'approved' || asset.repositoryStatus === 'approved'); }
function descriptor(slot, asset, source) {
  if (!asset || !asset.path || !fs.existsSync(asset.path)) fail('ASSET_PRODUCTION_RESOLVED_PIXELS_MISSING', 'Resolved asset must reference a local PNG.', 'AssetResolver');
  var bytes = fs.readFileSync(asset.path), raster; try { raster = png.decodePng(bytes); } catch (error) { fail('ASSET_PRODUCTION_RESOLVED_PNG_INVALID', error.message, 'LocalDerivationKernel'); }
  return Object.assign({}, asset, { assetId: asset.assetId || source + '.' + sha(bytes).slice(0, 16), path: asset.path, sha256: sha(bytes), format: 'png', width: raster.width, height: raster.height, transparent: Array.prototype.some.call(raster.data, function(value, index) { return index % 4 === 3 && value < 255; }), semanticTags: (slot.semanticTags || []).slice(), styleTags: (slot.styleTags || []).slice(), styleId: slot.styleId, source: source, status: source === 'localExplicit' || source === 'cloudRepo' ? 'reused' : 'variant', publishability: Object.assign({ playable: true, publishable: true, blocksFinalExport: false }, asset.publishability || {}) });
}
function localize(candidate, outputDir) {
  var dir = path.resolve(outputDir), bytes = fs.readFileSync(candidate.path), digest = sha(bytes), target = path.join(dir, 'resolved-' + digest.slice(0, 16) + '.png'); fs.mkdirSync(dir, { recursive: true }); if (!fs.existsSync(target)) fs.copyFileSync(candidate.path, target); return Object.assign({}, candidate, { path: target, sha256: digest, materialized: true, privacyScope: candidate.privacyScope || 'project-local' });
}
function lookupCloud(cloud, slot) {
  if (!cloud) return null;
  var exact = typeof cloud.findExactForSpec === 'function' ? cloud.findExactForSpec(slot) : null; if (approved(exact)) return { kind: 'cloud_exact', asset: exact };
  var near = typeof cloud.findNearForSpec === 'function' ? cloud.findNearForSpec(slot) : null; if (approved(near)) return { kind: 'cloud_near', asset: near, localPlan: near.localPlan || null };
  return null;
}
async function resolveWorkItem(input) {
  var item = input.workItem, slot = item.assetSpec, source = (input.sources || {})[item.slotId] || null, candidate = (input.localAssets || {})[item.slotId] || null;
  if (!candidate && (input.localInputs || {})[item.slotId]) candidate = input.localInputs[item.slotId];
  if (candidate) return localize(descriptor(slot, candidate, 'localExplicit'), input.projectAssetDir);
  if (!source || !source.kind) source = lookupCloud(input.cloudAssetEngine, slot);
  if (!source || !source.kind || source.kind === 'generation_required') return null;
  if (source.kind === 'local') return localize(descriptor(slot, source.asset, 'localExplicit'), input.projectAssetDir);
  if (source.kind === 'cloud_exact' || source.kind === 'cloud_near') {
    var asset = source.asset;
    if (!approved(asset)) fail('ASSET_PRODUCTION_CLOUD_ASSET_UNAPPROVED', 'Cloud candidate is not approved.', 'CloudAssetEngine');
    if (input.cloudAssetEngine && typeof input.cloudAssetEngine.materialize === 'function' && asset.assetId) asset = Object.assign({}, asset, input.cloudAssetEngine.materialize({ requestId: input.runId + ':materialize:' + item.slotId, revisionId: asset.revisionId || asset.assetId, projectId: input.projectId, targetScope: 'project-local', projectAssetDir: input.projectAssetDir }));
    var resolved = descriptor(slot, asset, 'cloudRepo');
    if (source.kind === 'cloud_exact') return localize(resolved, input.projectAssetDir);
    if (source.localPlan && input.ports.localPlan && typeof input.ports.localPlan.run === 'function') return localize(descriptor(slot, await input.ports.localPlan.run({ runId: input.runId, projectId: input.projectId, slot: slot, source: Object.assign({}, source, { asset: resolved }), projectAssetDir: input.projectAssetDir }), 'deterministicVariant'), input.projectAssetDir);
    if (source.derivationSpec && input.ports.localDerive && typeof input.ports.localDerive.derive === 'function') return localize(descriptor(slot, await input.ports.localDerive.derive({ runId: input.runId, projectId: input.projectId, slot: slot, source: source, projectAssetDir: input.projectAssetDir }), 'deterministicVariant'), input.projectAssetDir);
    if (typeof input.ports.variant === 'function') return localize(descriptor(slot, await input.ports.variant({ runId: input.runId, projectId: input.projectId, slot: slot, source: source, projectAssetDir: input.projectAssetDir }), 'deterministicVariant'), input.projectAssetDir);
    if (source.needsPixels === true) fail('ASSET_PRODUCTION_DERIVATION_PLAN_REQUIRED', 'Cloud-near candidate requiring pixel changes has no approved derivation action.', 'AssetResolver');
    return localize(Object.assign(resolved, { source: 'cloudRepo', status: 'reused' }), input.projectAssetDir);
  }
  fail('ASSET_PRODUCTION_RESOLUTION_KIND_INVALID', 'Unsupported asset resolution kind: ' + source.kind, 'AssetResolver');
}
async function resolveProductionSet(input) { var candidates = {}, debts = []; for (var index = 0; index < input.plan.workItems.length; index++) { var item = input.plan.workItems[index]; try { var candidate = await resolveWorkItem(Object.assign({}, input, { workItem: item })); if (candidate) candidates[item.slotId] = candidate; } catch (error) { debts.push({ slotId: item.slotId, code: error.code || 'ASSET_PRODUCTION_RESOLVE_FAILED', owner: error.owner || 'AssetResolver', message: error.message }); } } return { candidates: candidates, debts: debts }; }

module.exports = { resolveWorkItem: resolveWorkItem, resolveProductionSet: resolveProductionSet };
