var intentPipelineGraph = require('./intent-pipeline-graph');

var PROJECT_GRAPH_NAME = 'Project Weave Graph';

var PROJECT_PRE_GRAPH_STAGES = [
  {
    id: 'creative-imagination',
    owner: 'CreativeImagination',
    execution: 'ai/creative-agent.js',
    reads: ['userRequest', 'creativeHistory', 'previousCreativeVision'],
    writes: ['creativeVision', 'creativeChange'],
    handoff: 'llm2.nodeInput',
  },
];

var PROJECT_GRAPH_NODE_SEQUENCE = [
  'llm2-intent',
  'intent-compiler',
  'resolver',
  'asset-weave',
  'bridge',
  'runtime-linker',
  'runtime',
  'project-world',
  'tick-runtime',
  'server-runtime',
  'html-export',
  'runtime-validator',
  'tick-playtest',
  'semantic-feedback',
];

var PROJECT_GRAPH_NODE_DEFINITIONS = {
  'llm2-intent': {
    layer: 'world-intent',
    owner: 'IntentAgent',
    status: 'wired-langgraph',
    reads: ['llm2.nodeInput'],
    writes: ['llm2.intentSlotPacket', 'llm2.intentSlotCommandCount'],
    aiVisible: true,
    prohibitedReads: [
      'projectWorld.world',
      'bridge.bridgePlan',
      'bridge.targetPlanText',
      'runtime.executionReport',
      'assetResolver.manifest',
      'assetWorld.world',
    ],
  },
  'intent-compiler': {
    layer: 'world-intent',
    owner: 'IntentCompiler',
    status: 'wired-langgraph',
    reads: ['llm2.intentSlotPacket', 'projectWorld.world'],
    writes: ['compiler.intentDslText', 'compiler.intentDslLineCount', 'intentGraph.graph', 'intentGraph.summary', 'compiler.contracts', 'compiler.resultCard'],
  },
  resolver: {
    layer: 'world-intent',
    owner: 'PlacementResolver',
    status: 'wired-langgraph',
    reads: ['intentGraph.graph', 'projectWorld.world'],
    writes: ['resolver.placementPlan', 'resolver.summary'],
  },
  'asset-weave': {
    layer: 'asset-weave',
    owner: 'RuntimeAssetResolver',
    status: 'wired-langgraph',
    reads: ['compiler.contracts', 'assetWorld.previous'],
    writes: ['assetResolver.manifest', 'assetResolver.summary', 'assetWorld.world', 'assetWorld.sanitizedForAgents'],
    modules: ['ai/asset-engine-langgraph.js', 'ai/asset-weave-graph.js', 'ai/asset-world.js', 'ai/asset-model-ports.js', 'ai/cloud-asset-engine.js', 'ai/cloud-local-plan-runner.js', 'ai/runtime-animation-recipes.js', 'ai/asset-animation-state-machine.js'],
  },
  bridge: {
    layer: 'world-intent',
    owner: 'GdjsBridge',
    status: 'wired-langgraph',
    reads: ['intentGraph.graph', 'resolver.placementPlan', 'compiler.contracts'],
    writes: ['bridge.bridgePlan', 'bridge.summary', 'bridge.targetPlanText', 'bridge.targetPlanLineCount'],
  },
  'runtime-linker': {
    layer: 'runtime-assembly',
    owner: 'RuntimeLinker',
    status: 'wired-langgraph',
    reads: ['bridge.bridgePlan', 'bridge.targetPlanText', 'assetResolver.manifest', 'assetWorld.world'],
    writes: ['assembly.report', 'assembly.htmlExportManifest', 'assembly.runtimeFiles'],
    modules: ['ai/pipeline.js', 'ai/runtime-codegen.js'],
  },
  'tick-runtime': {
    layer: 'runtime-assembly',
    owner: 'TickRuntimeCodegen',
    status: 'wired-langgraph',
    reads: ['bridge.bridgePlan', 'assembly.report'],
    writes: ['tickRuntime.manifest', 'tickRuntime.bundle', 'tickRuntime.summary'],
    modules: ['ai/network-runtime/codegen.js', 'ai/network-runtime/transport.js', 'ai/network-runtime/tick-intent-bridge.js', 'ai/network-runtime/tick-intent-runtime.js', 'ai/network-runtime/snapshot-sync.js', 'ai/network-runtime/event-relay.js', 'ai/network-runtime/async-persistence.js'],
  },
  'server-runtime': {
    layer: 'server-weave',
    owner: 'ServerRuntime',
    status: 'wired-langgraph',
    reads: ['tickRuntime.manifest', 'tickRuntime.summary'],
    writes: ['serverRuntime.report', 'serverRuntime.rooms', 'serverRuntime.stateStore'],
    modules: ['server/signaling-server.js', 'server/room.js', 'server/game-loop.js', 'server/server-ordered-input.js', 'server/state-store.js'],
  },
  'html-export': {
    layer: 'runtime-assembly',
    owner: 'HtmlExporter',
    status: 'wired-langgraph',
    reads: ['assembly.report', 'tickRuntime.bundle', 'assetResolver.manifest'],
    writes: ['htmlExport.manifest', 'htmlExport.files', 'htmlExport.summary'],
    modules: ['ai/html-exporter.js'],
  },
  runtime: {
    layer: 'runtime-assembly',
    owner: 'RuntimeExecutor',
    status: 'wired-langgraph',
    reads: ['bridge.targetPlanText', 'bridge.bridgePlan', 'assembly.report'],
    writes: ['runtime.executionReport', 'runtime.summary'],
  },
  'runtime-validator': {
    layer: 'validation',
    owner: 'RuntimeValidator',
    status: 'wired-langgraph',
    reads: ['runtime.executionReport', 'projectWorld.world', 'assetWorld.world', 'assembly.report'],
    writes: ['validation.report', 'validation.ownerRoute'],
  },
  'project-world': {
    layer: 'world-summary',
    owner: 'ProjectWorld',
    status: 'wired-langgraph',
    reads: ['runtime.executionReport', 'validation.report', 'projectWorld.previous'],
    writes: ['projectWorld.world', 'projectWorld.sanitizedForLlm2', 'executionLedger.latest'],
  },
  'tick-playtest': {
    layer: 'world-summary',
    owner: 'SemanticPlaytestAgent',
    status: 'wired-langgraph',
    reads: ['projectWorld.world', 'projectWorld.sanitizedForLlm2', 'semanticMapping.dictionary', 'semanticMapping.llmSafeView'],
    writes: ['tickPlaytest.playPolicy', 'tickPlaytest.report', 'tickPlaytest.llmReport', 'tickPlaytest.userReport', 'tickPlaytest.repairIntentDslText', 'tickPlaytest.summary'],
    modules: ['ai/semantic-playtest-agent.js', 'ai/tick-playtest-runtime.js', 'ai/semantic-mapping/semantic-feedback.json'],
  },
  'semantic-feedback': {
    layer: 'world-summary',
    owner: 'SemanticFeedback',
    status: 'wired-langgraph',
    reads: ['projectWorld.sanitizedForLlm2', 'runtime.executionReport', 'validation.report', 'tickPlaytest.llmReport', 'semanticMapping.dictionary'],
    writes: ['semanticFeedback.report', 'semanticFeedback.repairIntentDslText', 'semanticFeedback.summary', 'semanticFeedback.semanticMappingView'],
    modules: ['ai/semantic-feedback.js', 'ai/semantic-mapping/semantic-feedback.json'],
  },
};

var PROJECT_GRAPH_LAYERS = [
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
    summary: 'Bind target plans, assets, runtime files, HTML export, tick intent runtime, and execution.',
  },
  {
    id: 'server-weave',
    name: 'Server Weave Layer',
    summary: 'Compose signaling, rooms, tick intent ordering, state store, and server runtime reports.',
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
    preGraphStages: clone(PROJECT_PRE_GRAPH_STAGES),
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
