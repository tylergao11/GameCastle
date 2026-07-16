var dictionary = require('../contracts/semantic-layout-dictionary.json');

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'SemanticLayoutDictionary'; throw error; }
function object(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('SEMANTIC_LAYOUT_DICTIONARY_INVALID', label + ' must be an object'); return value; }
function text(value, label) { if (typeof value !== 'string' || !value.trim()) fail('SEMANTIC_LAYOUT_DICTIONARY_INVALID', label + ' must be non-empty text'); return value.trim(); }
function finite(value, label) { if (typeof value !== 'number' || !isFinite(value)) fail('SEMANTIC_LAYOUT_DICTIONARY_INVALID', label + ' must be finite'); return value; }
function allowed(value, fields, label) { Object.keys(value).forEach(function(field) { if (fields.indexOf(field) < 0) fail('SEMANTIC_LAYOUT_DICTIONARY_INVALID', label + ' contains unknown field: ' + field); }); }

function validateSafeArea(value, label) {
  object(value, label); allowed(value, ['leftFraction', 'topFraction', 'rightFraction', 'bottomFraction'], label);
  var left = finite(value.leftFraction, label + '.leftFraction'), top = finite(value.topFraction, label + '.topFraction'), right = finite(value.rightFraction, label + '.rightFraction'), bottom = finite(value.bottomFraction, label + '.bottomFraction');
  if (left < 0 || top < 0 || right < 0 || bottom < 0 || left + right >= 1 || top + bottom >= 1) fail('SEMANTIC_LAYOUT_DICTIONARY_INVALID', label + ' must leave positive viewport area');
}
function validateAnchorPreference(value, axis, label) {
  object(value, label); allowed(value, ['align', 'offsetFraction'], label);
  var allowedAlignments = axis === 'horizontal' ? ['left', 'center', 'right'] : ['top', 'center', 'bottom'];
  if (allowedAlignments.indexOf(value.align) < 0) fail('SEMANTIC_LAYOUT_DICTIONARY_INVALID', label + '.align is not valid for the ' + axis + ' axis');
  finite(value.offsetFraction, label + '.offsetFraction');
}
function validateAnchorPreferencePair(value, label) {
  object(value, label); allowed(value, ['horizontal', 'vertical'], label);
  validateAnchorPreference(value.horizontal, 'horizontal', label + '.horizontal');
  validateAnchorPreference(value.vertical, 'vertical', label + '.vertical');
}
function validateOverlap(value, label) {
  object(value, label); allowed(value, ['group', 'policy'], label); text(value.group, label + '.group');
  if (value.policy !== 'reject' && value.policy !== 'allow') fail('SEMANTIC_LAYOUT_DICTIONARY_INVALID', label + '.policy must be reject or allow');
}
function validateZOrderRange(value, label) {
  object(value, label); allowed(value, ['minimum', 'maximum'], label);
  var minimum = finite(value.minimum, label + '.minimum'), maximum = finite(value.maximum, label + '.maximum');
  if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || maximum < minimum) fail('SEMANTIC_LAYOUT_DICTIONARY_INVALID', label + ' requires ordered integer minimum and maximum');
}
function validatePlacement(value, safeAreas, label) {
  object(value, label); allowed(value, ['mode', 'materialization', 'space', 'safeArea', 'anchorPreference', 'grid', 'layer', 'zOrderRange', 'overlap'], label);
  if (value.mode !== 'region' && value.mode !== 'grid') fail('SEMANTIC_LAYOUT_DICTIONARY_INVALID', label + '.mode must be region or grid');
  if (value.materialization !== 'scene-instance' && value.materialization !== 'runtime-contract') fail('SEMANTIC_LAYOUT_DICTIONARY_INVALID', label + '.materialization must be scene-instance or runtime-contract');
  text(value.space, label + '.space'); var safeArea = text(value.safeArea, label + '.safeArea'); if (!safeAreas[safeArea]) fail('SEMANTIC_LAYOUT_DICTIONARY_INVALID', label + '.safeArea is absent from coordinateContract.safeAreas');
  if (typeof value.layer !== 'string') fail('SEMANTIC_LAYOUT_DICTIONARY_INVALID', label + '.layer must be text');
  validateZOrderRange(value.zOrderRange, label + '.zOrderRange');
  validateOverlap(value.overlap, label + '.overlap');
  if (value.mode === 'region') {
    if (value.materialization !== 'scene-instance') fail('SEMANTIC_LAYOUT_DICTIONARY_INVALID', label + ' region placement materializes a scene instance');
    if (value.grid !== undefined) fail('SEMANTIC_LAYOUT_DICTIONARY_INVALID', label + ' region placement uses an anchor preference instead of a grid');
    validateAnchorPreferencePair(value.anchorPreference, label + '.anchorPreference');
    return;
  }
  if (value.anchorPreference !== undefined) fail('SEMANTIC_LAYOUT_DICTIONARY_INVALID', label + ' grid placement uses its grid instead of an anchor preference');
  object(value.grid, label + '.grid'); allowed(value.grid, ['columns', 'rows', 'selection'], label + '.grid');
  if (!Number.isInteger(value.grid.columns) || value.grid.columns < 1 || !Number.isInteger(value.grid.rows) || value.grid.rows < 1 || value.grid.selection !== 'random-free-cell') fail('SEMANTIC_LAYOUT_DICTIONARY_INVALID', label + '.grid requires positive columns, rows, and random-free-cell selection');
}
function validate(value) {
  object(value, 'SemanticLayoutDictionary'); allowed(value, ['schemaVersion', 'dictionaryId', 'coordinateContract', 'relations'], 'SemanticLayoutDictionary');
  if (value.schemaVersion !== 4) fail('SEMANTIC_LAYOUT_DICTIONARY_INVALID', 'SemanticLayoutDictionary schemaVersion must be 4'); text(value.dictionaryId, 'SemanticLayoutDictionary.dictionaryId');
  object(value.coordinateContract, 'SemanticLayoutDictionary.coordinateContract'); allowed(value.coordinateContract, ['safeAreas'], 'SemanticLayoutDictionary.coordinateContract');
  object(value.coordinateContract.safeAreas, 'SemanticLayoutDictionary.coordinateContract.safeAreas');
  Object.keys(value.coordinateContract.safeAreas).forEach(function(name) { text(name, 'safe area name'); validateSafeArea(value.coordinateContract.safeAreas[name], 'safeAreas.' + name); });
  object(value.relations, 'SemanticLayoutDictionary.relations');
  Object.keys(value.relations).forEach(function(reference) {
    var relation = value.relations[reference]; text(reference, 'layout reference'); object(relation, reference); allowed(relation, ['title', 'description', 'placement'], reference); text(relation.title, reference + '.title'); text(relation.description, reference + '.description'); validatePlacement(relation.placement, value.coordinateContract.safeAreas, reference + '.placement');
  });
  return clone(value);
}

validate(dictionary);
function resolve(reference) { var relation = dictionary.relations[reference]; if (!relation) { var error = new Error('Unknown semantic layout relation: ' + reference); error.code = 'SEMANTIC_LAYOUT_REFERENCE_INVALID'; throw error; } return Object.assign({ semanticRef: reference }, clone(relation)); }
function list() { return Object.keys(dictionary.relations).sort().map(resolve); }
module.exports = { dictionary: dictionary, validate: validate, resolve: resolve, list: list };
