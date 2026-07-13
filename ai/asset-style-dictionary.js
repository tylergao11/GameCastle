var dictionary = require('../shared/asset-style-dictionary.json');

function getStyle(styleId) {
  var id = styleId || dictionary.defaultStyleId;
  var style = dictionary.styles[id];
  if (!style) throw new Error('Unknown asset style: ' + id);
  return Object.assign({ id: id }, style);
}

function paletteColor(styleId, role) {
  var style = getStyle(styleId);
  var value = style.palette[role];
  if (!value) throw new Error('Unknown palette role: ' + role);
  return value;
}

function validateStyle(style) {
  if (!style.palette || !style.palette.ink || !style.renderRecipe || !style.animationPolicy || !style.styleDNA || !style.promptContract) throw new Error('Asset style is missing GameCastle Style DNA tokens');
  ['outline', 'shapeLanguage', 'colorLanguage', 'volume', 'characterProportion', 'uiLanguage', 'sceneLanguage'].forEach(function(key) { if (!style.styleDNA[key]) throw new Error('Asset style is missing Style DNA: ' + key); });
  if (!Array.isArray(style.promptContract.requiredPhrases) || !Array.isArray(style.promptContract.negativePhrases) || !Array.isArray(style.explicitlyNot)) throw new Error('Asset style is missing prompt and exclusion policy');
  if (style.animationPolicy.defaultFramesPerState !== 1 || style.animationPolicy.runtimeTransformFirst !== true) throw new Error('GameCastle style must preserve low-cost runtime animation');
  return true;
}

validateStyle(getStyle());
module.exports = { dictionary: dictionary, getStyle: getStyle, paletteColor: paletteColor, validateStyle: validateStyle };
