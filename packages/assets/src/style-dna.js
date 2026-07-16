var crypto = require('crypto');
var dictionary = require('../contracts/asset-style-dictionary.json');

function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, {}); return value; }
function fingerprint(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }

function style(styleId) {
  var id = styleId || dictionary.defaultStyleId, value = dictionary.styles[id];
  if (!value) throw new Error('Unknown GameCastle Style DNA: ' + id);
  return Object.assign({ id: id }, value);
}

function palettePhrases(styleId) {
  var value = style(styleId), palette = value.palette || {};
  if (!Object.keys(palette).length) return [];
  var accents = [palette.red, palette.yellow, palette.blue, palette.lime].filter(Boolean).join(' ');
  return [
    'ink ' + (palette.ink || '#141923') + ' paper ' + (palette.paper || '#fff7e5') + ' limited ramps',
    accents ? 'accents ' + accents : null
  ].filter(Boolean);
}

function generationPrompt(styleId, subject, options) {
  options = options || {}; var value = style(styleId), prompt = value.promptContract;
  var familyPhrases = (prompt.productionFamilyPhrases && prompt.productionFamilyPhrases[options.productionFamily]) || [];
  var background = options.productionFamily === 'background' ? 'coherent empty game scene, no interface overlay' : options.productionFamily === 'world-geometry' ? 'single orthographic edge-to-edge game tile, no surrounding scene' : options.productionFamily === 'ui' ? 'isolated centered interface shape on plain solid white background' : options.transparent === false ? 'centered asset on plain solid background' : 'isolated subject, plain solid white background';
  var phrases = [String(subject || 'game asset'), background].concat(familyPhrases, prompt.requiredPhrases, palettePhrases(styleId));
  if (options.styleAnchor) {
    phrases.push('same cohesive GameCastle raster-toon art family as the established game cast', 'matching chunky silhouette language and limited color ramps');
  }
  return phrases.filter(Boolean).join(', ');
}

function styleFingerprint(styleId) {
  var value = style(styleId);
  return fingerprint({ dictionaryId: dictionary.dictionaryId, dictionarySchemaVersion: dictionary.schemaVersion, styleId: value.id, style: value });
}

function negativePrompt(styleId, extra) {
  var value = style(styleId), options = arguments[2] || {}, prompt = value.promptContract, familyPhrases = (prompt.productionFamilyNegativePhrases && prompt.productionFamilyNegativePhrases[options.productionFamily]) || [];
  return prompt.negativePhrases.concat(familyPhrases, extra || []).join(', ');
}

function reviewPolicy(styleId, semanticTags, options) {
  options = options || {};
  var value = style(styleId);
  var semanticReview = value.semanticReview || {}, transparentSubject = options.transparent === true && ['character', 'character-part', 'prop', 'effect'].indexOf(options.productionFamily) >= 0;
  return { requiredSemanticTags: (semanticTags || []).slice(), requiredAliases: semanticReview.requiredAliases || {}, forbiddenSemanticGroups: transparentSubject ? (semanticReview.transparentSubjectForbiddenGroups || []).slice() : [], minConfidence: 0.35, styleDNA: value.id, requiredTraits: ['runtime-size-readable-silhouette', 'limited-color-ramps', 'controlled-raster-toon-shading', 'expressive-western-cartoon-proportion'], forbiddenTraits: value.explicitlyNot.slice() };
}

function reviewTexts(styleId, slot, phase) {
  slot = slot || {};
  var value = style(styleId), review = value.semanticReview || {}, defaults = review.defaultProfile;
  if (!defaults) throw new Error('Style semantic review defaultProfile is required: ' + value.id);
  var family = (review.productionFamilyProfiles || {})[slot.productionFamily] || {}, phaseProfiles = (review.phaseProfiles || []).filter(function(profile) { return profile.phase === phase && (profile.requiresTransparent !== true || !!((slot.constraints || {}).transparent)); });
  function merged(name) { return (defaults[name] || []).concat(family[name] || []); }
  var subject = slot.description || slot.subject || '', tags = (slot.semanticTags || []).join(' ');
  return {
    reviewPositiveTexts: [subject, tags && tags + ' game asset'].filter(Boolean).concat(merged('semanticPositiveTexts')),
    reviewNegativeTexts: merged('semanticNegativeTexts'),
    stylePositiveTexts: [value.purpose].concat(merged('stylePositiveTexts')),
    styleNegativeTexts: [value.explicitlyNot.join(', ')].concat(merged('styleNegativeTexts')),
    phase: phase || null,
    compositionChecks: (family.compositionChecks || []).concat(phaseProfiles.flatMap(function(profile) { return profile.compositionChecks || []; })).map(function(check) {
      return { id: check.id, positiveTexts: (check.positiveTexts || []).slice(), negativeTexts: (check.negativeTexts || []).slice() };
    })
  };
}

function reviewPolicyFingerprint(styleId, slot, phase) {
  return fingerprint({ styleFingerprint: styleFingerprint(styleId), phase: phase || null, policy: reviewTexts(styleId, slot, phase) });
}

module.exports = { style: style, styleFingerprint: styleFingerprint, generationPrompt: generationPrompt, negativePrompt: negativePrompt, reviewPolicy: reviewPolicy, reviewTexts: reviewTexts, reviewPolicyFingerprint: reviewPolicyFingerprint, palettePhrases: palettePhrases };
