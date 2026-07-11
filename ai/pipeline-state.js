var projectWorld = require('./project-world');
var intentSurfaceGuard = require('./intent-surface-guard');
var intentAgent = require('./intent-agent');
var intentSlots = require('./intent-slots');
var semanticFeedback = require('./semantic-feedback');

var PIPELINE_STATE_SCHEMA_VERSION = 1;

var PROHIBITED_AI_VISIBLE_KEYS = {
  x: true,
  y: true,
  dx: true,
  dy: true,
  bridgePlan: true,
  runtimeAdapterRequirements: true,
  componentId: true,
  adapter: true,
  runtimeAdapter: true,
  targetPlanText: true,
  targetPlanLines: true,
  commandResults: true,
  projectJson: true,
};

var PROHIBITED_AI_VISIBLE_TEXT = [
  'project.json',
];

var NODE_CONTRACTS = {
  'llm2-intent': {
    reads: ['llm2.nodeInput'],
    writes: ['llm2.intentSlotPacket', 'llm2.intentSlotCommandCount'],
    prohibitedReads: [
      'userRequest.text',
      'creative.vision',
      'creative.change',
      'projectWorld.world',
      'bridge.bridgePlan',
      'bridge.targetPlanText',
      'runtime.executionReport',
    ],
  },
  'intent-compiler': {
    reads: ['llm2.intentSlotPacket', 'projectWorld.world'],
    writes: ['compiler.intentDslText', 'compiler.intentDslLineCount', 'intentGraph.graph', 'intentGraph.summary', 'compiler.contracts', 'compiler.resultCard', 'compiler.resultCardSummary'],
  },
  resolver: {
    reads: ['intentGraph.graph', 'projectWorld.world'],
    writes: ['resolver.placementPlan', 'resolver.summary'],
  },
  bridge: {
    reads: ['intentGraph.graph', 'resolver.placementPlan', 'compiler.contracts'],
    writes: ['bridge.bridgePlan', 'bridge.summary', 'bridge.targetPlanText', 'bridge.targetPlanLineCount'],
  },
  runtime: {
    reads: ['bridge.targetPlanText', 'bridge.bridgePlan'],
    writes: ['runtime.executionReport', 'runtime.summary', 'projectWorld.world', 'projectWorld.sanitizedForLlm2'],
  },
};

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function getNodeContract(nodeName) {
  return clone(NODE_CONTRACTS[nodeName] || null);
}

function assertAllowedNodeAccess(nodeName, access) {
  var contract = NODE_CONTRACTS[nodeName];
  if (!contract) throw new Error('Unknown PipelineState node contract: ' + nodeName);
  access = access || {};
  var reads = access.reads || [];
  var writes = access.writes || [];
  var allowedReads = contract.reads || [];
  var allowedWrites = contract.writes || [];
  var prohibitedReads = contract.prohibitedReads || [];

  reads.forEach(function(path) {
    if (prohibitedReads.indexOf(path) >= 0) {
      throw new Error(nodeName + ' may not read prohibited PipelineState path: ' + path);
    }
    if (allowedReads.indexOf(path) < 0) {
      throw new Error(nodeName + ' may not read undeclared PipelineState path: ' + path);
    }
  });
  writes.forEach(function(path) {
    if (allowedWrites.indexOf(path) < 0) {
      throw new Error(nodeName + ' may not write undeclared PipelineState path: ' + path);
    }
  });
  return true;
}

function makeNodeContractsSnapshot() {
  return clone(NODE_CONTRACTS);
}

function assertContractListEqual(actual, expected, label) {
  var a = (actual || []).slice().sort();
  var e = (expected || []).slice().sort();
  if (a.length !== e.length) {
    throw new Error(label + ' length mismatch');
  }
  for (var i = 0; i < e.length; i++) {
    if (a[i] !== e[i]) throw new Error(label + ' mismatch: ' + a[i] + ' !== ' + e[i]);
  }
}

function validateNodeContractsSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') throw new Error('PipelineState nodeContracts missing');
  Object.keys(NODE_CONTRACTS).forEach(function(nodeName) {
    var expected = NODE_CONTRACTS[nodeName];
    var actual = snapshot[nodeName];
    if (!actual) throw new Error('PipelineState nodeContracts missing node: ' + nodeName);
    assertContractListEqual(actual.reads, expected.reads, nodeName + '.reads');
    assertContractListEqual(actual.writes, expected.writes, nodeName + '.writes');
    assertContractListEqual(actual.prohibitedReads, expected.prohibitedReads, nodeName + '.prohibitedReads');
  });
}

function getPathValue(value, pathName) {
  return String(pathName || '').split('.').reduce(function(current, part) {
    if (current === null || current === undefined) return undefined;
    return current[part];
  }, value);
}

function setPathValue(target, pathName, value) {
  var parts = String(pathName || '').split('.');
  var current = target;
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i];
    if (i === parts.length - 1) {
      current[part] = clone(value);
    } else {
      if (!current[part] || typeof current[part] !== 'object') current[part] = {};
      current = current[part];
    }
  }
}

function makeNodeStateView(state, nodeName, options) {
  validatePipelineState(state, options);
  var contract = NODE_CONTRACTS[nodeName];
  if (!contract) throw new Error('Unknown PipelineState node contract: ' + nodeName);
  assertAllowedNodeAccess(nodeName, { reads: contract.reads || [] });
  var view = {
    node: nodeName,
    reads: clone(contract.reads || []),
    state: {},
  };
  (contract.reads || []).forEach(function(pathName) {
    setPathValue(view.state, pathName, getPathValue(state, pathName));
  });
  if (nodeName === 'llm2-intent') {
    assertNoProhibitedAiVisibleSurface(view.state, 'nodeView.llm2-intent');
  }
  return view;
}

function applyNodeStateUpdate(state, nodeName, update, options) {
  validatePipelineState(state, options);
  if (!update || typeof update !== 'object' || Array.isArray(update)) {
    throw new Error('PipelineState node update must be an object keyed by state path');
  }
  var writes = Object.keys(update);
  assertAllowedNodeAccess(nodeName, { writes: writes });
  var next = clone(state);
  writes.forEach(function(pathName) {
    setPathValue(next, pathName, update[pathName]);
  });
  if (writes.indexOf('llm2.intentSlotPacket') >= 0 || writes.indexOf('llm2.intentSlotCommandCount') >= 0) {
    var commandCount = next.llm2 && next.llm2.intentSlotPacket && Array.isArray(next.llm2.intentSlotPacket.commands)
      ? next.llm2.intentSlotPacket.commands.length
      : 0;
    next.llm2.intentSlotCommandCount = commandCount;
    next.statePartitions.llm2Intent.evidence.intentSlotCommandCount = commandCount;
  }
  if (writes.indexOf('compiler.intentDslText') >= 0 || writes.indexOf('compiler.intentDslLineCount') >= 0) {
    next.compiler.intentDslLineCount = normalizeTextLines(next.compiler.intentDslText).length;
  }
  if (writes.some(function(pathName) { return pathName.indexOf('bridge.') === 0; })) {
    var targetLineCount = normalizeTextLines(next.bridge.targetPlanText).length;
    var bridgePlan = next.bridge.bridgePlan || {};
    next.bridge.targetPlanLineCount = targetLineCount;
    next.statePartitions.runtimeExecutionPlan.evidence.targetPlanLineCount = targetLineCount;
    next.statePartitions.runtimeExecutionPlan.evidence.runtimeAdapterRequirements = (bridgePlan.runtimeAdapterRequirements || []).length;
    next.statePartitions.compilerModuleFacts.evidence.installedModules = (bridgePlan.installedModules || []).length;
    next.statePartitions.compilerModuleFacts.evidence.tickRuntimeModules = ((((bridgePlan.tickRuntimeManifest || {}).modules) || [])).length;
  }
  if (writes.indexOf('projectWorld.world') >= 0 && next.projectWorld.world) {
    next.statePartitions.projectWorld.evidence.worldVersion = next.projectWorld.world.worldVersion;
    next.statePartitions.projectWorld.evidence.semanticHash = next.projectWorld.world.semanticHash;
  }
  validatePipelineState(next, options);
  return next;
}

function normalizeTextLines(textOrLines) {
  var lines = Array.isArray(textOrLines) ? textOrLines : String(textOrLines || '').split(/\r?\n/);
  return lines.map(function(line) {
    return String(line || '').trim();
  }).filter(function(line) {
    return line && line[0] !== '#';
  });
}

