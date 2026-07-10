var assert = require('assert');
var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');

var fullCreativeLoop = require('./full-creative-loop');
var loopRunner = require('./llm2-decision-loop-runner');

var ROOT = path.join(__dirname, '..');
var OUTPUT_DIR = path.join(ROOT, 'output');

function run(args, label) {
  var result = childProcess.spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(label + ' failed\nSTDOUT:\n' + result.stdout + '\nSTDERR:\n' + result.stderr);
  }
  return result.stdout;
}

function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text);
}

function assertExists(fileName) {
  assert(fs.existsSync(path.join(OUTPUT_DIR, fileName)), fileName + ' should exist');
}

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, fileName), 'utf8'));
}

function assertNoMachineLeak(value, label) {
  var text = JSON.stringify(value);
  assert(text.indexOf('"x"') < 0, label + ' should not expose x coordinates');
  assert(text.indexOf('"y"') < 0, label + ' should not expose y coordinates');
  assert(text.indexOf('componentId') < 0, label + ' should not expose component ids');
  assert(text.indexOf('bridgePlan') < 0, label + ' should not expose bridge plan');
  assert(text.indexOf('gdjs') < 0, label + ' should not expose gdjs internals');
  assert(text.indexOf('adapter') < 0, label + ' should not expose adapters');
}

function makeView(options) {
  options = options || {};
  return {
    owner: 'IntentWorldView',
    contextCache: {
      baseSemanticHash: 'hash_a',
      targetSemanticHash: 'hash_a',
      semanticCacheHit: true,
      contextMode: 'diff-only',
      diff: {
        latestIntentDslLines: ['place coins near Player front as trail count 5'],
        changedGameplayEvidence: options.evidence || [],
      },
    },
    evidence: options.evidence || [],
    sceneIntent: {
      gameplayFirst: true,
      sceneMode: 'single-scene',
      roles: [],
      uiPolicy: { role: 'supporting layer only' },
    },
    contextRequests: {
      defaultRead: options.evidence && options.evidence.length ? ['tick_event_window', 'project_world_diff'] : ['project_world_diff'],
      available: [{ id: 'tick_event_window' }, { id: 'project_world_diff' }, { id: 'ui_template_policy' }],
    },
    recommendedActions: options.actions || [],
    recommendationPolicy: {
      authority: 'candidate-only',
      finalDecisionOwner: 'LLM2',
    },
  };
}

function makeThreatTickReport() {
  return {
    eventLog: [
      { tick: 220, type: 'PressureDetected', semantic: 'pressure detected', details: { subject: 'pressure', count: 4 } },
      { tick: 260, type: 'ActorDamaged', semantic: 'actor damaged', details: { subject: 'actor', source: 'pressure' } },
    ],
    snapshots: [
      { tick: 300, state: { player: 'hurt' }, metrics: { threatsSeen: 4 } },
    ],
    summary: {
      collectibleCollectionRate: 1,
    },
  };
}

function testRegressedMeasurementCreatesStructuredRemainingIssue() {
  var memory = loopRunner.buildSemanticIterationMemory({
    userRequest: 'still feels worse',
    decisionType: 'apply_intent',
    intentDslLines: ['place coins near Player front as trail count 8'],
    beforeIntentWorldView: { contextCache: { targetSemanticHash: 'hash_before' } },
    afterIntentWorldView: { contextCache: { targetSemanticHash: 'hash_after' } },
    afterSemanticPlaytestReport: { llmReport: { tickIssues: [] } },
    improvementComparison: {
      view: 'semantic-tick-improvement-comparison',
      improved: false,
      regressed: true,
      measurements: [
        {
          measurement: 'reward_reachability',
          status: 'worsened',
          before: 0.8,
          after: 0.5,
          direction: 'increase',
        },
      ],
      summary: { compared: 1, improved: 0, worsened: 1, unchanged: 0, missing: 0 },
    },
  });
  assert(memory.latest.regressedMeasurements.indexOf('reward_reachability') >= 0, 'memory should keep the regressed measurement id');
  assert(memory.latest.remainingIssues.some(function(issue) {
    return issue.measurement === 'reward_reachability' &&
      issue.experienceDimension === 'reward_pacing' &&
      issue.gameplayRole === 'reward' &&
      issue.repairVerb === 'increase_presence';
  }), 'regressed reward reachability should become a structured remaining semantic issue');
  assert(memory.latest.nextSemanticFocus.some(function(item) {
    return item.indexOf('reward_reachability') >= 0;
  }), 'next semantic focus should mention the regressed measurement');
  assertNoMachineLeak(memory, 'regressed measurement semantic iteration memory');
}

