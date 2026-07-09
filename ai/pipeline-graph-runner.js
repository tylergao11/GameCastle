var pipelineState = require('./pipeline-state');

function applyStepPatch(state, step, view, patch, validationOptions, options) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new Error('Graph step ' + step.node + ' must return a path-object patch');
  }
  return {
    state: pipelineState.applyNodeStatePatch(state, step.node, patch, validationOptions),
    traceEntry: {
      node: step.node,
      reads: view.reads,
      writes: Object.keys(patch),
      partial: !!options.allowPartial,
    },
  };
}

function runGraph(initialState, steps, options) {
  options = options || {};
  var validationOptions = { allowPartial: !!options.allowPartial };
  var state = pipelineState.validatePipelineState(initialState, validationOptions);
  var trace = [];
  (steps || []).forEach(function(step, index) {
    if (!step || !step.node || typeof step.run !== 'function') {
      throw new Error('Graph step #' + index + ' must provide node and run(view)');
    }
    var view = pipelineState.makeNodeStateView(state, step.node, validationOptions);
    var patch = step.run(view);
    var applied = applyStepPatch(state, step, view, patch, validationOptions, options);
    state = applied.state;
    trace.push(applied.traceEntry);
  });
  return {
    state: state,
    trace: trace,
  };
}

async function runGraphAsync(initialState, steps, options) {
  options = options || {};
  var validationOptions = { allowPartial: !!options.allowPartial };
  var state = pipelineState.validatePipelineState(initialState, validationOptions);
  var trace = [];
  for (var index = 0; index < (steps || []).length; index++) {
    var step = steps[index];
    if (!step || !step.node || typeof step.run !== 'function') {
      throw new Error('Graph step #' + index + ' must provide node and run(view)');
    }
    var view = pipelineState.makeNodeStateView(state, step.node, validationOptions);
    var patch = await step.run(view);
    var applied = applyStepPatch(state, step, view, patch, validationOptions, options);
    state = applied.state;
    trace.push(applied.traceEntry);
  }
  return {
    state: state,
    trace: trace,
  };
}

module.exports = {
  runGraph: runGraph,
  runGraphAsync: runGraphAsync,
};
