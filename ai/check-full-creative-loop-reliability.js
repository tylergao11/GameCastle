var assert = require('assert');
var fs = require('fs');
var path = require('path');

var fullCreativeLoop = require('./full-creative-loop');

var ROOT = path.join(__dirname, '..');
var OUTPUT_DIR = path.join(ROOT, 'output');

var SCENARIOS = [
  {
    id: 'collectible_repair',
    userRequest: '做一个手机跑酷游戏，金币多一点，别太难',
    expectedRepair: true,
  },
  {
    id: 'sparse_collectible_repair',
    userRequest: '做一个手机平台跳跃游戏，金币少一点，先看看系统会不会补',
    expectedRepair: true,
  },
  {
    id: 'already_playable_no_repair',
    userRequest: '做一个手机平台跳跃游戏，金币够多，不用修',
    expectedRepair: false,
  },
  {
    id: 'english_stable_no_repair',
    userRequest: 'make a mobile platformer with enough collectibles and stable pacing',
    expectedRepair: false,
  },
];

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function assertNoMachineLeak(value, label) {
  var text = JSON.stringify(value);
  assert(text.indexOf('"x"') < 0, label + ' should not expose x coordinates');
  assert(text.indexOf('"y"') < 0, label + ' should not expose y coordinates');
  assert(text.indexOf('componentId') < 0, label + ' should not expose component ids');
  assert(text.indexOf('bridgePlan') < 0, label + ' should not expose bridge plan');
  assert(text.indexOf('gdjs') < 0, label + ' should not expose gdjs internals');
}

function summarizeScenario(scenario, report) {
  var scenarioDir = path.join(OUTPUT_DIR, 'full-creative-loop-reliability', scenario.id);
  writeJson(path.join(scenarioDir, 'report.json'), report);
  return {
    id: scenario.id,
    userRequest: scenario.userRequest,
    expectedRepair: scenario.expectedRepair,
    repairApplied: report.summary.repairApplied,
    createRepairLines: report.summary.createRepairLines,
    afterRepairLines: report.summary.afterRepairLines,
    beforeRate: report.comparison.collectibleCollectionRateBefore,
    afterRate: report.comparison.collectibleCollectionRateAfter,
    beforeCollected: report.comparison.collectiblesCollectedBefore,
    afterCollected: report.comparison.collectiblesCollectedAfter,
    semanticImprovement: report.comparison.semanticImprovement,
    improved: report.comparison.improved,
    noRepairNeeded: report.comparison.noRepairNeeded,
    finalUserSummary: report.finalUserSummary,
    selectedAction: report.mockLlm.repairDecision.selectedAction,
  };
}

function comparableResult(report) {
  return {
    repairIntentDslLines: report.mockLlm.repairDecision.repairIntentDslLines,
    beforeRate: report.comparison.collectibleCollectionRateBefore,
    afterRate: report.comparison.collectibleCollectionRateAfter,
    beforeCollected: report.comparison.collectiblesCollectedBefore,
    afterCollected: report.comparison.collectiblesCollectedAfter,
    semanticImprovement: report.comparison.semanticImprovement,
    repairApplied: report.summary.repairApplied,
    createRepairLines: report.summary.createRepairLines,
    afterRepairLines: report.summary.afterRepairLines,
    finalUserSummary: report.finalUserSummary,
    selectedAction: report.mockLlm.repairDecision.selectedAction,
  };
}

