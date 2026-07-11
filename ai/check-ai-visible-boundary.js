var assert = require('assert');
var fs = require('fs');
var path = require('path');

var componentCatalog = require('./component-catalog');
var intentAgent = require('./intent-agent');
var intentCompiler = require('./intent-compiler');
var intentPipelineGraph = require('./intent-pipeline-graph');
var intentWorldView = require('./intent-world-view');
var llm2ContextCacheRouter = require('./llm2-context-cache-router');
var llm2DeepSeekDecisionProvider = require('./llm2-deepseek-decision-provider');
var moduleCompiler = require('./module-compiler');
var pipeline = require('./pipeline');
var pipelineState = require('./pipeline-state');
var projectWorld = require('./project-world');

var PRODUCT_MODULES_DIR = path.join(__dirname, 'product-modules');

var INTERNAL_AI_HIDDEN_TOKENS = [
  'componentId',
  'bridgePlan',
  'runtimeAdapterRequirements',
  'runtimePreview',
  'runtime adapter',
  'adapter=',
  'GDJS',
  'gdjs',
  'project.json',
  'PrimitiveDrawing',
  'ShapePainter',
  'PlatformerObject',
  'CreateObject',
  'install module id=',
  'configure module id=',
  'core.platformer',
  'internal target instruction',
  'set placement object=',
  'place object=',
  'targetPlanText',
  'targetPlanLines',
  'commandId',
  '"x"',
  '"y"',
  '"instances"',
  '"events"',
  '"globalObjects"',
  '"globalVariables"',
  '"modules"',
  '"layer"',
];

function assertAiVisibleClean(label, value) {
  pipelineState.assertNoProhibitedAiVisibleSurface(value, label);
  var json = typeof value === 'string' ? value : JSON.stringify(value);
  INTERNAL_AI_HIDDEN_TOKENS.forEach(function(token) {
    assert(json.indexOf(token) < 0, label + ' must not expose ' + token);
  });
  assertSemanticRepairOnly(label, value);
}

function walkValue(value, visit, pathParts) {
  pathParts = pathParts || [];
  if (value === null || value === undefined) return;
  visit(value, pathParts);
  if (typeof value !== 'object') return;
  Object.keys(value).forEach(function(key) {
    walkValue(value[key], visit, pathParts.concat([key]));
  });
}

function assertSemanticRepairOnly(label, value) {
  walkValue(value, function(node, pathParts) {
    var key = pathParts[pathParts.length - 1];
    if ((key === 'semanticRepairRecommendations' || key === 'semanticRepairCandidates') && Array.isArray(node)) {
      node.forEach(function(candidate, index) {
        assert.strictEqual(
          candidate.action,
          'apply_semantic_repair',
          label + '.' + pathParts.join('.') + '[' + index + '] must use apply_semantic_repair'
        );
      });
    }
  });
}

function creativeVision() {
  return 'A mobile platformer with bright collectible rhythms and readable pressure.';
}

function intentSlotPacket() {
  return { schemaVersion: 1, commands: [{ kind: 'make_game', slots: { description: 'mobile platformer' } }] };
}

function semanticReport() {
  return {
    llmReport: {
      tickIssues: [{
        kind: 'reward_pacing_low',
        dimension: 'reward_pacing',
        gameplayRole: 'reward',
        repairVerb: 'increase_presence',
        message: 'reward pacing is sparse',
        evidence: { tick: 160, metric: 'reward_presence_rate', observed: 0.5, expectedAtLeast: 0.75 },
      }],
      repairIntentDslLines: ['place coins near Player front as trail count 5'],
    },
    tickReport: {
      summary: { survived: true, collectibleCollectionRate: 0.5 },
    },
    playPolicy: {
      intents: ['move-forward', 'collect-reachable'],
      roleBindings: {},
    },
  };
}

