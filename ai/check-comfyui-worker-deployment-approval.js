var assert = require('assert');
var crypto = require('crypto');
var approvals = require('./comfyui-worker-deployment-approval');
var registry = require('../shared/comfyui-worker-deployment-registry.json');
function clone(value) { return JSON.parse(JSON.stringify(value)); }
var keys = crypto.generateKeyPairSync('ed25519'), trusted = { 'fixture-approval-key': keys.publicKey.export({ type: 'spki', format: 'pem' }) };
function sign(approval) { approval.contentSha256 = approvals.sha256(approval); approval.signature = { keyId: 'fixture-approval-key', algorithm: 'ed25519', value: crypto.sign(null, Buffer.from(approvals.stable(approvals.content(approval))), keys.privateKey).toString('base64') }; }
function approved(deployment) {
  var item = clone(deployment); item.status = 'approved'; item.workflowSha256 = 'a'.repeat(64); item.modelSha256 = 'b'.repeat(64); item.approval = { approvalId: 'comfy-approval.stage-c-fixture', deploymentId: item.id, executionImage: { repository: 'ghcr.io/gamecastle/comfyui-worker', digest: 'sha256:' + 'c'.repeat(64), upstreamRepository: 'https://github.com/SaladTechnologies/comfyui-api', upstreamRevision: 'd'.repeat(40), sbomSha256: 'e'.repeat(64) }, model: { id: item.modelId, sha256: item.modelSha256, licenseId: item.licenseId }, workflow: { id: item.workflowId, revision: item.workflowRevision, sha256: item.workflowSha256 }, hardware: { gpuName: 'NVIDIA RTX 4090', vramMiB: 24576, driverVersion: '555.42', cudaVersion: '12.4' }, humanReview: { receiptId: 'review.stage-c-fixture', reviewer: 'gpu-release-reviewer', reviewedAt: '2026-07-13T00:00:00.000Z', decision: 'approved' } }; sign(item.approval); return item;
}
var valid = approved(registry.deployments['gamecastle.flux-schnell.gpu.v1']);
assert.deepEqual(approvals.validate(valid, { trustedKeys: trusted }), []); assert.equal(approvals.assertApproved(valid, { trustedKeys: trusted }).deploymentId, valid.id);
var missingSbom = clone(valid); missingSbom.approval.executionImage.sbomSha256 = '0'.repeat(64); assert.throws(function() { approvals.assertApproved(missingSbom, { trustedKeys: trusted }); }, function(value) { return value.code === 'COMFYUI_WORKER_APPROVAL_INVALID'; });
var tampered = clone(valid); tampered.approval.model.sha256 = 'f'.repeat(64); assert.throws(function() { approvals.assertApproved(tampered, { trustedKeys: trusted }); }, function(value) { return value.code === 'COMFYUI_WORKER_APPROVAL_INVALID'; });
var unsigned = clone(valid); delete unsigned.approval.signature; assert.throws(function() { approvals.assertApproved(unsigned, { trustedKeys: trusted }); }, function(value) { return value.code === 'COMFYUI_WORKER_APPROVAL_INVALID'; });
var planned = clone(valid); planned.status = 'planned-not-approved'; assert.throws(function() { approvals.assertApproved(planned, { trustedKeys: trusted }); }, function(value) { return value.code === 'COMFYUI_WORKER_DEPLOYMENT_UNAPPROVED'; });
console.log('[ComfyUIWorkerDeploymentApproval] immutable image/model/workflow/hardware/human-review evidence is required before approval');
