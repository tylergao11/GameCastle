var intentSurfaceGuard = require('./intent-surface-guard');

function index(list) {
  var result = {};
  (list || []).forEach(function(item) {
    result[item] = true;
  });
  return result;
}

function assertRewrite(rewrite, options) {
  options = options || {};
  var rules = options.rules || intentSurfaceGuard.loadRules();
  var contract = rules.rewriteContract || {};
  var owners = index(contract.allowedOwners || []);
  var mechanisms = index(contract.allowedMechanisms || []);

  (contract.requiredFields || []).forEach(function(field) {
    if (rewrite[field] === undefined || rewrite[field] === null || rewrite[field] === '') {
      throw new Error('Intent rewrite missing ' + field + ': ' + JSON.stringify(rewrite));
    }
  });
  if (!owners[rewrite.owner]) {
    throw new Error('Intent rewrite owner is not allowed: ' + rewrite.owner);
  }
  if (!mechanisms[rewrite.mechanism]) {
    throw new Error('Intent rewrite mechanism is not allowed: ' + rewrite.mechanism);
  }
  intentSurfaceGuard.assertIntentSurfaceAllowed(String(rewrite.from || ''), { rules: rules });
  return true;
}

function assertResultCardRewrites(card, options) {
  (card && card.rewrites || []).forEach(function(rewrite) {
    assertRewrite(rewrite, options);
  });
  return true;
}

module.exports = {
  assertRewrite: assertRewrite,
  assertResultCardRewrites: assertResultCardRewrites
};
