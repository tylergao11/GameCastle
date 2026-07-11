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
  if (!style.palette || !style.palette.ink || !style.renderRecipe || !style.animationPolicy) throw new Error('Asset style is missing runtime tokens');
  if (style.animationPolicy.defaultFramesPerState !== 1 || style.animationPolicy.runtimeTransformFirst !== true) throw new Error('GameCastle style must preserve low-cost runtime animation');
  return true;
}

validateStyle(getStyle());
module.exports = { dictionary: dictionary, getStyle: getStyle, paletteColor: paletteColor, validateStyle: validateStyle };
