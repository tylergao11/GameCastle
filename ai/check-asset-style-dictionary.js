var assert = require('assert');
var styles = require('./asset-style-dictionary');
var style = styles.getStyle();
assert.equal(style.id, 'gamecastle.style-dna.v1');
assert.equal(styles.paletteColor(style.id, 'ink'), '#141923');
assert.equal(style.renderRecipe.output.transparent, true);
assert(style.semanticRoleTokens['ui.button'].indexOf('accent') >= 0);
assert.throws(function() { styles.getStyle('missing'); }, /Unknown asset style/);
console.log('[AssetStyleDictionary] fixed visual grammar and runtime tokens passed');
