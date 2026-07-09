var assert = require('assert');

var router = require('./llm2-context-cache-router');
var fullCreativeLoop = require('./full-creative-loop');

function makeView(options) {
  options = options || {};
  var baseHash = options.baseHash === undefined ? 'hash_a' : options.baseHash;
  var targetHash = options.targetHash === undefined ? 'hash_a' : options.targetHash;
  var issues = options.issues || [];
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
    playtestJudgement: {
      rewardPacing: issues.length ? 'too_sparse' : 'acceptable',
      pressure: options.pressure || 'acceptable',
    },
    contextCache: {
      baseSemanticHash: baseHash,
      targetSemanticHash: targetHash,
      semanticCacheHit: !!(baseHash && targetHash && baseHash === targetHash),
      contextMode: baseHash && targetHash && baseHash === targetHash ? 'diff-only' : 'summary-plus-diff',
      diff: {
        latestIntentDslLines: ['place coins near Player front as trail count 3'],
        changedGameplayEvidence: issues.map(function(issue) {
          return { kind: issue.issue, tick: issue.tick };
        }),
      },
    },
    evidence: issues,
    contextRequests: {
      policy: 'LLM2 may request more context before choosing an Intent DSL patch; candidate actions are not authoritative.',
      defaultRead: issues.length ? ['tick_event_window', 'project_world_diff'] : ['project_world_diff'],
      available: [
        { id: 'project_world_diff', defaultMode: 'diff' },
        { id: 'tick_event_window', defaultMode: 'focused-window' },
        { id: 'snapshot_summary', defaultMode: 'semantic-summary' },
        { id: 'semantic_mapping', defaultMode: 'llm-safe-view' },
        { id: 'ui_template_policy', defaultMode: 'template-choice' },
      ],
    },
    recommendedActions: options.recommendedActions || [
      {
        action: 'increase_reward_pacing',
        priority: 'high',
        reason: 'collection rate below target',
        safeIntentDsl: 'place coins near Player front as trail count 5',
      },
      {
        action: 'no_op',
        priority: 'low',
        reason: 'designer may skip this turn',
        safeIntentDsl: null,
      },
    ],
    recommendationPolicy: {
      authority: 'candidate-only',
      finalDecisionOwner: 'LLM2',
    },
  };
}

function route(options) {
  return router.routeLlm2Context(Object.assign({
    intentWorldView: makeView(),
    userRequest: '金币多一点',
    projectMode: 'continue',
  }, options));
}

function assertMode(name, actual, expected) {
  assert.strictEqual(actual.contextMode, expected, name + ' should route to ' + expected + ', got ' + actual.contextMode);
  router.assertSafeRouterOutput(actual);
}

function main() {
  var sameSceneGameplay = route({
    intentWorldView: makeView({
      baseHash: 'same_hash',
      targetHash: 'same_hash',
      issues: [{ tick: 160, issue: 'reward_pacing_low', meaning: 'reward pacing low' }],
    }),
    userRequest: '金币多一点',
  });
  assertMode('same scene gameplay iteration', sameSceneGameplay, 'diff_hit');
  assert.strictEqual(sameSceneGameplay.dynamicTail.contextModeHint, 'diff-only', 'diff_hit should keep diff-only hint');

  var unchangedHash = route({
    intentWorldView: makeView({ baseHash: 'same_hash', targetHash: 'same_hash', issues: [] }),
    userRequest: '再调整一下',
  });
  assertMode('semanticHash unchanged', unchangedHash, 'diff_hit');
  assert.strictEqual(unchangedHash.dynamicTail.contextModeHint, 'diff-only', 'semanticHash unchanged should use diff-only context');

  var newProject = route({
    intentWorldView: makeView({ baseHash: null, targetHash: 'new_hash', issues: [] }),
    projectMode: 'new',
    userRequest: '做一个手机平台跳跃游戏',
  });
  assertMode('new project', newProject, 'full_miss');
  assert.strictEqual(newProject.estimatedCacheRisk, 'high', 'full_miss should carry high cache risk');

  var threatDensity = route({
    intentWorldView: makeView({
      baseHash: 'same_hash',
      targetHash: 'same_hash',
      issues: [{ tick: 90, issue: 'pressure_balance_high', meaning: 'pressure balance high' }],
      pressure: 'too_high',
      recommendedActions: [
        {
          action: 'reduce_pressure',
          priority: 'high',
          reason: 'enemy density high',
          safeIntentDsl: 'reduce enemy pressure near Player early route',
        },
      ],
    }),
    userRequest: '怪别太密',
  });
  assertMode('focused threat density request', threatDensity, 'recommended_pack');
  assert(threatDensity.dynamicTail.requestedContext.indexOf('tick_event_window') >= 0, 'recommended_pack should request tick_event_window');

  var repeatedFailureWithPrefix = route({
    intentWorldView: makeView({ baseHash: 'hash_a', targetHash: 'hash_b', issues: [{ tick: 160, issue: 'reward_pacing_low' }] }),
    consecutiveFailureCount: 2,
    hasStablePrefix: true,
    userRequest: '还是不对',
  });
  assertMode('two wrong turns with stable prefix', repeatedFailureWithPrefix, 'full_hit');

  var repeatedFailureWithoutPrefix = route({
    intentWorldView: makeView({ baseHash: 'hash_a', targetHash: 'hash_b', issues: [{ tick: 160, issue: 'reward_pacing_low' }] }),
    consecutiveFailureCount: 2,
    hasStablePrefix: false,
    userRequest: '还是不对',
  });
  assertMode('two wrong turns without stable prefix', repeatedFailureWithoutPrefix, 'full_miss');

  assert.strictEqual(sameSceneGameplay.providerCacheModel.cacheKind, 'text-kv-prefix', 'DeepSeek cache model should be text KV prefix');
  assert.strictEqual(sameSceneGameplay.providerCacheModel.reusableAcrossModalities, false, 'DeepSeek KV cache should not be treated as multimodal cache');
  assert.strictEqual(sameSceneGameplay.providerCacheModel.hitToMissPriceRatio, 50, 'router should carry 50x hit/miss pricing assumption');

  var mockRepair = fullCreativeLoop.mockRepairModel(threatDensity.dynamicTail ? makeView({
    baseHash: 'same_hash',
    targetHash: 'same_hash',
    issues: [{ tick: 90, issue: 'pressure_balance_high', meaning: 'pressure balance high' }],
    recommendedActions: [
      {
        action: 'reduce_pressure',
        priority: 'high',
        reason: 'enemy density high',
        safeIntentDsl: 'reduce enemy pressure near Player early route',
      },
    ],
  }) : makeView(), {
    userRequest: '怪别太密',
    projectMode: 'continue',
  });
  assert.strictEqual(mockRepair.contextRoute.contextMode, 'recommended_pack', 'Mock LLM2 should expose router mode');
  assert.strictEqual(mockRepair.contextRoute.providerCacheModel.cacheKind, 'text-kv-prefix', 'Mock LLM2 should carry DeepSeek KV cache boundary');
  assert.strictEqual(mockRepair.contextReadPolicy.recommendationAuthority, 'candidate-only', 'Mock LLM2 should keep recommendations candidate-only');
  assert(mockRepair.contextReadPolicy.defaultRead.indexOf('tick_event_window') >= 0, 'Mock LLM2 should request tick_event_window for threat density');

  console.log('[LLM2ContextCacheRouter] modes, DeepSeek KV boundary, and Mock LLM2 context route passed');
}

main();
