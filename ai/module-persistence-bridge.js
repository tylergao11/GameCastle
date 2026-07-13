/* Writes only promotion-validated module revisions to the immutable cloud-library repository. */
var crypto = require('crypto');
var origin = require('./internal-module-origin');

function sha256(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function required(value, name) { if (!value) throw new Error(name + ' is required'); return value; }
function createModulePersistenceBridge(options) {
  options = options || {};
  var repository = required(options.repository, 'repository');
  ['putModuleCandidate', 'putModulePromotionReceipt', 'putModuleRevision', 'audit'].forEach(function(method) { if (typeof repository[method] !== 'function') throw new Error('repository.' + method + ' is required'); });
  async function persistApprovedModule(input) {
    required(input, 'module persistence input');
    var candidate = required(input.candidate, 'candidate'), receipt = required(input.promotionReceipt, 'promotionReceipt'), manifest = required(input.manifest || candidate.draftManifest, 'manifest');
    if (candidate.status !== 'verified') throw new Error('only verified module candidates can be persisted');
    if (receipt.decision !== 'approved-local' && receipt.decision !== 'approved-cloud') throw new Error('only approved module promotion receipts can be persisted');
    if (!receipt.receiptId || receipt.candidateId !== candidate.candidateId) throw new Error('promotion receipt does not belong to candidate');
    if (receipt.moduleId !== manifest.id || receipt.revision !== manifest.revision) throw new Error('promotion receipt does not match manifest identity');
    var originReceipt = candidate.internalOriginReceipt ? origin.resolve(candidate.internalOriginReceipt, manifest.id, manifest.revision) : input.originReceipt;
    if (!originReceipt) throw new Error('approved module requires an origin receipt');
    var manifestHash = sha256(manifest);
    var persistedCandidate = await repository.putModuleCandidate({ candidateId: candidate.candidateId, candidate: candidate, status: candidate.status, sourceDebtIds: candidate.sourceDebtIds || [] });
    var persistedReceipt = await repository.putModulePromotionReceipt({ receipt: receipt });
    await repository.putModuleRevision({ moduleId: manifest.id, revision: manifest.revision, manifest: manifest, manifestSha256: manifestHash, originReceipt: originReceipt, promotionReceipt: receipt, status: receipt.decision });
    var auditReceiptId = await repository.audit('module-promoted', manifest.id + '@' + manifest.revision, { candidateId: candidate.candidateId, candidateSha256: persistedCandidate.candidateSha256, manifestSha256: manifestHash, promotionReceiptId: receipt.receiptId, promotionReceiptSha256: persistedReceipt.receiptSha256, originAuthorization: originReceipt.authorization || null, decision: receipt.decision });
    return { moduleId: manifest.id, revision: manifest.revision, candidateId: candidate.candidateId, manifestSha256: manifestHash, promotionReceiptId: receipt.receiptId, auditReceiptId: auditReceiptId };
  }
  return { persistApprovedModule: persistApprovedModule };
}
module.exports = { createModulePersistenceBridge: createModulePersistenceBridge, sha256: sha256 };
