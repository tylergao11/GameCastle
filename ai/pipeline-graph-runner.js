var pipelineState = require('./pipeline-state');

function applyStepUpdate(state, step, view, update, validationOptions, options) {
  if (!update || typeof update !== 'object' || Array.isArray(update)) {
    throw new Error('Graph step ' + step.node + ' must return a path-object state update');
  }
  return {
    state: pipelineState.applyNodeStateUpdate(state, step.node, update, validationOptions),
    traceEntry: {
      node: step.node,
      reads: view.reads,
      writes: Object.keys(update),
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
    var update = step.run(view);
    var applied = applyStepUpdate(state, step, view, update, validationOptions, options);
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
    var update = await step.run(view);
    var applied = applyStepUpdate(state, step, view, update, validationOptions, options);
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