function summarizeIntentGraph(graph) {
  if (!graph) return null;
  return {
    things: (graph.things || []).length,
    components: (graph.components || []).length,
    relations: (graph.relations || []).length,
    placements: (graph.placements || []).length,
    edits: (graph.edits || []).length,
    bindings: (graph.bindings || []).length,
    requirements: (graph.requirements || []).length,
    diagnostics: (graph.diagnostics || []).length,
  };
}

function summarizePlacementPlan(plan) {
  if (!plan) return null;
  return {
    placements: (plan.placements || []).length,
    edits: (((plan.editPlan || {}).edits) || []).length,
    diagnostics: (plan.diagnostics || []).length,
  };
}

function summarizeBridgePlan(plan) {
  if (!plan) return null;
  return {
    target: plan.target || null,
    targetPlanLines: (plan.targetPlanLines || []).length,
    runtimeAdapterRequirements: (plan.runtimeAdapterRequirements || []).length,
    diagnostics: (plan.diagnostics || []).length,
  };
}

function summarizeResultCard(card) {
  if (!card) return null;
  return {
    resolved: (card.resolved || []).length,
    rewrites: (card.rewrites || []).length,
    overrides: (card.overrides || []).length,
    editConstraints: (card.editConstraints || []).length,
    autoAdded: (card.autoAdded || []).length,
    diagnostics: (card.diagnostics || []).length,
    warnings: (card.warnings || []).length,
    ownerTrace: clone(card.ownerTrace || []),
  };
}

function makeStatePartitions(options, summaries) {
  options = options || {};
  summaries = summaries || {};
  return {
    creative: {
      owner: 'CreativeImagination',
      artifact: 'CreativeVision',
      aiVisibleToLlm2: false,
      evidence: {
        hasCreativeVision: !!options.creativeVision,
        hasCreativeChange: !!options.creativeChange,
      },
    },
    llm2Intent: {
      owner: 'IntentSlotDirector',
      artifact: 'Intent Slot Packet',
      aiVisibleToLlm2: true,
      evidence: {
        intentSlotCommandCount: summaries.intentSlotCommandCount || 0,
        reads: ['llm2.nodeInput'],
      },
    },
    intentGraph: {
      owner: 'IntentCompiler',
      artifact: 'Intent Graph',
      aiVisibleToLlm2: false,
      evidence: summaries.intentGraphSummary || null,
    },
    resolver: {
      owner: 'PlacementResolver',
      artifact: 'Placement Plan',
      aiVisibleToLlm2: false,
      evidence: summaries.placementSummary || null,
    },
    compilerModuleFacts: {
      owner: 'IntentCompiler/ModuleCompiler',
      artifact: 'compiler-owned module facts',
      aiVisibleToLlm2: false,
      evidence: {
        installedModules: (((options.bridgePlan || {}).installedModules) || []).length,
        tickRuntimeModules: (((((options.bridgePlan || {}).tickRuntimeManifest) || {}).modules) || []).length,
      },
    },
    runtimeExecutionPlan: {
      owner: 'GDJSBridge/RuntimeExecutor',
      artifact: 'runtime execution plan',
      aiVisibleToLlm2: false,
      evidence: {
        targetPlanLineCount: summaries.targetPlanLineCount || 0,
        runtimeAdapterRequirements: (((options.bridgePlan || {}).runtimeAdapterRequirements) || []).length,
      },
    },
    projectWorld: {
      owner: 'ProjectWorld',
      artifact: 'semantic world snapshot',
      aiVisibleToLlm2: false,
      evidence: {
        worldVersion: options.projectWorld ? options.projectWorld.worldVersion : null,
        semanticHash: options.projectWorld ? options.projectWorld.semanticHash : null,
      },
    },
    engineProjectFile: {
      owner: 'RuntimeExecutor/GDJS',
      artifact: 'engine project file',
      aiVisibleToLlm2: false,
      evidence: {
        outputOnly: true,
        storedInPipelineState: false,
      },
    },
  };
}

