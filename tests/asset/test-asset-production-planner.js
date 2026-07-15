var assert = require('assert');
var planner = require('../../ai/asset-production-planner');
var productionTruth = require('../../shared/asset-production-pipeline-contract.json');

function request() {
  return {
    requestId: 'request.semantic.1',
    projectId: 'project.semantic.1',
    sourceHash: 'semantic.source.fixture',
    requirements: [
      { semanticId: 'hero_visual', subject: 'hero', description: 'Hero sprite', roles: ['hero'], productionFamily: 'character', recipeId: 'character-sprite.v1', styleId: 'gamecastle.style-dna.v1', constraints: { width: 96, height: 96 }, gdjsBindings: [] },
      { semanticId: 'enemy_visual', subject: 'enemy', description: 'Enemy sprite', roles: ['enemy'], productionFamily: 'character', recipeId: 'character-sprite.v1', styleId: 'gamecastle.style-dna.v1', constraints: { width: 96, height: 96 }, gdjsBindings: [] },
      { semanticId: 'collectible_visual', subject: 'collectible', description: 'Collectible sprite', roles: ['collectible'], productionFamily: 'prop', recipeId: 'prop-sprite.v1', styleId: 'gamecastle.style-dna.v1', constraints: { width: 64, height: 64 }, gdjsBindings: [] }
    ]
  };
}
var plan = planner.compile({ request: request() });
assert.strictEqual(plan.workItems.length, 3);
assert.strictEqual(plan.workItems[0].productionFamily, 'character');
assert.strictEqual(plan.workItems[2].productionFamily, 'prop');
assert.strictEqual(plan.coveragePolicy.mode, 'all-required-before-playable');
assert.strictEqual(plan.contentHash.length, 64);
assert.deepStrictEqual(planner.compile({ request: request() }).workItems.map(function(item) { return item.workItemPlanId; }), plan.workItems.map(function(item) { return item.workItemPlanId; }));
var crossProjectRequest = request(); crossProjectRequest.requestId = 'request.semantic.other'; crossProjectRequest.projectId = 'project.semantic.other';
var crossProjectPlan = planner.compile({ request: crossProjectRequest });
assert.deepStrictEqual(crossProjectPlan.workItems.map(function(item) { return item.workItemPlanId; }), plan.workItems.map(function(item) { return item.workItemPlanId; }), 'work item identity must derive from the immutable visual requirement, not the current run or project');
assert.notStrictEqual(crossProjectPlan.productionSetId, plan.productionSetId, 'production-set identity remains run/project scoped');
var changedVisualRequest = request(); changedVisualRequest.requirements[0].description = 'Different hero silhouette';
assert.notStrictEqual(planner.compile({ request: changedVisualRequest }).workItems[0].workItemPlanId, plan.workItems[0].workItemPlanId, 'visual requirement changes must invalidate reusable work-item evidence');
assert.throws(function() { var value = request(); value.requirements[1].semanticId = value.requirements[0].semanticId; planner.compile({ request: value }); }, function(error) { return error.code === 'ASSET_PRODUCTION_REQUIREMENT_DUPLICATE'; });
assert.throws(function() { var value = request(); value.requirements[0].productionFamily = 'invented'; planner.compile({ request: value }); }, function(error) { return error.code === 'ASSET_PRODUCTION_FAMILY_INVALID'; });
assert.deepStrictEqual(plan.workItems[0].stageSequence, productionTruth.recipes['character-sprite.v1'].minimumPath);
assert.strictEqual(plan.workItems[0].retryBudget.generation, productionTruth.retryPolicies[productionTruth.recipes['character-sprite.v1'].retryPolicyId].generationAttempts);
assert.deepStrictEqual(plan.workItems[0].retryBudget.retryableCodes, productionTruth.retryPolicies[productionTruth.recipes['character-sprite.v1'].retryPolicyId].retryableCodes);
console.log('[AssetProductionPlanner] semantic requirements, pinned family recipes, stable plan, and review-guided generation policy passed');
