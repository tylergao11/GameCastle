var stateMachine = require('./asset-animation-state-machine');
var styleDictionary = require('./asset-style-dictionary');
function buildVisualIntent(input) {
  input = input || {};
  return { subject: input.subject || 'sketch', mood: input.mood || 'playful', motion: input.motion || 'float', anchor: input.anchor || 'bottom-center', states: input.states || ['idle', 'move', 'hit', 'death'] };
}
function compileRecipe(intent) {
  var recipes = {
    float: { idle: [{ property: 'y', keyframes: [0, -6, 0], durationMs: 900 }, { property: 'rotation', keyframes: [-3, 3, -3], durationMs: 1200 }], move: [{ property: 'x', keyframes: [0, 5, 0], durationMs: 260 }], hit: [{ property: 'scale', keyframes: [1, 0.78, 1], durationMs: 150 }], death: [{ property: 'alpha', keyframes: [1, 0], durationMs: 320 }] },
    bounce: { idle: [{ property: 'scaleY', keyframes: [1, 0.92, 1], durationMs: 600 }], move: [{ property: 'y', keyframes: [0, -12, 0], durationMs: 420 }], hit: [{ property: 'rotation', keyframes: [-12, 12, 0], durationMs: 160 }], death: [{ property: 'scale', keyframes: [1, 0, 0], durationMs: 240 }] },
    shake: { idle: [{ property: 'rotation', keyframes: [-1, 1, -1], durationMs: 300 }], move: [{ property: 'x', keyframes: [-3, 3, -3], durationMs: 180 }], hit: [{ property: 'x', keyframes: [-10, 10, 0], durationMs: 120 }], death: [{ property: 'alpha', keyframes: [1, 0], durationMs: 200 }] },
  };
  var recipe = recipes[intent.motion] || recipes.float;
  return { schemaVersion: 1, subject: intent.subject, anchor: intent.anchor, states: intent.states.reduce(function(result, state) { result[state] = recipe[state] || []; return result; }, {}) };
}
function bindSpriteAsset(asset, intent) {
  if (!asset || !asset.assetId) throw new Error('Runtime animation binding requires assetId');
  var visualIntent = buildVisualIntent(intent);
  var styleId = asset.styleId || styleDictionary.dictionary.defaultStyleId;
  styleDictionary.getStyle(styleId);
  return { owner: 'RuntimeLinker', assetId: asset.assetId, styleId: styleId, anchor: visualIntent.anchor, animation: compileRecipe(visualIntent), stateMachine: stateMachine.createAnimationStateMachine({ states: visualIntent.states }), states: visualIntent.states };
}
module.exports = { buildVisualIntent: buildVisualIntent, compileRecipe: compileRecipe, bindSpriteAsset: bindSpriteAsset };
