'use strict';

// Provider-side ports that do not own asset Style DNA or ComfyUI.
// Asset image ports live in packages/assets/src/asset-provider-ports.js.

function createTextProvider(runtime, role, options) {
  options = options || {};
  return {
    invoke: function(request) {
      return runtime.invokeRole({
        requestId: request.requestId,
        projectId: request.projectId,
        role: role,
        provider: options.provider,
        estimatedCost: options.estimatedCost,
        timeoutMs: options.timeoutMs,
        maxAttempts: options.maxAttempts,
        input: { systemPrompt: request.systemPrompt, prompt: request.prompt, maxTokens: request.maxTokens }
      });
    }
  };
}

function createSpatialPlannerPort(runtime, options) {
  options = options || {};
  if (!runtime || typeof runtime.invokeRole !== 'function') throw new Error('SpatialPlanner requires ProviderRuntime.invokeRole.');
  return {
    invoke: function(request) {
      return runtime.invokeRole({
        requestId: request.requestId,
        projectId: request.projectId,
        role: 'spatial-plan',
        provider: options.provider,
        estimatedCost: options.estimatedCost,
        timeoutMs: options.timeoutMs,
        maxAttempts: options.maxAttempts,
        input: {
          systemPrompt: request.systemPrompt,
          prompt: request.prompt,
          imagePaths: request.imagePaths,
          maxTokens: request.maxTokens
        }
      });
    }
  };
}

module.exports = {
  createTextProvider: createTextProvider,
  createSpatialPlannerPort: createSpatialPlannerPort
};
