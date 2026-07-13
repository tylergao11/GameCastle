/* C-2 evidence aggregation. Only signed worker, Acceptance, and human-review receipts may enter a report. */
var attestation = require('./comfyui-worker-attestation');
function number(value, name) { var parsed = Number(value); if (!Number.isFinite(parsed) || parsed < 0) throw new Error(name + ' must be a non-negative number'); return parsed; }
function percentile(values, p) { var sorted = values.slice().sort(function(a, b) { return a - b; }); return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))]; }
function signed(value, keys, label) { if (!attestation.verify(value, keys)) throw new Error('C-2 ' + label + ' receipt signature is untrusted'); return attestation.content(value); }
function latencyMs(provider) { var start = Date.parse(provider.startedAt), end = Date.parse(provider.finishedAt); if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new Error('C-2 provider receipt has invalid timestamps'); return end - start; }
function summarize(evidence, trustedKeys) {
  if (!evidence || evidence.source !== 'signed-live-gpu-worker' || !Array.isArray(evidence.samples) || evidence.samples.length < 20) throw new Error('C-2 metrics require at least 20 signed-live-gpu-worker samples');
  if (!trustedKeys || !trustedKeys.workerKeys || !trustedKeys.acceptanceKeys || !trustedKeys.humanReviewKeys) throw new Error('C-2 metrics require configured trust keys');
  var samples = evidence.samples.map(function(sample) {
    if (!sample || sample.simulated === true || !sample.providerReceipt || !sample.workerAttestation || !sample.acceptanceReceipt || !sample.humanReviewReceipt) throw new Error('C-2 sample lacks its signed evidence chain');
    var provider = sample.providerReceipt, worker = attestation.validate(sample.workerAttestation, { requestId: provider.requestId, projectId: provider.projectId, jobId: provider.provenance && provider.provenance.jobId, deploymentId: provider.provenance && provider.provenance.deploymentId, workflowId: provider.provenance && provider.provenance.workflowId, workflowRevision: provider.provenance && provider.provenance.workflowRevision, workflowSha256: provider.provenance && provider.provenance.workflowSha256, modelId: provider.provenance && provider.provenance.modelId, modelSha256: provider.provenance && provider.provenance.modelSha256, licenseId: provider.provenance && provider.provenance.licenseId }, trustedKeys.workerKeys);
    if (provider.provider !== 'comfyui-worker' || provider.status !== 'succeeded' || provider.role !== 'image-generate' || number(provider.usage && provider.usage.gpuMs, 'providerReceipt.usage.gpuMs') !== number(worker.gpuMs, 'worker.gpuMs')) throw new Error('C-2 provider receipt does not bind a successful Worker execution');
    var acceptance = signed(sample.acceptanceReceipt, trustedKeys.acceptanceKeys, 'Acceptance');
    var human = signed(sample.humanReviewReceipt, trustedKeys.humanReviewKeys, 'human review');
    if (acceptance.requestId !== provider.requestId || acceptance.providerReceiptId !== provider.receiptId || !['accepted', 'rejected'].includes(acceptance.decision) || human.requestId !== provider.requestId || !['accepted', 'rejected'].includes(human.decision)) throw new Error('C-2 Acceptance or human review receipt is not bound to the Worker request');
    return { latencyMs: latencyMs(provider), gpuMs: number(worker.gpuMs, 'gpuMs'), accepted: acceptance.decision === 'accepted', repaired: acceptance.repairApplied === true, humanDecision: human.decision };
  });
  var latency = samples.map(function(sample) { return sample.latencyMs; });
  return { schemaVersion: 1, source: evidence.source, sampleCount: samples.length, p50LatencyMs: percentile(latency, 0.5), p95LatencyMs: percentile(latency, 0.95), meanGpuMs: samples.reduce(function(sum, sample) { return sum + sample.gpuMs; }, 0) / samples.length, acceptanceRate: samples.filter(function(sample) { return sample.accepted; }).length / samples.length, repairRate: samples.filter(function(sample) { return sample.repaired; }).length / samples.length, humanAcceptanceRate: samples.filter(function(sample) { return sample.humanDecision === 'accepted'; }).length / samples.length };
}
module.exports = { summarize: summarize };
