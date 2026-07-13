var assert = require('assert').strict;
var origin = require('./internal-module-origin');
var foundry = require('./product-module-foundry');
['core.platformer', 'core.route_dash', 'core.interaction_puzzle', 'core.state_puzzle_grid', 'core.survivor_arena', 'core.survivor_escape'].forEach(function(id) {
  var receipt = origin.forModule(id, 'local-v1');
  assert(receipt, 'Missing internal origin receipt for ' + id);
  var candidate = foundry.candidate({ debt: { debtId: 'debt.' + id, blocking: true }, referenceFixture: { hash: 'internal.' + id, license: 'GameCastle-internal' }, draftManifest: { id: id, revision: 'local-v1' } });
  candidate.status = 'verified'; candidate.internalOriginReceipt = Object.keys(origin.registry.receipts).find(function(key) { return origin.registry.receipts[key] === receipt; });
  assert.equal(foundry.promote(candidate, { contractEvidence: 'contract', runtimeEvidence: 'runtime', playtestEvidence: 'playtest', provenanceEvidence: 'internal-origin' }).decision, 'approved-local');
});
console.log('[InternalModuleOrigin] six Blueprint composition modules are authorized and locally promotable internal assets');
