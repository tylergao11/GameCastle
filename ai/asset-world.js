var crypto = require('crypto');
var frameSet = require('./frame-set');
var reviewContract = require('../shared/asset-semantic-review-contract.json');

var SCHEMA_VERSION = 4;
var DOCUMENT_KIND = 'semantic-asset-world';

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, {}); return value; }
function digest(value) { return crypto.createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex'); }
function contentHash(value) { return 'asset-world.' + digest(stable(value)).slice(0, 24); }
function workItemReceiptId(receipt) { return 'work-acceptance.' + digest(receipt).slice(0, 24); }
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'SemanticAssetWorld'; throw error; }
function object(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('SEMANTIC_ASSET_WORLD_INVALID', label + ' must be an object.'); return value; }
function array(value, label) { if (!Array.isArray(value)) fail('SEMANTIC_ASSET_WORLD_INVALID', label + ' must be an array.'); return value; }
function text(value, label) { if (typeof value !== 'string' || !value.trim()) fail('SEMANTIC_ASSET_WORLD_INVALID', label + ' must be non-empty text.'); return value; }
function same(left, right) { return JSON.stringify(stable(left)) === JSON.stringify(stable(right)); }
function unique(values, label) { if (new Set(values).size !== values.length) fail('SEMANTIC_ASSET_WORLD_INVALID', label + ' must be unique.'); }
function sorted(values) { return values.slice().sort(); }
function allowed(value, fields, label) { Object.keys(value).forEach(function(field) { if (fields.indexOf(field) < 0) fail('SEMANTIC_ASSET_WORLD_INVALID', label + ' contains unknown field: ' + field + '.'); }); }

function coreForHash(value) {
  var core = clone(value);
  delete core.contentHash;
  return core;
}

function expectedEvidenceIds(asset) {
  if (asset.frameSet) {
    var accepted = frameSet.validate(asset.frameSet);
    return [accepted.contentHash, accepted.acceptanceReceiptId];
  }
  return (asset.derivationReceipts || []).map(function(receipt) { return receipt.outputHash; }).concat([asset.sha256]);
}

function acceptedRevision(asset) {
  if (asset.frameSet) return frameSet.validate(asset.frameSet).revisionId;
  return text(asset.revisionId, 'asset revisionId');
}

function imageHashes(asset) {
  if (asset.frameSet) return frameSet.validate(asset.frameSet).frames.map(function(frame) { return frame.sha256; });
  return [text(asset.sha256, 'asset sha256')];
}

function validateReviewReceipt(receipt, asset, workReceipt) {
  object(receipt, 'review receipt');
  text(receipt.receiptId, 'review receipt.receiptId');
  if (receipt.decision !== 'accepted') fail('SEMANTIC_ASSET_WORLD_REVIEW_INVALID', 'Every AssetWorld review or integrity receipt must be accepted.');
  if (receipt.workItemPlanId !== workReceipt.workItemPlanId || receipt.targetVisualSlotId !== workReceipt.targetVisualSlotId || receipt.targetVisualSlotId !== asset.targetVisualSlotId) fail('SEMANTIC_ASSET_WORLD_REVIEW_INVALID', 'Review or integrity receipt does not bind the accepted work item and target slot for ' + asset.slotId + '.');
  var resourceKind = asset.frameSet ? frameSet.validate(asset.frameSet).resourceKind : asset.resourceKind;
  if (resourceKind === 'image') {
    if (!Array.isArray(receipt.imageSha256s) || !same(receipt.imageSha256s, imageHashes(asset))) fail('SEMANTIC_ASSET_WORLD_REVIEW_INVALID', 'Image review receipt does not bind the exact accepted image bytes for ' + asset.slotId + '.');
    if (receipt.phase !== 'final-derived-asset' || typeof receipt.modelFingerprint !== 'string' || !receipt.modelFingerprint) fail('SEMANTIC_ASSET_WORLD_REVIEW_INVALID', 'Image review receipt does not identify the final review phase and model for ' + asset.slotId + '.');
    if (!Number.isFinite(receipt.semanticMargin) || !Number.isFinite(receipt.styleMargin) || receipt.semanticMargin < reviewContract.thresholds.finalSemanticMargin || receipt.styleMargin < reviewContract.thresholds.finalStyleMargin) fail('SEMANTIC_ASSET_WORLD_REVIEW_INVALID', 'Image review receipt does not satisfy the pinned final margins for ' + asset.slotId + '.');
    return clone(receipt);
  }
  if (receipt.phase !== 'resource-integrity' || receipt.sha256 !== asset.sha256 || receipt.format !== asset.format) fail('SEMANTIC_ASSET_WORLD_REVIEW_INVALID', 'Resource integrity receipt does not bind the accepted resource bytes and format for ' + asset.slotId + '.');
  var expectedId = 'resource-integrity.' + digest([workReceipt.workItemPlanId, workReceipt.targetVisualSlotId, asset.sha256, asset.format]).slice(0, 24);
  if (receipt.receiptId !== expectedId) fail('SEMANTIC_ASSET_WORLD_REVIEW_INVALID', 'Resource integrity receipt id is invalid for ' + asset.slotId + '.');
  return clone(receipt);
}

