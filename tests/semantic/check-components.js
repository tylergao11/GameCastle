var assert = require('assert');
var catalogApi = require('../../ai/component-catalog');
var dictionary = require('../../ai/capability-semantic-dictionary');

var catalog = catalogApi.loadComponentCatalog();
var ids = catalog.components.map(function(component) { return component.id; }).sort();
assert.deepStrictEqual(ids, ['ability.cooldown_skill', 'ability.triggered_effect', 'input.action_button', 'input.touch_surface', 'input.virtual_joystick', 'logic.state_machine'], 'catalog contains only the current coarse component families and their abstract bases');

var base = catalogApi.getComponent(catalog, 'input.touch_surface');
var button = catalogApi.getComponent(catalog, 'input.action_button');
var joystick = catalogApi.getComponent(catalog, 'input.virtual_joystick');
var skillBase = catalogApi.getComponent(catalog, 'ability.triggered_effect');
var skill = catalogApi.getComponent(catalog, 'ability.cooldown_skill');
var stateMachine = catalogApi.getComponent(catalog, 'logic.state_machine');
assert.strictEqual(base.abstract, true, 'touch surface is an internal inheritance base');
assert.strictEqual(catalogApi.aiView(base), null, 'internal inheritance bases stay outside LLM2');
assert.strictEqual(catalogApi.aiView(skillBase), null, 'trigger/effect inheritance base stays internal');

['shape', 'size', 'color', 'placement'].forEach(function(name) {
  assert(button.config[name], 'action button must inherit touch surface config: ' + name);
  assert(joystick.config[name], 'joystick must inherit touch surface config: ' + name);
});
assert(button.bindings.action && button.bindings.action.kind === 'action', 'one action binding keeps button variants component instances');
assert.deepStrictEqual(joystick.config.direction.values, ['horizontal', 'vertical', 'omnidirectional'], 'joystick direction variants belong to one component config field');
assert(skill.bindings.trigger && skill.bindings.effect, 'cooldown skill inherits generic trigger and effect bindings');
assert.strictEqual(stateMachine.config.transitions.item.fields.condition.bindingKind, 'condition', 'state transitions carry dictionary condition bindings');
assert(joystick.implementation.targetBehaviors.indexOf('topdown') >= 0, 'joystick deterministically supplies its movement receiver behavior');
assert(button.implementation.entities.some(function(entity) { return entity.name === 'surface'; }), 'action button inherits the shared surface implementation');
assert(button.implementation.events.some(function(event) { return event.name === 'activate'; }), 'action button owns one bound-action event');
assert(joystick.implementation.events.filter(function(event) { return ['left', 'right', 'up', 'down'].indexOf(event.name) >= 0; }).length === 4, 'joystick owns four dictionary-backed direction branches');

[button, joystick, skill, stateMachine].forEach(function(component) {
  var view = catalogApi.aiView(component);
  var text = JSON.stringify(view);
  assert(view && view.name && view.summary && view.config, component.id + ' has a compact LLM2 component card');
  assert.strictEqual(/safeExamples|gdjs:\/\/|runtimeAdapter|componentId/.test(text), false, component.id + ' LLM2 card contains no example or backend form');
});

var index = dictionary.buildIndex({ components: catalog });
assert.strictEqual(index.schemaVersion, 3, 'component library is compiled into dictionary schema v3');
assert.strictEqual(index.summary.componentCount, 6, 'generated dictionary owns the complete component catalog');
assert.strictEqual(dictionary.resolveComponent(index, 'input.action_button').runtime.status, 'executable');
assert.strictEqual(dictionary.resolveComponent(index, 'gc-component://input.virtual_joystick').runtime.status, 'executable');
assert.strictEqual(dictionary.listComponents(index, { exposed: true, executable: true }).length, 4, 'only complete public components reach LLM2');
assert.strictEqual(typeof index.source.componentDictionaryHash, 'string', 'dictionary fingerprint pins component definitions');
var changedCatalog = JSON.parse(JSON.stringify(catalog));
changedCatalog.components[0].summary += ' changed';
assert.notStrictEqual(dictionary.buildIndex({ components: changedCatalog }).source.componentDictionaryHash, index.source.componentDictionaryHash, 'component fingerprint changes with the canonical component manifest');

var legacy = JSON.parse(JSON.stringify(button)); legacy.schemaVersion = 2;
assert.throws(function() { catalogApi.validateManifest(legacy, 'legacy.json'); }, /unsupported component schemaVersion/, 'pre-config component compatibility stays removed');
var staleShape = JSON.parse(JSON.stringify(button)); staleShape.slots = staleShape.config; delete staleShape.config;
assert.throws(function() { catalogApi.validateManifest(staleShape, 'stale-shape.json'); }, /unknown component field: slots/, 'retired component terminology is rejected instead of translated');
var invalidBlueprint = JSON.parse(JSON.stringify(button)); invalidBlueprint.implementation.events = [{ name: 'broken', kind: 'rule', conditions: [], actions: [{ use: 'not.a.real.use', arguments: {} }] }];
assert.throws(function() { catalogApi.validateManifest(invalidBlueprint, 'invalid-blueprint.json'); }, /declared semantic action/, 'invalid blueprint operations cannot enter the dictionary as executable');
var missingBlueprintArgument = JSON.parse(JSON.stringify(button)); missingBlueprintArgument.implementation.events = [{ name: 'broken', kind: 'rule', conditions: [], actions: [{ use: 'object.hide', arguments: {} }] }];
assert.throws(function() { catalogApi.validateManifest(missingBlueprintArgument, 'missing-blueprint-argument.json'); }, /requires parameter target/, 'blueprint operations must satisfy required dictionary arguments');
var extraBlueprintArgument = JSON.parse(JSON.stringify(button)); extraBlueprintArgument.implementation.events = [{ name: 'broken', kind: 'rule', conditions: [], actions: [{ use: 'object.hide', arguments: { target: '$target', bogus: true } }] }];
assert.throws(function() { catalogApi.validateManifest(extraBlueprintArgument, 'extra-blueprint-argument.json'); }, /no parameter named bogus/, 'blueprint operations reject arguments outside the dictionary contract');
console.log('[Components] dictionary-owned config, inheritance, controls, state machine, skill, and stale-path rejection passed');
