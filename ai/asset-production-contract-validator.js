var contract = require('../shared/asset-production-pipeline-contract.json');
var reviewContract = require('../shared/asset-semantic-review-contract.json');
var styleDNA = require('./style-dna');

function fail(code, message, owner) {
  var error = new Error(message); error.code = code; error.owner = owner || 'AssetProductionPipeline'; throw error;
}
function object(value, name) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('ASSET_PRODUCTION_ARTIFACT_INVALID', name + ' must be an object.'); }
function required(name, value) {
  object(value, name);
  var artifact = contract.artifacts[name]; if (!artifact) fail('ASSET_PRODUCTION_ARTIFACT_UNKNOWN', 'Unknown asset production artifact: ' + name);
  var missing = artifact.required.filter(function(field) { return value[field] === undefined; });
  if (missing.length) fail('ASSET_PRODUCTION_ARTIFACT_INVALID', name + ' missing required fields: ' + missing.join(', '), artifact.owner);
  return value;
}
function unique(values, code, message) { if (new Set(values).size !== values.length) fail(code, message); }
function validateSemanticReview(value, imageSha256s, context) {
  required('SemanticReviewReceipt', value);
  var workItem = context && context.workItem, slot = workItem && workItem.assetSpec;
  if (!workItem || !slot) fail('ASSET_SEMANTIC_REVIEW_EVIDENCE_INVALID', 'Semantic review validation requires the current work item and visual slot.', 'CLIPImageReviewer');
  if (value.decision !== 'accepted') fail('ASSET_SEMANTIC_REVIEW_REJECTED', 'Semantic review receipt did not accept the final asset pixels.', 'CLIPImageReviewer');
  if (value.phase !== 'final-derived-asset') fail('ASSET_SEMANTIC_REVIEW_EVIDENCE_INVALID', 'Semantic review receipt must describe the final-derived-asset phase.', 'CLIPImageReviewer');
  if (value.workItemPlanId !== workItem.workItemPlanId || value.targetVisualSlotId !== workItem.targetVisualSlotId || value.targetVisualSlotId !== slot.targetVisualSlotId) fail('ASSET_SEMANTIC_REVIEW_EVIDENCE_INVALID', 'Semantic review receipt must bind the exact work item and target visual slot.', 'CLIPImageReviewer');
  var expectedPolicyFingerprint = styleDNA.reviewPolicyFingerprint(slot.styleId, slot, 'final-derived-asset');
  if (value.reviewPolicyFingerprint !== expectedPolicyFingerprint) fail('ASSET_SEMANTIC_REVIEW_EVIDENCE_INVALID', 'Semantic review receipt was produced under a stale or different review policy.', 'CLIPImageReviewer');
  if (value.modelRevision !== reviewContract.model.revision) fail('ASSET_SEMANTIC_REVIEW_EVIDENCE_INVALID', 'Semantic review receipt was produced by a stale model revision.', 'CLIPImageReviewer');
  if (typeof value.receiptId !== 'string' || !value.receiptId || typeof value.modelFingerprint !== 'string' || !value.modelFingerprint) fail('ASSET_SEMANTIC_REVIEW_EVIDENCE_INVALID', 'Semantic review receipt requires a stable receiptId and modelFingerprint.', 'CLIPImageReviewer');
  if (!Array.isArray(value.imageSha256s) || JSON.stringify(value.imageSha256s) !== JSON.stringify(imageSha256s || [])) fail('ASSET_SEMANTIC_REVIEW_EVIDENCE_INVALID', 'Semantic review receipt must bind the exact final image hashes.', 'CLIPImageReviewer');
  if (!Number.isFinite(value.semanticMargin) || !Number.isFinite(value.styleMargin)) fail('ASSET_SEMANTIC_REVIEW_EVIDENCE_INVALID', 'Semantic review margins must be finite numbers.', 'CLIPImageReviewer');
  if (value.semanticMargin < reviewContract.thresholds.finalSemanticMargin || value.styleMargin < reviewContract.thresholds.finalStyleMargin) fail('ASSET_SEMANTIC_REVIEW_REJECTED', 'Semantic review margins do not satisfy the pinned final thresholds.', 'CLIPImageReviewer');
  if (!Array.isArray(value.decisions) || value.decisions.length !== value.imageSha256s.length) fail('ASSET_SEMANTIC_REVIEW_EVIDENCE_INVALID', 'Semantic review receipt requires one decision for every final image.', 'CLIPImageReviewer');
  var expectedChecks = styleDNA.reviewTexts(slot.styleId, slot, 'final-derived-asset').compositionChecks.map(function(check) { return check.id; }).sort(), semanticMargins = [], styleMargins = [];
  value.decisions.forEach(function(decision, index) {
    if (!decision || decision.decision !== 'accepted' || decision.phase !== 'final-derived-asset' || decision.imageSha256 !== value.imageSha256s[index]) fail('ASSET_SEMANTIC_REVIEW_EVIDENCE_INVALID', 'Every semantic review decision must accept and bind its exact final image.', 'CLIPImageReviewer');
    if (decision.modelRevision !== value.modelRevision) fail('ASSET_SEMANTIC_REVIEW_EVIDENCE_INVALID', 'Every semantic review decision must bind the aggregate model revision.', 'CLIPImageReviewer');
    if (decision.modelFingerprint !== value.modelFingerprint) fail('ASSET_SEMANTIC_REVIEW_EVIDENCE_INVALID', 'Every semantic review decision must bind the aggregate model fingerprint.', 'CLIPImageReviewer');
    if (!Number.isFinite(decision.semanticSimilarity) || !Number.isFinite(decision.semanticMargin) || !Number.isFinite(decision.styleMargin)) fail('ASSET_SEMANTIC_REVIEW_EVIDENCE_INVALID', 'Every semantic review decision requires finite semantic and style scores.', 'CLIPImageReviewer');
    if (decision.semanticMargin < reviewContract.thresholds.finalSemanticMargin || decision.styleMargin < reviewContract.thresholds.finalStyleMargin) fail('ASSET_SEMANTIC_REVIEW_REJECTED', 'A final image decision does not satisfy the pinned semantic or style threshold.', 'CLIPImageReviewer');
    if (!Array.isArray(decision.compositionChecks)) fail('ASSET_SEMANTIC_REVIEW_EVIDENCE_INVALID', 'Every final image decision requires composition evidence.', 'CLIPImageReviewer');
    var actualChecks = decision.compositionChecks.map(function(check) { return check && check.id; }).sort();
    if (new Set(actualChecks).size !== actualChecks.length || JSON.stringify(actualChecks) !== JSON.stringify(expectedChecks)) fail('ASSET_SEMANTIC_REVIEW_EVIDENCE_INVALID', 'Final image composition evidence does not match the current review policy.', 'CLIPImageReviewer');
    decision.compositionChecks.forEach(function(check) { if (!Number.isFinite(check.margin)) fail('ASSET_SEMANTIC_REVIEW_EVIDENCE_INVALID', 'Composition margins must be finite.', 'CLIPImageReviewer'); if (check.margin < reviewContract.thresholds.finalSemanticMargin) fail('ASSET_SEMANTIC_REVIEW_REJECTED', 'A required final composition check was rejected.', 'CLIPImageReviewer'); });
    semanticMargins.push(decision.semanticMargin); styleMargins.push(decision.styleMargin);
  });
  if (value.semanticMargin !== Math.min.apply(null, semanticMargins) || value.styleMargin !== Math.min.apply(null, styleMargins)) fail('ASSET_SEMANTIC_REVIEW_EVIDENCE_INVALID', 'Aggregate semantic review margins must equal the minimum per-image margins.', 'CLIPImageReviewer');
  return value;
}
function validateRequest(value) {
  required('AssetProductionRequest', value);
  if (typeof value.sourceHash !== 'string' || !value.sourceHash) fail('ASSET_PRODUCTION_SOURCE_HASH_INVALID', 'AssetProductionRequest requires a GameSemanticSource hash.', 'AssetProductionPlanner');
  if (!Array.isArray(value.requirements) || !value.requirements.length) fail('ASSET_PRODUCTION_REQUIREMENTS_INVALID', 'AssetProductionRequest requires semantic asset requirements.', 'AssetProductionPlanner');
  unique(value.requirements.map(function(item) { return item && item.semanticId; }), 'ASSET_PRODUCTION_REQUIREMENT_DUPLICATE', 'AssetProductionRequest semantic asset requirements must be unique.');
  return value;
}
function validatePlan(value) {
  required('AssetProductionSetPlan', value);
  if (!Array.isArray(value.workItems) || !value.workItems.length) fail('ASSET_PRODUCTION_WORK_ITEMS_INVALID', 'AssetProductionSetPlan requires workItems.', 'AssetProductionPlanner');
  value.workItems.forEach(function(item) { required('AssetWorkItemPlan', item); });
  unique(value.workItems.map(function(item) { return item.workItemPlanId; }), 'ASSET_PRODUCTION_WORK_ITEM_DUPLICATE', 'workItemPlanId must be unique.');
  unique(value.workItems.map(function(item) { return item.semanticId; }), 'ASSET_PRODUCTION_REQUIREMENT_DUPLICATE', 'AssetProductionSetPlan semantic ids must be unique.');
  unique(value.workItems.map(function(item) { return item.targetVisualSlotId; }), 'ASSET_PRODUCTION_TARGET_DUPLICATE', 'AssetProductionSetPlan targetVisualSlotId must be unique.');
  return value;
}
function validateSetAcceptance(value) {
  required('AssetProductionSetAcceptanceReceipt', value);
  if (!Array.isArray(value.workItemAcceptanceReceiptIds)) fail('ASSET_PRODUCTION_ACCEPTANCE_INVALID', 'Production set receipt ids must be an array.', 'AssetAcceptanceGate');
  object(value.requiredSlotCoverage, 'AssetProductionSetAcceptanceReceipt.requiredSlotCoverage');
  object(value.acceptedRevisionByTargetVisualSlotId, 'AssetProductionSetAcceptanceReceipt.acceptedRevisionByTargetVisualSlotId');
  if (value.decision === 'accepted' && (!value.workItemAcceptanceReceiptIds.length || value.requiredSlotCoverage.complete !== true)) fail('ASSET_PRODUCTION_ACCEPTANCE_INCOMPLETE', 'Accepted production set requires receipts and complete slot coverage.', 'AssetAcceptanceGate');
  return value;
}
module.exports = { contract: contract, validateArtifact: required, validateSemanticReview: validateSemanticReview, validateRequest: validateRequest, validatePlan: validatePlan, validateSetAcceptance: validateSetAcceptance };