function validateAcceptance(assetManifest, productionSetReceipt, workItemReceipts, reviewReceipts) {
  object(assetManifest, 'assetManifest');
  object(assetManifest.meta, 'assetManifest.meta');
  object(assetManifest.summary, 'assetManifest.summary');
  if (assetManifest.meta.status !== 'ready' || assetManifest.summary.publishable !== true) fail('SEMANTIC_ASSET_WORLD_NOT_ACCEPTED', 'AssetWorld requires a ready, publishable asset manifest.');
  text(assetManifest.sourceHash, 'assetManifest.sourceHash');
  text(assetManifest.productionSetId, 'assetManifest.productionSetId');
  var assets = array(assetManifest.assets, 'assetManifest.assets');
  if (!assets.length) fail('SEMANTIC_ASSET_WORLD_NOT_ACCEPTED', 'AssetWorld requires at least one accepted asset.');
  unique(assets.map(function(asset) { return text(asset && asset.slotId, 'asset.slotId'); }), 'asset slot ids');
  unique(assets.map(function(asset) { return text(asset && asset.targetVisualSlotId, 'asset.targetVisualSlotId'); }), 'asset target visual slot ids');

  object(productionSetReceipt, 'productionSetAcceptanceReceipt');
  if (productionSetReceipt.productionSetId !== assetManifest.productionSetId || productionSetReceipt.decision !== 'accepted') fail('SEMANTIC_ASSET_WORLD_NOT_ACCEPTED', 'Production set receipt must accept the exact asset manifest production set.');
  object(productionSetReceipt.requiredSlotCoverage, 'productionSetAcceptanceReceipt.requiredSlotCoverage');
  if (productionSetReceipt.requiredSlotCoverage.complete !== true || !Array.isArray(productionSetReceipt.requiredSlotCoverage.missingTargetVisualSlotIds) || productionSetReceipt.requiredSlotCoverage.missingTargetVisualSlotIds.length) fail('SEMANTIC_ASSET_WORLD_COVERAGE_INVALID', 'Production set acceptance must have complete slot coverage.');
  object(productionSetReceipt.acceptedRevisionByTargetVisualSlotId, 'productionSetAcceptanceReceipt.acceptedRevisionByTargetVisualSlotId');
  array(productionSetReceipt.workItemAcceptanceReceiptIds, 'productionSetAcceptanceReceipt.workItemAcceptanceReceiptIds');

  workItemReceipts = array(workItemReceipts, 'workItemAcceptanceReceipts');
  reviewReceipts = array(reviewReceipts, 'reviewReceipts');
  if (workItemReceipts.length !== assets.length || reviewReceipts.length !== assets.length) fail('SEMANTIC_ASSET_WORLD_COVERAGE_INVALID', 'Every accepted asset requires one work-item receipt and one unique review or integrity receipt.');
  var workByTarget = Object.create(null), reviewById = Object.create(null);
  workItemReceipts.forEach(function(receipt) {
    object(receipt, 'work-item acceptance receipt');
    var target = text(receipt.targetVisualSlotId, 'work-item acceptance receipt.targetVisualSlotId');
    if (receipt.decision !== 'accepted' || workByTarget[target]) fail('SEMANTIC_ASSET_WORLD_RECEIPT_INVALID', 'Work-item acceptance receipts must be accepted and target unique slots.');
    text(receipt.finalRevisionId, 'work-item acceptance receipt.finalRevisionId');
    text(receipt.reviewReceiptId, 'work-item acceptance receipt.reviewReceiptId');
    array(receipt.deterministicEvidenceIds, 'work-item acceptance receipt.deterministicEvidenceIds');
    workByTarget[target] = receipt;
  });
  reviewReceipts.forEach(function(receipt) { var id = text(receipt && receipt.receiptId, 'review receipt.receiptId'); if (reviewById[id]) fail('SEMANTIC_ASSET_WORLD_RECEIPT_INVALID', 'Review receipt ids must be unique.'); reviewById[id] = receipt; });

  var expectedTargets = assets.map(function(asset) { return asset.targetVisualSlotId; });
  var coverage = productionSetReceipt.requiredSlotCoverage;
  if (!same(sorted(coverage.expectedTargetVisualSlotIds || []), sorted(expectedTargets)) || !same(sorted(coverage.acceptedTargetVisualSlotIds || []), sorted(expectedTargets))) fail('SEMANTIC_ASSET_WORLD_COVERAGE_INVALID', 'Production set coverage does not match the accepted manifest assets.');
  if (!same(sorted(Object.keys(productionSetReceipt.acceptedRevisionByTargetVisualSlotId)), sorted(expectedTargets))) fail('SEMANTIC_ASSET_WORLD_COVERAGE_INVALID', 'Production set revision coverage does not match the accepted manifest assets.');
  var expectedWorkIds = workItemReceipts.map(workItemReceiptId);
  if (!same(sorted(productionSetReceipt.workItemAcceptanceReceiptIds), sorted(expectedWorkIds))) fail('SEMANTIC_ASSET_WORLD_RECEIPT_INVALID', 'Production set receipt does not bind the supplied work-item acceptance receipts.');

  var usedReviews = Object.create(null);
  assets.forEach(function(asset) {
    var target = asset.targetVisualSlotId, workReceipt = workByTarget[target];
    if (!workReceipt) fail('SEMANTIC_ASSET_WORLD_COVERAGE_INVALID', 'Accepted asset has no work-item acceptance receipt: ' + asset.slotId + '.');
    var revisionId = acceptedRevision(asset);
    if (workReceipt.finalRevisionId !== revisionId || productionSetReceipt.acceptedRevisionByTargetVisualSlotId[target] !== revisionId) fail('SEMANTIC_ASSET_WORLD_REVISION_MISMATCH', 'Acceptance receipts do not bind the accepted revision for ' + asset.slotId + '.');
    if (!same(workReceipt.deterministicEvidenceIds, expectedEvidenceIds(asset))) fail('SEMANTIC_ASSET_WORLD_RECEIPT_INVALID', 'Work-item deterministic evidence does not bind the accepted artifact for ' + asset.slotId + '.');
    var reviewReceipt = reviewById[workReceipt.reviewReceiptId];
    if (!reviewReceipt) fail('SEMANTIC_ASSET_WORLD_REVIEW_INVALID', 'Work-item receipt references no supplied review or integrity receipt for ' + asset.slotId + '.');
    validateReviewReceipt(reviewReceipt, asset, workReceipt);
    usedReviews[reviewReceipt.receiptId] = true;
  });
  if (Object.keys(usedReviews).length !== reviewReceipts.length) fail('SEMANTIC_ASSET_WORLD_REVIEW_INVALID', 'AssetWorld contains an unused review or integrity receipt.');
  return { assets: assets, workByTarget: workByTarget, reviewById: reviewById };
}

