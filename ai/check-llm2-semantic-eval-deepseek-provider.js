var assert = require('assert');
var fs = require('fs');
var path = require('path');

var semanticEvalLoop = require('./llm2-semantic-eval-loop');

var ROOT = path.join(__dirname, '..');

function fakeProvider() {
  return async function(options) {
    return {
      owner: 'LLM2DeepSeekDecisionProvider',
      rawText: '{"decisionType":"apply_intent"}',
      usage: {
        input_tokens: 1000,
        input_tokens_details: { cached_tokens: 940 },
        prompt_cache_hit_tokens: 940,
        prompt_cache_miss_tokens: 60,
      },
      cacheGate: {
        threshold: 0.9,
        hitRate: 0.94,
        passed: true,
        hasUsage: true,
        usage: {
          inputTokens: 1000,
          cachedTokens: 940,
          promptCacheHitTokens: 940,
          promptCacheMissTokens: 60,
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
        cacheHitRate: 0.94,
      },
    };
  };
}

async function main() {
  var report = await semanticEvalLoop.runSemanticEvalLoopAsync({
    outputPrefix: 'llm2-semantic-eval-deepseek',
    decisionProvider: 'deepseek',
    cacheHitThreshold: 0.9,
    deepseekDecisionProvider: fakeProvider(),
    cases: [{
      id: 'coin_more_slot_deepseek',
      userRequest: 'REQUEST_SLOT:more_collectibles',
      kind: 'synthetic_deepseek_coin_apply',
      execute: false,
      expectedDecision: 'apply_intent',
    }],
  });
  assert.strictEqual(report.mode, 'deepseek-semantic-eval-loop', 'deepseek eval mode');
  assert.strictEqual(report.summary.failed, 0, 'deepseek eval should pass');
  assert.strictEqual(report.summary.provider, 'LLM2DeepSeekDecisionProvider', 'summary provider');
  assert.strictEqual(report.summary.cacheGatePassed, true, 'summary cache gate');
  assert.strictEqual(report.summary.cacheHitRate, 0.94, 'summary cache hit rate');
  assert.strictEqual(report.cases[0].providerTraceCount, 1, 'case provider trace count');
  assert.strictEqual(report.cases[0].cacheGatePassed, true, 'case cache gate');
  assert.strictEqual(report.cases[0].proofApplied, true, 'case proof applied');

  var transcriptPath = path.join(ROOT, report.cases[0].transcriptPath);
  assert(fs.existsSync(transcriptPath), 'transcript should exist');
  var transcript = JSON.parse(fs.readFileSync(transcriptPath, 'utf8'));
  assert.strictEqual(transcript.decisionProviderTrace[0].owner, 'LLM2DeepSeekDecisionProvider', 'transcript provider trace');
  assert.strictEqual(transcript.decisionProviderTrace[0].cacheGate.passed, true, 'transcript cache gate');
  assert(Object.prototype.hasOwnProperty.call(transcript, 'improvementComparison'), 'transcript should carry stable improvementComparison slot');

  console.log('[LLM2SemanticEvalDeepSeekProvider] async eval provider trace passed');
}

main().catch(function(error) {
  console.error(error && error.stack || error);
  process.exit(1);
});
