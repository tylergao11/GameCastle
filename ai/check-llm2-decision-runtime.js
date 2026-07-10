var assert = require('assert');

var router = require('./llm2-context-cache-router');
var decisionRuntime = require('./llm2-decision-runtime');
var contextProvider = require('./llm2-context-provider');

function makeView(options) {
  options = options || {};
  var baseHash = options.baseHash === undefined ? 'hash_a' : options.baseHash;
  var targetHash = options.targetHash === undefined ? 'hash_a' : options.targetHash;
  var actions = options.actions === undefined ? [
    {
      action: 'apply_semantic_repair',
      experienceDimension: 'reward_pacing',
      gameplayRole: 'reward',
      repairVerb: 'increase_presence',
      priority: 'high',
      reason: 'collection rate below target',
      safeIntentDsl: 'place coins near Player front as trail count 5',
    },
  ] : options.actions;
  return {
    owner: 'IntentWorldView',
    gameplayFirst: true,
    sceneMode: 'single-scene',
    sceneIntent: {
      gameplayFirst: true,
      sceneMode: 'single-scene',
      coreLoop: ['move', 'jump', 'collect', 'avoid'],
      roles: [
        { role: 'player_agent', subject: 'Player', primaryDesignObject: true },
        { role: 'reward_pacing', subject: 'coins', primaryDesignObject: true },
        { role: 'pressure_source', subject: 'Enemy', primaryDesignObject: true },
        { role: 'action_entry', subject: 'JumpButton', primaryDesignObject: false, uiPolicy: 'supporting input surface only' },
      ],
      uiPolicy: {
        role: 'supporting layer only',
        templateStrategy: 'style, icon, and broad layout come from selectable templates',
      },
    },
    contextCache: {
      baseSemanticHash: baseHash,
      targetSemanticHash: targetHash,
      semanticCacheHit: !!(baseHash && targetHash && baseHash === targetHash),
      contextMode: baseHash && targetHash && baseHash === targetHash ? 'diff-only' : 'summary-plus-diff',
    },
    evidence: options.evidence || [],
    contextRequests: {
      defaultRead: options.evidence && options.evidence.length ? ['tick_event_window', 'project_world_diff'] : ['project_world_diff'],
      available: [
        { id: 'project_world_diff', defaultMode: 'diff' },
        { id: 'tick_event_window', defaultMode: 'focused-window' },
        { id: 'ui_template_policy', defaultMode: 'template-choice' },
      ],
    },
    semanticRepairRecommendations: actions,
    semanticIterationMemory: options.semanticIterationMemory || null,
    recommendationPolicy: {
      authority: 'semantic-repair-candidate-only',
      finalDecisionOwner: 'LLM2',
    },
  };
}

function assertDecision(decision, type, label) {
  assert.strictEqual(decision.owner, 'LLM2DecisionRuntime', label + ' should be owned by DecisionRuntime');
  assert.strictEqual(decision.decisionType, type, label + ' decision type');
  assert.strictEqual(decision.verifier.passed, true, label + ' verifier should pass');
}

