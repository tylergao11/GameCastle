var assert = require('assert');

var pipeline = require('./pipeline');
var projectWorld = require('./project-world');
var semanticPlaytestAgent = require('./semantic-playtest-agent');
var semanticFeedback = require('./semantic-feedback');
var tickPlaytestRuntime = require('./tick-playtest-runtime');

function makeProjectWorld() {
  var project = pipeline.emptyProject('SemanticPlaytestAgentCheck');
  var scene = {
    b: 0,
    disableInputWhenNotFocused: true,
    mangledName: 'Game',
    name: 'Game',
    r: 0,
    standardSortMethod: true,
    stopSoundsOnStartup: true,
    title: '',
    v: 0,
    uiSettings: {},
    instances: [],
    objects: [],
    events: [],
    layers: [{ name: '', visibility: true, cameras: [], effects: [] }],
    variables: [],
    objectsGroups: [],
    behaviorsSharedData: [],
    usedResources: [],
  };
  project.firstLayout = 'Game';
  project.layouts.push(scene);
  ['Player', 'Coin', 'Enemy', 'JumpButton'].forEach(function(name) {
    scene.objects.push({
      name: name,
      type: 'PrimitiveDrawing::Drawer',
      fillColor: { r: 255, g: 255, b: 255 },
      outlineColor: { r: 255, g: 255, b: 255 },
      outlineSize: 0,
      variables: [],
      behaviors: [],
    });
  });
  scene.instances.push({ name: 'Player', x: 100, y: 100, width: 32, height: 48, layer: '', zOrder: 1 });
  scene.instances.push({ name: 'Enemy', x: 500, y: 100, width: 32, height: 32, layer: '', zOrder: 2 });
  for (var i = 0; i < 6; i++) {
    scene.instances.push({ name: 'Coin', x: 160 + i * 40, y: 100, width: 16, height: 16, layer: '', zOrder: i + 3 });
  }
  scene.instances.push({ name: 'JumpButton', x: 600, y: 420, width: 72, height: 72, layer: 'UI', zOrder: 10 });
  scene.events.push({
    type: 'BuiltinCommonInstructions::Standard',
    conditions: [{ type: { value: 'CollisionNP' }, parameters: ['Player', 'Coin'] }],
    actions: [],
    events: [],
  });
  scene.events.push({
    type: 'BuiltinCommonInstructions::Standard',
    conditions: [{ type: { value: 'CollisionNP' }, parameters: ['Player', 'Enemy'] }],
    actions: [],
    events: [],
  });
  return projectWorld.buildProjectWorld(project, null, {});
}

function assertNoMachineLeak(value, label) {
  var text = JSON.stringify(value);
  assert(text.indexOf('"x"') < 0, label + ' must not expose x coordinates');
  assert(text.indexOf('"y"') < 0, label + ' must not expose y coordinates');
  assert(text.indexOf('bridgePlan') < 0, label + ' must not expose bridge plan');
  assert(text.indexOf('componentId') < 0, label + ' must not expose component ids');
}

