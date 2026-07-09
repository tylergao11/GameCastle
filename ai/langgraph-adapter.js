var pipelineState = require('./pipeline-state');

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function normalizeOptions(options) {
  options = options || {};
  return {
    allowPartial: !!options.allowPartial,
  };
}

function makeLangGraphState(state, trace) {
  return {
    pipelineState: pipelineState.validatePipelineState(state, { allowPartial: true }),
    graphTrace: clone(trace || []),
  };
}

function unwrapPipelineState(graphState) {
  if (!graphState) throw new Error('LangGraph adapter requires graph state');
  if (graphState.pipelineState) return graphState.pipelineState;
  if (graphState.stateKind === 'gamecastle-ai-first-intent-pipeline') return graphState;
  throw new Error('LangGraph adapter requires graphState.pipelineState');
}

function appendTrace(graphState, entry) {
  var trace = (graphState && graphState.graphTrace) || [];
  return trace.concat([entry]);
}

function makeLangGraphNode(nodeName, handler, options) {
  if (!nodeName) throw new Error('LangGraph adapter requires nodeName');
  if (typeof handler !== 'function') throw new Error('LangGraph adapter requires handler(view)');
  var validationOptions = normalizeOptions(options);

  return async function langGraphNode(graphState) {
    var state = unwrapPipelineState(graphState);
    pipelineState.validatePipelineState(state, validationOptions);
    var view = pipelineState.makeNodeStateView(state, nodeName, validationOptions);
    var patch = await handler(view);
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      throw new Error('LangGraph node ' + nodeName + ' must return a path-object patch');
    }
    var nextState = pipelineState.applyNodeStatePatch(state, nodeName, patch, validationOptions);
    return {
      pipelineState: nextState,
      graphTrace: appendTrace(graphState, {
        node: nodeName,
        reads: view.reads,
        writes: Object.keys(patch),
        partial: !!validationOptions.allowPartial,
      }),
    };
  };
}

module.exports = {
  makeLangGraphState: makeLangGraphState,
  makeLangGraphNode: makeLangGraphNode,
  unwrapPipelineState: unwrapPipelineState,
};