function main() {
  var applyView = makeView({
    baseHash: 'same_hash',
    targetHash: 'same_hash',
    evidence: [{ tick: 160, issue: 'reward_pacing_low', meaning: 'reward pacing low' }],
  });
  var applyDecision = decisionRuntime.runDecisionRuntime({
    intentWorldView: applyView,
    userRequest: '金币多一点',
    projectMode: 'continue',
  });
  assertDecision(applyDecision, 'apply_intent', 'gameplay repair');
  assert.strictEqual(applyDecision.intentDslLines[0], 'place coins near Player front as trail count 5', 'apply decision should emit safe Intent DSL');
  assert.strictEqual(applyDecision.contextRoute.contextMode, 'diff_hit', 'gameplay repair should use routed context');

  var threatView = makeView({
    baseHash: 'same_hash',
    targetHash: 'same_hash',
    evidence: [{ tick: 90, issue: 'pressure_balance_high', meaning: 'pressure balance high' }],
    actions: [
      {
        action: 'apply_semantic_repair',
        experienceDimension: 'pressure_balance',
        gameplayRole: 'pressure',
        repairVerb: 'soften_pressure',
        priority: 'high',
        reason: 'enemy density high',
        safeIntentDsl: 'reduce enemy pressure near Player early route',
      },
    ],
  });
  var requestDecision = decisionRuntime.runDecisionRuntime({
    intentWorldView: threatView,
    userRequest: '怪别太密',
    projectMode: 'continue',
  });
  assertDecision(requestDecision, 'request_context', 'threat density first pass');
  assert(requestDecision.requestedContext.indexOf('tick_event_window') >= 0, 'threat density should request tick_event_window');
  assert.strictEqual(requestDecision.intentDslLines.length, 0, 'request_context must not emit Intent DSL');

  var providedContext = contextProvider.provideContext({
    requestedContext: requestDecision.requestedContext,
    intentWorldView: threatView,
    tickReport: {
      eventLog: [
        { tick: 90, type: 'PressureDetected', semantic: 'pressure detected', details: { subject: 'pressure', count: 4 } },
      ],
      snapshots: [
        { tick: 90, state: { player: 'ready' }, metrics: { threatsSeen: 4 } },
      ],
    },
  });
  var applyAfterContext = decisionRuntime.runDecisionRuntime({
    intentWorldView: threatView,
    userRequest: '怪别太密',
    projectMode: 'continue',
    resolvedContext: providedContext,
  });
  assertDecision(applyAfterContext, 'apply_intent', 'threat density after context');
  assert.strictEqual(applyAfterContext.intentDslLines[0], 'reduce enemy pressure near Player early route', 'resolved context should allow pressure Intent DSL');

  var remixMemoryView = makeView({
    baseHash: 'same_hash',
    targetHash: 'same_hash',
    evidence: [{ tick: 180, issue: 'route_readability_low', meaning: 'route readability low' }],
    semanticIterationMemory: {
      owner: 'SemanticIterationMemory',
      contextKind: 'semantic-iteration-memory',
      latest: {
        improvedMeasurements: ['reward_presence_rate', 'reward_reachability'],
        remainingIssues: [
          {
            kind: 'route_readability_low',
            experienceDimension: 'route_readability',
            gameplayRole: 'route',
            repairVerb: 'cluster_near_route',
          },
        ],
      },
    },
    actions: [
      {
        action: 'apply_semantic_repair',
        priority: 'high',
        reason: 'reward pacing already improved',
        experienceDimension: 'reward_pacing',
        gameplayRole: 'reward',
        repairVerb: 'increase_presence',
        safeIntentDsl: 'place coins near Player front as trail count 5',
      },
      {
        action: 'apply_semantic_repair',
        priority: 'medium',
        reason: 'route readability still needs work',
        experienceDimension: 'route_readability',
        gameplayRole: 'route',
        repairVerb: 'cluster_near_route',
        safeIntentDsl: 'place coins near Player front as trail count 7',
      },
    ],
  });
  var remixFirstPass = decisionRuntime.runDecisionRuntime({
    intentWorldView: remixMemoryView,
    userRequest: '还是有点难',
    projectMode: 'continue',
  });
  assertDecision(remixFirstPass, 'request_context', 'semantic memory remix first pass');
  assert(remixFirstPass.requestedContext.indexOf('tick_event_window') >= 0, 'difficulty remix should request tick evidence first');
  var remixAfterContext = decisionRuntime.runDecisionRuntime({
    intentWorldView: remixMemoryView,
    userRequest: '还是有点难',
    projectMode: 'continue',
    resolvedContext: contextProvider.provideContext({
      requestedContext: remixFirstPass.requestedContext,
      intentWorldView: remixMemoryView,
      tickReport: {
        eventLog: [
          { tick: 180, type: 'RewardMissed', semantic: 'reward missed', details: { subject: 'reward' } },
        ],
        snapshots: [
          { tick: 180, state: { player: 'running' }, metrics: { rewardReachabilityRate: 0.7 } },
        ],
      },
    }),
  });
  assertDecision(remixAfterContext, 'apply_intent', 'semantic memory remix after context');
  assert.strictEqual(remixAfterContext.selectedAction.experienceDimension, 'route_readability', 'semantic memory should prioritize remaining route issue over already improved reward pacing');
  assert.strictEqual(remixAfterContext.selectedAction.repairVerb, 'cluster_near_route', 'semantic memory should preserve the remaining repair verb');

  var noOpDecision = decisionRuntime.runDecisionRuntime({
    intentWorldView: makeView({
      baseHash: 'same_hash',
      targetHash: 'same_hash',
      evidence: [],
      actions: [],
    }),
    userRequest: '再看一下',
    projectMode: 'continue',
  });
  assertDecision(noOpDecision, 'no_op', 'no tick issue');

  var rejectDecision = decisionRuntime.runDecisionRuntime({
    intentWorldView: makeView({ baseHash: 'same_hash', targetHash: 'same_hash', evidence: [] }),
    userRequest: '按钮换个酷炫图标',
    projectMode: 'continue',
  });
  assertDecision(rejectDecision, 'reject', 'ui icon only request');
  assert(rejectDecision.requestedContext.indexOf('ui_template_policy') >= 0, 'UI/icon reject should point to template policy');

  var unsafeVerification = decisionRuntime.verifyDecision({
    decisionType: 'apply_intent',
    intentDslLines: ['set componentId=abc x=100'],
    requestedContext: [],
    contextRoute: router.routeLlm2Context({
      intentWorldView: applyView,
      userRequest: '金币多一点',
      projectMode: 'continue',
    }),
  });
  assert.strictEqual(unsafeVerification.passed, false, 'verifier should reject machine-surface Intent DSL');
  assert(unsafeVerification.errors.some(function(error) {
    return error.indexOf('prohibited_intent_surface') === 0;
  }), 'verifier should name prohibited Intent surface');

  console.log('[LLM2DecisionRuntime] apply/request_context/no_op/reject and verifier passed');
}

main();
