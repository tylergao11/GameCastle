var fs = require('fs');
var path = require('path');

var semanticEvalLoop = require('./llm2-semantic-eval-loop');

var ROOT = path.join(__dirname, '..');
var OUTPUT_DIR = path.join(ROOT, 'output');

function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text);
}

function writeJson(filePath, value) {
  writeText(filePath, JSON.stringify(value, null, 2));
}

function makeCases() {
  return [
    {
      id: 'slot_more_collectibles',
      userRequest: 'REQUEST_SLOT:more_collectibles',
      kind: 'synthetic_deepseek_coin_apply',
      execute: false,
      expectedDecision: 'apply_intent',
    },
    {
      id: 'slot_enemy_density',
      userRequest: 'REQUEST_SLOT:enemy_density',
      kind: 'synthetic_threat_context',
      execute: false,
      expectedFirstDecision: 'request_context',
      expectedDecision: 'apply_intent',
    },
    {
      id: 'slot_death_too_fast',
      userRequest: 'REQUEST_SLOT:death_too_fast',
      kind: 'synthetic_death_apply',
      execute: false,
      expectedFirstDecision: 'request_context',
      expectedDecision: 'apply_intent',
    },
    {
      id: 'slot_ui_template',
      userRequest: 'REQUEST_SLOT:ui_template',
      kind: 'synthetic_ui_reject',
      execute: false,
      expectedDecision: 'reject',
    },
    {
      id: 'slot_stable_noop',
      userRequest: 'REQUEST_SLOT:stable_noop',
      kind: 'synthetic_stable_noop',
      execute: false,
      expectedDecision: 'no_op',
    },
    {
      id: 'slot_route_unclear',
      userRequest: 'REQUEST_SLOT:route_unclear',
      kind: 'synthetic_route_readability',
      execute: false,
      expectedDecision: 'apply_intent',
    },
    {
      id: 'slot_content_sparse',
      userRequest: 'REQUEST_SLOT:content_sparse',
      kind: 'synthetic_content_density',
      execute: false,
      expectedDecision: 'apply_intent',
    },
    {
      id: 'slot_phase_reward_missing',
      userRequest: 'REQUEST_SLOT:phase_reward_missing',
      kind: 'synthetic_phase_feedback',
      execute: false,
      expectedFirstDecision: 'request_context',
      expectedDecision: 'apply_intent',
    },
    {
      id: 'slot_remix_runner',
      userRequest: 'REQUEST_SLOT:remix_runner',
      kind: 'synthetic_remix_runner',
      execute: false,
      expectedDecision: 'apply_intent',
    },
    {
      id: 'slot_remix_survivor',
      userRequest: 'REQUEST_SLOT:remix_survivor',
      kind: 'synthetic_remix_survivor',
      execute: false,
      expectedDecision: 'apply_intent',
    },
  ];
}

function summarizeRun(role, report) {
  var rates = report.cases
    .filter(function(item) { return typeof item.cacheHitRate === 'number'; })
    .map(function(item) { return item.cacheHitRate; });
  return {
    role: role,
    mode: report.mode,
    passed: report.summary.failed === 0,
    provider: report.summary.provider,
    cacheGatePassed: report.summary.cacheGatePassed,
    cacheHitRate: report.summary.cacheHitRate,
    minCacheHitRate: rates.length ? Math.min.apply(Math, rates) : null,
    cases: report.cases.map(function(item) {
      return {
        id: item.id,
        firstDecisionType: item.firstDecisionType,
        finalDecisionType: item.finalDecisionType,
        providerTraceCount: item.providerTraceCount,
        cacheGatePassed: item.cacheGatePassed,
        cacheHitRate: item.cacheHitRate,
        proofApplied: item.proofApplied,
        failures: item.failures,
      };
    }),
  };
}

async function main() {
  var cases = makeCases();
  var warmup = await semanticEvalLoop.runSemanticEvalLoopAsync({
    outputPrefix: 'llm2-deepseek-loop-warmup',
    decisionProvider: 'deepseek',
    cacheHitThreshold: 0,
    cases: cases,
  });
  var hot = await semanticEvalLoop.runSemanticEvalLoopAsync({
    outputPrefix: 'llm2-deepseek-loop',
    decisionProvider: 'deepseek',
    cacheHitThreshold: 0.9,
    cases: cases,
  });
  var hotRates = hot.cases
    .filter(function(item) { return typeof item.cacheHitRate === 'number'; })
    .map(function(item) { return item.cacheHitRate; });
  var hotFailedCases = hot.cases.filter(function(item) {
    return item.failures.length > 0;
  }).map(function(item) { return item.id; });
  var combined = {
    schemaVersion: 1,
    owner: 'LLM2DeepSeekLoopDebug',
    mode: 'warmup-then-hot-cache-gated',
    threshold: 0.9,
    steps: [
      summarizeRun('warmup', warmup),
      summarizeRun('hot', hot),
    ],
    summary: {
      passed: hot.summary.failed === 0 && hot.summary.cacheGatePassed === true,
      hotCaseCount: hot.cases.length,
      hotFailedCases: hotFailedCases,
      hotCacheHitRate: hot.summary.cacheHitRate,
      hotMinCacheHitRate: hotRates.length ? Math.min.apply(Math, hotRates) : null,
      hotCacheGatePassed: hot.summary.cacheGatePassed,
      hotDecisions: hot.cases.map(function(item) {
        return item.id + ':' + item.firstDecisionType + '->' + item.finalDecisionType;
      }),
      hotProofAppliedCount: hot.cases.filter(function(item) { return item.proofApplied; }).length,
    },
  };
  writeJson(path.join(OUTPUT_DIR, 'llm2-deepseek-loop-debug-report.json'), combined);
  writeText(path.join(OUTPUT_DIR, 'llm2-deepseek-loop-debug-summary.txt'), [
    'LLM2 DeepSeek Loop Debug',
    'passed: ' + combined.summary.passed,
    'hotCaseCount: ' + combined.summary.hotCaseCount,
    'hotFailedCases: ' + combined.summary.hotFailedCases.join(','),
    'hotCacheHitRate: ' + combined.summary.hotCacheHitRate,
    'hotMinCacheHitRate: ' + combined.summary.hotMinCacheHitRate,
    'hotCacheGatePassed: ' + combined.summary.hotCacheGatePassed,
    'hotDecisions: ' + combined.summary.hotDecisions.join(', '),
    'hotProofAppliedCount: ' + combined.summary.hotProofAppliedCount,
  ].join('\n') + '\n');
  console.log('[LLM2DeepSeekLoop] warmupCache=' + warmup.summary.cacheHitRate +
    ' hotCache=' + hot.summary.cacheHitRate +
    ' hotMinCache=' + combined.summary.hotMinCacheHitRate +
    ' hotGate=' + hot.summary.cacheGatePassed +
    ' cases=' + combined.summary.hotCaseCount +
    ' failed=' + combined.summary.hotFailedCases.length +
    ' proofApplied=' + combined.summary.hotProofAppliedCount);
  if (!combined.summary.passed) process.exit(1);
}

main().catch(function(error) {
  console.error(error && error.stack || error);
  process.exit(1);
});
