var providerRuntime = require('./provider-runtime');

var runtime = providerRuntime.createProviderRuntime();

async function callTextModel(prompt, systemPrompt, opts, logger) {
  opts = opts || {}; logger = logger || function() {};
  var role = opts.providerRole || (opts.agentRole === 'creative' || opts.agentRole === 'CreativeImagination' ? 'creative-text' : 'semantic-design');
  var requestId = opts.requestId || ('text.' + Date.now());
  var input = opts.input ? { messages: opts.input } : { systemPrompt: systemPrompt, prompt: prompt };
  input.maxTokens = opts.maxTokens || 4096;
  if (opts.thinking) input.thinking = opts.thinking;
  if (opts.reasoningEffort) input.reasoningEffort = opts.reasoningEffort;
  if (opts.temperature !== undefined) input.temperature = opts.temperature;
  var result = await runtime.invokeRole({
    requestId: requestId,
    projectId: opts.projectId || 'local-session',
    role: role,
    provider: opts.provider || opts.providerConfig,
    model: opts.model,
    estimatedCost: opts.estimatedCost,
    timeoutMs: opts.timeoutMs,
    maxAttempts: opts.maxAttempts || 1,
    input: input
  });
  logger('[ProviderRuntime] role=' + role + ' receipt=' + result.receipt.receiptId + ' status=' + result.receipt.status + ' provider=' + result.receipt.provider + ' model=' + result.receipt.model);
  if (!result.ok) return null;
  return result.output.text;
}

module.exports = { callTextModel: callTextModel, getRuntime: function() { return runtime; } };
