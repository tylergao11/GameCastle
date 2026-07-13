/* Records an accepted, materialized generated asset as immutable verification staging. Shared-library publication belongs to CloudPromotion. */
var crypto = require('crypto');
var fs = require('fs');
var governance = require('./ai-provider-governance');

function sha256(value) { return crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex'); }
function required(value, name) { if (!value) throw new Error(name + ' is required'); return value; }
function workflowReceipt(candidate) {
  var provenance = candidate.providerReceipt && candidate.providerReceipt.provenance;
  if (!provenance || !provenance.workflowId || !provenance.workflowSha256 || !provenance.modelId || !provenance.modelSha256 || !provenance.licenseId) throw new Error('accepted generated candidate requires complete ComfyUI provenance');
  if (!provenance.provider || !governance.governance.providers[provenance.provider]) throw new Error('accepted generated candidate requires a governed provenance provider');
  return provenance;
}
function createAssetPersistenceBridge(options) {
  options = options || {};
  var objectStore = required(options.objectStore, 'objectStore');
  var repository = required(options.repository, 'repository');
  if (typeof objectStore.put !== 'function') throw new Error('objectStore.put is required');
  ['putAssetRevision', 'putDerivationReceipt', 'audit'].forEach(function(method) { if (typeof repository[method] !== 'function') throw new Error('repository.' + method + ' is required'); });
  async function persistAcceptedGeneratedAsset(input) {
    required(input, 'persistence input');
    if (input.persistenceMode !== 'verification-staging') throw new Error('accepted generated asset persistence requires persistenceMode=verification-staging; shared publication must use CloudPromotion');
    var candidate = required(input.candidate, 'candidate');
    if (candidate.privacyScope === 'private-local' || (candidate.assetBlobProvenance && candidate.assetBlobProvenance.transitScope === 'private-local')) throw new Error('private-local candidates cannot enter the cloud asset persistence bridge');
    if ((candidate.status !== 'generated' && candidate.status !== 'variant') || !candidate.materialized || !candidate.path || !fs.existsSync(candidate.path)) throw new Error('only accepted materialized model candidates can be persisted');
    if (candidate.status === 'variant' && !candidate.parentRevisionId) throw new Error('accepted image edit candidate requires parentRevisionId');
    var provenance = workflowReceipt(candidate), bytes = fs.readFileSync(candidate.path), digest = sha256(bytes);
    if (candidate.sha256 && candidate.sha256 !== digest) throw new Error('candidate sha256 does not match materialized bytes');
    var familyId = required(input.familyId, 'familyId');
    var revisionId = input.revisionId || 'assetrev.' + digest.slice(0, 32);
    var stored = await objectStore.put({ bytes: bytes, sha256: digest, extension: candidate.format || 'png', mediaType: input.mediaType || 'image/png', origin: provenance.provider });
    var parentRevisionIds = input.parentRevisionIds || (candidate.parentRevisionId ? [candidate.parentRevisionId] : []);
    if (candidate.status === 'variant' && parentRevisionIds.length !== 1) throw new Error('accepted image edit candidate requires exactly one parent revision');
    await repository.putAssetRevision({ familyId: familyId, revisionId: revisionId, bytesSha256: digest, objectKey: stored.objectKey, kind: input.kind || 'raster', styleId: required(candidate.styleId, 'candidate.styleId'), semanticTags: candidate.semanticTags || [], familyStatus: 'verification-staging', status: 'verification-staging', metadata: { byteLength: stored.byteLength, mediaType: stored.mediaType, width: candidate.width, height: candidate.height, transparent: !!candidate.transparent, sourcePathSha256: sha256(candidate.path), parentRevisionIds: parentRevisionIds, persistenceMode: input.persistenceMode }, provenanceReceipt: { provider: provenance.provider, licenseId: provenance.licenseId, jobId: provenance.jobId, workflowSha256: provenance.workflowSha256, modelSha256: provenance.modelSha256, providerReceiptSha256: sha256(candidate.providerReceipt) } });
    var receiptId = 'derive.' + sha256([revisionId, provenance.workflowSha256, provenance.modelSha256, candidate.providerReceipt]).slice(0, 32);
    await repository.putDerivationReceipt({ receiptId: receiptId, outputRevisionId: revisionId, parentRevisionIds: parentRevisionIds, workflow: { id: provenance.workflowId, revision: provenance.workflowRevision, sha256: provenance.workflowSha256 }, model: { id: provenance.modelId, sha256: provenance.modelSha256, licenseId: provenance.licenseId }, inputSha256: { outputBytes: digest, providerReceipt: sha256(candidate.providerReceipt) } });
    var auditReceiptId = await repository.audit('asset-verification-staged', revisionId, { familyId: familyId, objectKey: stored.objectKey, sha256: digest, derivationReceiptId: receiptId, status: 'verification-staging' });
    return { familyId: familyId, revisionId: revisionId, sha256: digest, objectKey: stored.objectKey, derivationReceiptId: receiptId, auditReceiptId: auditReceiptId, persistenceMode: 'verification-staging' };
  }
  return { persistAcceptedGeneratedAsset: persistAcceptedGeneratedAsset };
}
module.exports = { createAssetPersistenceBridge: createAssetPersistenceBridge, sha256: sha256 };
