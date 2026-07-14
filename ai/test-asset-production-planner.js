var assert = require('assert');
var planner = require('./asset-production-planner');
var validator = require('./asset-production-contract-validator');

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
assert.throws(function() { var value = request(); value.requirements[1].semanticId = value.requirements[0].semanticId; planner.compile({ request: value }); }, function(error) { return error.code === 'ASSET_PRODUCTION_REQUIREMENT_DUPLICATE'; });
assert.throws(function() { var value = request(); value.requirements[0].productionFamily = 'invented'; planner.compile({ request: value }); }, function(error) { return error.code === 'ASSET_PRODUCTION_FAMILY_INVALID'; });
validator.assertTransition('generating', 'observing');
assert.throws(function() { validator.assertTransition('accepted', 'observing'); }, function(error) { return error.code === 'ASSET_PRODUCTION_TRANSITION_INVALID'; });
console.log('[AssetProductionPlanner] semantic requirements, pinned family recipes, stable plan, and fail-closed transitions passed');
