var assert = require('assert').strict;
var crypto = require('crypto');
var fs = require('fs');
var os = require('os');
var path = require('path');
var bridgeModule = require('./asset-persistence-bridge');
var storeModule = require('./s3-object-store');

async function main() {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-persistence-'));
  try {
    var file = path.join(root, 'hero.png'), bytes = Buffer.from('accepted-generated-png-bytes'); fs.writeFileSync(file, bytes);
    var sent = [], client = { send: async function(command) { sent.push(command.input); return { ETag: 'test' }; } };
    var assetCalls = [], derivationCalls = [], audits = [];
    var repository = { putAssetRevision: async function(input) { assetCalls.push(input); }, putDerivationReceipt: async function(input) { derivationCalls.push(input); }, audit: async function(kind, subjectId, payload) { audits.push({ kind: kind, subjectId: subjectId, payload: payload }); return 'audit.test'; } };
    var store = storeModule.createS3ObjectStore({ client: client, bucket: 'gamecastle-assets' });
    var bridge = bridgeModule.createAssetPersistenceBridge({ objectStore: store, repository: repository });
    var digest = crypto.createHash('sha256').update(bytes).digest('hex');
    var result = await bridge.persistAcceptedGeneratedAsset({ persistenceMode: 'verification-staging', familyId: 'asset-family.hero', candidate: { status: 'generated', materialized: true, path: file, sha256: digest, format: 'png', styleId: 'gamecastle.style-dna.v1', semanticTags: ['hero'], width: 32, height: 32, transparent: true, providerReceipt: { provenance: { provider: 'comfyui-local', workflowId: 'pixel-sprite', workflowRevision: 'v1', workflowSha256: 'a'.repeat(64), modelId: 'local-model', modelSha256: 'b'.repeat(64), licenseId: 'internal-model-license', jobId: 'job-7' } } } });
    assert.equal(result.sha256, digest); assert.equal(sent[0].Key, 'assets/' + digest + '.png'); assert.equal(sent[0].Metadata.sha256, digest);
    assert.equal(assetCalls[0].bytesSha256, digest); assert.equal(assetCalls[0].objectKey, sent[0].Key); assert.equal(assetCalls[0].provenanceReceipt.provider, 'comfyui-local'); assert.equal(derivationCalls[0].workflow.sha256, 'a'.repeat(64)); assert.equal(derivationCalls[0].model.licenseId, 'internal-model-license'); assert.equal(audits[0].payload.derivationReceiptId, result.derivationReceiptId);
    await assert.rejects(function() { return bridge.persistAcceptedGeneratedAsset({ persistenceMode: 'verification-staging', familyId: 'asset-family.bad', candidate: { status: 'generated', materialized: true, path: file, sha256: 'c'.repeat(64), format: 'png', styleId: 'gamecastle.style-dna.v1', providerReceipt: { provenance: { provider: 'comfyui-local', workflowId: 'pixel-sprite', workflowRevision: 'v1', workflowSha256: 'a'.repeat(64), modelId: 'local-model', modelSha256: 'b'.repeat(64), licenseId: 'internal-model-license', jobId: 'job-8' } } } }); }, /candidate sha256/);
    await assert.rejects(function() { return bridge.persistAcceptedGeneratedAsset({ persistenceMode: 'verification-staging', familyId: 'asset-family.private', candidate: { status: 'generated', materialized: true, privacyScope: 'private-local', path: file, sha256: digest, format: 'png', styleId: 'gamecastle.style-dna.v1', providerReceipt: { provenance: { provider: 'comfyui-local', workflowId: 'pixel-sprite', workflowRevision: 'v1', workflowSha256: 'a'.repeat(64), modelId: 'local-model', modelSha256: 'b'.repeat(64), licenseId: 'internal-model-license', jobId: 'job-9' } } } }); }, /private-local candidates/);
    await assert.rejects(function() { return bridge.persistAcceptedGeneratedAsset({ familyId: 'asset-family.missing-mode', candidate: { status: 'generated', materialized: true, path: file, sha256: digest, format: 'png', styleId: 'gamecastle.style-dna.v1', providerReceipt: { provenance: { provider: 'comfyui-local', workflowId: 'pixel-sprite', workflowRevision: 'v1', workflowSha256: 'a'.repeat(64), modelId: 'local-model', modelSha256: 'b'.repeat(64), licenseId: 'internal-model-license', jobId: 'job-10' } } } }); }, /persistenceMode=verification-staging/);
    console.log('[AssetPersistenceBridge] content-addressed S3 storage, asset revision, derivation receipt, audit receipt, and hash rejection passed');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
main().catch(function(error) { console.error(error); process.exit(1); });
