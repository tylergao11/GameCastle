var POLICY = Object.freeze({ provider: 'deepseek', model: 'deepseek-v4-flash' });

function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'DirectorModelPort'; throw error; }

function assertPort(port) { if (!port || typeof port.invoke !== 'function') fail('DIRECTOR_MODEL_PORT_INVALID', 'Director model port requires invoke(request).'); return port; }

function fromProviderRuntime(runtime, options) {
  if (!runtime || typeof runtime.invokeRole !== 'function') fail('DIRECTOR_MODEL_PORT_INVALID', 'Director provider adapter requires ProviderRuntime.invokeRole.');
  options = options || {};
  var testDouble = options.testDouble === true;
  return assertPort({
    kind: 'provider-runtime-director-model-port',
    invoke: function(request) {
      if (!request || !request.requestId || !request.projectId || !request.systemPrompt || !request.prompt) fail('DIRECTOR_MODEL_PORT_INVALID', 'Director request requires requestId, projectId, systemPrompt, and prompt.');
      return runtime.invokeRole({ requestId: request.requestId, projectId: request.projectId, role: 'director-plan', provider: testDouble ? 'simulated-local' : POLICY.provider, model: testDouble ? 'simulated-text' : POLICY.model, allowExternal: !testDouble, estimatedCost: options.estimatedCost, timeoutMs: options.timeoutMs, maxAttempts: 1, input: { systemPrompt: request.systemPrompt, prompt: request.prompt, maxTokens: options.maxTokens || 2048, thinking: { type: 'disabled' }, temperature: 0 } });
    }
  });
}

module.exports = { POLICY: POLICY, assertPort: assertPort, fromProviderRuntime: fromProviderRuntime };
