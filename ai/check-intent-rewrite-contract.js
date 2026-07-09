var assert = require('assert');

var intentCompiler = require('./intent-compiler');
var rewriteContract = require('./intent-rewrite-contract');

function findRewrite(card, predicate) {
  return (card.rewrites || []).find(predicate);
}

function assertRewrite(card, from, mechanism, owner) {
  var rewrite = findRewrite(card, function(item) {
    return item.from === from && item.mechanism === mechanism && item.owner === owner;
  });
  assert(rewrite, 'missing rewrite evidence: ' + from + ' via ' + mechanism + ' by ' + owner);
  assert(rewrite.stage, 'rewrite should carry stage: ' + from);
  return rewrite;
}

function main() {
  var compiled = intentCompiler.compileIntentDsl([
    'make a mobile platformer',
    'add joystick controls Player near screen bottom-left',
    'add jump button controls Player near screen bottom-right',
    'add attack button controls Player near jump button left',
    'add inventory owned by Player with 24 slots near screen right',
    'place coins near Player front as trail count 3'
  ].join('\n'));

  rewriteContract.assertResultCardRewrites(compiled.resultCard);
  assertRewrite(compiled.resultCard, 'mobile platformer', 'module-inference', 'intent-compiler');
  assertRewrite(compiled.resultCard, 'joystick', 'component-alias', 'component-catalog');
  assertRewrite(compiled.resultCard, 'jump button', 'natural-anchor', 'intent-compiler');
  assertRewrite(compiled.resultCard, 'inventory', 'component-alias', 'component-catalog');
  assertRewrite(compiled.resultCard, 'coins', 'semantic-group', 'intent-compiler');

  try {
    rewriteContract.assertRewrite({ from: 'jump button', to: 'JumpButton', owner: 'intent-compiler' });
  } catch (error) {
    assert(error.message.indexOf('missing mechanism') >= 0, 'missing mechanism should fail rewrite contract');
    console.log('[IntentRewriteContract] rewrites carry owner, mechanism, and stage evidence');
    return;
  }
  throw new Error('rewrite without mechanism should fail');
}

main();
