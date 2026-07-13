var contract = require('../shared/asset-production-pipeline-contract.json');

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
function validateRequest(value) {
  required('AssetProductionRequest', value);
  if (!Array.isArray(value.requiredSlotIds) || !value.requiredSlotIds.length) fail('ASSET_PRODUCTION_REQUIRED_SLOTS_INVALID', 'AssetProductionRequest requires at least one requiredSlotId.', 'AssetProductionPlanner');
  unique(value.requiredSlotIds, 'ASSET_PRODUCTION_SLOT_DUPLICATE', 'AssetProductionRequest requiredSlotIds must be unique.');
  object(value.targetVisualSlotIds, 'AssetProductionRequest.targetVisualSlotIds');
  var keys = Object.keys(value.targetVisualSlotIds).sort(), requiredIds = value.requiredSlotIds.slice().sort();
  if (JSON.stringify(keys) !== JSON.stringify(requiredIds)) fail('ASSET_PRODUCTION_TARGET_COVERAGE_INVALID', 'targetVisualSlotIds keys must exactly equal requiredSlotIds.', 'AssetProductionPlanner');
  var targets = keys.map(function(key) { return value.targetVisualSlotIds[key]; });
  if (targets.some(function(target) { return typeof target !== 'string' || !target; })) fail('ASSET_PRODUCTION_TARGET_INVALID', 'Every targetVisualSlotId must be a non-empty string.', 'AssetProductionPlanner');
  unique(targets, 'ASSET_PRODUCTION_TARGET_DUPLICATE', 'targetVisualSlotIds must be unique.');
  return value;
}
function validatePlan(value) {
  required('AssetProductionSetPlan', value);
  if (!Array.isArray(value.workItems) || !value.workItems.length) fail('ASSET_PRODUCTION_WORK_ITEMS_INVALID', 'AssetProductionSetPlan requires workItems.', 'AssetProductionPlanner');
  value.workItems.forEach(function(item) { required('AssetWorkItemPlan', item); });
  unique(value.workItems.map(function(item) { return item.workItemPlanId; }), 'ASSET_PRODUCTION_WORK_ITEM_DUPLICATE', 'workItemPlanId must be unique.');
  unique(value.workItems.map(function(item) { return item.slotId; }), 'ASSET_PRODUCTION_SLOT_DUPLICATE', 'AssetProductionSetPlan slotId must be unique.');
  unique(value.workItems.map(function(item) { return item.targetVisualSlotId; }), 'ASSET_PRODUCTION_TARGET_DUPLICATE', 'AssetProductionSetPlan targetVisualSlotId must be unique.');
  return value;
}
function validateRevision(value) {
  required('AssetRevision', value);
  if (!Array.isArray(value.parentRevisionIds)) fail('ASSET_PRODUCTION_REVISION_PARENT_INVALID', 'AssetRevision.parentRevisionIds must be an array.', 'AssetEngine');
  if (!Array.isArray(value.executionReceipts) || !value.executionReceipts.length) fail('ASSET_PRODUCTION_REVISION_RECEIPT_REQUIRED', 'Every pixel revision requires at least one execution receipt.', 'AssetEngine');
  if (!/^[a-f0-9]{64}$/.test(value.sha256)) fail('ASSET_PRODUCTION_REVISION_HASH_INVALID', 'AssetRevision.sha256 must be a lowercase SHA-256.', 'AssetEngine');
  return value;
}
function validateMask(value) {
  required('MaskRevision', value);
  if (!/^[a-f0-9]{64}$/.test(value.sha256)) fail('ASSET_PRODUCTION_MASK_HASH_INVALID', 'MaskRevision.sha256 must be a lowercase SHA-256.', 'VisionInspector');
  if (!Number.isInteger(value.width) || !Number.isInteger(value.height) || value.width < 1 || value.height < 1) fail('ASSET_PRODUCTION_MASK_DIMENSIONS_INVALID', 'MaskRevision dimensions are invalid.', 'LocalDerivationKernel');
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
function assertTransition(from, to) {
  var allowed = contract.closedLoop.stateMachine[from];
  if (!allowed || allowed.indexOf(to) < 0) fail('ASSET_PRODUCTION_TRANSITION_INVALID', 'Invalid asset production transition: ' + from + ' -> ' + to, 'AssetEngine');
  return true;
}

module.exports = { contract: contract, validateArtifact: required, validateRequest: validateRequest, validatePlan: validatePlan, validateRevision: validateRevision, validateMask: validateMask, validateSetAcceptance: validateSetAcceptance, assertTransition: assertTransition };
