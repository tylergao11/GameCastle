var assert = require('assert');
var fs = require('fs');
var path = require('path');

var loopRunner = require('./llm2-decision-loop-runner');

var ROOT = path.join(__dirname, '..');
var OUTPUT_DIR = path.join(ROOT, 'output');

function makeView() {
  return {
    owner: 'IntentWorldView',
    contextCache: {
      baseSemanticHash: 'deepseek_loop_hash',
      targetSemanticHash: 'deepseek_loop_hash',
      semanticCacheHit: true,
      contextMode: 'diff-only',
      diff: {
        latestIntentDslLines: ['place coins near Player front as trail count 5'],
        changedGameplayEvidence: [],
      },
    },
    evidence: [],
    sceneIntent: {
      gameplayFirst: true,
      sceneMode: 'single-scene',
      roles: [],
      uiPolicy: { role: 'supporting layer only' },
    },
    contextRequests: {
      defaultRead: ['project_world_diff'],
      available: [{ id: 'tick_event_window' }, { id: 'project_world_diff' }, { id: 'snapshot_summary' }, { id: 'ui_template_policy' }],
    },
    recommendedActions: [{
      action: 'increase_collectibles',
      priority: 'high',
      reason: 'request slot asks for more collectibles',
      safeIntentDsl: 'place coins near Player front as trail count 5',
    }],
    recommendationPolicy: {
      authority: 'candidate-only',
      finalDecisionOwner: 'LLM2',
    },
  };
}

async function main() {
  var calls = [];
  var report = await loopRunner.runDecisionLoopAsync({
    userRequest: 'REQUEST_SLOT:more_collectibles',
    projectMode: 'continue',
    execute: false,
    decisionProvider: 'deepseek',
    intentWorldView: makeView(),
    semanticPlaytestReport: { tickReport: { summary: { collectibleCollectionRate: 0.8 }, eventLog: [], snapshots: [] } },
    deepseekDecisionProvider: async function(options) {
      calls.push(options);
      return {
        owner: 'LLM2DeepSeekDecisionProvider',
        rawText: '{"decisionType":"apply_intent"}',
        usage: {
          input_tokens: 1000,
          input_tokens_details: { cached_tokens: 950 },
          prompt_cache_hit_tokens: 950,
          prompt_cache_miss_tokens: 50,
        },
        cacheGate: {
          threshold: 0.9,
          hitRate: 0.95,
          passed: true,
          hasUsage: true,
          usage: {
            inputTokens: 1000,
            cachedTokens: 950,
            promptCacheHitTokens: 950,
            promptCacheMissTokens: 50,
            measuredTokens: 1000,
          },
        },
        decision: {
          schemaVersion: 1,
          owner: 'LLM2DecisionRuntime',
          engine: 'deepseek',
          decisionType: 'apply_intent',
          intentDslLines: ['place coins near Player front as trail count 5'],
          requestedContext: [],
          reason: 'Proof slot candidate_matched selected safe Intent DSL.',
          confidence: 0.9,
          proof: {
            applied: true,
            rawDecisionType: 'apply_intent',
            slots: { proof: 'candidate_matched' },
          },
          verifier: {
            owner: 'LLM2DecisionVerifier',
            passed: true,
            errors: [],
            warnings: [],
          },
        },
        summary: {
          passed: true,
          decisionType: 'apply_intent',
          verifierPassed: true,
          cacheGatePassed: true,
          cacheHitRate: 0.95,
        },
      };
    },
    outputs: {
      report: 'llm2-decision-loop-deepseek-report.json',
      intentDsl: 'llm2-decision-loop-deepseek.intent.dsl',
      contextRoute: 'llm2-decision-loop-deepseek-context-route.json',
      providedContext: 'llm2-decision-loop-deepseek-provided-context.json',
    },
  });

  assert.strictEqual(calls.length, 1, 'deepseek provider should be called once');
  assert.strictEqual(report.mode, 'deepseek-decision-loop', 'report should name deepseek mode');
  assert.strictEqual(report.decisionProviderTrace.length, 1, 'report should keep provider trace');
  assert.strictEqual(report.decisionProviderTrace[0].owner, 'LLM2DeepSeekDecisionProvider', 'trace owner');
  assert.strictEqual(report.decisionProviderTrace[0].cacheGate.passed, true, 'cache gate should pass');
  assert.strictEqual(report.decisionProviderTrace[0].cacheGate.hitRate, 0.95, 'cache hit rate should be recorded');
  assert.strictEqual(report.finalDecision.engine, 'deepseek', 'final decision should come from deepseek engine');
  assert.strictEqual(report.finalDecision.proof.applied, true, 'proof slot should be recorded');
  assert.strictEqual(report.summary.cacheGatePassed, true, 'summary should include cache gate');
  assert.strictEqual(report.summary.cacheHitRate, 0.95, 'summary should include cache hit rate');
  assert.strictEqual(report.summary.executed, false, 'execute=false should avoid pipeline mutation');
  assert(fs.existsSync(path.join(OUTPUT_DIR, 'llm2-decision-loop-deepseek-report.json')), 'deepseek loop report should be written');

  console.log('[LLM2DecisionLoopDeepSeekProvider] async provider trace and cache gate passed');
}

main().catch(function(error) {
  console.error(error && error.stack || error);
  process.exit(1);
});
