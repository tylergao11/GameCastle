var assert = require('assert');
var semanticFeedback = require('./semantic-feedback');
var dictionary = semanticFeedback.loadSemanticMapping();
var path = require('path');
var componentCatalog = require('./component-catalog');
var moduleCompiler = require('./module-compiler');
var intentCompiler = require('./intent-compiler');

function has(list, value) { return Array.isArray(list) && list.indexOf(value) >= 0; }
function main() {
  var required = ['capability_semantic_policy', 'semantic_concepts', 'canonical_write_values', 'display_terms', 'command_shapes', 'template_defaults', 'template_writable_surface', 'implementation_bindings', 'semantic_routes', 'validation_rules'];
  required.forEach(function(section) { assert(dictionary[section] && typeof dictionary[section] === 'object', section + ' is required'); });
  Object.keys(dictionary.semantic_concepts).forEach(function(id) {
    var concept = dictionary.semantic_concepts[id];
    if (concept.extends) assert(dictionary.semantic_concepts[concept.extends] || dictionary.gameplayRoles[concept.extends], 'unknown concept parent: ' + id);
    if (concept.abstract !== true && !concept.extends) assert.fail('concrete semantic concept must extend an abstract concept: ' + id);
    if (concept.abstract === true && concept.extends && dictionary.semantic_concepts[concept.extends] && dictionary.semantic_concepts[concept.extends].abstract !== true) assert.fail('abstract semantic concept must extend abstract parent: ' + id);
  });
  Object.keys(dictionary.display_terms).forEach(function(term) {
    var value = dictionary.display_terms[term];
    assert(dictionary.implementation_bindings[value] || dictionary.canonical_write_values.controls[value] || dictionary.canonical_write_values.abilities[value] || dictionary.canonical_write_values.subjects[value] || dictionary.canonical_write_values.systems[value], 'display term lacks canonical value: ' + term);
  });
  Object.keys(dictionary.implementation_bindings).forEach(function(value) {
    var binding = dictionary.implementation_bindings[value];
    assert(dictionary.canonical_write_values.controls[value] || dictionary.canonical_write_values.abilities[value] || dictionary.canonical_write_values.subjects[value] || dictionary.canonical_write_values.systems[value] || dictionary.canonical_write_values.actions[value], 'binding lacks canonical declaration: ' + value);
    assert(dictionary.command_shapes[binding.compiler_action], 'binding lacks command shape: ' + value);
  });
  var components = componentCatalog.loadComponentCatalog();
  var modules = moduleCompiler.loadProductModuleCatalog(path.join(__dirname, 'product-modules'));
  Object.keys(dictionary.implementation_bindings).forEach(function(value) {
    var binding = dictionary.implementation_bindings[value];
    if (binding.component_id) assert(components.byId[binding.component_id], 'missing component binding: ' + value + ' -> ' + binding.component_id);
    if (binding.module_id) assert(modules.modules.some(function(module) { return module.id === binding.module_id; }), 'missing module binding: ' + value + ' -> ' + binding.module_id);
  });
  var probeLines = [
    'make a mobile platformer',
    'add joystick controls Player move near screen bottom-left',
    'add jump button controls Player jump near screen bottom-right',
    'place coins near screen center as trail',
    'place enemies near screen bottom as line',
    'place platforms near screen center as stairs',
    'place ground near screen bottom as single'
  ];
  var compiled = intentCompiler.compileIntentDsl(probeLines.join('\n'), { productModuleCatalog: modules, componentCatalog: components });
  assert(compiled.bridgePlan && compiled.bridgePlan.targetPlanLines.length > 0, 'canonical probe must emit target plan lines');
  assert(compiled.bridgePlan.emitted.length === compiled.bridgePlan.targetPlanLines.length, 'canonical probe bridge evidence must match emitted lines');
  Object.keys(dictionary.template_writable_surface).forEach(function(template) {
    dictionary.template_writable_surface[template].forEach(function(command) { assert(dictionary.command_shapes[command], 'writable command lacks shape: ' + command); });
  });
  Object.keys(dictionary.semantic_routes).forEach(function(concept) { assert(dictionary.semantic_concepts[concept], 'route lacks semantic concept: ' + concept); });
  Object.keys(dictionary.semantic_concepts).forEach(function(concept) { if (dictionary.semantic_concepts[concept].abstract !== true) assert(dictionary.semantic_routes[concept], 'concrete semantic concept lacks route: ' + concept); });
  assert(has(dictionary.template_writable_surface.platformer, 'place_group'), 'platformer writable surface must include place_group');
  assert(!has(dictionary.template_writable_surface.platformer, 'give_ability'), 'template default ability must remain outside writable surface');
  console.log('[SemanticDictionary] single-source sections, inheritance, canonical values, bindings, template surface, and routes passed');
}
main();
