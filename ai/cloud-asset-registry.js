var crypto = require('crypto');
var contract = require('../shared/cloud-asset-engine-contract.json');
var cloud = require('../shared/cloud-asset-dictionary.json');
var styles = require('../shared/asset-style-dictionary.json');
var templates = require('../shared/asset-template-dictionary.json');
var localDerivation = require('../shared/local-derivation-contract.json');

function error(code, message) { var value = new Error(message); value.code = code; return value; }
function unique(values) { return Array.from(new Set((values || []).filter(Boolean))).sort(); }
function fingerprint(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function known(map, value) { return !!map[String(value || '')]; }

function createCloudAssetRegistry() {
  var staticFingerprint = fingerprint({ contract: contract, cloud: cloud, style: styles, template: templates, local: localDerivation });
  function requireId(section, id, code) { if (!known(cloud[section] || {}, id)) throw error(code || 'CLOUD_DICTIONARY_ID_INVALID', 'Unknown ' + section + ' id: ' + id); return id; }
  function compileSemanticTags(values) {
    return unique(unique(values).map(function(value) {
      var id = String(value || '').trim();
      if (known(cloud.semanticTags, id)) return id;
      var compiled = cloud.inputTerms[String(id).toLowerCase()];
      if (compiled && known(cloud.semanticTags, compiled)) return compiled;
      throw error('CLOUD_SEMANTIC_TAG_INVALID', 'Unknown public semantic tag: ' + id);
    }));
  }
  function requireSemanticTags(values) {
    var tags = unique(values);
    if (!tags.length) throw error('CLOUD_SEMANTIC_TAG_REQUIRED', 'Public cloud asset requires at least one semantic tag.');
    tags.forEach(function(id) { requireId('semanticTags', id, 'CLOUD_SEMANTIC_TAG_INVALID'); });
    return tags;
  }
  function requireStyle(styleId) { if (!styles.styles[styleId]) throw error('CLOUD_STYLE_INVALID', 'Unknown styleId: ' + styleId); return styleId; }
  function template(templateId) { var found = templates.templates.find(function(item) { return item.id === templateId && item.status === 'approved'; }); if (!found) throw error('CLOUD_TEMPLATE_INVALID', 'Unknown or inactive template: ' + templateId); return found; }
  function templateSlot(templateId, slotId) { var found = template(templateId).slots.find(function(slot) { return slot.id === slotId || templateId + '::' + slot.id === slotId; }); if (!found) throw error('CLOUD_TEMPLATE_SLOT_INVALID', 'Unknown template slot: ' + templateId + '::' + slotId); return found; }
  function requireKind(kind) { if (contract.assetKinds.indexOf(kind) < 0) throw error('CLOUD_ASSET_KIND_INVALID', 'Unknown cloud asset kind: ' + kind); return kind; }
  function requireQualityTier(id) { return requireId('qualityTiers', id, 'CLOUD_QUALITY_TIER_INVALID'); }
  function requireQualityFlags(values) { var flags = unique(values); flags.forEach(function(id) { requireId('qualityFlags', id, 'CLOUD_QUALITY_FLAG_INVALID'); }); return flags; }
  function requireProvenance(id) { return requireId('provenanceTypes', id, 'CLOUD_PROVENANCE_INVALID'); }
  function requireLicense(id) { return requireId('licensePolicies', id, 'CLOUD_LICENSE_INVALID'); }
  function requireBundleKind(id) { return requireId('bundleKinds', id, 'CLOUD_BUNDLE_KIND_INVALID'); }
  function publicAllowed(asset) {
    var provenance = cloud.provenanceTypes[asset.provenanceTypeId], license = cloud.licensePolicies[asset.licensePolicyId], quality = cloud.qualityTiers[asset.qualityTierId];
    return !!(provenance && provenance.publicPromotionAllowed && license && license.publicPromotionAllowed && quality && quality.publicQueryAllowed && !(asset.qualityFlags || []).some(function(flag) { return cloud.qualityFlags[flag].blocksPromotion; }));
  }
  function rights(asset) { var policy = cloud.licensePolicies[asset.licensePolicyId]; if (!policy) throw error('CLOUD_LICENSE_INVALID', 'Unknown license policy: ' + asset.licensePolicyId); return { reuseAllowed: policy.reuseAllowed, derivativeAllowed: policy.derivativeAllowed, redistributeInGameAllowed: policy.redistributeInGameAllowed, attributionRequired: policy.attributionRequired, licensePolicyId: asset.licensePolicyId }; }
  function normalizePromotionAsset(asset) {
    asset = asset || {};
    ['license', 'provenance', 'quality'].forEach(function(field) { if (Object.prototype.hasOwnProperty.call(asset, field)) throw error('CLOUD_LEGACY_PUBLIC_FIELD_FORBIDDEN', 'Legacy public field is forbidden: ' + field); });
    var normalized = {
      assetId: asset.assetId || null,
      path: asset.path,
      kind: requireKind(asset.kind || 'raster'),
      format: asset.format || 'png',
      width: asset.width || null,
      height: asset.height || null,
      transparent: asset.transparent === true,
      styleId: requireStyle(asset.styleId),
      semanticTags: requireSemanticTags(asset.semanticTags),
      provenanceTypeId: requireProvenance(asset.provenanceTypeId),
      licensePolicyId: requireLicense(asset.licensePolicyId),
      qualityTierId: requireQualityTier(asset.qualityTierId),
      qualityFlags: requireQualityFlags(asset.qualityFlags || []),
      templateSlots: asset.templateSlots || [],
      parentRevisionId: asset.parentRevisionId || null,
      localPlan: asset.localPlan || null,
      publishability: asset.publishability || null
    };
    if (cloud.provenanceTypes[normalized.provenanceTypeId].requiresParentRevision && !normalized.parentRevisionId) throw error('CLOUD_PARENT_REVISION_REQUIRED', 'Provenance requires parentRevisionId.');
    if (!publicAllowed(normalized)) throw error('CLOUD_PUBLIC_POLICY_DENIED', 'Public promotion is denied by provenance, license, or quality policy.');
    return normalized;
  }
  function normalizeQuerySpec(spec) {
    spec = spec || {};
    var normalized = Object.assign({}, spec, { styleId: requireStyle(spec.styleId), semanticTags: compileSemanticTags(spec.semanticTags || []) });
    if (spec.templateId) { var item = template(spec.templateId); normalized.templateId = item.id; if (spec.targetVisualSlotId || spec.slotId) templateSlot(item.id, spec.targetVisualSlotId || spec.slotId); }
    return normalized;
  }
  function projectionTemplates() { return templates.templates.filter(function(item) { return item.status === 'approved'; }); }
  return { contract: contract, cloud: cloud, styles: styles, templates: templates, localDerivation: localDerivation, fingerprint: staticFingerprint, compileSemanticTags: compileSemanticTags, requireSemanticTags: requireSemanticTags, requireStyle: requireStyle, requireKind: requireKind, requireQualityTier: requireQualityTier, requireQualityFlags: requireQualityFlags, requireProvenance: requireProvenance, requireLicense: requireLicense, requireBundleKind: requireBundleKind, template: template, templateSlot: templateSlot, normalizePromotionAsset: normalizePromotionAsset, normalizeQuerySpec: normalizeQuerySpec, publicAllowed: publicAllowed, rights: rights, projectionTemplates: projectionTemplates, error: error };
}

module.exports = { createCloudAssetRegistry: createCloudAssetRegistry };
