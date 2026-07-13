var assert = require('assert').strict;
var foundry = require('./product-module-foundry');
var bridgeModule = require('./module-persistence-bridge');

async function main() {
  var candidate = foundry.candidate({ debt: { debtId: 'debt.route', blocking: true }, referenceFixture: { hash: 'internal-route-dash', license: 'GameCastle-internal' }, draftManifest: { id: 'core.route_dash', revision: 'local-v1', compiler: { targetPlan: [] } } });
  candidate.status = 'verified'; candidate.internalOriginReceipt = 'origin.gamecastle.route-dash.v1';
  var receipt = foundry.promote(candidate, { contractEvidence: 'contract-hash', runtimeEvidence: 'runtime-hash', playtestEvidence: 'playtest-hash', provenanceEvidence: 'internal-origin' });
  var candidates = [], receipts = [], revisions = [], audits = [];
  var repository = { putModuleCandidate: async function(input) { candidates.push(input); return { candidateId: input.candidateId, candidateSha256: 'c'.repeat(64) }; }, putModulePromotionReceipt: async function(input) { receipts.push(input); return { receiptId: input.receipt.receiptId, receiptSha256: 'r'.repeat(64) }; }, putModuleRevision: async function(input) { revisions.push(input); }, audit: async function(kind, subjectId, payload) { audits.push({ kind: kind, subjectId: subjectId, payload: payload }); return 'audit.module'; } };
  var bridge = bridgeModule.createModulePersistenceBridge({ repository: repository });
  var persisted = await bridge.persistApprovedModule({ candidate: candidate, promotionReceipt: receipt });
  assert.equal(persisted.moduleId, 'core.route_dash'); assert.equal(candidates[0].status, 'verified'); assert.equal(receipts[0].receipt.receiptId, receipt.receiptId); assert.equal(revisions[0].originReceipt.authorization, 'internal-original-module'); assert.equal(revisions[0].promotionReceipt.receiptId, receipt.receiptId); assert.equal(revisions[0].manifestSha256.length, 64); assert.equal(audits[0].payload.promotionReceiptId, receipt.receiptId);
  await assert.rejects(function() { return bridge.persistApprovedModule({ candidate: candidate, promotionReceipt: Object.assign({}, receipt, { moduleId: 'core.other' }) }); }, /does not match manifest identity/);
  console.log('[ModulePersistenceBridge] approved module revision, internal origin, promotion receipt, immutable manifest hash, audit, and identity rejection passed');
}
main().catch(function(error) { console.error(error); process.exit(1); });
