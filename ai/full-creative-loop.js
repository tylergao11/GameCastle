var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');
var intentSurfaceGuard = require('./intent-surface-guard');
var llm2ContextCacheRouter = require('./llm2-context-cache-router');
var llm2DecisionRuntime = require('./llm2-decision-runtime');
var llm2ContextProvider = require('./llm2-context-provider');
var semanticFeedback = require('./semantic-feedback');

var FULL_CREATIVE_LOOP_SCHEMA_VERSION = 1;
var ROOT = path.join(__dirname, '..');
var OUTPUT_DIR = path.join(ROOT, 'output');

var MOCK_CREATIVE_RULES = {
  themes: [
    {
      id: 'mobile-parkour-platformer',
      matches: ['跑酷', 'parkour'],
      intentLine: 'make a mobile parkour platformer',
    },
    {
      id: 'mobile-platformer',
      matches: [],
      intentLine: 'make a mobile platformer',
    },
  ],
  collectiblePacing: [
    {
      id: 'already-enough',
      matches: ['金币够', '不用修', 'stable', 'enough'],
      count: 15,
      requestedChanges: [],
    },
    {
      id: 'more-requested',
      matches: ['金币多', '多一点', 'more coins', 'more collectibles'],
      count: 3,
      requestedChanges: ['more collectible pacing'],
    },
    {
      id: 'sparse-requested',
      matches: ['金币少', 'sparse', 'few'],
      count: 2,
      requestedChanges: ['repair sparse collectible pacing'],
    },
    {
      id: 'default-collectible-pacing',
      matches: [],
      count: 3,
      requestedChanges: [],
    },
  ],
  controls: [
    'add joystick controls Player near screen bottom-left',
    'add jump button controls Player near screen bottom-right',
  ],
  collectiblePlan: {
    subject: 'coins',
    anchor: 'Player',
    direction: 'front',
    pattern: 'trail',
  },
};

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function ensureOutputDir() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text);
}

function writeJson(filePath, value) {
  writeText(filePath, JSON.stringify(value, null, 2));
}

function readJsonOutput(fileName) {
  return JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, fileName), 'utf8'));
}

function readTextOutput(fileName) {
  return fs.readFileSync(path.join(OUTPUT_DIR, fileName), 'utf8');
}

function assertSafeIntentText(text, label) {
  var hits = intentSurfaceGuard.detectProhibitedSurface(text);
  if (hits.length) {
    throw new Error(label + ' contains prohibited machine surface: ' + hits.map(function(hit) { return hit.id; }).join(', '));
  }
}

function assertSafeJson(value, label) {
  var text = JSON.stringify(value);
  if (text.indexOf('"x"') >= 0 || text.indexOf('"y"') >= 0) {
    throw new Error(label + ' must not expose coordinates');
  }
  if (text.indexOf('bridgePlan') >= 0 || text.indexOf('componentId') >= 0 || text.indexOf('gdjs') >= 0) {
    throw new Error(label + ' must not expose backend planning fields');
  }
}

function matchesRule(text, rule) {
  return (rule.matches || []).some(function(pattern) {
    return text.indexOf(String(pattern).toLowerCase()) >= 0;
  });
}

function firstMatchingRule(text, rules) {
  var normalized = String(text || '').toLowerCase();
  for (var i = 0; i < rules.length; i++) {
    if (matchesRule(normalized, rules[i])) return rules[i];
  }
  return rules[rules.length - 1];
}

function mockRequirementModel(userRequest) {
  var text = String(userRequest || '').trim();
  var themeRule = firstMatchingRule(text, MOCK_CREATIVE_RULES.themes);
  var pacingRule = firstMatchingRule(text, MOCK_CREATIVE_RULES.collectiblePacing);
  var collectiblePlan = Object.assign({}, MOCK_CREATIVE_RULES.collectiblePlan, {
    count: pacingRule.count,
  });
  return {
    schemaVersion: FULL_CREATIVE_LOOP_SCHEMA_VERSION,
    owner: 'DeterministicMockLLM',
    role: 'requirement',
    source: text,
    designBrief: {
      theme: themeRule.id,
      themeIntentLine: themeRule.intentLine,
      goals: ['survive', 'collect'],
      feel: text.indexOf('别太难') >= 0 ? 'forgiving early route' : 'balanced route',
      requestedChanges: pacingRule.requestedChanges,
      collectiblePlan: collectiblePlan,
    },
  };
}

