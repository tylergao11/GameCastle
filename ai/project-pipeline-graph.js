var intentPipelineGraph = require('./intent-pipeline-graph');

var PROJECT_GRAPH_NAME = 'Project Weave Graph';

var PROJECT_GRAPH_NODE_SEQUENCE = [
  'requirement',
  'llm2-intent',
  'intent-compiler',
  'resolver',
  'asset-library',
  'image-generation',
  'asset-review',
  'asset-resolver',
  'asset-world',
  'bridge',
  'runtime-linker',
  'network-runtime',
  'server-runtime',
  'html-export',
  'runtime',
  'runtime-validator',
  'project-world',
];

var PROJECT_GRAPH_NODE_DEFINITIONS = {
  requirement: {
    layer: 'briefing',
    owner: 'RequirementModel',
    status: 'existing',
    reads: ['userRequest.text', 'projectWorld.sanitizedForLlm1'],
    writes: ['requirement.designBrief', 'requirement.diff'],
    aiVisible: true,
  },
  'llm2-intent': {
    layer: 'world-intent',
    owner: 'DSLAgent',
    status: 'wired-langgraph',
    reads: ['llm2.nodeInput'],
    writes: ['llm2.intentDslText', 'llm2.intentDslLineCount'],
    aiVisible: true,
    prohibitedReads: [
      'projectWorld.world',
      'bridge.bridgePlan',
      'bridge.internalDslText',
      'runtime.executionReport',
      'assetResolver.manifest',
      'assetWorld.world',
    ],
  },
  'intent-compiler': {
    layer: 'world-intent',
    owner: 'IntentCompiler',
    status: 'wired-langgraph',
    reads: ['llm2.intentDslText', 'projectWorld.world'],
    writes: ['intentGraph.graph', 'intentGraph.summary', 'compiler.contracts', 'compiler.resultCard'],
  },
  resolver: {
    layer: 'world-intent',
    owner: 'PlacementResolver',
    status: 'wired-langgraph',
    reads: ['intentGraph.graph', 'projectWorld.world'],
    writes: ['resolver.placementPlan', 'resolver.summary'],
  },
  'asset-library': {
    layer: 'asset-weave',
    owner: 'CloudLibraryManager',
    status: 'wired-langgraph-smoke',
    reads: ['requirement.designBrief', 'intentGraph.graph', 'assetWorld.world'],
    writes: ['assetLibrary.matches', 'assetLibrary.summary'],
    modules: ['ai/cloud-library-manager.js', 'ai/texture-provider.js'],
  },
  'image-generation': {
    layer: 'asset-weave',
    owner: 'ImageAgent',
    status: 'wired-langgraph-smoke',
    reads: ['assetResolver.missingSlots', 'assetLibrary.matches'],
    writes: ['imageGeneration.candidates', 'imageGeneration.distillHints'],
    modules: ['ai/image-agent.js', 'ai/distillation-agent.js', 'ai/asset-rag-client.js'],
  },
  'asset-review': {
    layer: 'asset-weave',
    owner: 'VisionAgent',
    status: 'wired-langgraph-smoke',
    reads: ['imageGeneration.candidates', 'imageGeneration.distillHints'],
    writes: ['assetReview.report', 'assetReview.approvedCandidates'],
    modules: ['ai/asset-rag-client.js', 'ai/distillation-agent.js'],
  },
  'asset-resolver': {
    layer: 'asset-weave',
    owner: 'RuntimeAssetResolver',
    status: 'wired-langgraph-smoke',
    reads: ['requirement.designBrief', 'intentGraph.graph', 'projectWorld.world', 'assetWorld.world', 'assetLibrary.matches', 'assetReview.approvedCandidates'],
    writes: ['assetResolver.manifest', 'assetResolver.summary', 'assetResolver.missingSlots'],
    modules: ['ai/asset-resolver.js'],
  },
  'asset-world': {
    layer: 'asset-weave',
    owner: 'AssetWorld',
    status: 'wired-langgraph-smoke',
    reads: ['assetResolver.manifest', 'assetWorld.previous'],
    writes: ['assetWorld.world', 'assetWorld.sanitizedForAgents'],
    modules: ['ai/asset-world.js'],
  },
  bridge: {
    layer: 'world-intent',
    owner: 'GdjsBridge',
    status: 'wired-langgraph',
    reads: ['intentGraph.graph', 'resolver.placementPlan', 'compiler.contracts'],
    writes: ['bridge.bridgePlan', 'bridge.summary', 'bridge.internalDslText', 'bridge.internalDslLineCount'],
  },
  'runtime-linker': {
    layer: 'runtime-assembly',
    owner: 'RuntimeLinker',
    status: 'wired-langgraph-smoke',
    reads: ['bridge.bridgePlan', 'bridge.internalDslText', 'assetResolver.manifest', 'assetWorld.world'],
    writes: ['assembly.report', 'assembly.htmlExportManifest', 'assembly.runtimeFiles'],
    modules: ['ai/pipeline.js', 'ai/runtime-codegen.js'],
  },
  'network-runtime': {
    layer: 'runtime-assembly',
    owner: 'NetworkRuntimeCodegen',
    status: 'wired-langgraph-smoke',
    reads: ['bridge.bridgePlan', 'assembly.report'],
    writes: ['networkRuntime.manifest', 'networkRuntime.bundle', 'networkRuntime.summary'],
    modules: ['ai/network-runtime/codegen.js', 'ai/network-runtime/transport.js', 'ai/network-runtime/game-bridge.js', 'ai/network-runtime/frame-sync.js', 'ai/network-runtime/snapshot-sync.js', 'ai/network-runtime/event-relay.js', 'ai/network-runtime/async-persistence.js'],
  },
  'server-runtime': {
    layer: 'server-weave',
    owner: 'ServerRuntime',
    status: 'wired-langgraph-smoke',
    reads: ['networkRuntime.manifest', 'networkRuntime.summary'],
    writes: ['serverRuntime.report', 'serverRuntime.rooms', 'serverRuntime.stateStore'],
    modules: ['server/signaling-server.js', 'server/room.js', 'server/game-loop.js', 'server/server-ordered-input.js', 'server/state-store.js'],
  },
  'html-export': {
    layer: 'runtime-assembly',
    owner: 'HtmlExporter',
    status: 'wired-langgraph-smoke',
    reads: ['assembly.report', 'networkRuntime.bundle', 'assetResolver.manifest'],
    writes: ['htmlExport.manifest', 'htmlExport.files', 'htmlExport.summary'],
    modules: ['ai/html-exporter.js'],
  },
  runtime: {
    layer: 'runtime-assembly',
    owner: 'RuntimeExecutor',
    status: 'wired-langgraph',
    reads: ['bridge.internalDslText', 'bridge.bridgePlan', 'assembly.report'],
    writes: ['runtime.executionReport', 'runtime.summary'],
  },
  'runtime-validator': {
    layer: 'validation',
    owner: 'RuntimeValidator',
    status: 'wired-langgraph-smoke',
    reads: ['runtime.executionReport', 'projectWorld.world', 'assetWorld.world', 'assembly.report'],
    writes: ['validation.report', 'validation.ownerRoute'],
  },
  'project-world': {
    layer: 'world-summary',
    owner: 'ProjectWorld',
    status: 'wired-langgraph-smoke',
    reads: ['runtime.executionReport', 'validation.report', 'projectWorld.previous'],
    writes: ['projectWorld.world', 'projectWorld.sanitizedForLlm2', 'executionLedger.latest'],
  },
};

