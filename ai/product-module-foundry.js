var crypto = require('crypto');
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16); }
function candidate(input) {
  if (!input || !input.debt || !input.debt.blocking) throw new Error('Foundry requires explicit blocking ModuleDebt');
  if (!input.referenceFixture || !input.referenceFixture.hash || !input.referenceFixture.license) throw new Error('Foundry requires licensed hashed reference fixture');
  return { schemaVersion: 1, candidateId: 'candidate.' + hash([input.debt.debtId, input.referenceFixture.hash]), status: 'draft', sourceDebtIds: [input.debt.debtId], semanticBindings: input.semanticBindings || [], referenceFixture: input.referenceFixture, draftManifest: input.draftManifest || {}, ownershipModel: input.ownershipModel || {}, verificationPlan: input.verificationPlan || {}, provenance: { owner: 'ProductModuleFoundry', offlineOnly: true } };
}
function promote(item, evidence) {
  if (!item || item.status !== 'verified') return { decision: 'rejected', reason: 'candidate-not-verified' };
  ['contractEvidence', 'runtimeEvidence', 'playtestEvidence', 'provenanceEvidence'].forEach(function(key) { if (!evidence || !evidence[key]) throw new Error('Promotion requires ' + key); });
  return { schemaVersion: 1, receiptId: 'receipt.' + hash([item.candidateId, evidence]), candidateId: item.candidateId, moduleId: item.draftManifest.id, revision: item.draftManifest.revision, manifestHash: hash(item.draftManifest), fixtureHashes: [item.referenceFixture.hash], contractEvidence: evidence.contractEvidence, runtimeEvidence: evidence.runtimeEvidence, playtestEvidence: evidence.playtestEvidence, provenanceEvidence: evidence.provenanceEvidence, decision: 'approved-local', decidedAt: new Date().toISOString() };
}
module.exports = { candidate: candidate, promote: promote };
