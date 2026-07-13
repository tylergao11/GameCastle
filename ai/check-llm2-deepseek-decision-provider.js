var assert = require('assert');

var provider = require('./llm2-deepseek-decision-provider');

function fakeSse(events) {
  return {
    ok: true,
    status: 200,
    body: {
      getReader: function() {
        var done = false;
        var payload = events.map(function(event) {
          return 'data: ' + JSON.stringify(event);
        }).concat(['data: [DONE]', '', '']).join('\n');
        return {
          read: function() {
            if (done) return Promise.resolve({ done: true });
            done = true;
            return Promise.resolve({ done: false, value: new TextEncoder().encode(payload) });
          },
        };
      },
    },
  };
}

async function main() {
  // Explicit test-only environment authorization; production keys remain environment-only.
  process.env.LLM_PROVIDER = 'deepseek';
  process.env.DEEPSEEK_API_KEY = 'test-key';
  process.env.LLM_ALLOW_EXTERNAL = 'true';
  process.env.LLM_ENDPOINT = 'http://fake.local/v1';
  function cachedResponse(decisionPayload) {
    return fakeSse([
      { choices: [{ delta: { content: JSON.stringify(decisionPayload) } }] },
      {
        usage: {
            input_tokens: 1000,
            input_tokens_details: { cached_tokens: 950 },
            prompt_cache_hit_tokens: 950,
            prompt_cache_miss_tokens: 50,
        }, choices: [],
      },
    ]);
  }

  var decisionJson = JSON.stringify({
    decisionType: 'apply_intent',
    intentDslLines: ['place coins near Player front as trail count 5'],
    requestedContext: [],
    reason: 'More collectibles are requested and safe Intent DSL exists.',
    confidence: 0.74,
  });
  var calls = [];
  var decision = await provider.runDeepSeekDecisionProvider({
    endpoint: 'http://fake.local/v1',
    apiKey: 'test-key',
    model: 'deepseek-test',
    threshold: 0.9,
    intentWorldView: {
      owner: 'IntentWorldView',
      evidence: [],
      semanticRepairRecommendations: [{
        action: 'apply_semantic_repair',
        experienceDimension: 'reward_pacing',
        gameplayRole: 'reward',
        repairVerb: 'increase_presence',
        priority: 'high',
        reason: 'user requested more coins',
        safeIntentDsl: 'place coins near Player front as trail count 5',
      }],
    },
    contextRoute: {
      contextMode: 'diff_hit',
      stablePrefix: { promptVersion: 'test' },
      dynamicTail: { userRequest: '金币多一点' },
      providerCacheModel: { reusableAcrossModalities: false },
    },
    userRequest: '金币多一点',
    fetchImpl: async function(url, init) {
      calls.push({ url: url, body: JSON.parse(init.body) });
      return fakeSse([
        { choices: [{ delta: { content: decisionJson } }] },
        {
          usage: {
              input_tokens: 1000,
              input_tokens_details: { cached_tokens: 930 },
              prompt_cache_hit_tokens: 930,
              prompt_cache_miss_tokens: 70,
          }, choices: [],
        },
      ]);
    },
  });

  assert.strictEqual(decision.owner, 'LLM2DeepSeekDecisionProvider', 'provider owner');
  assert.strictEqual(decision.decision.decisionType, 'apply_intent', 'DeepSeek decision should be parsed');
  assert.strictEqual(decision.decision.verifier.passed, true, 'decision verifier should pass');
  assert.strictEqual(decision.cacheGate.passed, true, 'cache gate should pass');
  assert.strictEqual(decision.cacheGate.hitRate, 0.93, 'cache hit rate should be captured');
  assert(calls[0].body.messages[0].content.indexOf('GameCastle LLM2 real decision') >= 0, 'stable prefix should be first');
  assert(calls[0].body.messages[1].content.indexOf('金币多一点') >= 0, 'dynamic request should be in second message');
  assert(calls[0].body.messages[1].content.indexOf('reward_pacing') >= 0, 'gameplay request should carry generic experience dimension');
  assert(calls[0].body.messages[1].content.indexOf('increase_presence') >= 0, 'gameplay request should carry generic repair verb');
  assert(calls[0].body.messages[1].content.indexOf('apply_semantic_repair') >= 0, 'provider prompt should carry unified semantic repair action');
  assert(calls[0].body.messages[1].content.indexOf('action=no_op') < 0, 'provider prompt must not expose no_op as a semantic repair candidate');
  assert(calls[0].body.messages[1].content.indexOf('slot:local_proof') >= 0, 'provider prompt should use proof slots');
  assert(calls[0].body.messages[1].content.indexOf('candidate_matched') >= 0, 'provider prompt should expose candidate proof vocabulary');
  assert(calls[0].body.messages[1].content.indexOf('slot:allowed_requested_context_ids') >= 0, 'provider prompt should constrain request_context ids by slot');
  assert.strictEqual(decision.decision.proof.applied, true, 'candidate proof should apply local safe Intent');

  var promptSummaryCalls = [];
  await provider.runDeepSeekDecisionProvider({
    endpoint: 'http://fake.local/v1',
    apiKey: 'test-key',
    model: 'deepseek-test',
    threshold: 0.9,
    intentWorldView: {
      owner: 'IntentWorldView',
      semanticRepairRecommendations: [{
        action: 'apply_semantic_repair',
        experienceDimension: 'reward_pacing',
        gameplayRole: 'reward',
        repairVerb: 'increase_presence',
        priority: 'high',
        reason: 'user requested more coins',
        safeIntentDsl: 'place coins near Player front as trail count 5',
      }],
    },
    contextRoute: {
      contextMode: 'diff_hit',
      providerCacheModel: { reusableAcrossModalities: false },
      dynamicTail: {
        semanticRepairCandidates: [{
          action: 'apply_semantic_repair',
          safeIntentDsl: 'place coins near Player front as trail count 5',
        }],
      },
    },
    userRequest: 'more coins',
    fetchImpl: async function(url, init) {
      promptSummaryCalls.push({ url: url, body: JSON.parse(init.body) });
      return cachedResponse({ decisionType: 'no_op', intentDslLines: [], requestedContext: [], reason: 'safe empty', confidence: 0.4 });
    },
  });
  var summaryPrompt = promptSummaryCalls[0].body.messages[1].content;
  assert(summaryPrompt.indexOf('semanticRepairCandidateCount') >= 0, 'provider prompt should retain context-route semantic repair candidate count without exposing candidates');
  assert(summaryPrompt.indexOf('semanticRepairRecommendationCount') >= 0, 'provider prompt should retain world-view semantic repair recommendation count without exposing recommendations');

  var unsafe = await provider.runDeepSeekDecisionProvider({
    endpoint: 'http://fake.local/v1',
    apiKey: 'test-key',
    model: 'deepseek-test',
    threshold: 0.9,
    intentWorldView: {
      owner: 'IntentWorldView',
      semanticRepairRecommendations: [{
        action: 'apply_semantic_repair',
        experienceDimension: 'reward_pacing',
        gameplayRole: 'reward',
        repairVerb: 'increase_presence',
        priority: 'high',
        reason: 'user requested more coins',
        safeIntentDsl: 'place coins near Player front as trail count 5',
      }],
    },
    contextRoute: { contextMode: 'diff_hit', providerCacheModel: { reusableAcrossModalities: false } },
    userRequest: '金币多一点',
    fetchImpl: async function() {
      return fakeSse([
        { choices: [{ delta: { content: JSON.stringify({ decisionType: 'apply_intent', intentDslLines: ['place Coin x=1 y=2'], requestedContext: [] }) } }] },
        { usage: { input_tokens: 1000, input_tokens_details: { cached_tokens: 950 }, prompt_cache_hit_tokens: 950, prompt_cache_miss_tokens: 50 }, choices: [] },
      ]);
    },
  });
  assert.strictEqual(unsafe.decision.decisionType, 'apply_intent', 'unsafe raw DeepSeek output should be replaced by proven safe Intent');
  assert.strictEqual(unsafe.decision.verifier.passed, true, 'proof-applied safe candidate should pass verifier');
  assert.strictEqual(unsafe.decision.proof.applied, true, 'proof should override unsafe raw model output');

  var invalidContext = await provider.runDeepSeekDecisionProvider({
    endpoint: 'http://fake.local/v1',
    apiKey: 'test-key',
    model: 'deepseek-test',
    threshold: 0.9,
    intentWorldView: { owner: 'IntentWorldView', contextRequests: { available: [{ id: 'tick_event_window' }] } },
    contextRoute: { contextMode: 'diff_hit', providerCacheModel: { reusableAcrossModalities: false } },
    userRequest: '再看一下',
    fetchImpl: async function() {
      return fakeSse([
        { choices: [{ delta: { content: JSON.stringify({ decisionType: 'request_context', intentDslLines: [], requestedContext: ['user_intent'], reason: 'need user intent', confidence: 0.2 }) } }] },
        { usage: { input_tokens: 1000, input_tokens_details: { cached_tokens: 950 }, prompt_cache_hit_tokens: 950, prompt_cache_miss_tokens: 50 }, choices: [] },
      ]);
    },
  });
  assert.strictEqual(invalidContext.decision.decisionType, 'reject', 'invalid context id should reject');
  assert.strictEqual(invalidContext.decision.verifier.passed, false, 'invalid context id should preserve verifier failure');

  var threatWorld = {
    owner: 'IntentWorldView',
    contextRequests: { available: [{ id: 'tick_event_window' }, { id: 'project_world_diff' }] },
    semanticRepairRecommendations: [{
      action: 'apply_semantic_repair',
      experienceDimension: 'pressure_balance',
      gameplayRole: 'pressure',
      repairVerb: 'soften_pressure',
      priority: 'high',
      reason: 'enemy density high near the early route',
      safeIntentDsl: 'reduce enemy pressure near Player early route',
    }],
  };
  var enemyFirst = await provider.runDeepSeekDecisionProvider({
    endpoint: 'http://fake.local/v1',
    apiKey: 'test-key',
    model: 'deepseek-test',
    threshold: 0.9,
    intentWorldView: threatWorld,
    contextRoute: { contextMode: 'recommended_pack', providerCacheModel: { reusableAcrossModalities: false } },
    userRequest: 'REQUEST_SLOT:enemy_density',
    fetchImpl: async function() {
      return cachedResponse({ decisionType: 'no_op', intentDslLines: [], requestedContext: [], reason: 'raw weak answer', confidence: 0.1 });
    },
  });
  assert.strictEqual(enemyFirst.decision.decisionType, 'request_context', 'enemy density slot should request Tick evidence first');
  assert.deepStrictEqual(enemyFirst.decision.requestedContext, ['tick_event_window'], 'enemy density slot should request tick_event_window');
  assert.strictEqual(enemyFirst.decision.proof.applied, true, 'evidence_gap proof should override weak no_op');

  var enemySecond = await provider.runDeepSeekDecisionProvider({
    endpoint: 'http://fake.local/v1',
    apiKey: 'test-key',
    model: 'deepseek-test',
    threshold: 0.9,
    intentWorldView: threatWorld,
    contextRoute: { contextMode: 'recommended_pack', providerCacheModel: { reusableAcrossModalities: false } },
    resolvedContext: { contexts: { tick_event_window: { events: [{ tick: 220, type: 'PressureDetected' }] } } },
    userRequest: 'REQUEST_SLOT:enemy_density',
    fetchImpl: async function() {
      return cachedResponse({ decisionType: 'reject', intentDslLines: [], requestedContext: ['ui_template_policy'], reason: 'raw weak answer', confidence: 0.1 });
    },
  });
  assert.strictEqual(enemySecond.decision.decisionType, 'apply_intent', 'enemy density slot should apply after Tick evidence');
  assert.deepStrictEqual(enemySecond.decision.intentDslLines, ['reduce enemy pressure near Player early route'], 'enemy density should use safe candidate DSL');

  var uiTemplate = await provider.runDeepSeekDecisionProvider({
    endpoint: 'http://fake.local/v1',
    apiKey: 'test-key',
    model: 'deepseek-test',
    threshold: 0.9,
    intentWorldView: { owner: 'IntentWorldView' },
    contextRoute: { contextMode: 'diff_hit', providerCacheModel: { reusableAcrossModalities: false } },
    userRequest: 'REQUEST_SLOT:ui_template',
    fetchImpl: async function() {
      return cachedResponse({ decisionType: 'apply_intent', intentDslLines: ['place icon near button'], requestedContext: [], reason: 'raw weak answer', confidence: 0.1 });
    },
  });
  assert.strictEqual(uiTemplate.decision.decisionType, 'reject', 'ui template slot should reject gameplay Intent');
  assert.deepStrictEqual(uiTemplate.decision.requestedContext, ['ui_template_policy'], 'ui template slot should carry policy context id');

  var stableNoop = await provider.runDeepSeekDecisionProvider({
    endpoint: 'http://fake.local/v1',
    apiKey: 'test-key',
    model: 'deepseek-test',
    threshold: 0.9,
    intentWorldView: { owner: 'IntentWorldView', semanticRepairRecommendations: [] },
    contextRoute: { contextMode: 'diff_hit', providerCacheModel: { reusableAcrossModalities: false } },
    userRequest: 'REQUEST_SLOT:stable_noop',
    fetchImpl: async function() {
      return cachedResponse({ decisionType: 'request_context', intentDslLines: [], requestedContext: ['project_world_diff'], reason: 'raw weak answer', confidence: 0.1 });
    },
  });
  assert.strictEqual(stableNoop.decision.decisionType, 'no_op', 'stable slot should no_op');

  var deathApply = await provider.runDeepSeekDecisionProvider({
    endpoint: 'http://fake.local/v1',
    apiKey: 'test-key',
    model: 'deepseek-test',
    threshold: 0.9,
    intentWorldView: {
      owner: 'IntentWorldView',
      contextRequests: { available: [{ id: 'tick_event_window' }, { id: 'project_world_diff' }] },
      semanticRepairRecommendations: [{
        action: 'apply_semantic_repair',
        experienceDimension: 'survival_window',
        gameplayRole: 'actor',
        repairVerb: 'add_recovery_window',
        priority: 'high',
        reason: 'death happened too early',
        safeIntentDsl: 'reduce enemy pressure near Player early route',
      }],
    },
    contextRoute: { contextMode: 'recommended_pack', providerCacheModel: { reusableAcrossModalities: false } },
    resolvedContext: { contexts: { tick_event_window: { summary: { firstDeathTick: 300 } } } },
    userRequest: 'REQUEST_SLOT:death_too_fast',
    fetchImpl: async function() {
      return cachedResponse({ decisionType: 'no_op', intentDslLines: [], requestedContext: [], reason: 'raw weak answer', confidence: 0.1 });
    },
  });
  assert.strictEqual(deathApply.decision.decisionType, 'apply_intent', 'death slot should apply safe route candidate after Tick evidence');
  assert.strictEqual(deathApply.decision.proof.applied, true, 'death slot proof should apply');

  console.log('[LLM2DeepSeekDecisionProvider] parse, cache gate, verifier, and proof slots passed');
}

main().catch(function(error) {
  console.error(error && error.stack || error);
  process.exit(1);
});
