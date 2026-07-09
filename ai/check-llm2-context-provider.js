var assert = require('assert');

var contextProvider = require('./llm2-context-provider');
var decisionRuntime = require('./llm2-decision-runtime');
var router = require('./llm2-context-cache-router');

function makeIntentWorldView() {
  return {
    owner: 'IntentWorldView',
    contextCache: {
      baseSemanticHash: 'hash_a',
      targetSemanticHash: 'hash_a',
      semanticCacheHit: true,
      diff: {
        latestIntentDslLines: ['place enemies near Player front as wave count 4'],
        changedGameplayEvidence: [{ kind: 'pressure_balance_high', tick: 220 }],
      },
    },
    evidence: [
      {
        tick: 220,
        issue: 'pressure_balance_high',
        meaning: 'enemy density high',
      },
    ],
    sceneIntent: {
      gameplayFirst: true,
      sceneMode: 'single-scene',
      roles: [],
      uiPolicy: { role: 'supporting layer only' },
    },
    contextRequests: {
      defaultRead: ['tick_event_window', 'project_world_diff'],
      available: [
        { id: 'tick_event_window' },
        { id: 'project_world_diff' },
        { id: 'snapshot_summary' },
        { id: 'ui_template_policy' },
      ],
    },
    recommendedActions: [
      {
        action: 'reduce_pressure',
        priority: 'high',
        reason: 'enemy density high',
        safeIntentDsl: 'reduce enemy pressure near Player early route',
      },
    ],
    recommendationPolicy: {
      authority: 'candidate-only',
      finalDecisionOwner: 'LLM2',
    },
  };
}

function makeTickReport() {
  return {
    owner: 'TickPlaytestRuntime',
    eventLog: [
      { tick: 1, type: 'ActorIntent', semantic: 'actor intent', details: { intent: 'move-forward' } },
      { tick: 220, type: 'PressureDetected', semantic: 'pressure detected', details: { subject: 'pressure', count: 4 } },
      { tick: 260, type: 'ActorDamaged', semantic: 'actor damaged', details: { subject: 'actor', source: 'pressure' } },
    ],
    snapshots: [
      { tick: 0, state: { player: 'ready', score: 0 }, metrics: { threatsSeen: 0 } },
      { tick: 300, state: { player: 'hurt', score: 0 }, metrics: { threatsSeen: 4, survived: false } },
    ],
  };
}

function main() {
  var intentWorldView = makeIntentWorldView();
  var tickReport = makeTickReport();
  var provided = contextProvider.provideContext({
    requestedContext: ['tick_event_window', 'project_world_diff', 'snapshot_summary', 'ui_template_policy'],
    intentWorldView: intentWorldView,
    tickReport: tickReport,
  });
  assert.strictEqual(provided.owner, 'LLM2ContextProvider', 'provider owner');
  assert.strictEqual(provided.contexts.tick_event_window.events.length, 2, 'tick window should include nearby threat/damage events');
  assert.strictEqual(provided.contexts.tick_event_window.centerTick, 220, 'tick window should center on issue tick');
  assert.strictEqual(provided.contexts.project_world_diff.semanticCacheHit, true, 'world diff should preserve cache hit');
  assert(provided.contexts.snapshot_summary.snapshots.length > 0, 'snapshot summary should include nearby snapshots');
  assert.strictEqual(provided.contexts.ui_template_policy.policy.role, 'supporting template layer', 'UI policy should be template layer');
  contextProvider.assertSafeProvidedContext(provided);

  var contextRoute = router.routeLlm2Context({
    intentWorldView: intentWorldView,
    userRequest: '怪别太密',
    projectMode: 'continue',
  });
  var firstDecision = decisionRuntime.runDecisionRuntime({
    intentWorldView: intentWorldView,
    contextRoute: contextRoute,
    userRequest: '怪别太密',
    projectMode: 'continue',
  });
  assert.strictEqual(firstDecision.decisionType, 'request_context', 'first threat density decision should request context');

  var secondDecision = decisionRuntime.runDecisionRuntime({
    intentWorldView: intentWorldView,
    contextRoute: contextRoute,
    userRequest: '怪别太密',
    projectMode: 'continue',
    resolvedContext: provided,
  });
  assert.strictEqual(secondDecision.decisionType, 'apply_intent', 'provided context should allow second decision to apply intent');
  assert.strictEqual(secondDecision.intentDslLines[0], 'reduce enemy pressure near Player early route', 'second decision should emit pressure repair Intent');
  assert.strictEqual(secondDecision.verifier.passed, true, 'second decision verifier should pass');

  console.log('[LLM2ContextProvider] request_context provider and second decision loop passed');
}

main();
