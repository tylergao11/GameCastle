var assert = require('assert');
var templates = require('../shared/asset-template-dictionary.json');
var styles = require('../shared/asset-style-dictionary.json');
var production = require('../shared/asset-production-pipeline-contract.json');
var moduleCompiler = require('./module-compiler');

assert.equal(templates.dictionaryId, 'gamecastle.asset-template-dictionary');
assert.equal(templates.governance.cloudDefinedTemplatesForbidden, true);
assert.equal(styles.uiTemplates, undefined, 'style dictionary must not own template definitions');
var ids = templates.templates.map(function(template) { return template.id; });
assert.equal(new Set(ids).size, ids.length);
assert(templates.templates.some(function(template) { return template.templateKind === 'ui-template'; }));
assert(templates.templates.some(function(template) { return template.templateKind === 'game-template'; }));
templates.templates.forEach(function(template) {
  assert(template.id && template.version > 0 && template.status && styles.styles[template.styleId], 'invalid template: ' + template.id);
  var slots = template.slots.map(function(slot) { return slot.id; });
  assert(slots.length && new Set(slots).size === slots.length, 'invalid slots: ' + template.id);
  template.slots.forEach(function(slot) {
    assert(production.productionFamilies[slot.productionFamily], 'unknown production family for ' + template.id + '/' + slot.id);
    assert(production.recipes[slot.recipeId], 'unknown production recipe for ' + template.id + '/' + slot.id);
  });
});
var gameTemplates = templates.templates.filter(function(template) { return template.templateKind === 'game-template'; });
var ownedModules = gameTemplates.map(function(template) { return template.productModuleId; });
assert.equal(new Set(ownedModules).size, ownedModules.length, 'a core Product Module may own only one approved asset template version in the active dictionary');
moduleCompiler.loadProductModuleCatalog(require('path').join(__dirname, 'product-modules')).modules.filter(function(module) { return module.id.indexOf('core.') === 0; }).forEach(function(module) {
  var template = gameTemplates.find(function(item) { return item.productModuleId === module.id && item.status === 'approved'; });
  assert(template, 'core Product Module has no approved asset template: ' + module.id);
  assert(Array.isArray(module.declarationContract.visualSlots) && module.declarationContract.visualSlots.length === template.slots.length, 'core Product Module visual slots must exactly cover its asset template: ' + module.id);
});
console.log('[AssetTemplateDictionary] every core Product Module owns one approved template whose slots resolve to real VisualSlotDeclarations');