function mockIntentModel(requirementOutput) {
  var brief = requirementOutput.designBrief || {};
  var plan = brief.collectiblePlan || {};
  var lines = [brief.themeIntentLine || MOCK_CREATIVE_RULES.themes[MOCK_CREATIVE_RULES.themes.length - 1].intentLine]
    .concat(MOCK_CREATIVE_RULES.controls)
    .concat([
    'place ' + (plan.subject || 'coins') + ' near ' + (plan.anchor || 'Player') + ' ' + (plan.direction || 'front') + ' as ' + (plan.pattern || 'trail') + ' count ' + Number(plan.count || 3),
  ]);
  var text = lines.join('\n') + '\n';
  assertSafeIntentText(text, 'Mock intent DSL');
  return {
    schemaVersion: FULL_CREATIVE_LOOP_SCHEMA_VERSION,
    owner: 'DeterministicMockLLM',
    role: 'intent',
    intentDslText: text,
    intentDslLines: lines,
  };
}

function mockRepairModel(intentWorldView, options) {
  options = options || {};
  var contextRoute = llm2ContextCacheRouter.routeLlm2Context({
    projectWorld: options.projectWorld,
    intentWorldView: intentWorldView,
    semanticHash: options.semanticHash,
    userRequest: options.userRequest,
    projectMode: options.projectMode || 'continue',
    consecutiveFailureCount: options.consecutiveFailureCount || 0,
    hasStablePrefix: options.hasStablePrefix,
  });
  var decision = llm2DecisionRuntime.runDecisionRuntime({
    intentWorldView: intentWorldView,
    contextRoute: contextRoute,
    userRequest: options.userRequest,
    currentRequest: options.currentRequest,
    projectMode: options.projectMode || 'continue',
    resolvedContext: options.resolvedContext,
  });
  var providedContext = options.resolvedContext || null;
  if (decision.decisionType === 'request_context') {
    providedContext = llm2ContextProvider.provideContext({
      requestedContext: decision.requestedContext,
      intentWorldView: intentWorldView,
      tickReport: options.tickReport,
      semanticPlaytestReport: options.semanticPlaytestReport,
    });
    decision = llm2DecisionRuntime.runDecisionRuntime({
      intentWorldView: intentWorldView,
      contextRoute: contextRoute,
      userRequest: options.userRequest,
      currentRequest: options.currentRequest,
      projectMode: options.projectMode || 'continue',
      resolvedContext: providedContext,
    });
  }
  llm2DecisionRuntime.assertVerifiedDecision(decision);
  var lines = decision.decisionType === 'apply_intent' ? decision.intentDslLines : [];
  var text = lines.join('\n') + (lines.length ? '\n' : '');
  assertSafeIntentText(text, 'Mock repair Intent DSL');
  return {
    schemaVersion: FULL_CREATIVE_LOOP_SCHEMA_VERSION,
    owner: 'DeterministicMockLLM',
    role: 'repair',
    decision: decision,
    providedContext: providedContext,
    contextRoute: contextRoute,
    decisionSource: 'llm2-context-cache-router.dynamicTail.candidateActions',
    contextReadPolicy: intentWorldView && intentWorldView.contextRequests ? {
      available: (intentWorldView.contextRequests.available || []).map(function(item) { return item.id; }),
      defaultRead: contextRoute.dynamicTail.requestedContext || intentWorldView.contextRequests.defaultRead || [],
      recommendationAuthority: intentWorldView.recommendationPolicy && intentWorldView.recommendationPolicy.authority,
    } : null,
    selectedAction: decision.selectedAction || null,
    reason: decision.reason,
    repairIntentDslText: text,
    repairIntentDslLines: lines,
  };
}

