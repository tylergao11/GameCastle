var crypto = require('crypto');

function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(function(key) { return JSON.stringify(key) + ':' + stable(value[key]); }).join(',') + '}';
  return JSON.stringify(value);
}
function content(value) { var copy = Object.assign({}, value || {}); delete copy.signature; return copy; }
function verify(value, trustedKeys) {
  var signature = value && value.signature, publicKey = signature && trustedKeys && trustedKeys[signature.keyId];
  if (!publicKey || signature.algorithm !== 'ed25519' || typeof signature.value !== 'string') return false;
  try { return crypto.verify(null, Buffer.from(stable(content(value))), publicKey, Buffer.from(signature.value, 'base64')); } catch (_error) { return false; }
}
function validate(value, expected, trustedKeys) {
  var required = ['requestId', 'projectId', 'jobId', 'deploymentId', 'workflowId', 'workflowRevision', 'workflowSha256', 'modelId', 'modelSha256', 'licenseId', 'startedAt', 'finishedAt', 'gpuMs'];
  if (!value || required.some(function(key) { return value[key] === undefined || value[key] === null || value[key] === ''; }) || !value.gpu || !value.gpu.name || !Number.isFinite(Number(value.gpu.vramMiB)) || Number(value.gpu.vramMiB) < 16384 || !Number.isFinite(Number(value.gpuMs)) || Number(value.gpuMs) < 0) throw new Error('worker attestation shape is invalid');
  if (Object.keys(expected || {}).some(function(key) { return value[key] !== expected[key]; })) throw new Error('worker attestation does not bind this request or deployment');
  if (!verify(value, trustedKeys)) throw new Error('worker attestation signature is untrusted');
  return Object.assign({}, content(value));
}
module.exports = { stable: stable, content: content, verify: verify, validate: validate };
