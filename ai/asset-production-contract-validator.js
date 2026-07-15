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
module.exports = { contract: contract, validateArtifact: required, validateRequest: validateRequest, validatePlan: validatePlan, validateSetAcceptance: validateSetAcceptance };
