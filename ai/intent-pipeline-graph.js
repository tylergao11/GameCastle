var pipelineGraphRunner = require('./pipeline-graph-runner');
var pipelineState = require('./pipeline-state');
var langGraphAdapter = require('./langgraph-adapter');
var langGraphRuntime = require('./langgraph-runtime');

var INTENT_PIPELINE_NODE_SEQUENCE = [
  'llm2-intent',
  'intent-compiler',
  'resolver',
  'bridge',
  'runtime',
];

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function normalizeHandlers(handlers) {
  if (!handlers || typeof handlers !== 'object' || Array.isArray(handlers)) {
    throw new Error('Intent pipeline graph requires handlers keyed by node name');
  }
  INTENT_PIPELINE_NODE_SEQUENCE.forEach(function(nodeName) {
    if (typeof handlers[nodeName] !== 'function') {
      throw new Error('Intent pipeline graph missing handler for node: ' + nodeName);
    }
  });
  Object.keys(handlers).forEach(function(nodeName) {
    if (INTENT_PIPELINE_NODE_SEQUENCE.indexOf(nodeName) < 0) {
      throw new Error('Intent pipeline graph does not define node: ' + nodeName);
    }
  });
  return handlers;
}

function makeIntentPipelineSteps(handlers) {
  handlers = normalizeHandlers(handlers);
  return INTENT_PIPELINE_NODE_SEQUENCE.map(function(nodeName) {
    return {
      node: nodeName,
      run: handlers[nodeName],
    };
  });
}

async function runIntentPipelineGraph(initialState, handlers, options) {
  options = options || {};
  var runnerOptions = { allowPartial: options.allowPartial !== false };
  var result = await pipelineGraphRunner.runGraphAsync(
    initialState,
    makeIntentPipelineSteps(handlers),
    runnerOptions
  );
  if (options.validateFinal !== false) {
    pipelineState.validatePipelineState(result.state);
  }
  return result;
}

function makeIntentLangGraphNodes(handlers, options) {
  handlers = normalizeHandlers(handlers);
  options = options || {};
  var adapterOptions = { allowPartial: options.allowPartial !== false };
  var result = {};
  INTENT_PIPELINE_NODE_SEQUENCE.forEach(function(nodeName) {
    result[nodeName] = langGraphAdapter.makeLangGraphNode(nodeName, handlers[nodeName], adapterOptions);
  });
  return result;
}

function makeIntentLangGraphState(initialState) {
  return langGraphAdapter.makeLangGraphState(initialState);
}

async function compileIntentLangGraph(handlers, options) {
  handlers = normalizeHandlers(handlers);
  options = options || {};
  return langGraphRuntime.compileStateGraph({
    nodeSequence: INTENT_PIPELINE_NODE_SEQUENCE,
    handlers: handlers,
    allowPartial: options.allowPartial !== false,
    langGraphPackage: options.langGraphPackage,
  });
}

async function runIntentLangGraph(initialState, handlers, options) {
  handlers = normalizeHandlers(handlers);
  options = options || {};
  var result = await langGraphRuntime.invokeStateGraph(initialState, {
    nodeSequence: INTENT_PIPELINE_NODE_SEQUENCE,
    handlers: handlers,
    allowPartial: options.allowPartial !== false,
    validateFinal: options.validateFinal !== false,
    compiledGraph: options.compiledGraph,
    graphState: options.graphState,
    invokeOptions: options.invokeOptions,
    langGraphPackage: options.langGraphPackage,
  });
  if (options.validateFinal !== false) {
    pipelineState.validatePipelineState(result.state);
  }
  return result;
}

function makeArtifactReplayHandlers(completeState) {
  pipelineState.validatePipelineState(completeState);
  return {
    'llm2-intent': function(view) {
      var viewJson = JSON.stringify(view);
      pipelineState.assertNoProhibitedAiVisibleSurface(view.state, 'intent.graph.llm2.view');
      if (viewJson.indexOf('bridgePlan') >= 0 || viewJson.indexOf('runtimeAdapterRequirements') >= 0) {
        throw new Error('Intent graph LLM2 view leaked internal bridge/runtime state');
      }
      return {
        'llm2.intentDslText': completeState.llm2.intentDslText,
        'llm2.intentDslLineCount': completeState.llm2.intentDslLineCount,
      };
    },
    'intent-compiler': function() {
      return {
        'intentGraph.graph': completeState.intentGraph.graph,
        'intentGraph.summary': completeState.intentGraph.summary,
        'compiler.contracts': completeState.compiler.contracts,
        'compiler.resultCard': completeState.compiler.resultCard,
        'compiler.resultCardSummary': completeState.compiler.resultCardSummary,
      };
    },
    resolver: function() {
      return {
        'resolver.placementPlan': completeState.resolver.placementPlan,
        'resolver.summary': completeState.resolver.summary,
      };
    },
    bridge: function() {
      return {
        'bridge.bridgePlan': completeState.bridge.bridgePlan,
        'bridge.summary': completeState.bridge.summary,
        'bridge.internalDslText': completeState.bridge.internalDslText,
        'bridge.internalDslLineCount': completeState.bridge.internalDslLineCount,
      };
    },
    runtime: function() {
      return {
        'runtime.executionReport': completeState.runtime.executionReport,
        'runtime.summary': completeState.runtime.summary,
        'projectWorld.world': completeState.projectWorld.world,
        'projectWorld.sanitizedForLlm2': completeState.projectWorld.sanitizedForLlm2,
      };
    },
  };
}

async function makePipelineStateFromArtifacts(options) {
  options = options || {};
  var completeState = pipelineState.createPipelineState(options);
  pipelineState.validatePipelineState(completeState);
  var partialState = pipelineState.createPipelineState({
    mode: options.mode || options.projectMode,
    batchLabel: options.batchLabel,
    patchKind: options.patchKind || 'intent',
    userRequest: options.userRequest,
    designBrief: options.designBrief,
    diff: options.diff,
    projectWorld: options.projectWorld,
    lastExecutionReport: options.executionReport,
  });
  var graphRunner = options.useLocalGraphRunner ? runIntentPipelineGraph : runIntentLangGraph;
  var result = await graphRunner(partialState, makeArtifactReplayHandlers(completeState));
  result.state.graphTrace = result.graphTrace || result.trace;
  pipelineState.validatePipelineState(result.state);
  return result.state;
}

module.exports = {
  INTENT_PIPELINE_NODE_SEQUENCE: clone(INTENT_PIPELINE_NODE_SEQUENCE),
  makeIntentPipelineSteps: makeIntentPipelineSteps,
  runIntentPipelineGraph: runIntentPipelineGraph,
  makeIntentLangGraphNodes: makeIntentLangGraphNodes,
  makeIntentLangGraphState: makeIntentLangGraphState,
  compileIntentLangGraph: compileIntentLangGraph,
  runIntentLangGraph: runIntentLangGraph,
  makeArtifactReplayHandlers: makeArtifactReplayHandlers,
  makePipelineStateFromArtifacts: makePipelineStateFromArtifacts,
};
