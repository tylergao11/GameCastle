var dictionary = require('../shared/asset-style-dictionary.json');

function style(styleId) {
  var id = styleId || dictionary.defaultStyleId, value = dictionary.styles[id];
  if (!value) throw new Error('Unknown GameCastle Style DNA: ' + id);
  return Object.assign({ id: id }, value);
}

function generationPrompt(styleId, subject, options) {
  options = options || {}; var value = style(styleId), dna = value.styleDNA, prompt = value.promptContract;
  return [
    String(subject || 'game asset'),
    prompt.requiredPhrases.join(', '),
    'shape language: ' + dna.shapeLanguage,
    'outline rule: ' + dna.outline,
    'volume rule: ' + dna.volume,
    options.transparent === false ? 'one coherent role-specific scene with a clean declared background policy' : 'isolated single subject with transparent-background-ready edge separation'
  ].filter(Boolean).join('. ');
}

function negativePrompt(styleId, extra) {
  var value = style(styleId);
  return value.promptContract.negativePhrases.concat(extra || []).join(', ');
}

function reviewPolicy(styleId, semanticTags, options) {
  options = options || {};
  var value = style(styleId);
  var semanticReview = value.semanticReview || {}, transparentSubject = options.transparent === true && ['character', 'prop', 'effect'].indexOf(options.productionFamily) >= 0;
  return { requiredSemanticTags: (semanticTags || []).slice(), requiredAliases: semanticReview.requiredAliases || {}, forbiddenSemanticGroups: transparentSubject ? (semanticReview.transparentSubjectForbiddenGroups || []).slice() : [], minConfidence: 0.35, styleDNA: value.id, requiredTraits: ['bold-outline', 'flat-color-blocks', 'low-detail-geometry', 'single-toon-shadow', 'western-cartoon-proportion'], forbiddenTraits: value.explicitlyNot.slice() };
}

module.exports = { style: style, generationPrompt: generationPrompt, negativePrompt: negativePrompt, reviewPolicy: reviewPolicy };