function slotsFromAcceptance(acceptance) {
  return acceptance.assets.map(function(asset) {
    var acceptedFrameSet = asset.frameSet ? frameSet.validate(asset.frameSet) : null, workReceipt = acceptance.workByTarget[asset.targetVisualSlotId], common = { semanticId: asset.slotId, targetVisualSlotId: asset.targetVisualSlotId, assetId: asset.assetId, revisionId: acceptedRevision(asset), resourceKind: acceptedFrameSet ? acceptedFrameSet.resourceKind : asset.resourceKind || (String(asset.format || '').toLowerCase() === 'png' ? 'image' : null), source: asset.source, workItemAcceptanceReceiptId: workItemReceiptId(workReceipt), reviewReceiptId: workReceipt.reviewReceiptId };
    if (asset.frameSet) return Object.assign(common, { frameSet: acceptedFrameSet });
    if (!asset.path || !asset.sha256) fail('SEMANTIC_ASSET_WORLD_INVALID', 'Accepted single-resource manifest entry is incomplete: ' + asset.slotId + '.');
    return Object.assign(common, { path: asset.path, sha256: asset.sha256, format: asset.format, width: asset.width, height: asset.height, transparent: asset.transparent === true });
  }).sort(function(left, right) { return left.semanticId.localeCompare(right.semanticId); });
}

