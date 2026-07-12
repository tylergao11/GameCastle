var providerRuntime = require('./provider-runtime');

var runtime = providerRuntime.createProviderRuntime();

async function callTextModel(prompt, systemPrompt, opts, logger) {
  opts = opts || {}; logger = logger || function() {};
  var role = opts.providerRole || (opts.agentRole === 'CreativeImagination' ? 'creative-text' : 'intent-text');
  var requestId = opts.requestId || ('text.' + Date.now());
  var result = await runtime.invokeRole({
    requestId: requestId,
    projectId: opts.projectId || 'local-session',
    role: role,
    provider: opts.provider || opts.providerConfig,
    model: opts.model,
    estimatedCost: opts.estimatedCost,
    timeoutMs: opts.timeoutMs,
    maxAttempts: opts.maxAttempts || 1,
    input: { systemPrompt: systemPrompt, prompt: prompt, maxTokens: opts.maxTokens || 4096 }
  });
  logger('[ProviderRuntime] role=' + role + ' receipt=' + result.receipt.receiptId + ' status=' + result.receipt.status + ' provider=' + result.receipt.provider + ' model=' + result.receipt.model);
  if (!result.ok) return null;
  return result.output.text;
}

module.exports = { callTextModel: callTextModel, getRuntime: function() { return runtime; } };
