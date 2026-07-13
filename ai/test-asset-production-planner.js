var assert = require('assert');
var planner = require('./asset-production-planner');
var validator = require('./asset-production-contract-validator');

function request() { return { requestId: 'request.runner.1', projectId: 'project.runner.1', templateId: 'game.runner.v1', templateVersion: 2, styleId: 'gamecastle.style-dna.v1', requiredSlotIds: ['hero', 'enemy', 'collectible'], targetVisualSlotIds: { hero: 'game.player.visual', enemy: 'game.enemy.visual', collectible: 'game.collectible.visual' } }; }
var plan = planner.compile({ request: request(), assetSlots: [
  { slotId: 'hero', semanticTags: ['hero'], targetVisualSlotId: 'game.player.visual', constraints: { width: 96, height: 96 } },
  { slotId: 'enemy', semanticTags: ['enemy'], targetVisualSlotId: 'game.enemy.visual', constraints: { width: 96, height: 96 } },
  { slotId: 'collectible', semanticTags: ['coin'], targetVisualSlotId: 'game.collectible.visual', constraints: { width: 64, height: 64 } }
] });
assert.strictEqual(plan.workItems.length, 3);
assert.strictEqual(plan.workItems[0].productionFamily, 'character');
assert.strictEqual(plan.workItems[2].productionFamily, 'prop');
assert.strictEqual(plan.coveragePolicy.mode, 'all-required-before-playable');
assert.strictEqual(plan.contentHash.length, 64);
assert.deepStrictEqual(planner.compile({ request: request() }).workItems.map(function(item) { return item.workItemPlanId; }), plan.workItems.map(function(item) { return item.workItemPlanId; }));
assert.throws(function() { var value = request(); value.requiredSlotIds = ['hero']; value.targetVisualSlotIds = { hero: 'game.player.visual' }; planner.compile({ request: value }); }, function(error) { return error.code === 'ASSET_PRODUCTION_SLOT_COVERAGE_INVALID'; });
assert.throws(function() { var value = request(); value.targetVisualSlotIds.enemy = 'game.player.visual'; planner.compile({ request: value }); }, function(error) { return error.code === 'ASSET_PRODUCTION_TARGET_DUPLICATE'; });
assert.throws(function() { var value = request(); value.templateVersion = 1; planner.compile({ request: value }); }, function(error) { return error.code === 'ASSET_PRODUCTION_TEMPLATE_INVALID'; });
validator.assertTransition('generating', 'observing');
assert.throws(function() { validator.assertTransition('accepted', 'observing'); }, function(error) { return error.code === 'ASSET_PRODUCTION_TRANSITION_INVALID'; });
console.log('[AssetProductionPlanner] exact template, one work item per required slot, stable plan, target coverage and fail-closed transitions passed');
