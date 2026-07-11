var semanticFeedback = require('./semantic-feedback');
var SOURCE = semanticFeedback.loadSemanticMapping();
var SHAPES = SOURCE.command_shapes;
var VALUES = SOURCE.canonical_write_values;
var BINDINGS = SOURCE.implementation_bindings;
var DIRECTIONS = SHAPES.place_group.values.direction;
var PATTERNS = SHAPES.place_group.values.pattern;
var AMOUNTS = ['slightly', 'small', 'normal', 'far'];
var CONTROL_VALUES = SHAPES.add_control.values.control.map(function(value) {
  var binding = BINDINGS[value] || {};
  return { value: value, componentId: binding.component_id, action: binding.action };
});
var ABILITY_VALUES = Object.keys(VALUES.abilities).map(function(value) {
  var binding = BINDINGS[value] || {};
  return { value: value, componentId: binding.component_id, target: 'Player' };
});
var PLACE_GROUP_VALUES = SHAPES.place_group.values.subject;

function normalize(value) { return String(value || '').trim().toLowerCase().replace(/\s+/g, ' '); }
function findByValue(values, value) { value = normalize(value); return values.filter(function(item) { return item.value === value; })[0] || null; }
function control(value) { return findByValue(CONTROL_VALUES, value); }
function ability(value) { return findByValue(ABILITY_VALUES, value); }

function llmView(gameMode) {
  var template = SOURCE.template_defaults[gameMode] || SOURCE.template_defaults.platformer;
  var writable = SOURCE.template_writable_surface[template.extends || 'platformer'] || [];
  var commands = {};
  if (writable.indexOf('make_game') >= 0) commands.make_game = { description_max_characters: SHAPES.make_game.limits.descriptionMaxCharacters };
  if (writable.indexOf('add_control') >= 0) commands.add_control = CONTROL_VALUES.map(function(item) { return { control: item.value, action: item.action, target: 'Player', anchor: 'screen', direction: item.action === 'move' ? 'bottom-left' : 'bottom-right' }; });
  if (writable.indexOf('place_group') >= 0) commands.place_group = { required_slots: SHAPES.place_group.required, subject: PLACE_GROUP_VALUES, anchor: SHAPES.place_group.values.anchor, direction: DIRECTIONS, pattern: PATTERNS };
  if (writable.indexOf('add_inventory') >= 0) commands.add_inventory = SHAPES.add_inventory;
  return { game_mode: gameMode || null, template_defaults: template, writable_commands: commands };
}
module.exports = { CONTROL_VALUES: CONTROL_VALUES, ABILITY_VALUES: ABILITY_VALUES, PLACE_GROUP_VALUES: PLACE_GROUP_VALUES, DIRECTIONS: DIRECTIONS, PATTERNS: PATTERNS, AMOUNTS: AMOUNTS, control: control, ability: ability, llmView: llmView };