function collectDiagnostics(options) {
  var diagnostics = [];
  function add(stage, owner, list) {
    (list || []).forEach(function(item) {
      diagnostics.push({
        stage: stage,
        owner: item.owner || owner || null,
        category: item.category || item.code || null,
        routeId: item.routeId || null,
        nextAction: item.nextAction || null,
        message: item.message || null,
      });
    });
  }
  add('intent-graph', 'intent-compiler', options.intentGraph && options.intentGraph.diagnostics);
  add('resolver', 'placement-resolver', options.placementPlan && options.placementPlan.diagnostics);
  add('bridge', 'gdjs-bridge', options.bridgePlan && options.bridgePlan.diagnostics);
  add('compiler', 'intent-compiler', options.compileResultCard && options.compileResultCard.diagnostics);
  add('runtime', 'executor', options.executionReport && options.executionReport.failed);
  (((options.executionReport || {}).intentFulfillment || {}).checks || []).forEach(function(check) {
    if (check.status === 'fulfilled') return;
    diagnostics.push({
      stage: 'runtime-fulfillment',
      owner: 'runtime-validator',
      category: check.kind || 'intent-fulfillment',
      routeId: 'intent-fulfillment-missing',
      nextAction: 'route-to-owner',
      message: check.reason || 'Intent fulfillment check missing',
    });
  });
  return diagnostics;
}

function deriveOwnerRoute(diagnostics) {
  var routed = (diagnostics || []).filter(function(item) {
    return item.nextAction === 'route-to-owner' || item.owner;
  });
  if (!routed.length) return null;
  return {
    owner: routed[0].owner || null,
    stage: routed[0].stage || null,
    category: routed[0].category || null,
    routeId: routed[0].routeId || null,
    nextAction: routed[0].nextAction || null,
  };
}

function makeSanitizedWorldContext(options) {
  return {
    projectWorld: projectWorld.sanitizeProjectWorldForIntentPrompt(options.projectWorld),
    lastExecutionReport: projectWorld.sanitizeExecutionReportForIntentPrompt(options.executionReport || options.lastExecutionReport),
    semanticMapping: semanticFeedback.buildSemanticMappingLlmView(),
  };
}

function makeLlm2NodeInput(options) {
  return {
    userRequest: intentAgent.sanitizeUserPromptForIntentPrompt(options.userRequest || options.prompt),
    creativeVision: intentAgent.sanitizeCreativeVisionForIntentPrompt(options.creativeVision),
    creativeChange: intentAgent.sanitizeCreativeChangeForIntentPrompt(options.creativeChange),
    worldContext: makeSanitizedWorldContext(options),
  };
}

function createPipelineState(options) {
  options = options || {};
  var artifactKind = options.artifactKind || (options.intentGraph ? 'intent' : null);
  if (artifactKind !== 'intent') {
    throw new Error('PipelineState only accepts AI-first Intent state');
  }
  var diagnostics = collectDiagnostics(options);
  var intentDslLines = normalizeTextLines(options.intentDslText);
  var intentSlotPacket = clone(options.intentSlotPacket || null);
  var intentSlotCommandCount = intentSlotPacket && Array.isArray(intentSlotPacket.commands) ? intentSlotPacket.commands.length : 0;
  var targetPlanLines = normalizeTextLines(options.targetPlanText || (options.bridgePlan && options.bridgePlan.targetPlanText));
  var llm2NodeInput = makeLlm2NodeInput(options);
  var intentGraphSummary = summarizeIntentGraph(options.intentGraph);
  var placementSummary = summarizePlacementPlan(options.placementPlan);
  var bridgeSummary = summarizeBridgePlan(options.bridgePlan);
  var resultCardSummary = summarizeResultCard(options.compileResultCard);
  var statePartitions = makeStatePartitions(options, {
    intentSlotCommandCount: intentSlotCommandCount,
    targetPlanLineCount: targetPlanLines.length,
    intentGraphSummary: intentGraphSummary,
    placementSummary: placementSummary,
  });
  return {
    schemaVersion: PIPELINE_STATE_SCHEMA_VERSION,
    stateKind: 'gamecastle-ai-first-intent-pipeline',
    nodeContracts: makeNodeContractsSnapshot(),
    graphTrace: clone(options.graphTrace || []),
    mode: options.mode || options.projectMode || null,
    batchLabel: options.batchLabel || null,
    artifactKind: artifactKind,
    statePartitions: statePartitions,
    userRequest: {
      text: options.userRequest || options.prompt || null,
    },
    creative: {
      vision: clone(options.creativeVision || null),
      change: clone(options.creativeChange || null),
    },
    llm2: {
      intentSlotPacket: intentSlotPacket,
      intentSlotCommandCount: intentSlotCommandCount,
      nodeInput: llm2NodeInput,
      sanitizedWorldContext: llm2NodeInput.worldContext,
    },
    intentGraph: {
      graph: clone(options.intentGraph || null),
      summary: intentGraphSummary,
    },
    resolver: {
      placementPlan: clone(options.placementPlan || null),
      summary: placementSummary,
    },
    compiler: {
      intentDslText: options.intentDslText || null,
      intentDslLineCount: intentDslLines.length,
      contracts: clone(options.intentContracts || null),
      resultCard: clone(options.compileResultCard || null),
      resultCardSummary: resultCardSummary,
    },
    bridge: {
      bridgePlan: clone(options.bridgePlan || null),
      summary: bridgeSummary,
      targetPlanText: options.targetPlanText || (options.bridgePlan && options.bridgePlan.targetPlanText) || '',
      targetPlanLineCount: targetPlanLines.length,
    },
    runtime: {
      executionReport: clone(options.executionReport || null),
      summary: options.executionReport ? clone(options.executionReport.summary || null) : null,
    },
    projectWorld: {
      world: clone(options.projectWorld || null),
      sanitizedForLlm2: llm2NodeInput.worldContext.projectWorld,
    },
    diagnostics: diagnostics,
    ownerRoute: deriveOwnerRoute(diagnostics),
  };
}

