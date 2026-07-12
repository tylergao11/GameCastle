var assert = require('assert');
var registry = require('./cloud-asset-registry').createCloudAssetRegistry();

assert.deepEqual(registry.compileSemanticTags(['hero', 'role.hero', 'enemy']), ['role.enemy', 'role.hero']);
assert.throws(function() { registry.compileSemanticTags(['unbounded-text']); }, function(error) { return error.code === 'CLOUD_SEMANTIC_TAG_INVALID'; });
assert.throws(function() { registry.normalizePromotionAsset({ kind: 'raster', styleId: 'gamecastle.style-1', semanticTags: ['role.hero'], provenanceTypeId: 'provenance.user-final', licensePolicyId: 'license.unknown', qualityTierId: 'quality.accepted', qualityFlags: [] }); }, function(error) { return error.code === 'CLOUD_PUBLIC_POLICY_DENIED'; });
var normalized = registry.normalizePromotionAsset({ kind: 'raster', styleId: 'gamecastle.style-1', semanticTags: ['role.hero'], provenanceTypeId: 'provenance.user-final', licensePolicyId: 'license.creator-share', qualityTierId: 'quality.accepted', qualityFlags: [] });
assert.equal(registry.rights(normalized).reuseAllowed, true);
assert.equal(registry.templateSlot('game.runner.v1', 'hero').kind, 'sprite');
console.log('[CloudAssetRegistry] closed IDs, input compilation, policy denial, rights, and template ownership passed');
