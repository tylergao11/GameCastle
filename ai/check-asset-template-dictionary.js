var assert = require('assert');
var templates = require('../shared/asset-template-dictionary.json');
var styles = require('../shared/asset-style-dictionary.json');

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
});
console.log('[AssetTemplateDictionary] UI/game templates and slots have one non-style truth source');
