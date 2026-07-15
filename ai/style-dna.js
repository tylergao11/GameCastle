var dictionary = require('../shared/asset-style-dictionary.json');

function style(styleId) {
  var id = styleId || dictionary.defaultStyleId, value = dictionary.styles[id];
  if (!value) throw new Error('Unknown GameCastle Style DNA: ' + id);
  return Object.assign({ id: id }, value);
}

function generationPrompt(styleId, subject, options) {
  options = options || {}; var value = style(styleId), prompt = value.promptContract;
  var familyPhrases = (prompt.productionFamilyPhrases && prompt.productionFamilyPhrases[options.productionFamily]) || [];
  var background = options.transparent === false ? 'coherent game scene, no interface overlay' : 'isolated subject, plain solid background';
  return [String(subject || 'game asset')].concat(familyPhrases, prompt.requiredPhrases, [background]).filter(Boolean).join(', ');
}

function negativePrompt(styleId, extra) {
  var value = style(styleId), options = arguments[2] || {}, prompt = value.promptContract, familyPhrases = (prompt.productionFamilyNegativePhrases && prompt.productionFamilyNegativePhrases[options.productionFamily]) || [];
  var layoutPhrases = options.productionFamily === 'ui' ? [] : ['UI', 'interface', 'menu', 'infographic'];
  return prompt.negativePhrases.concat(layoutPhrases, familyPhrases, extra || []).join(', ');
}

function reviewPolicy(styleId, semanticTags, options) {
  options = options || {};
  var value = style(styleId);
  var semanticReview = value.semanticReview || {}, transparentSubject = options.transparent === true && ['character', 'prop', 'effect'].indexOf(options.productionFamily) >= 0;
  return { requiredSemanticTags: (semanticTags || []).slice(), requiredAliases: semanticReview.requiredAliases || {}, forbiddenSemanticGroups: transparentSubject ? (semanticReview.transparentSubjectForbiddenGroups || []).slice() : [], minConfidence: 0.35, styleDNA: value.id, requiredTraits: ['bold-outline', 'flat-color-blocks', 'low-detail-geometry', 'single-toon-shadow', 'western-cartoon-proportion'], forbiddenTraits: value.explicitlyNot.slice() };
}

module.exports = { style: style, generationPrompt: generationPrompt, negativePrompt: negativePrompt, reviewPolicy: reviewPolicy };