async function buildRuntimeSurfaces(productModules, components) {
  var intentDslText = fs.readFileSync(path.join(__dirname, 'fixtures', 'intent-mobile-platformer.dsl'), 'utf8');
  var compiled = intentCompiler.compileIntentDsl(intentDslText, {
    placementContext: {
      objectBounds: {
        Player: { x: 100, y: 400, width: 32, height: 48 },
      },
    },
    productModuleCatalog: productModules,
    componentCatalog: components,
  });
  var project = pipeline.emptyProject('AiVisibleBoundaryCheck');
  var ops = pipeline.parseTargetPlan(compiled.bridgePlan.targetPlanText);
  var commandResults = [];
  for (var i = 0; i < ops.length; i++) {
    var result = await pipeline.execute(project, ops[i]);
    assert(result.ok, 'bridge target should execute for AI-visible boundary check: ' + result.msg);
    commandResults.push({
      index: i,
      commandId: 'ai_visible_' + String(i + 1).padStart(3, '0'),
      ok: true,
      label: compiled.bridgePlan.targetPlanLines[i],
      message: result.msg,
    });
  }
  var intent = {
    artifactKind: 'intent',
    intentSlotPacket: intentSlotPacket(),
    intentDslText: intentDslText,
    intentGraph: compiled.graph,
    placementPlan: compiled.placementPlan,
    bridgePlan: compiled.bridgePlan,
    intentContracts: compiled.contracts,
    compileResultCard: compiled.resultCard,
    runtimeAdapterRequirements: compiled.bridgePlan.runtimeAdapterRequirements,
  };
  var world = projectWorld.buildProjectWorld(project, null, {
    modules: compiled.bridgePlan.installedModules,
    intent: intent,
  });
  var report = projectWorld.makeExecutionReport({
    previousWorld: null,
    world: world,
    targetPlanLines: compiled.bridgePlan.targetPlanLines,
    commandResults: commandResults,
    runIndex: 1,
    batchLabel: 'ai_visible_boundary_check',
    intent: intent,
  });
  var state = await intentPipelineGraph.makePipelineStateFromArtifacts({
    mode: 'intentFixtureNew',
    batchLabel: 'ai_visible_boundary_check',
    artifactKind: 'intent',
    userRequest: 'make a mobile platformer',
    creativeVision: creativeVision(),
    creativeChange: { isNew: true, changed: true, previousVision: null, currentVision: creativeVision() },
    intentSlotPacket: intentSlotPacket(),
    intentDslText: intentDslText,
    intentGraph: compiled.graph,
    placementPlan: compiled.placementPlan,
    bridgePlan: compiled.bridgePlan,
    intentContracts: compiled.contracts,
    compileResultCard: compiled.resultCard,
    targetPlanText: compiled.bridgePlan.targetPlanText,
    executionReport: report,
    projectWorld: world,
  });
  var approvalPacket = await pipeline.makePendingApprovalPacket({
    prompt: 'make a mobile platformer',
    projectMode: 'intentFixtureNew',
    batchLabel: 'ai_visible_approval_check',
    isNewProject: true,
    requiresIntentIterationState: false,
    artifactKind: 'intent',
    project: pipeline.emptyProject('AiVisibleApprovalCheck'),
    baseWorld: null,
    intentSlotPacket: intentSlotPacket(),
    intentDslText: intentDslText,
    intentGraph: compiled.graph,
    placementPlan: compiled.placementPlan,
    bridgePlan: compiled.bridgePlan,
    intentContracts: compiled.contracts,
    compileResultCard: compiled.resultCard,
    targetPlanText: compiled.bridgePlan.targetPlanText,
    modules: compiled.bridgePlan.installedModules,
    tickRuntimeManifest: compiled.bridgePlan.tickRuntimeManifest,
    runtimeAdapterRequirements: compiled.bridgePlan.runtimeAdapterRequirements,
    creativeVision: creativeVision(),
    creativeChange: { isNew: true, changed: true, previousVision: null, currentVision: creativeVision() },
  });
  return {
    world: world,
    report: report,
    state: state,
    approvalPacket: approvalPacket,
  };
}

async function main() {
  var productModules = moduleCompiler.loadProductModuleCatalog(PRODUCT_MODULES_DIR);
  var components = componentCatalog.loadComponentCatalog();
  var runtimeSurfaces = await buildRuntimeSurfaces(productModules, components);
  var safeWorld = projectWorld.sanitizeProjectWorldForIntentPrompt(runtimeSurfaces.world);
  var view = intentWorldView.buildIntentWorldView({
    projectWorld: runtimeSurfaces.world,
    worldContext: safeWorld,
    executionReport: runtimeSurfaces.report,
    semanticPlaytestReport: semanticReport(),
    currentRequest: '金币多一点',
  });
  var contextRoute = llm2ContextCacheRouter.routeLlm2Context({
    intentWorldView: view,
    userRequest: '金币多一点',
    projectMode: 'continue',
  });

  var surfaces = {
    systemPrompt: intentAgent.buildIntentCommanderSystemPrompt(productModules, components),
    userPrompt: intentAgent.buildIntentUserPrompt({
      userPrompt: '金币多一点',
      worldContext: safeWorld,
      creativeVision: creativeVision(),
      creativeChange: { isNew: false, changed: true, previousVision: 'A sparse platformer.', currentVision: creativeVision() },
      isNew: false,
    }),
    sanitizedProjectWorld: safeWorld,
    sanitizedExecutionReport: projectWorld.sanitizeExecutionReportForIntentPrompt(runtimeSurfaces.report),
    pipelineStateNodeInput: runtimeSurfaces.state.llm2.nodeInput,
    pipelineStateSanitizedWorld: runtimeSurfaces.state.projectWorld.sanitizedForLlm2,
    llm2GraphView: pipelineState.makeNodeStateView(runtimeSurfaces.state, 'llm2-intent'),
    approvalAiVisibleForLlm2: runtimeSurfaces.approvalPacket.aiVisibleForLlm2,
    intentWorldView: view,
    llm2ContextRoute: contextRoute,
    llm2DeepSeekDecisionPrompt: llm2DeepSeekDecisionProvider.dynamicPrompt({
      intentWorldView: view,
      contextRoute: contextRoute,
      userRequest: '金币多一点',
    }),
  };

  Object.keys(surfaces).forEach(function(label) {
    assertAiVisibleClean(label, surfaces[label]);
  });
  console.log('[AiVisibleBoundary] all current LLM2-visible surfaces passed');
}

main().catch(function(error) {
  console.error(error);
  process.exit(1);
});
