var langGraphAdapter = require('./langgraph-adapter');
var pipelineState = require('./pipeline-state');

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

async function loadLangGraphPackage() {
  try {
    return await import('@langchain/langgraph');
  } catch (error) {
    throw new Error(
      'Official LangGraph runtime is not installed. Run npm install @langchain/langgraph @langchain/core zod. Cause: ' +
        (error && error.message ? error.message : String(error))
    );
  }
}

function createPipelineStateAnnotation(langGraph) {
  if (!langGraph || !langGraph.Annotation) {
    throw new Error('Official LangGraph package must expose Annotation');
  }
  return langGraph.Annotation.Root({
    pipelineState: langGraph.Annotation({
      reducer: function(_left, right) {
        return right;
      },
      default: function() {
        return null;
      },
    }),
    graphTrace: langGraph.Annotation({
      reducer: function(_left, right) {
        return right || [];
      },
      default: function() {
        return [];
      },
    }),
  });
}

function normalizeSequence(nodeSequence) {
  if (!Array.isArray(nodeSequence) || !nodeSequence.length) {
    throw new Error('LangGraph runtime requires a non-empty node sequence');
  }
  nodeSequence.forEach(function(nodeName) {
    if (!nodeName || typeof nodeName !== 'string') {
      throw new Error('LangGraph runtime node sequence must contain node names');
    }
  });
  return nodeSequence.slice();
}

function assertHandlers(nodeSequence, handlers) {
  if (!handlers || typeof handlers !== 'object' || Array.isArray(handlers)) {
    throw new Error('LangGraph runtime requires handlers keyed by node name');
  }
  nodeSequence.forEach(function(nodeName) {
    if (typeof handlers[nodeName] !== 'function') {
      throw new Error('LangGraph runtime missing handler for node: ' + nodeName);
    }
  });
}

async function compileStateGraph(options) {
  options = options || {};
  var nodeSequence = normalizeSequence(options.nodeSequence);
  assertHandlers(nodeSequence, options.handlers);

  var langGraph = options.langGraphPackage || await loadLangGraphPackage();
  if (!langGraph.StateGraph || !langGraph.START || !langGraph.END) {
    throw new Error('Official LangGraph package must expose StateGraph, START, and END');
  }

  var graph = new langGraph.StateGraph(createPipelineStateAnnotation(langGraph));
  var adapterOptions = { allowPartial: options.allowPartial !== false };
  nodeSequence.forEach(function(nodeName) {
    graph.addNode(
      nodeName,
      langGraphAdapter.makeLangGraphNode(nodeName, options.handlers[nodeName], adapterOptions)
    );
  });
  graph.addEdge(langGraph.START, nodeSequence[0]);
  for (var i = 0; i < nodeSequence.length - 1; i++) {
    graph.addEdge(nodeSequence[i], nodeSequence[i + 1]);
  }
  graph.addEdge(nodeSequence[nodeSequence.length - 1], langGraph.END);

  return graph.compile();
}

async function invokeStateGraph(initialState, options) {
  options = options || {};
  var compiledGraph = options.compiledGraph || await compileStateGraph(options);
  var graphState = options.graphState || langGraphAdapter.makeLangGraphState(initialState);
  var result = await compiledGraph.invoke(graphState, options.invokeOptions || {});
  var finalState = langGraphAdapter.unwrapPipelineState(result);
  if (options.validateFinal !== false) {
    pipelineState.validatePipelineState(finalState);
  }
  return {
    state: finalState,
    graphTrace: clone(result.graphTrace || []),
    graphState: result,
  };
}

module.exports = {
  loadLangGraphPackage: loadLangGraphPackage,
  createPipelineStateAnnotation: createPipelineStateAnnotation,
  compileStateGraph: compileStateGraph,
  invokeStateGraph: invokeStateGraph,
};
