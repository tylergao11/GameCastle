/* C-2 immutable approval gate. It validates evidence; it never downloads, installs, or approves artifacts. */
var crypto = require('crypto');

function stable(value) { if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']'; if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(function(key) { return JSON.stringify(key) + ':' + stable(value[key]); }).join(',') + '}'; return JSON.stringify(value); }
function sha256(value) { return crypto.createHash('sha256').update(stable(value)).digest('hex'); }
function error(code, message) { var value = new Error(message); value.code = code; value.owner = 'ComfyUIWorkerDeploymentApproval'; return value; }
function nonZeroHash(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) && !/^0{64}$/.test(value); }
function imageDigest(value) { return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value) && !/^sha256:0{64}$/.test(value); }
function content(approval) { var copy = Object.assign({}, approval); delete copy.contentSha256; delete copy.signature; return copy; }
function verifySignature(approval, trustedKeys) { var signature = approval && approval.signature, key = signature && trustedKeys && trustedKeys[signature.keyId]; if (!signature || signature.algorithm !== 'ed25519' || !key || typeof signature.value !== 'string') return false; try { return crypto.verify(null, Buffer.from(stable(content(approval))), key, Buffer.from(signature.value, 'base64')); } catch (_error) { return false; } }
function validate(deployment, options) {
  var approval = deployment && deployment.approval, errors = [];
  if (!approval || typeof approval !== 'object') return ['approval is required'];
  if (approval.deploymentId !== deployment.id) errors.push('deploymentId mismatch');
  if (!approval.approvalId || !/^comfy-approval\.[a-z0-9_.-]+$/.test(approval.approvalId)) errors.push('approvalId invalid');
  if (!approval.contentSha256 || approval.contentSha256 !== sha256(content(approval))) errors.push('contentSha256 mismatch');
  if (!verifySignature(approval, options && options.trustedKeys)) errors.push('approval signature invalid');
  var image = approval.executionImage || {};
  if (!image.repository || !imageDigest(image.digest) || !image.upstreamRepository || !/^[a-f0-9]{40,64}$/.test(image.upstreamRevision || '') || !nonZeroHash(image.sbomSha256)) errors.push('execution image evidence incomplete');
  var model = approval.model || {};
  if (model.id !== deployment.modelId || model.sha256 !== deployment.modelSha256 || model.licenseId !== deployment.licenseId || !nonZeroHash(model.sha256)) errors.push('model evidence mismatch');
  var workflow = approval.workflow || {};
  if (workflow.id !== deployment.workflowId || workflow.revision !== deployment.workflowRevision || workflow.sha256 !== deployment.workflowSha256 || !nonZeroHash(workflow.sha256)) errors.push('workflow evidence mismatch');
  var hardware = approval.hardware || {};
  if (!hardware.gpuName || !Number.isFinite(Number(hardware.vramMiB)) || Number(hardware.vramMiB) < 16384 || !hardware.driverVersion || !hardware.cudaVersion) errors.push('hardware evidence incomplete');
  var review = approval.humanReview || {};
  if (!review.receiptId || !review.reviewer || !review.reviewedAt || review.decision !== 'approved') errors.push('human review evidence incomplete');
  return errors;
}
function assertApproved(deployment, options) { if (!deployment || deployment.status !== 'approved') throw error('COMFYUI_WORKER_DEPLOYMENT_UNAPPROVED', 'Cloud worker deployment is not approved.'); var errors = validate(deployment, options); if (errors.length) throw error('COMFYUI_WORKER_APPROVAL_INVALID', 'Cloud worker approval is invalid: ' + errors.join('; ')); return deployment.approval; }
module.exports = { stable: stable, content: content, sha256: sha256, validate: validate, assertApproved: assertApproved };