function main() {
  var world = makeProjectWorld();
  var mapping = semanticFeedback.loadSemanticMapping();
  var safeWorld = projectWorld.sanitizeProjectWorldForIntentPrompt(world);
  var mappingView = semanticFeedback.buildSemanticMappingLlmView(mapping);
  var policy = semanticPlaytestAgent.buildPlayPolicy({
    worldContext: safeWorld,
    semanticMappingView: mappingView,
  });
  assert.strictEqual(policy.owner, 'SemanticPlaytestAgent', 'policy should be owned by SemanticPlaytestAgent');
  assert.strictEqual(policy.roleBindings.actorSubject, 'Player', 'policy should bind actor role from safe world');
  assert.strictEqual(policy.roleBindings.rewardSubject, 'coin', 'policy should bind reward role from semantic aliases');

  var report = semanticPlaytestAgent.runSemanticPlaytest({
    projectWorld: world,
    semanticMapping: mapping,
    executionReport: {
      runId: 'agent_check',
      summary: { nextAction: 'done', completed: 1, failed: 0 },
    },
  });
  assert.strictEqual(report.owner, 'SemanticPlaytestAgent', 'report should declare agent owner');
  assert.strictEqual(report.llmReport.audience, 'llm', 'report should include LLM layer');
  assert.strictEqual(report.userReport.audience, 'user', 'report should include user layer');
  assert.strictEqual(report.intentWorldView.owner, 'IntentWorldView', 'report should include gameplay-first IntentWorldView');
  assert.strictEqual(report.intentWorldView.sceneIntent.uiPolicy.role, 'supporting layer only', 'IntentWorldView should keep UI supporting');
  assert(report.tickReport.eventLog.length > 0, 'report should include tick events');
  assert(report.tickReport.snapshots.length > 0, 'report should include snapshots');
  assert.strictEqual(report.summary.nextAction, 'repair-intent', 'low collection should produce repair intent');
  assert(report.repairIntentDslText.indexOf('place') >= 0, 'repair intent should be executable Intent DSL');
  assert(report.llmReport.tickIssues[0].evidence.tick >= 0, 'LLM report should preserve tick evidence');
  assert(report.userReport.issues[0].indexOf('Tick ') >= 0, 'user report should speak in tick evidence terms');
  assertNoMachineLeak(report.input.worldContext, 'agent world input');
  assertNoMachineLeak(report.input.semanticMapping, 'agent semantic mapping input');
  assertNoMachineLeak(report.intentWorldView, 'agent IntentWorldView');

  var expandedTickIssues = tickPlaytestRuntime.analyzeTickRun({
    semanticMapping: mapping,
    playPolicy: tickPlaytestRuntime.buildDefaultPlayPolicy({
      roleBindings: {
        actorSubject: 'Player',
        rewardSubject: 'coin',
        pressureSubject: 'enemy',
        actionEntrySubject: 'jump button',
      },
      thresholds: {
        minRewardReachabilityRate: 0.6,
        minRouteRewardReachabilityRate: 0.8,
        maxEarlyPressure: 1,
        minMeaningfulEventCount: 1,
        minSurvivalTicks: 480,
      },
    }),
    report: {
      eventLog: [
        { tick: 1, type: 'ActorIntent' },
        { tick: 90, type: 'RewardMissed' },
        { tick: 120, type: 'PressureDetected' },
        { tick: 180, type: 'PhaseTransitioned' },
        { tick: 260, type: 'ActorDamaged' },
        { tick: 300, type: 'ActorFailed' },
      ],
      summary: {
        durationTicks: 600,
        rewardsAvailable: 3,
        rewardsReached: 1,
        rewardsMissed: 2,
        rewardReachabilityRate: 0.333,
        pressureSeen: 3,
        meaningfulEventCount: 4,
        feedbackEventCount: 0,
        firstDamageTick: 260,
        firstDeathTick: 300,
        survived: false,
      },
    },
  });
  var issueKinds = expandedTickIssues.map(function(issue) { return issue.kind; });
  [
    'reward_pacing_low',
    'pressure_balance_high',
    'route_readability_low',
    'survival_window_short',
    'phase_feedback_missing',
  ].forEach(function(kind) {
    assert(issueKinds.indexOf(kind) >= 0, 'expanded tick analyzer should emit ' + kind);
  });
  expandedTickIssues.forEach(function(issue) {
    assert(issue.dimension, 'expanded tick issue should carry experience dimension');
    assert(issue.gameplayRole, 'expanded tick issue should carry gameplay role');
    assert(issue.repairVerb, 'expanded tick issue should carry repair verb');
    assert(issue.repair && issue.repair.subject, 'expanded tick issue should carry semantic repair params');
    assert(issue.evidence && typeof issue.evidence.tick === 'number', 'expanded tick issue should carry tick evidence');
  });
  assert(expandedTickIssues.some(function(issue) {
    return issue.kind === 'pressure_balance_high' && issue.repair.subject === 'enemy';
  }), 'pressure repair should bind through gameplay role policy');

  var sparseContentIssues = tickPlaytestRuntime.analyzeTickRun({
    semanticMapping: mapping,
    playPolicy: tickPlaytestRuntime.buildDefaultPlayPolicy({
      thresholds: { minMeaningfulEventCount: 1 },
    }),
    report: {
      eventLog: [{ tick: 1, type: 'ActorIntent' }, { tick: 20, type: 'AutoRunStarted' }],
      summary: {
        durationTicks: 600,
        rewardsAvailable: 0,
        rewardsReached: 0,
        rewardsMissed: 0,
        rewardReachabilityRate: 1,
        pressureSeen: 0,
        meaningfulEventCount: 0,
        firstDeathTick: null,
        survived: true,
      },
    },
  });
  assert(sparseContentIssues.some(function(issue) {
    return issue.kind === 'content_density_low' && issue.dimension === 'content_density';
  }), 'empty tick window should emit content density issue');

  console.log('[SemanticPlaytestAgent] policy, dual report, intent world view, tick evidence, repair intent passed');
}

main();
