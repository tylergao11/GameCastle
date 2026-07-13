var assert = require('assert').strict;
var fs = require('fs');
var path = require('path');
var compiler = require('./module-compiler');
var library = require('./fun-blueprint-library');
var catalog = compiler.loadProductModuleCatalog(path.join(__dirname, 'product-modules'));
var pairs = {
  'route-mastery': ['core.platformer', 'core.route_dash'],
  'state-puzzle': ['core.interaction_puzzle', 'core.state_puzzle_grid'],
  'survivor-growth': ['core.survivor_arena', 'core.survivor_escape']
};
Object.keys(pairs).forEach(function(blueprintId) {
  var blueprint = library.approved(blueprintId, 1);
  var modules = pairs[blueprintId].map(function(id) { return catalog.modules.find(function(module) { return module.id === id; }); });
  assert(modules.every(Boolean), blueprintId + ' composition modules must exist');
  modules.forEach(function(module) {
    blueprint.requiredSemanticRefs.forEach(function(ref) { assert(module.semanticContract.provides.indexOf(ref) >= 0, module.id + ' must cover ' + ref); });
    var keys = (module.mechanicRevisionRefs || []).map(function(ref) { return ref.mechanicId + '@' + ref.revision + '@' + ref.contentHash; });
    blueprint.mechanicSlots.forEach(function(slot) { (slot.requiredMechanicRevisionRefs || []).forEach(function(ref) { assert(keys.indexOf(ref.mechanicId + '@' + ref.revision + '@' + ref.contentHash) >= 0, module.id + ' must satisfy ' + slot.slotId); }); });
  });
  var a = JSON.stringify(modules[0].compiler.targetPlan), b = JSON.stringify(modules[1].compiler.targetPlan);
  assert.notEqual(a, b, blueprintId + ' alternatives must have different runtime event structures');
  assert.notDeepEqual(modules[0].capabilities.map(function(item) { return item.id; }), modules[1].capabilities.map(function(item) { return item.id; }), blueprintId + ' alternatives must expose different capability providers');
});
console.log('[BlueprintCompositionEvidence] each approved Blueprint has two semantic-, mechanism-, and event-distinct compositions');
