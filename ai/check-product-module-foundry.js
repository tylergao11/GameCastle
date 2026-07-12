var assert = require('assert').strict; var foundry = require('./product-module-foundry');
var debt = { debtId: 'debt.missing', blocking: true };
var item = foundry.candidate({ debt: debt, referenceFixture: { hash: 'fixture-hash', license: 'internal' }, draftManifest: { id: 'core.test', revision: 'local-v1' } });
assert.equal(item.status, 'draft'); assert.equal(foundry.promote(item, {}).decision, 'rejected'); item.status = 'verified';
assert.equal(foundry.promote(item, { contractEvidence: 'c', runtimeEvidence: 'r', playtestEvidence: 'p', provenanceEvidence: 'v' }).decision, 'approved-local');
console.log('[ProductModuleFoundry] offline candidate and promotion gate passed');
