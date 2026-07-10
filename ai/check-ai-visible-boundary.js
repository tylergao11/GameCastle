var assert = require('assert');
var fs = require('fs');
var path = require('path');

var componentCatalog = require('./component-catalog');
var dslAgent = require('./dsl-agent');
var intentCompiler = require('./intent-compiler');
var intentPipelineGraph = require('./intent-pipeline-graph');
var llm2ContextCacheRouter = require('./llm2-context-cache-router');
var llm2DeepSeekDecisionProvider = require('./llm2-deepseek-decision-provider');
var moduleCompiler = require('./module-compiler');
var pipeline = require('./pipeline');
var pipelineState = require('./pipeline-state');
var projectWorld = require('./project-world');

var PRODUCT_MODULES_DIR = path.join(__dirname, 'product-modules');

var PROHIBITED_AI_VISIBLE_TOKENS = [
  'componentId',
  'input.jump_button',
  'input.virtual_joystick',
  'movement.platformer',
  'system.inventory',
  'bridgePlan',
  'Bridge Plan',
  'runtimeAdapterRequirements',
  'runtimePreview',
  'runtime adapter',
  'virtual-joystick',
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
  'Product module cards',
  'module cards',
  'product modules',
  'Module DSL',
  'low-level DSL',
  'low-level object/event DSL',
  'set placement object=',
  'place object=',
  'internalDsl',
  'dslLines',
  'failedCommands',
  'failedDiagnostics',
  'commandId',
  'repairAction',
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
  PROHIBITED_AI_VISIBLE_TOKENS.forEach(function(token) {
    assert(json.indexOf(token) < 0, label + ' must not expose ' + token);
  });
  assertUnifiedCandidateActions(label, value);
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

function assertUnifiedCandidateActions(label, value) {
  walkValue(value, function(node, pathParts) {
    var key = pathParts[pathParts.length - 1];
    if ((key === 'recommendedActions' || key === 'candidateActions') && Array.isArray(node)) {
      node.forEach(function(action, index) {
        if (action && action.action !== 'apply_semantic_repair') {
          throw new Error(label + '.' + pathParts.join('.') + '[' + index + '] must use apply_semantic_repair');
        }
      });
    }
  });
}

function makeDangerousWorldContext() {
  return {
    projectWorld: {
      project: { name: 'LeakCheck', firstScene: 'Game', width: 800, height: 600 },
      scenes: [{
        id: 'scene_game',
        name: 'Game',
        objects: [{
          id: 'obj_jump',
          name: 'JumpButton',
          text: 'Tap to jump',
          type: 'PrimitiveDrawing::Drawer',
          kind: 'ShapePainter',
          behaviors: [{ name: 'PlatformerObject', type: 'PlatformerObject::PlatformerObjectBehavior' }]
        }],
        instances: [{ id: 'inst_jump', object: 'JumpButton', x: 640, y: 520, width: 80, height: 80, layer: 'adapter=touch-button' }],
        events: [{ id: 'evt_1', type: 'standard', text: 'always -> CreateObject(JumpButton, 640, 520)' }]
      }],
      globalObjects: [{ name: 'ScoreLabel', text: 'set placement object=ScoreLabel x=10 y=10 scene=Game' }],
      globalVariables: [{ name: 'Score', type: 'number', debug: 'componentId=input.jump_button' }],
      modules: [{ id: 'core.platformer', preset: 'basic' }],
      intent: {
        intentDslLines: [
          'add jump button controls Player near screen bottom-right',
          'add component id=input.jump_button target=Player near=screen direction=bottom-right',
          'set placement object=JumpButton x=640 y=500 scene=Game'
        ],
        intentGraph: {
          counts: { components: 1, placements: 1 },
          things: [{ name: 'JumpButton', archetype: 'control', role: 'control' }],
          components: [{ componentId: 'input.jump_button', thing: 'JumpButton' }],
          relations: [],
          placements: [{ subject: 'JumpButton', anchor: 'screen', direction: 'bottom-right' }]
        },
        bridgePlan: { target: 'gdjs-internal-dsl', runtimeAdapterRequirements: 1 },
        runtimeAdapterRequirements: [{ adapter: 'virtual-joystick', componentId: 'input.virtual_joystick' }]
      }
    },
    lastExecutionReport: {
      runId: 'gdjs.run_001',
      batchLabel: 'set placement object=JumpButton x=640 y=500 scene=Game',
      summary: {
        total: 1,
        completed: 1,
        failed: 0,
        nextAction: 'done',
        failedCommand: 'set placement object=JumpButton x=640 y=500 scene=Game',
        reason: 'adapter=virtual-joystick componentId=input.jump_button'
      },
      completed: [{ command: 'set placement object=JumpButton x=640 y=500 scene=Game' }],
      intent: {
        intentDslLines: ['set placement object=JumpButton x=640 y=500 scene=Game'],
        bridgePlan: { target: 'gdjs-internal-dsl' }
      }
    }
  };
}

function makeDangerousDesignBrief() {
  return {
    theme: 'mobile platformer',
    objects: [
      { name: 'Player', kind: 'player', color: '#4488FF', width: 32, height: 48 },
      { name: 'gdjs.BadObject', kind: 'ui', note: 'componentId=input.jump_button' }
    ],
    rules: ['on key ArrowLeft held -> move Player x=-4 scene=Game'],
    layout: { placements: [{ object: 'Player', x: 100, y: 400 }] },
    variables: [{ name: 'Score', value: 0 }]
  };
}

function makeDangerousIntentWorldView() {
  return {
    owner: 'IntentWorldView',
    gameplayFirst: true,
    sceneIntent: {
      gameplayFirst: true,
      sceneMode: 'single-scene',
      coreLoop: ['move', 'jump', 'collect', 'avoid'],
      roles: [
        { role: 'player_agent', subject: 'Player', primaryDesignObject: true },
        { role: 'reward_pacing', subject: 'coins', primaryDesignObject: true },
      ],
      uiPolicy: {
        role: 'supporting layer only',
        templateStrategy: 'style and icons come from selectable templates',
      },
    },
    contextCache: {
      baseSemanticHash: 'same_hash',
      targetSemanticHash: 'same_hash',
      semanticCacheHit: true,
      contextMode: 'diff-only',
    },
    evidence: [{ tick: 160, issue: 'reward_pacing_low', meaning: 'reward pacing low' }],
    contextRequests: {
      defaultRead: ['tick_event_window', 'project_world_diff'],
      available: [
        { id: 'project_world_diff', defaultMode: 'diff' },
        { id: 'tick_event_window', defaultMode: 'focused-window' },
        { id: 'ui_template_policy', defaultMode: 'template-choice' },
      ],
    },
    recommendedActions: [
      {
        action: 'increase_reward_count',
        repairAction: 'increase-count',
        experienceDimension: 'reward_pacing',
        gameplayRole: 'reward',
        repairVerb: 'increase_presence',
        priority: 'high',
        reason: 'legacy action should be removed before LLM2',
        safeIntentDsl: 'place coins near Player front as trail count 5',
      },
      {
        action: 'apply_semantic_repair',
        experienceDimension: 'reward_pacing',
        gameplayRole: 'reward',
        repairVerb: 'increase_presence',
        priority: 'medium',
        reason: 'safe unified action',
        safeIntentDsl: 'place coins near Player front as trail count 4',
      },
    ],
    recommendationPolicy: {
      authority: 'candidate-only',
      finalDecisionOwner: 'LLM2',
    },
  };
}

async function buildRuntimeSurfaces(productModules, components) {
  var intentDslText = fs.readFileSync(path.join(__dirname, 'fixtures', 'intent-mobile-platformer.dsl'), 'utf8');
  var compiled = intentCompiler.compileIntentDsl(intentDslText, {
    placementContext: {
      objectBounds: {
        Player: { x: 100, y: 400, width: 32, height: 48 }
      }
    },
    productModuleCatalog: productModules,
    componentCatalog: components
  });
  var project = pipeline.emptyProject('AiVisibleBoundaryCheck');
  var ops = pipeline.parseDSL(compiled.bridgePlan.dslText);
  var commandResults = [];
  for (var i = 0; i < ops.length; i++) {
    var result = await pipeline.execute(project, ops[i]);
    assert(result.ok, 'bridge DSL should execute for AI-visible boundary check: ' + result.msg);
    commandResults.push({
      index: i,
      commandId: 'ai_visible_' + String(i + 1).padStart(3, '0'),
      ok: true,
      label: compiled.bridgePlan.dslLines[i],
      message: result.msg
    });
  }
  var intent = {
    artifactKind: 'intent',
    intentDslText: intentDslText,
    intentGraph: compiled.graph,
    placementPlan: compiled.placementPlan,
    bridgePlan: compiled.bridgePlan,
    intentContracts: compiled.contracts,
    compileResultCard: compiled.resultCard,
    runtimeAdapterRequirements: compiled.bridgePlan.runtimeAdapterRequirements
  };
  var world = projectWorld.buildProjectWorld(project, null, {
    modules: compiled.bridgePlan.installedModules,
    intent: intent
  });
  var report = projectWorld.makeExecutionReport({
    previousWorld: null,
    world: world,
    dslLines: compiled.bridgePlan.dslLines,
    commandResults: commandResults,
    runIndex: 1,
    batchLabel: 'ai_visible_boundary_check',
    intent: intent
  });
  var state = await intentPipelineGraph.makePipelineStateFromArtifacts({
    mode: 'fixture-new',
    batchLabel: 'ai_visible_boundary_check',
    artifactKind: 'intent',
    userRequest: [
      'make a mobile platformer',
      'move Player up 10 pixels',
      'set placement object=Player x=100 y=400 scene=Game'
    ].join('\n'),
    designBrief: makeDangerousDesignBrief(),
    diff: { isNew: true },
    intentDslText: intentDslText,
    intentGraph: compiled.graph,
    placementPlan: compiled.placementPlan,
    bridgePlan: compiled.bridgePlan,
    intentContracts: compiled.contracts,
    compileResultCard: compiled.resultCard,
    internalDslText: compiled.bridgePlan.dslText,
    executionReport: report,
    projectWorld: world
  });
  var approvalPacket = await pipeline.makePendingApprovalPacket({
    prompt: 'make a mobile platformer\nset placement object=Player x=100 y=400 scene=Game',
    projectMode: 'fixture-new',
    batchLabel: 'ai_visible_approval_check',
    isNewProject: true,
    requiresIntentIterationState: false,
    artifactKind: 'intent',
    project: pipeline.emptyProject('AiVisibleApprovalCheck'),
    baseWorld: null,
    intentDslText: intentDslText,
    intentGraph: compiled.graph,
    placementPlan: compiled.placementPlan,
    bridgePlan: compiled.bridgePlan,
    intentContracts: compiled.contracts,
    compileResultCard: compiled.resultCard,
    dslText: compiled.bridgePlan.dslText,
    modules: compiled.bridgePlan.installedModules,
    tickRuntimeManifest: compiled.bridgePlan.tickRuntimeManifest,
    runtimeAdapterRequirements: compiled.bridgePlan.runtimeAdapterRequirements,
    designBrief: makeDangerousDesignBrief(),
    diff: { isNew: true }
  });
  return {
    world: world,
    report: report,
    state: state,
    approvalPacket: approvalPacket
  };
}

async function captureRepairPrompt(productModules) {
  var repairPrompt = '';
  await dslAgent.compileIntentDslWithRepair({
    intentDslText: [
      'add component id=input.jump_button target=Player near=screen direction=bottom-right',
      'set placement object=JumpButton x=640 y=500 scene=Game'
    ].join('\n'),
    intentCompiler: intentCompiler,
    productModuleCatalog: productModules,
    userPrompt: [
      'move jump button a bit',
      'move jump button up 10 pixels',
      'use runtime adapter gdjs.virtual_joystick'
    ].join('\n'),
    designBrief: makeDangerousDesignBrief(),
    worldContext: makeDangerousWorldContext(),
    maxRepairRounds: 1,
    allowLlmRepair: true,
    callModel: async function(prompt) {
      repairPrompt = prompt;
      return 'add jump button controls Player near screen bottom-right';
    }
  });
  return repairPrompt;
}

async function main() {
  var productModules = moduleCompiler.loadProductModuleCatalog(PRODUCT_MODULES_DIR);
  var components = componentCatalog.loadComponentCatalog();
  var dangerousWorldContext = makeDangerousWorldContext();
  var dangerousIntentWorldView = makeDangerousIntentWorldView();
  var llm2ContextRoute = llm2ContextCacheRouter.routeLlm2Context({
    intentWorldView: dangerousIntentWorldView,
    userRequest: 'more coins',
    projectMode: 'continue',
  });
  var runtimeSurfaces = await buildRuntimeSurfaces(productModules, components);

  var surfaces = {
    systemPrompt: dslAgent.buildIntentCommanderSystemPrompt(productModules, components),
    maliciousSystemPrompt: dslAgent.buildIntentCommanderSystemPrompt({
      modules: [{
        name: 'Useful Adventure Kit',
        category: 'starter',
        summary: 'install module id=core.platformer',
        presets: { mobile: {}, 'core.platformer': {} }
      }]
    }, {
      components: [{
        name: 'Useful Button',
        kind: 'control',
        compilerManifest: {},
        aiManifest: {
          summary: 'adapter=touch-button',
          aliases: ['tap button', 'input.jump_button'],
          actions: ['jump', 'action=jump'],
          safeExamples: ['set placement object=UsefulButton x=1 y=2 scene=Game']
        }
      }]
    }),
    userPrompt: dslAgent.buildIntentUserPrompt({
      userPrompt: [
        'move the jump button a bit',
        'move the jump button up 10 pixels',
        'set placement object=JumpButton x=640 y=500 scene=Game',
        'use runtime adapter gdjs.virtual_joystick'
      ].join('\n'),
      worldContext: dangerousWorldContext,
      designBrief: makeDangerousDesignBrief(),
      diff: { isNew: false },
      isNew: false
    }),
    repairPrompt: await captureRepairPrompt(productModules),
    sanitizedWorldContext: dslAgent.sanitizeIntentWorldContext(dangerousWorldContext),
    sanitizedProjectWorld: projectWorld.sanitizeProjectWorldForIntentPrompt(runtimeSurfaces.world),
    sanitizedExecutionReport: projectWorld.sanitizeExecutionReportForIntentPrompt(runtimeSurfaces.report),
    pipelineStateNodeInput: runtimeSurfaces.state.llm2.nodeInput,
    pipelineStateSanitizedWorld: runtimeSurfaces.state.projectWorld.sanitizedForLlm2,
    llm2GraphView: pipelineState.makeNodeStateView(runtimeSurfaces.state, 'llm2-intent'),
    approvalAiVisibleForLlm2: runtimeSurfaces.approvalPacket.aiVisibleForLlm2,
    llm2ContextRoute: llm2ContextRoute,
    llm2DeepSeekDecisionPrompt: llm2DeepSeekDecisionProvider.dynamicPrompt({
      intentWorldView: dangerousIntentWorldView,
      contextRoute: llm2ContextRoute,
      userRequest: 'more coins',
    })
  };

  Object.keys(surfaces).forEach(function(label) {
    assertAiVisibleClean(label, surfaces[label]);
  });

  assert(JSON.stringify(surfaces.userPrompt).indexOf('move the jump button a bit') >= 0, 'user prompt should preserve safe natural wording');
  assert(JSON.stringify(surfaces.pipelineStateNodeInput).indexOf('make a mobile platformer') >= 0, 'PipelineState LLM2 input should preserve safe request');
  assert.strictEqual(surfaces.sanitizedExecutionReport.summary.intentFulfillment.status, 'fulfilled', 'sanitized report should preserve fulfillment status');
  assert.deepStrictEqual(
    runtimeSurfaces.state.graphTrace.map(function(item) { return item.node; }),
    intentPipelineGraph.INTENT_PIPELINE_NODE_SEQUENCE,
    'boundary state should retain canonical graph trace'
  );

  console.log('[AiVisibleBoundary] all LLM2-visible surfaces passed');
}

main().catch(function(error) {
  console.error(error);
  process.exit(1);
});