function main() {
  testRegressedMeasurementCreatesStructuredRemainingIssue();
  var createIntent = fullCreativeLoop.mockIntentModel(fullCreativeLoop.mockRequirementModel('做一个手机跑酷游戏，金币多一点，别太难'));
  var createIntentPath = path.join(OUTPUT_DIR, 'llm2-decision-loop-base.intent.dsl');
  writeText(createIntentPath, createIntent.intentDslText);
  run([
    'ai/pipeline.js',
    '--intent-fixture-file',
    path.relative(ROOT, createIntentPath),
    '--batch-label',
    'llm2_decision_loop_base',
  ], 'decision loop base create');

  var applyReport = loopRunner.runDecisionLoop({
    userRequest: '金币多一点',
    projectMode: 'continue',
    batchLabel: 'llm2_decision_loop_apply',
  });
  assert.strictEqual(applyReport.owner, 'LLM2DecisionLoopRunner', 'apply report owner');
  assert.strictEqual(applyReport.finalDecision.decisionType, 'apply_intent', 'coin request should apply intent');
  assert.strictEqual(applyReport.summary.executed, true, 'apply decision should execute pipeline');
  assert(applyReport.summary.nextAction === 'done' || applyReport.summary.nextAction === 'needs_iteration', 'apply report should be replayable after execution');
  assert(applyReport.intentDslText.indexOf('place ') >= 0, 'apply report should contain Intent DSL');
  assert.strictEqual(applyReport.improvementComparison.view, 'semantic-tick-improvement-comparison', 'apply report should include semantic improvement comparison');
  assert(applyReport.improvementComparison.measurements.length > 0, 'semantic improvement comparison should compare measurements');
  assert.strictEqual(applyReport.summary.improved, applyReport.improvementComparison.improved, 'summary improved should come from semantic comparison');
  assert(applyReport.semanticIterationMemory, 'apply report should create semantic iteration memory');
  assert.strictEqual(applyReport.semanticIterationMemory.contextKind, 'semantic-iteration-memory', 'semantic iteration memory should declare context kind');
  assert(applyReport.semanticIterationMemory.latest.improvedMeasurements.indexOf('reward_reachability') >= 0, 'semantic iteration memory should preserve reward reachability improvement');
  assertNoMachineLeak(applyReport.semanticIterationMemory, 'apply report semantic iteration memory');
  var appliedCountMatch = applyReport.intentDslText.match(/\bcount\s+(\d+)\b/);
  assert(appliedCountMatch, 'apply report should keep the target semantic placement count');
  var appliedRewardCount = Number(appliedCountMatch[1]);
  assert.strictEqual(
    applyReport.after.semanticSummary.rewardsAvailable,
    appliedRewardCount,
    'continue reward placement should merge to the semantic target count instead of appending to existing rewards'
  );
  assert(
    applyReport.after.semanticSummary.rewardsAvailable < applyReport.before.semanticSummary.rewardsAvailable + appliedRewardCount,
    'continue reward placement should not duplicate old reward instances plus the target count'
  );

  ['llm2-decision-loop-report.json', 'llm2-decision-loop.intent.dsl', 'llm2-decision-loop-context-route.json', 'llm2-decision-loop-provided-context.json', 'semantic-iteration-memory.json'].forEach(assertExists);
  var persistedMemory = readJson('semantic-iteration-memory.json');
  assert.strictEqual(persistedMemory.scope.afterSemanticHash, applyReport.after.intentWorldView.contextCache.targetSemanticHash, 'semantic iteration memory should bind to the after world hash');
  assertNoMachineLeak(persistedMemory, 'persisted semantic iteration memory');

  var followUpInputs = loopRunner.loadCurrentLoopInputs({});
  assert(followUpInputs.intentWorldView.semanticIterationMemory, 'next LLM2 inputs should include matching semantic iteration memory');
  assert.strictEqual(
    followUpInputs.intentWorldView.semanticIterationMemory.scope.afterSemanticHash,
    followUpInputs.intentWorldView.contextCache.targetSemanticHash,
    'next LLM2 semantic memory should match the current world hash'
  );
  assert(followUpInputs.intentWorldView.semanticIterationMemory.latest.improvedMeasurements.indexOf('reward_reachability') >= 0, 'next LLM2 context should remember reward reachability improvement');
  assertNoMachineLeak(followUpInputs.intentWorldView.semanticIterationMemory, 'next LLM2 semantic iteration memory');

  var remixReport = loopRunner.runDecisionLoop({
    userRequest: '还是有点难',
    projectMode: 'continue',
    execute: false,
    outputs: {
      report: 'llm2-decision-loop-remix-report.json',
      intentDsl: 'llm2-decision-loop-remix.intent.dsl',
      contextRoute: 'llm2-decision-loop-remix-context-route.json',
      providedContext: 'llm2-decision-loop-remix-provided-context.json',
    },
  });
  assert(remixReport.before.intentWorldView.semanticIterationMemory, 'remix turn should read semantic iteration memory');
  assert.strictEqual(remixReport.firstDecision.decisionType, 'request_context', 'difficulty remix should request focused context first');
  var remainingIssues = remixReport.before.intentWorldView.semanticIterationMemory.latest.remainingIssues || [];
  if (remainingIssues.length) {
    assert.strictEqual(remixReport.finalDecision.decisionType, 'apply_intent', 'difficulty remix should apply when semantic memory has remaining issues');
    assert.strictEqual(remixReport.finalDecision.selectedAction.experienceDimension, remainingIssues[0].experienceDimension, 'remix should focus the remaining semantic dimension');
    assert.strictEqual(remixReport.finalDecision.selectedAction.repairVerb, remainingIssues[0].repairVerb, 'remix should keep remaining semantic repair verb');
  } else {
    assert.strictEqual(remixReport.finalDecision.decisionType, 'no_op', 'difficulty remix should not invent Intent DSL when memory has no remaining issue');
    assert.strictEqual(remixReport.summary.executed, false, 'no-op remix should not execute pipeline');
    assert.strictEqual(remixReport.intentDslText, '', 'no-op remix should not emit Intent DSL');
  }
  assertNoMachineLeak(remixReport.before.intentWorldView.semanticIterationMemory, 'remix report semantic iteration memory');

  var threatReport = loopRunner.runDecisionLoop({
    userRequest: '怪别太密',
    projectMode: 'continue',
    execute: false,
    intentWorldView: makeView({
      evidence: [{ tick: 220, issue: 'pressure_balance_high', meaning: 'pressure balance high' }],
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
    }),
    tickReport: makeThreatTickReport(),
    semanticPlaytestReport: { tickReport: makeThreatTickReport() },
    outputs: {
      report: 'llm2-decision-loop-threat-report.json',
      intentDsl: 'llm2-decision-loop-threat.intent.dsl',
      contextRoute: 'llm2-decision-loop-threat-context-route.json',
      providedContext: 'llm2-decision-loop-threat-provided-context.json',
    },
  });
  assert.strictEqual(threatReport.firstDecision.decisionType, 'request_context', 'threat report should first request context');
  assert.strictEqual(threatReport.providedContext.owner, 'LLM2ContextProvider', 'threat report should provide context');
  assert.strictEqual(threatReport.finalDecision.decisionType, 'apply_intent', 'threat report should apply after context');
  assert.strictEqual(threatReport.summary.executed, false, 'execute=false should not run pipeline');

  var uiReport = loopRunner.runDecisionLoop({
    userRequest: '按钮换个酷炫图标',
    projectMode: 'continue',
    execute: false,
    intentWorldView: makeView({ evidence: [] }),
    semanticPlaytestReport: { tickReport: { summary: { collectibleCollectionRate: 1 }, eventLog: [], snapshots: [] } },
    outputs: {
      report: 'llm2-decision-loop-ui-report.json',
      intentDsl: 'llm2-decision-loop-ui.intent.dsl',
      contextRoute: 'llm2-decision-loop-ui-context-route.json',
      providedContext: 'llm2-decision-loop-ui-provided-context.json',
    },
  });
  assert.strictEqual(uiReport.finalDecision.decisionType, 'reject', 'UI icon request should reject gameplay Intent');
  assert.strictEqual(uiReport.summary.executed, false, 'reject should not execute pipeline');

  var noOpReport = loopRunner.runDecisionLoop({
    userRequest: '再看一下',
    projectMode: 'continue',
    execute: false,
    intentWorldView: makeView({ evidence: [] }),
    semanticPlaytestReport: { tickReport: { summary: { collectibleCollectionRate: 1 }, eventLog: [], snapshots: [] } },
    outputs: {
      report: 'llm2-decision-loop-noop-report.json',
      intentDsl: 'llm2-decision-loop-noop.intent.dsl',
      contextRoute: 'llm2-decision-loop-noop-context-route.json',
      providedContext: 'llm2-decision-loop-noop-provided-context.json',
    },
  });
  assert.strictEqual(noOpReport.finalDecision.decisionType, 'no_op', 'no issue request should no-op');
  assert.strictEqual(noOpReport.summary.executed, false, 'no-op should not execute pipeline');

  console.log('[LLM2DecisionLoopRunner] apply/request-context/reject/no-op loop passed');
}

main();