function runNode(args, label) {
  var result = childProcess.spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(label + ' failed\nSTDOUT:\n' + result.stdout + '\nSTDERR:\n' + result.stderr);
  }
  return {
    label: label,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function semanticPlaytestSnapshot(prefix) {
  var report = readJsonOutput('semantic-playtest-report.json');
  var llmReport = readJsonOutput('semantic-playtest-llm-report.json');
  var userReport = readJsonOutput('semantic-playtest-user-report.json');
  var policy = readJsonOutput('semantic-playtest-policy.json');
  var intentWorldView = readJsonOutput('intent-world-view.json');
  var repairIntent = readTextOutput('semantic-playtest-repair.intent.dsl');
  writeJson(path.join(OUTPUT_DIR, prefix + '-semantic-playtest-report.json'), report);
  writeJson(path.join(OUTPUT_DIR, prefix + '-semantic-playtest-llm-report.json'), llmReport);
  writeJson(path.join(OUTPUT_DIR, prefix + '-semantic-playtest-user-report.json'), userReport);
  writeJson(path.join(OUTPUT_DIR, prefix + '-semantic-playtest-policy.json'), policy);
  writeJson(path.join(OUTPUT_DIR, prefix + '-intent-world-view.json'), intentWorldView);
  writeText(path.join(OUTPUT_DIR, prefix + '-repair.intent.dsl'), repairIntent);
  return {
    report: report,
    llmReport: llmReport,
    userReport: userReport,
    policy: policy,
    intentWorldView: intentWorldView,
    repairIntentDslText: repairIntent,
  };
}

function summaryValue(summary, preferred, fallback) {
  if (!summary) return null;
  if (summary[preferred] !== undefined) return summary[preferred];
  return summary[fallback];
}

function buildFinalUserSummary(before, after, repairDecision, improvementComparison) {
  var beforeSummary = before.report.tickReport.summary;
  var afterSummary = after ? after.report.tickReport.summary : beforeSummary;
  var improved = !!(improvementComparison && improvementComparison.improved);
  var alreadyDone = !repairDecision.repairIntentDslLines.length;
  var beforeRate = summaryValue(beforeSummary, 'rewardReachabilityRate', 'collectibleCollectionRate');
  var afterRate = summaryValue(afterSummary, 'rewardReachabilityRate', 'collectibleCollectionRate');
  var improvedMeasurements = ((improvementComparison || {}).measurements || []).filter(function(item) {
    return item.status === 'improved';
  }).map(function(item) {
    return item.measurement;
  }).join('、');
  return [
    '已完成一次自动创作闭环。',
    alreadyDone
      ? '首版 Tick 证据 rewardReachabilityRate=' + beforeRate + '，无需自动修复。'
      : '首版 Tick 证据 rewardReachabilityRate=' + beforeRate + '，修复后二次试玩 rewardReachabilityRate=' + afterRate + '。',
    alreadyDone ? '首版已经满足当前试玩目标。' : (improved ? '修复有效：改善指标 ' + (improvedMeasurements || 'semantic measurements') + '。' : '修复未改善：需要继续调整玩法意图。'),
    repairDecision.repairIntentDslLines.length ? '本轮自动应用的修改意图：' + repairDecision.repairIntentDslLines.join('；') : '本轮没有需要自动应用的修改意图。',
  ].join('\n');
}

function compareFullLoopImprovement(before, after) {
  return semanticFeedback.compareSemanticTickSummaries({
    beforeSummary: before.report.tickReport.summary,
    afterSummary: after.report.tickReport.summary,
    issues: (((before.report || {}).llmReport || {}).tickIssues) || [],
  });
}

function runFullCreativeLoop(options) {
  options = options || {};
  ensureOutputDir();
  var userRequest = options.userRequest || '做一个手机跑酷游戏，金币多一点，别太难';
  var requirement = mockRequirementModel(userRequest);
  var initialIntent = mockIntentModel(requirement);
  assertSafeJson(requirement, 'Mock requirement output');
  assertSafeJson(initialIntent, 'Mock intent output');

  var createIntentPath = path.join(OUTPUT_DIR, 'full-creative-loop-create.intent.dsl');
  writeText(createIntentPath, initialIntent.intentDslText);
  var createRun = runNode([
    'ai/pipeline.js',
    '--intent-fixture-file',
    path.relative(ROOT, createIntentPath),
    '--batch-label',
    'full_creative_loop_create',
  ], 'full creative loop create');
  var before = semanticPlaytestSnapshot('full-creative-loop-before');

  var repairDecision = mockRepairModel(before.intentWorldView, {
    projectWorld: before.report && before.report.input ? null : null,
    semanticHash: before.intentWorldView && before.intentWorldView.contextCache ? before.intentWorldView.contextCache.targetSemanticHash : null,
    userRequest: userRequest,
    projectMode: 'continue',
    consecutiveFailureCount: options.consecutiveFailureCount || 0,
    tickReport: before.report.tickReport,
    semanticPlaytestReport: before.report,
  });
  assertSafeJson(repairDecision, 'Mock repair output');
  writeJson(path.join(OUTPUT_DIR, 'full-creative-loop-repair-context-route.json'), repairDecision.contextRoute);
  var repairIntentPath = path.join(OUTPUT_DIR, 'full-creative-loop-repair.intent.dsl');
  writeText(repairIntentPath, repairDecision.repairIntentDslText || '');
  var repairRun = null;
  var after = null;
  if (repairDecision.repairIntentDslText.trim()) {
    repairRun = runNode([
      'ai/pipeline.js',
      '--continue',
      '--intent-fixture-file',
      path.relative(ROOT, repairIntentPath),
      '--batch-label',
      'full_creative_loop_repair',
    ], 'full creative loop repair');
    after = semanticPlaytestSnapshot('full-creative-loop-after');
  } else {
    after = before;
    semanticPlaytestSnapshot('full-creative-loop-after');
  }

  var beforeSummary = before.report.tickReport.summary;
  var afterSummary = after.report.tickReport.summary;
  var expectedNoRepair = !repairDecision.repairIntentDslText.trim();
  var improvementComparison = compareFullLoopImprovement(before, after);
  var beforeRate = summaryValue(beforeSummary, 'rewardReachabilityRate', 'collectibleCollectionRate');
  var afterRate = summaryValue(afterSummary, 'rewardReachabilityRate', 'collectibleCollectionRate');
  var beforeReached = summaryValue(beforeSummary, 'rewardsReached', 'collectiblesCollected');
  var afterReached = summaryValue(afterSummary, 'rewardsReached', 'collectiblesCollected');
  var comparison = {
    rewardReachabilityRateBefore: beforeRate,
    rewardReachabilityRateAfter: afterRate,
    rewardsReachedBefore: beforeReached,
    rewardsReachedAfter: afterReached,
    collectibleCollectionRateBefore: beforeRate,
    collectibleCollectionRateAfter: afterRate,
    collectiblesCollectedBefore: beforeReached,
    collectiblesCollectedAfter: afterReached,
    semanticImprovement: improvementComparison,
    improved: expectedNoRepair ? true : improvementComparison.improved,
    noRepairNeeded: expectedNoRepair,
  };
  var finalUserSummary = buildFinalUserSummary(before, after, repairDecision, improvementComparison);
  var report = {
    schemaVersion: FULL_CREATIVE_LOOP_SCHEMA_VERSION,
    owner: 'FullCreativeLoop',
    mode: 'deterministic-mock-llm-single-player',
    input: {
      userRequest: userRequest,
    },
    mockLlm: {
      requirement: requirement,
      initialIntent: initialIntent,
      repairDecision: repairDecision,
    },
    create: {
      command: createRun.label,
      semanticPlaytest: before.report,
      userReport: before.userReport,
      llmReport: before.llmReport,
      intentWorldView: before.intentWorldView,
    },
    repair: {
      command: repairRun ? repairRun.label : null,
      skipped: !repairRun,
      semanticPlaytest: after.report,
      userReport: after.userReport,
      llmReport: after.llmReport,
      intentWorldView: after.intentWorldView,
    },
    comparison: comparison,
    finalUserSummary: finalUserSummary,
    summary: {
      nextAction: comparison.improved ? 'done' : 'needs-iteration',
      createRepairLines: before.report.summary.repairLines,
      afterRepairLines: after.report.summary.repairLines,
      repairApplied: !!repairRun,
      improved: comparison.improved,
    },
  };
  assertSafeJson(report.mockLlm, 'Full creative loop mock LLM section');
  writeJson(path.join(OUTPUT_DIR, 'full-creative-loop-report.json'), report);
  writeText(path.join(OUTPUT_DIR, 'full-creative-loop-user-summary.txt'), finalUserSummary + '\n');
  return report;
}

function main() {
  var userRequest = process.argv.slice(2).join(' ').trim();
  var report = runFullCreativeLoop({ userRequest: userRequest || undefined });
  console.log('[FullCreativeLoop] ' + report.summary.nextAction + ' before=' + report.comparison.collectibleCollectionRateBefore + ' after=' + report.comparison.collectibleCollectionRateAfter);
  console.log(report.finalUserSummary);
}

if (require.main === module) {
  main();
}

module.exports = {
  FULL_CREATIVE_LOOP_SCHEMA_VERSION: FULL_CREATIVE_LOOP_SCHEMA_VERSION,
  mockRequirementModel: mockRequirementModel,
  mockIntentModel: mockIntentModel,
  mockRepairModel: mockRepairModel,
  runFullCreativeLoop: runFullCreativeLoop,
};
