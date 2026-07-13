var assert = require('assert');
var crypto = require('crypto');
var metrics = require('./comfyui-c2-metrics');
var attest = require('./comfyui-worker-attestation');

function key() { var pair = crypto.generateKeyPairSync('ed25519'); return { privateKey: pair.privateKey, publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }) }; }
function sign(value, keyId, privateKey) { value.signature = { keyId: keyId, algorithm: 'ed25519', value: crypto.sign(null, Buffer.from(attest.stable(attest.content(value))), privateKey).toString('base64') }; return value; }
var worker = key(), acceptance = key(), human = key();
var trust = { workerKeys: { 'test-worker': worker.publicKey }, acceptanceKeys: { 'test-acceptance': acceptance.publicKey }, humanReviewKeys: { 'test-human': human.publicKey } };
function sample(index) {
  var requestId = 'evidence-' + index, receiptId = 'provider.' + requestId, startedAt = '2026-07-13T00:00:00.000Z', finishedAt = '2026-07-13T00:00:' + String(10 + index).padStart(2, '0') + '.000Z';
  var provenance = { jobId: 'job-' + index, deploymentId: 'gamecastle.flux-schnell.gpu.v1', workflowId: 'gamecastle.flux-schnell.gpu.v1', workflowRevision: 'v1', workflowSha256: 'a'.repeat(64), modelId: 'FLUX.1-schnell-fp8', modelSha256: 'b'.repeat(64), licenseId: 'apache-2.0' };
  var providerReceipt = { receiptId: receiptId, requestId: requestId, projectId: 'c2-project', provider: 'comfyui-worker', role: 'image-generate', status: 'succeeded', startedAt: startedAt, finishedAt: finishedAt, usage: { gpuMs: 80 + index }, provenance: provenance };
  var workerReceipt = sign(Object.assign({ requestId: requestId, projectId: 'c2-project', startedAt: startedAt, finishedAt: finishedAt, gpuMs: 80 + index, gpu: { name: 'NVIDIA RTX 4090', vramMiB: 24576, driverVersion: '555.42', cudaVersion: '12.4' } }, provenance), 'test-worker', worker.privateKey);
  return { providerReceipt: providerReceipt, workerAttestation: workerReceipt, acceptanceReceipt: sign({ requestId: requestId, providerReceiptId: receiptId, decision: index % 5 ? 'accepted' : 'rejected', repairApplied: index % 4 === 0 }, 'test-acceptance', acceptance.privateKey), humanReviewReceipt: sign({ requestId: requestId, decision: index % 3 ? 'accepted' : 'rejected' }, 'test-human', human.privateKey) };
}
var samples = Array.from({ length: 20 }, function(_, index) { return sample(index); });
var result = metrics.summarize({ source: 'signed-live-gpu-worker', samples: samples }, trust);
assert.equal(result.sampleCount, 20); assert.equal(result.p50LatencyMs, 19000); assert.equal(result.p95LatencyMs, 28000); assert.equal(result.acceptanceRate, 0.8); assert.equal(result.repairRate, 0.25);
assert.throws(function() { metrics.summarize({ source: 'fixture', samples: samples }, trust); }, /signed-live-gpu-worker/);
assert.throws(function() { metrics.summarize({ source: 'signed-live-gpu-worker', samples: samples.slice(0, 19) }, trust); }, /at least 20/);
var forged = JSON.parse(JSON.stringify(samples)); forged[0].workerAttestation.gpu.vramMiB = 999999; assert.throws(function() { metrics.summarize({ source: 'signed-live-gpu-worker', samples: forged }, trust); }, /untrusted/);
var unbound = JSON.parse(JSON.stringify(samples)); unbound[0].humanReviewReceipt.requestId = 'different'; assert.throws(function() { metrics.summarize({ source: 'signed-live-gpu-worker', samples: unbound }, trust); }, /untrusted|not bound/);
console.log('[ComfyUIC2Metrics] signed evidence-chain validator rejects unsigned, forged, and unbound metric records');