function walkStrings(value, visit, path) {
  path = path || [];
  if (value === null || value === undefined) return;
  if (typeof value === 'string') {
    visit(value, path);
    return;
  }
  if (typeof value !== 'object') return;
  Object.keys(value).forEach(function(key) {
    visit(String(key), path.concat([key, '$key']));
    walkStrings(value[key], visit, path.concat([key]));
  });
}

function assertNoProhibitedAiVisibleSurface(value, label) {
  var failures = [];
  walkStrings(value, function(text, path) {
    if (path[path.length - 1] === '$key') {
      var keyName = path[path.length - 2];
      if (PROHIBITED_AI_VISIBLE_KEYS[keyName]) {
        failures.push((label || 'value') + '.' + path.slice(0, -1).join('.') + ': structured-key');
      }
    }
    var hits = intentSurfaceGuard.detectProhibitedSurface(text);
    if (hits.length) {
      failures.push((label || 'value') + '.' + path.join('.') + ': ' + hits.join(','));
    }
    PROHIBITED_AI_VISIBLE_TEXT.forEach(function(token) {
      if (text.indexOf(token) >= 0) {
        failures.push((label || 'value') + '.' + path.join('.') + ': ' + token);
      }
    });
  });
  if (failures.length) {
    throw new Error('PipelineState AI-visible surface leaked machine form(s): ' + failures.join('; '));
  }
}

