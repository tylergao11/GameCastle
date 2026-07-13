var crypto = require('crypto');
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16); }
function fullHash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function validate(candidate, evidence) {
  if (!candidate || candidate.status !== 'verified') return { ok: false, code: 'CANDIDATE_NOT_VERIFIED' };
  ['contractEvidence', 'runtimeEvidence', 'playtestEvidence', 'provenanceEvidence'].forEach(function(key) { if (!evidence || !evidence[key]) throw new Error('Promotion requires ' + key); });
  if (candidate.templateSourceRecord && candidate.templateSourceRecord.intakeStatus !== 'accepted') return { ok: false, code: 'SOURCE_NOT_PROMOTABLE', message: 'Quarantined structure-only sources may inform candidates but cannot promote them.' };
  if (candidate.provenance && candidate.provenance.sourceBinaryReuseAllowed) return { ok: false, code: 'SOURCE_BINARY_REUSE_FORBIDDEN' };
  if (!candidate.draftManifest || !candidate.draftManifest.id || !candidate.draftManifest.revision) return { ok: false, code: 'MANIFEST_IDENTITY_MISSING' };
  if (candidate.internalOriginReceipt) require('./internal-module-origin').resolve(candidate.internalOriginReceipt, candidate.draftManifest.id, candidate.draftManifest.revision);
  return { ok: true, receipt: { schemaVersion: 1, receiptId: 'receipt.' + hash([candidate.candidateId, evidence]), candidateId: candidate.candidateId, moduleId: candidate.draftManifest.id, revision: candidate.draftManifest.revision, manifestHash: fullHash(candidate.draftManifest), candidateToModuleLineage: candidate.lineageProjection || null, fixtureHashes: [candidate.referenceFixture && candidate.referenceFixture.hash || candidate.templateIRRef && candidate.templateIRRef.normalizationHash].filter(Boolean), contractEvidence: evidence.contractEvidence, runtimeEvidence: evidence.runtimeEvidence, playtestEvidence: evidence.playtestEvidence, provenanceEvidence: evidence.provenanceEvidence, decision: 'approved-local', decidedAt: new Date().toISOString() } };
}
module.exports = { validate: validate };