var PROJECT_GRAPH_LAYERS = [
  {
    id: 'briefing',
    name: 'Briefing Layer',
    summary: 'Turn user request and current summaries into a creative design brief.',
  },
  {
    id: 'world-intent',
    name: 'World Intent Layer',
    summary: 'Convert creative intent into structured world intent and target-code plans.',
  },
  {
    id: 'asset-weave',
    name: 'Asset Weave Layer',
    summary: 'Resolve resource slots, asset reuse, generated-asset debt, and AssetWorld.',
  },
  {
    id: 'runtime-assembly',
    name: 'Runtime Assembly Layer',
    summary: 'Bind target plans, assets, runtime files, HTML export, network runtime, and execution.',
  },
  {
    id: 'server-weave',
    name: 'Server Weave Layer',
    summary: 'Compose signaling, rooms, ordered input, state store, and server runtime reports.',
  },
  {
    id: 'validation',
    name: 'Validation Layer',
    summary: 'Check world fulfillment, asset debt, export health, and owner routing.',
  },
  {
    id: 'world-summary',
    name: 'World Summary Layer',
    summary: 'Persist ProjectWorld, AssetWorld summaries, and execution ledger feedback.',
  },
];

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function getProjectGraphSpec() {
  return {
    name: PROJECT_GRAPH_NAME,
    nodeSequence: clone(PROJECT_GRAPH_NODE_SEQUENCE),
    layers: clone(PROJECT_GRAPH_LAYERS),
    nodes: clone(PROJECT_GRAPH_NODE_DEFINITIONS),
    embeddedGraphs: {
      worldIntent: {
        name: 'World Intent Layer',
        nodeSequence: clone(intentPipelineGraph.INTENT_PIPELINE_NODE_SEQUENCE),
      },
    },
  };
}