function validatePipelineState(state, options) {
  options = options || {};
  if (!state || state.schemaVersion !== PIPELINE_STATE_SCHEMA_VERSION) {
    throw new Error('PipelineState schemaVersion mismatch');
  }
  validateNodeContractsSnapshot(state.nodeContracts);
  if (state.artifactKind === 'intent' && !options.allowPartial) {
    if (!state.llm2 || !state.llm2.intentSlotPacket) throw new Error('Intent PipelineState requires llm2.intentSlotPacket');
    intentSlots.parseSlotPacket(JSON.stringify(state.llm2.intentSlotPacket));
    var slotCount = state.llm2.intentSlotPacket.commands.length;
    if (state.llm2.intentSlotCommandCount !== slotCount) throw new Error('Intent PipelineState slot command count mismatch');
    if (!state.statePartitions || !state.statePartitions.llm2Intent || state.statePartitions.llm2Intent.evidence.intentSlotCommandCount !== slotCount) {
      throw new Error('Intent PipelineState slot partition evidence mismatch');
    }
    if (!state.compiler || !state.compiler.intentDslText) throw new Error('Intent PipelineState requires compiler.intentDslText');
    if (!state.intentGraph || !state.intentGraph.graph) throw new Error('Intent PipelineState requires intentGraph.graph');
    if (!state.resolver || !state.resolver.placementPlan) throw new Error('Intent PipelineState requires resolver.placementPlan');
    if (!state.bridge || !state.bridge.bridgePlan) throw new Error('Intent PipelineState requires bridge.bridgePlan');
    if (!state.compiler || !state.compiler.contracts || state.compiler.contracts.intentCompile !== 'passed') {
      throw new Error('Intent PipelineState requires passed compiler contracts');
    }
    var intentDslLineCount = normalizeTextLines(state.compiler.intentDslText).length;
    if (state.compiler.intentDslLineCount !== intentDslLineCount) throw new Error('Intent PipelineState DSL line count mismatch');
    var targetPlanLineCount = normalizeTextLines(state.bridge.targetPlanText).length;
    if (state.bridge.targetPlanLineCount !== targetPlanLineCount) throw new Error('Intent PipelineState target plan line count mismatch');
    if (!state.bridge.summary || state.bridge.summary.targetPlanLines !== targetPlanLineCount) throw new Error('Intent PipelineState bridge summary count mismatch');
    if (!state.statePartitions.runtimeExecutionPlan || state.statePartitions.runtimeExecutionPlan.evidence.targetPlanLineCount !== targetPlanLineCount) {
      throw new Error('Intent PipelineState runtime plan partition count mismatch');
    }
    var bridgePlan = state.bridge.bridgePlan;
    var adapterCount = (bridgePlan.runtimeAdapterRequirements || []).length;
    if (state.statePartitions.runtimeExecutionPlan.evidence.runtimeAdapterRequirements !== adapterCount) throw new Error('Intent PipelineState runtime adapter evidence mismatch');
    if (state.statePartitions.compilerModuleFacts.evidence.installedModules !== (bridgePlan.installedModules || []).length) throw new Error('Intent PipelineState installed module evidence mismatch');
    if (state.statePartitions.compilerModuleFacts.evidence.tickRuntimeModules !== (((bridgePlan.tickRuntimeManifest || {}).modules) || []).length) throw new Error('Intent PipelineState tick runtime module evidence mismatch');
    if (!state.runtime.summary || state.runtime.summary.total !== targetPlanLineCount) throw new Error('Intent PipelineState runtime total count mismatch');
    if (state.runtime.summary.completed + state.runtime.summary.failed !== state.runtime.summary.total) throw new Error('Intent PipelineState runtime completion count mismatch');
    if (!state.projectWorld.world || state.statePartitions.projectWorld.evidence.worldVersion !== state.projectWorld.world.worldVersion || state.statePartitions.projectWorld.evidence.semanticHash !== state.projectWorld.world.semanticHash) {
      throw new Error('Intent PipelineState ProjectWorld partition evidence mismatch');
    }
  }
  assertNoProhibitedAiVisibleSurface(state.llm2 && state.llm2.sanitizedWorldContext, 'llm2.sanitizedWorldContext');
  assertNoProhibitedAiVisibleSurface(state.llm2 && state.llm2.nodeInput, 'llm2.nodeInput');
  assertNoProhibitedAiVisibleSurface(state.projectWorld && state.projectWorld.sanitizedForLlm2, 'projectWorld.sanitizedForLlm2');
  return state;
}

module.exports = {
  PIPELINE_STATE_SCHEMA_VERSION: PIPELINE_STATE_SCHEMA_VERSION,
  NODE_CONTRACTS: clone(NODE_CONTRACTS),
  createPipelineState: createPipelineState,
  makeLlm2NodeInput: makeLlm2NodeInput,
  makeNodeContractsSnapshot: makeNodeContractsSnapshot,
  getNodeContract: getNodeContract,
  assertAllowedNodeAccess: assertAllowedNodeAccess,
  makeNodeStateView: makeNodeStateView,
  applyNodeStateUpdate: applyNodeStateUpdate,
  validateNodeContractsSnapshot: validateNodeContractsSnapshot,
  validatePipelineState: validatePipelineState,
  assertNoProhibitedAiVisibleSurface: assertNoProhibitedAiVisibleSurface,
};