function main() {
  var summaries = SCENARIOS.map(function(scenario) {
    var report = fullCreativeLoop.runFullCreativeLoop({
      userRequest: scenario.userRequest,
    });
    assert.strictEqual(report.owner, 'FullCreativeLoop', scenario.id + ' should produce FullCreativeLoop report');
    assert.strictEqual(report.summary.nextAction, 'done', scenario.id + ' should finish as done');
    assert.strictEqual(report.summary.repairApplied, scenario.expectedRepair, scenario.id + ' repairApplied should match expectation');
    assert.strictEqual(report.comparison.noRepairNeeded, !scenario.expectedRepair, scenario.id + ' noRepairNeeded should match expectation');
    assert(report.create.semanticPlaytest.tickReport.eventLog.length > 0, scenario.id + ' should produce create EventLog');
    assert(report.create.semanticPlaytest.tickReport.snapshots.length > 0, scenario.id + ' should produce create Snapshot');
    assert.strictEqual(report.create.intentWorldView.owner, 'IntentWorldView', scenario.id + ' should produce create IntentWorldView');
    assert.strictEqual(report.create.intentWorldView.sceneIntent.uiPolicy.role, 'supporting layer only', scenario.id + ' UI should stay supporting');
    assert.strictEqual(report.create.intentWorldView.recommendationPolicy.authority, 'candidate-only', scenario.id + ' recommendations should be candidate-only');
    assert.strictEqual(report.mockLlm.repairDecision.decision.owner, 'LLM2DecisionRuntime', scenario.id + ' repair should run through Decision Runtime');
    assert.strictEqual(report.mockLlm.repairDecision.decision.verifier.passed, true, scenario.id + ' decision verifier should pass');
    assert.strictEqual(report.mockLlm.repairDecision.decisionSource, 'llm2-context-cache-router.dynamicTail.candidateActions', scenario.id + ' repair should read routed candidate actions');
    assert.strictEqual(report.mockLlm.repairDecision.contextRoute.providerCacheModel.cacheKind, 'text-kv-prefix', scenario.id + ' route should use DeepSeek text KV cache model');
    assert.strictEqual(report.mockLlm.repairDecision.contextRoute.providerCacheModel.reusableAcrossModalities, false, scenario.id + ' route should not reuse multimodal cache assumptions');
    assert.strictEqual(report.mockLlm.repairDecision.contextReadPolicy.recommendationAuthority, 'candidate-only', scenario.id + ' repair should treat recommendations as candidates');
    assert(report.repair.semanticPlaytest.tickReport.eventLog.length > 0, scenario.id + ' should produce after EventLog');
    assert(report.repair.semanticPlaytest.tickReport.snapshots.length > 0, scenario.id + ' should produce after Snapshot');
    assert.strictEqual(report.repair.intentWorldView.owner, 'IntentWorldView', scenario.id + ' should produce after IntentWorldView');
    assertNoMachineLeak(report.mockLlm, scenario.id + ' mock LLM');
    if (scenario.expectedRepair) {
      assert(report.mockLlm.repairDecision.repairIntentDslLines.length > 0, scenario.id + ' should have repair Intent lines');
      assert(report.comparison.collectibleCollectionRateAfter > report.comparison.collectibleCollectionRateBefore, scenario.id + ' should improve collection rate');
      assert(report.comparison.collectiblesCollectedAfter > report.comparison.collectiblesCollectedBefore, scenario.id + ' should collect more after repair');
      assert.strictEqual(report.comparison.semanticImprovement.view, 'semantic-tick-improvement-comparison', scenario.id + ' should compare semantic measurements');
      assert.strictEqual(report.comparison.semanticImprovement.improved, true, scenario.id + ' should prove semantic improvement');
      assert(report.comparison.semanticImprovement.measurements.some(function(item) {
        return item.status === 'improved';
      }), scenario.id + ' should name improved measurements');
    } else {
      assert.strictEqual(report.mockLlm.repairDecision.repairIntentDslLines.length, 0, scenario.id + ' should not invent repair Intent');
      assert.strictEqual(report.summary.createRepairLines, 0, scenario.id + ' should have no initial repair lines');
      assert.strictEqual(report.comparison.collectibleCollectionRateAfter, report.comparison.collectibleCollectionRateBefore, scenario.id + ' no-repair after rate should match before');
    }
    return summarizeScenario(scenario, report);
  });
  var repeatScenario = SCENARIOS[0];
  var repeatA = fullCreativeLoop.runFullCreativeLoop({ userRequest: repeatScenario.userRequest });
  var repeatB = fullCreativeLoop.runFullCreativeLoop({ userRequest: repeatScenario.userRequest });
  assert.deepStrictEqual(
    comparableResult(repeatB),
    comparableResult(repeatA),
    'same deterministic creative-loop scenario should produce repeatable core evidence'
  );

  var reliabilityReport = {
    schemaVersion: 1,
    owner: 'FullCreativeLoopReliability',
    scenarioCount: summaries.length,
    scenarios: summaries,
    repeatability: {
      scenarioId: repeatScenario.id,
      first: comparableResult(repeatA),
      second: comparableResult(repeatB),
      matched: true,
    },
    summary: {
      passed: summaries.length,
      repairScenarios: summaries.filter(function(item) { return item.repairApplied; }).length,
      noRepairScenarios: summaries.filter(function(item) { return !item.repairApplied; }).length,
      repeatabilityChecks: 1,
    },
  };
  writeJson(path.join(OUTPUT_DIR, 'full-creative-loop-reliability-report.json'), reliabilityReport);
  assert.strictEqual(reliabilityReport.summary.repairScenarios, 2, 'should cover multiple repair scenarios');
  assert.strictEqual(reliabilityReport.summary.noRepairScenarios, 2, 'should cover multiple no-repair scenarios');
  console.log('[FullCreativeLoopReliability] ' + summaries.length + ' scenarios passed');
}

main();