function validateAcceptedAssetWorld(value, options) {
  options = options || {};
  object(value, 'AssetWorld');
  allowed(value, ['schemaVersion', 'documentKind', 'sourceHash', 'productionSetId', 'manifestMeta', 'manifestSummary', 'acceptedAssets', 'productionSetAcceptanceReceipt', 'workItemAcceptanceReceipts', 'reviewReceipts', 'slots', 'contentHash'], 'AssetWorld');
  if (value.schemaVersion !== SCHEMA_VERSION || value.documentKind !== DOCUMENT_KIND) fail('SEMANTIC_ASSET_WORLD_INVALID', 'Accepted AssetWorld has an invalid kind or version.');
  var sourceHash = text(value.sourceHash, 'AssetWorld.sourceHash');
  if (options.sourceHash !== undefined && sourceHash !== options.sourceHash) fail('SEMANTIC_ASSET_WORLD_SOURCE_MISMATCH', 'Accepted AssetWorld sourceHash does not match the active project seed.');
  text(value.productionSetId, 'AssetWorld.productionSetId');
  var acceptance = validateAcceptance({ meta: value.manifestMeta, summary: value.manifestSummary, sourceHash: sourceHash, productionSetId: value.productionSetId, assets: value.acceptedAssets }, value.productionSetAcceptanceReceipt, value.workItemAcceptanceReceipts, value.reviewReceipts);
  var expectedSlots = slotsFromAcceptance(acceptance);
  if (!same(value.slots, expectedSlots)) fail('SEMANTIC_ASSET_WORLD_INVALID', 'AssetWorld slots must be derived from its accepted assets and receipts.');
  if (value.contentHash !== contentHash(coreForHash(value))) fail('SEMANTIC_ASSET_WORLD_CONTENT_HASH_INVALID', 'AssetWorld contentHash does not bind its accepted content.');
  return clone(value);
}

function buildAcceptedAssetWorld(input) {
  input = object(input, 'buildAcceptedAssetWorld input');
  allowed(input, ['assetManifest', 'productionSetAcceptanceReceipt', 'workItemAcceptanceReceipts', 'reviewReceipts'], 'buildAcceptedAssetWorld input');
  var assetManifest = object(input.assetManifest, 'assetManifest'), productionSetReceipt = input.productionSetAcceptanceReceipt, workItemReceipts = clone(input.workItemAcceptanceReceipts || []), reviewReceipts = clone(input.reviewReceipts || []);
  var acceptance = validateAcceptance(assetManifest, productionSetReceipt, workItemReceipts, reviewReceipts);
  var document = {
    schemaVersion: SCHEMA_VERSION,
    documentKind: DOCUMENT_KIND,
    sourceHash: assetManifest.sourceHash,
    productionSetId: assetManifest.productionSetId,
    manifestMeta: clone(assetManifest.meta),
    manifestSummary: clone(assetManifest.summary),
    acceptedAssets: clone(assetManifest.assets),
    productionSetAcceptanceReceipt: clone(productionSetReceipt),
    workItemAcceptanceReceipts: workItemReceipts,
    reviewReceipts: reviewReceipts,
    slots: slotsFromAcceptance(acceptance)
  };
  document.contentHash = contentHash(document);
  return validateAcceptedAssetWorld(document);
}

module.exports = { buildAcceptedAssetWorld: buildAcceptedAssetWorld, validateAcceptedAssetWorld: validateAcceptedAssetWorld };
