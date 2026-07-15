var crypto = require('crypto');
var production = require('../shared/asset-production-pipeline-contract.json');
var validator = require('./asset-production-contract-validator');

function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'AssetProductionPlanner'; throw error; }
function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, {}); return value; }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }
function targetVisualSlotId(requirement) { return 'semantic.' + requirement.subject + '.' + requirement.semanticId; }

function compile(input) {
  input = input || {};
  var request = validator.validateRequest(clone(input.request || input));
  var seen = {};
  var workItems = request.requirements.map(function(requirement) {
    if (!requirement || !requirement.semanticId || seen[requirement.semanticId]) fail('ASSET_PRODUCTION_REQUIREMENT_INVALID', 'Asset requirements require unique semanticId values.');
    seen[requirement.semanticId] = true;
    var family = production.productionFamilies[requirement.productionFamily];
    if (!family) fail('ASSET_PRODUCTION_FAMILY_INVALID', 'Unknown production family: ' + requirement.productionFamily);
    var recipeId = requirement.recipeId || family.defaultRecipeId;
    var recipe = production.recipes[recipeId];
    if (!recipe) fail('ASSET_PRODUCTION_RECIPE_INVALID', 'Pinned production truth has no recipe: ' + recipeId);
    var retryPolicy = production.retryPolicies && production.retryPolicies[recipe.retryPolicyId];
    if (!retryPolicy || !Number.isInteger(retryPolicy.generationAttempts) || retryPolicy.generationAttempts < 1 || !Array.isArray(retryPolicy.retryableCodes)) fail('ASSET_PRODUCTION_RETRY_POLICY_INVALID', 'Pinned production truth has no valid retry policy: ' + recipe.retryPolicyId);
    var target = targetVisualSlotId(requirement), assetSpec = { slotId: requirement.semanticId, targetVisualSlotId: target, subject: requirement.subject, description: requirement.description, productionFamily: requirement.productionFamily, artifactKind: recipe.artifactKind, resourceKind: requirement.resourceKind || 'image', acceptedFormats: clone(requirement.acceptedFormats || ['png']), gdjsAssetAdapterId: requirement.gdjsAssetAdapterId || null, semanticTags: clone(requirement.semanticTags || []), gdjsBindings: clone(requirement.gdjsBindings), styleId: requirement.styleId, styleTags: [requirement.styleId], constraints: clone(requirement.constraints), animation: clone(requirement.animation || null), preserve: [] };
    return {
      workItemPlanId: 'work.' + hash([requirement.semanticId, target, requirement.productionFamily, recipeId, recipe.artifactKind, assetSpec]).slice(0, 24),
      semanticId: requirement.semanticId,
      slotId: requirement.semanticId,
      targetVisualSlotId: target,
      productionFamily: requirement.productionFamily,
      recipeId: recipeId,
      artifactKind: recipe.artifactKind,
      assetSpec: assetSpec,
      stageSequence: clone(recipe.minimumPath),
      stylePromptRef: { dictionaryId: 'gamecastle.asset-style-dictionary', styleId: requirement.styleId },
      retryBudget: { generation: retryPolicy.generationAttempts, retryableCodes: clone(retryPolicy.retryableCodes) }
    };
  });
  var draft = {
    productionSetId: 'production.' + hash([request.projectId, request.requestId, request.sourceHash]).slice(0, 24),
    sourceHash: request.sourceHash,
    workItems: workItems,
    dependencyGraph: { nodes: workItems.map(function(item) { return item.workItemPlanId; }), edges: [] },
    coveragePolicy: { requiredSemanticIds: workItems.map(function(item) { return item.semanticId; }).sort(), requiredTargetVisualSlotIds: workItems.map(function(item) { return item.targetVisualSlotId; }).sort(), mode: 'all-required-before-playable' }
  };
  draft.contentHash = hash(draft);
  validator.validatePlan(draft);
  return Object.freeze(draft);
}

module.exports = { compile: compile, targetVisualSlotId: targetVisualSlotId, _hash: hash };
