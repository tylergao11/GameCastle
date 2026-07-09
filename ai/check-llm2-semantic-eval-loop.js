var assert = require('assert');
var fs = require('fs');
var path = require('path');

var semanticEvalLoop = require('./llm2-semantic-eval-loop');

var ROOT = path.join(__dirname, '..');
var OUTPUT_DIR = path.join(ROOT, 'output');

function assertExists(filePath) {
  assert(fs.existsSync(filePath), filePath + ' should exist');
}

function assertNoMachineLeak(value, label) {
  var text = JSON.stringify(value);
  assert(text.indexOf('"x"') < 0, label + ' should not expose x coordinates');
  assert(text.indexOf('"y"') < 0, label + ' should not expose y coordinates');
  assert(text.indexOf('componentId') < 0, label + ' should not expose component ids');
  assert(text.indexOf('bridgePlan') < 0, label + ' should not expose bridge plan');
  assert(text.indexOf('gdjs') < 0, label + ' should not expose gdjs internals');
}

function byId(report, id) {
  return report.cases.find(function(item) { return item.id === id; });
}

function main() {
  var report = semanticEvalLoop.runSemanticEvalLoop({
    cases: semanticEvalLoop.DEFAULT_EVAL_CASES,
    outputPrefix: 'llm2-semantic-eval',
  });

  assert.strictEqual(report.owner, 'LLM2SemanticEvalLoop', 'report owner');
  assert.strictEqual(report.scenarioCount, semanticEvalLoop.DEFAULT_EVAL_CASES.length, 'scenario count');
  assert(report.scenarioCount >= 6, 'eval should cover a meaningful natural language set');
  assert.strictEqual(report.summary.failed, 0, 'all semantic eval cases should pass');
  assert(report.summary.applyIntent >= 2, 'eval should include apply_intent cases');
  assert(report.summary.requestContext >= 1, 'eval should include request_context cases');
  assert(report.summary.reject >= 1, 'eval should include reject cases');
  assert(report.summary.noOp >= 1, 'eval should include no_op cases');
  assert(report.summary.executed >= 1, 'at least one case should execute the pipeline');
  assert(report.summary.cacheModes.length >= 2, 'eval should exercise more than one context cache mode');

  var coinCase = byId(report, 'coin_more_execute');
  assert(coinCase, 'coin_more_execute case should exist');
  assert.strictEqual(coinCase.finalDecisionType, 'apply_intent', 'coin request should apply intent');
  assert.strictEqual(coinCase.executed, true, 'coin request should execute');
  assert(coinCase.before && coinCase.after, 'executed case should record before and after');
  assert(coinCase.before.tickSummary, 'executed case should record before tick summary');
  assert(coinCase.after.tickSummary, 'executed case should record after tick summary');
  assert.strictEqual(coinCase.improvementComparison.view, 'semantic-tick-improvement-comparison', 'executed case should record semantic improvement comparison');
  assert(coinCase.improvementComparison.measurements.some(function(item) {
    return item.measurement === 'reward_reachability' && item.status === 'improved';
  }), 'executed case should prove reward reachability improvement');
  assert(coinCase.transcriptPath, 'executed case should have transcript path');

  var threatCase = byId(report, 'enemy_density_context');
  assert(threatCase, 'enemy_density_context case should exist');
  assert.strictEqual(threatCase.firstDecisionType, 'request_context', 'enemy density should request context first');
  assert.strictEqual(threatCase.finalDecisionType, 'apply_intent', 'enemy density should apply after context');
  assert.strictEqual(threatCase.contextRequested, true, 'enemy density should mark context requested');
  assert(threatCase.providedContextIds.indexOf('tick_event_window') >= 0, 'enemy density should get tick event context');
  assert.strictEqual(threatCase.executed, false, 'enemy density fixture should avoid mutating the shared project');

  var uiCase = byId(report, 'ui_icon_reject');
  assert(uiCase, 'ui_icon_reject case should exist');
  assert.strictEqual(uiCase.finalDecisionType, 'reject', 'pure UI icon request should reject gameplay patch');

  var noOpCase = byId(report, 'look_again_noop');
  assert(noOpCase, 'look_again_noop case should exist');
  assert.strictEqual(noOpCase.finalDecisionType, 'no_op', 'look again should no-op on stable evidence');

  report.cases.forEach(function(result) {
    assertExists(path.join(ROOT, result.transcriptPath));
    assert(result.contextRouteMode, result.id + ' should record context route mode');
    assert(result.verifierPassed, result.id + ' decision verifier should pass');
    assertNoMachineLeak(result, result.id);
  });

  assertExists(path.join(OUTPUT_DIR, 'llm2-semantic-eval-report.json'));
  assertExists(path.join(OUTPUT_DIR, 'llm2-semantic-eval-summary.txt'));
  assertExists(path.join(OUTPUT_DIR, 'llm2-semantic-eval-transcripts', 'coin_more_execute.json'));
  assertExists(path.join(OUTPUT_DIR, 'llm2-semantic-eval-transcripts', 'enemy_density_context.json'));
  var humanSummary = fs.readFileSync(path.join(OUTPUT_DIR, 'llm2-semantic-eval-summary.txt'), 'utf8');
  assert(humanSummary.indexOf('improvedMeasurements=') >= 0, 'human summary should expose improved measurements');
  assert(humanSummary.indexOf('reward_reachability') >= 0, 'human summary should name reward reachability improvement');
  var coinTranscript = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'llm2-semantic-eval-transcripts', 'coin_more_execute.json'), 'utf8'));
  assert.strictEqual(coinTranscript.improvementComparison.view, 'semantic-tick-improvement-comparison', 'transcript should persist improvement comparison');
  assertNoMachineLeak(coinTranscript.improvementComparison, 'transcript improvement comparison');

  console.log('[LLM2SemanticEvalLoop] ' + report.scenarioCount + ' semantic eval cases passed');
}

main();
