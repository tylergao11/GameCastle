var modelPolicy = require('./semantic-model-policy');
var dslGrammar = require('./semantic-dsl-gbnf');

function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'SemanticModelPort'; throw error; }
function assertPort(port) {
  if (!port || typeof port.invoke !== 'function') fail('SEMANTIC_MODEL_PORT_INVALID', 'Semantic model port requires invoke(request).');
  return port;
}

function createRoleRouter(ports) {
  if (!ports || !ports.planner || !ports.executor) fail('SEMANTIC_MODEL_PORT_INVALID', 'Role router requires planner and executor ports.');
  assertPort(ports.planner); assertPort(ports.executor);
  return assertPort({
    kind: 'semantic-role-model-router',
    cachePolicy: ports.executor.cachePolicy || null,
    invoke: function(request) {
      if (!request || (request.phase !== 'planner' && request.phase !== 'executor')) fail('SEMANTIC_MODEL_PORT_INVALID', 'Role router phase must be planner or executor.');
      return ports[request.phase].invoke(request);
    }
  });
}

function fromProviderRuntime(runtime, options) {
  if (!runtime || typeof runtime.invokeRole !== 'function') fail('SEMANTIC_MODEL_PORT_INVALID', 'Provider adapter requires ProviderRuntime.invokeRole.');
  options = options || {};
  return assertPort({
    kind: 'provider-runtime-semantic-model-port',
    cachePolicy: modelPolicy.MODEL.cachePolicy,
    invoke: function(request) {
      if (!request || (request.phase !== 'planner' && request.phase !== 'executor')) fail('SEMANTIC_MODEL_PORT_INVALID', 'Semantic model request phase must be planner or executor.');
      var profile = modelPolicy.profile(request.phase);
      var invocation = {
        requestId: request.requestId,
        projectId: request.projectId,
        role: 'semantic-design',
        provider: modelPolicy.MODEL.provider,
        model: modelPolicy.MODEL.model,
        estimatedCost: request.estimatedCost,
        timeoutMs: request.timeoutMs,
        maxAttempts: 1,
        input: {
          messages: request.messages,
          maxTokens: request.maxTokens,
          thinking: profile.thinking,
          reasoningEffort: profile.reasoningEffort,
          temperature: profile.temperature,
          grammar: dslGrammar.forPhase(request.phase)
        }
      };
      return runtime.invokeRole(invocation);
    }
  });
}

module.exports = { assertPort: assertPort, createRoleRouter: createRoleRouter, fromProviderRuntime: fromProviderRuntime };