function getNodeDefinition(nodeName) {
  return clone(PROJECT_GRAPH_NODE_DEFINITIONS[nodeName] || null);
}

function getLayerNodes(layerId) {
  return PROJECT_GRAPH_NODE_SEQUENCE.filter(function(nodeName) {
    return PROJECT_GRAPH_NODE_DEFINITIONS[nodeName].layer === layerId;
  });
}

function getWiredLangGraphNodes() {
  return PROJECT_GRAPH_NODE_SEQUENCE.filter(function(nodeName) {
    return PROJECT_GRAPH_NODE_DEFINITIONS[nodeName].status === 'wired-langgraph';
  });
}

function getLangGraphSmokeNodes() {
  return PROJECT_GRAPH_NODE_SEQUENCE.filter(function(nodeName) {
    return PROJECT_GRAPH_NODE_DEFINITIONS[nodeName].status === 'wired-langgraph-smoke';
  });
}

function getContractReadyNodes() {
  return PROJECT_GRAPH_NODE_SEQUENCE.filter(function(nodeName) {
    return PROJECT_GRAPH_NODE_DEFINITIONS[nodeName].status === 'contract-ready';
  });
}

function assertProjectGraphSpec(spec) {
  spec = spec || getProjectGraphSpec();
  if (spec.name !== PROJECT_GRAPH_NAME) throw new Error('Project graph name mismatch');
  if (!Array.isArray(spec.nodeSequence) || spec.nodeSequence.length !== PROJECT_GRAPH_NODE_SEQUENCE.length) {
    throw new Error('Project graph node sequence mismatch');
  }
  spec.nodeSequence.forEach(function(nodeName, index) {
    if (nodeName !== PROJECT_GRAPH_NODE_SEQUENCE[index]) {
      throw new Error('Project graph node sequence drift: ' + nodeName + ' !== ' + PROJECT_GRAPH_NODE_SEQUENCE[index]);
    }
    var node = spec.nodes[nodeName];
    if (!node) throw new Error('Project graph missing node definition: ' + nodeName);
    if (!node.layer || !node.owner || !node.status) {
      throw new Error('Project graph node must declare layer, owner, and status: ' + nodeName);
    }
    if (!Array.isArray(node.reads) || !Array.isArray(node.writes)) {
      throw new Error('Project graph node must declare reads and writes: ' + nodeName);
    }
  });
  var embedded = spec.embeddedGraphs && spec.embeddedGraphs.worldIntent;
  if (!embedded) throw new Error('Project graph must embed World Intent Layer');
  var embeddedIndexes = embedded.nodeSequence.map(function(nodeName) {
    return spec.nodeSequence.indexOf(nodeName);
  });
  if (embeddedIndexes.some(function(index) { return index < 0; })) {
    throw new Error('Project graph missing embedded World Intent node');
  }
  for (var embeddedIndex = 1; embeddedIndex < embeddedIndexes.length; embeddedIndex++) {
    if (embeddedIndexes[embeddedIndex] <= embeddedIndexes[embeddedIndex - 1]) {
      throw new Error('Project graph World Intent Layer order drift');
    }
  }
  if (embedded.nodeSequence.join('|') !== intentPipelineGraph.INTENT_PIPELINE_NODE_SEQUENCE.join('|')) {
    throw new Error('Project graph World Intent Layer sequence drift');
  }
  return true;
}

module.exports = {
  PROJECT_GRAPH_NAME: PROJECT_GRAPH_NAME,
  PROJECT_GRAPH_NODE_SEQUENCE: clone(PROJECT_GRAPH_NODE_SEQUENCE),
  PROJECT_GRAPH_LAYERS: clone(PROJECT_GRAPH_LAYERS),
  getProjectGraphSpec: getProjectGraphSpec,
  getNodeDefinition: getNodeDefinition,
  getLayerNodes: getLayerNodes,
  getWiredLangGraphNodes: getWiredLangGraphNodes,
  getLangGraphSmokeNodes: getLangGraphSmokeNodes,
  getContractReadyNodes: getContractReadyNodes,
  assertProjectGraphSpec: assertProjectGraphSpec,
};
