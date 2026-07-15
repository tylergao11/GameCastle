var crypto = require('crypto');
var profiles = require('../shared/asset-engine-execution-profiles.json');
var workflowRegistry = require('../shared/comfyui-workflow-registry.json');
var productionContract = require('../shared/asset-production-pipeline-contract.json');

function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, {}); return value; }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = profiles.owner; throw error; }
function looseOverride(input) {
  if (input.maxAttempts !== undefined) return 'maxAttempts';
  var provider = input.providerOptions || {}, names = ['timeoutMs', 'batchSize', 'candidateRounds', 'maxAttempts', 'reviewTimeoutMs'];
  for (var index = 0; index < names.length; index++) if (provider[names[index]] !== undefined) return 'providerOptions.' + names[index];
  return null;
}
function resolve(input) {
  input = input || {};
  var forbidden = looseOverride(input); if (forbidden) fail('ASSET_ENGINE_LOOSE_EXECUTION_OVERRIDE_FORBIDDEN', 'AssetEngine execution limits require a named profile; remove loose override ' + forbidden + '.');
  var profileId = input.executionProfileId || profiles.defaultProfileId, profile = profiles.profiles[profileId];
  if (!profile) fail('ASSET_ENGINE_EXECUTION_PROFILE_UNKNOWN', 'Unknown AssetEngine execution profile: ' + profileId);
  var modelId = input.providerOptions && (input.providerOptions.imageModel || input.providerOptions.model) || process.env.ASSET_IMAGE_MODEL || process.env.COMFYUI_IMAGE_MODEL || Object.keys(workflowRegistry.workflows)[0], workflow = workflowRegistry.workflows[modelId];
  if (!workflow || !workflow.candidatePolicy) fail('ASSET_ENGINE_EXECUTION_WORKFLOW_UNKNOWN', 'Execution profile cannot resolve the registered master-image workflow.');
  var retryPolicies = Object.keys(productionContract.retryPolicies || {}).map(function(id) { return productionContract.retryPolicies[id]; }), pinnedAttempts = Math.max.apply(null, retryPolicies.map(function(policy) { return policy.generationAttempts; }));
  var effective = {
    profileId: profileId,
    mode: profile.mode,
    modelId: modelId,
    maxGeneratedWorkItems: profile.maxGeneratedWorkItems === undefined ? null : profile.maxGeneratedWorkItems,
    maxProductionAttempts: profile.maxProductionAttempts === undefined ? pinnedAttempts : profile.maxProductionAttempts,
    candidateRounds: profile.candidateRounds === undefined ? workflow.candidatePolicy.defaultRounds : profile.candidateRounds,
    candidatesPerRound: workflow.candidatePolicy.candidatesPerRound,
    totalDeadlineMs: profile.totalDeadlineMs === undefined ? workflow.maxTimeoutMs : profile.totalDeadlineMs
  };
  if (!Number.isInteger(effective.maxProductionAttempts) || effective.maxProductionAttempts < 1 || !Number.isInteger(effective.candidateRounds) || effective.candidateRounds < 1 || effective.candidateRounds > workflow.candidatePolicy.maxRounds || !Number.isInteger(effective.candidatesPerRound) || effective.candidatesPerRound !== 2 || !Number.isInteger(effective.totalDeadlineMs) || effective.totalDeadlineMs < 1 || effective.totalDeadlineMs > workflow.maxTimeoutMs || (effective.maxGeneratedWorkItems !== null && (!Number.isInteger(effective.maxGeneratedWorkItems) || effective.maxGeneratedWorkItems < 1))) fail('ASSET_ENGINE_EXECUTION_PROFILE_INVALID', 'AssetEngine execution profile violates the pinned provider and production ceilings.');
  effective.maxWorkflowSubmissionsPerGeneratedWorkItem = effective.maxProductionAttempts * effective.candidateRounds;
  effective.maxCandidateImagesPerGeneratedWorkItem = effective.maxWorkflowSubmissionsPerGeneratedWorkItem * effective.candidatesPerRound;
  effective.profileHash = hash({ contractId: profiles.contractId, schemaVersion: profiles.schemaVersion, profileId: profileId, profile: profile, effective: effective, workflowRevision: workflow.revision, productionSchemaVersion: productionContract.schemaVersion });
  return Object.freeze(effective);
}

module.exports = { contract: profiles, resolve: resolve };
