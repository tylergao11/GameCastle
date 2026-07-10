var assert = require('assert');
var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');

var projectWorld = require('./project-world');
var semanticFeedback = require('./semantic-feedback');
var tickPlaytestRuntime = require('./tick-playtest-runtime');

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

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function writeJson(relativePath, value) {
  fs.writeFileSync(path.join(ROOT, relativePath), JSON.stringify(value, null, 2));
}

function writeText(relativePath, value) {
  fs.writeFileSync(path.join(ROOT, relativePath), value);
}

function lastRun() {
  var ledger = readJson('output/execution-ledger.json');
  return ledger.runs[ledger.runs.length - 1];
}

function makePlayPolicyFromLlmSafeViews(worldContext, semanticMappingView) {
  assert.strictEqual(semanticMappingView.view, 'llm-safe-semantic-mapping', 'policy builder should receive LLM-safe semantic mapping');
  assert(worldContext && worldContext.scenes && worldContext.scenes.length, 'policy builder should receive LLM-safe ProjectWorld');
  var eventNames = semanticMappingView.eventMeanings.map(function(event) { return event.event; });
  assert(eventNames.indexOf('RewardReached') >= 0, 'semantic mapping should describe reward reach events');
  return tickPlaytestRuntime.buildDefaultPlayPolicy({
    owner: 'LLMFixturePolicyBuilder',
    durationTicks: 600,
    goals: ['survive', 'collect'],
    intents: ['move-forward', 'jump-when-needed', 'collect-reachable', 'avoid-threats'],
    thresholds: {
      minRewardReachabilityRate: 0.6,
      minSurvivalTicks: 480,
      maxEarlyPressure: 1,
    },
    roleBindings: {
      actorSubject: 'Player',
      rewardSubject: 'coins',
      pressureSubject: 'enemies',
      actionEntrySubject: 'JumpButton',
    },
  });
}

function assertNoMachineLeak(value, label) {
  var text = JSON.stringify(value);
  assert(text.indexOf('"x"') < 0, label + ' should not expose x coordinates');
  assert(text.indexOf('"y"') < 0, label + ' should not expose y coordinates');
  assert(text.indexOf('componentId') < 0, label + ' should not expose component ids');
  assert(text.indexOf('bridgePlan') < 0, label + ' should not expose bridge plan');
  assert(text.indexOf('gdjs') < 0, label + ' should not expose gdjs internals');
}

function assertHtmlRuntimeScripts() {
  var html = fs.readFileSync(path.join(OUTPUT_DIR, 'game.html'), 'utf8');
  assert(html.indexOf('intent-runtime.js') >= 0, 'output game.html should load intent runtime');
  assert(html.indexOf('tick-runtime.js') >= 0, 'output game.html should load tick runtime');
}

function runTickLoopForCurrentWorld(policy, label) {
  var mapping = semanticFeedback.loadSemanticMapping();
  var world = readJson('output/project-world.json');
  var report = tickPlaytestRuntime.runTickPlaytest({
    projectWorld: world,
    semanticMapping: mapping,
    playPolicy: policy,
  });
  writeJson('output/' + label + '.json', report);
  assert.strictEqual(report.owner, 'TickPlaytestRuntime', label + ' should be owned by tick runtime');
  assert(report.eventLog.length >= 3, label + ' should record tick events');
  assert(report.snapshots.length >= 3, label + ' should record snapshots');
  assert(report.eventLog.some(function(event) { return event.type === 'ActorIntent'; }), label + ' should record actor intent ticks');
  return report;
}

function main() {
  run([
    'ai/pipeline.js',
    '--intent-fixture-file',
    'ai/fixtures/intent-parkour-real.dsl',
    '--batch-label',
    'tick_playtest_create_real',
  ], 'real create for tick playtest');

  var createRun = lastRun();
  assert.strictEqual(createRun.summary.nextAction, 'done', 'real create should finish before tick playtest');
  assertHtmlRuntimeScripts();

  var mappingView = semanticFeedback.buildSemanticMappingLlmView();
  var safeWorld = projectWorld.sanitizeProjectWorldForIntentPrompt(readJson('output/project-world.json'));
  var playPolicy = makePlayPolicyFromLlmSafeViews(safeWorld, mappingView);
  tickPlaytestRuntime.validatePlayPolicy(playPolicy);
  assertNoMachineLeak(safeWorld, 'ProjectWorld LLM view');
  assertNoMachineLeak(mappingView, 'semantic mapping LLM view');
  assertNoMachineLeak(playPolicy, 'PlayPolicy');
  writeJson('output/tick-playtest-policy.json', playPolicy);

  var beforeReport = runTickLoopForCurrentWorld(playPolicy, 'tick-playtest-report-before');
  assert(beforeReport.summary.rewardsAvailable > 0, 'tick run should discover reward role from world facts');
  assert(beforeReport.feedbackIssues.length > 0, 'tick run should produce semantic feedback issues');
  assert(beforeReport.feedbackIssues[0].evidence && typeof beforeReport.feedbackIssues[0].evidence.tick === 'number', 'tick issue should carry tick evidence');

  var feedback = semanticFeedback.analyzeSemanticFeedback({
    projectWorld: readJson('output/project-world.json'),
    executionReport: createRun,
    probeReport: {
      summary: {
        mode: 'llm-guided-tick-pseudo-run',
        durationTicks: beforeReport.summary.durationTicks,
        rewardReachabilityRate: beforeReport.summary.rewardReachabilityRate,
      },
      issues: beforeReport.feedbackIssues,
    },
  });
  assert.strictEqual(feedback.summary.nextAction, 'repair-intent', 'tick feedback should request repair Intent');
  assert(feedback.repairIntentDslText.indexOf('x=') < 0, 'tick repair Intent should not contain coordinates');
  assert(feedback.issues[0].evidence && typeof feedback.issues[0].evidence.tick === 'number', 'semantic feedback should preserve tick evidence');
  writeJson('output/tick-playtest-semantic-feedback.json', feedback);
  writeText('output/tick-playtest-repair.intent.dsl', feedback.repairIntentDslText);

  run([
    'ai/pipeline.js',
    '--continue',
    '--intent-fixture-file',
    'output/tick-playtest-repair.intent.dsl',
    '--batch-label',
    'tick_playtest_repair_real',
  ], 'real repair from tick feedback');

  var repairRun = lastRun();
  assert.strictEqual(repairRun.summary.nextAction, 'done', 'tick repair should finish');
  assert.notStrictEqual(repairRun.targetSemanticHash, createRun.targetSemanticHash, 'tick repair should change semantic world hash');
  assertHtmlRuntimeScripts();

  var afterReport = runTickLoopForCurrentWorld(playPolicy, 'tick-playtest-report-after');
  assert(
    afterReport.summary.rewardReachabilityRate > beforeReport.summary.rewardReachabilityRate,
    'rerun should improve reward reachability rate'
  );
  assert(
    afterReport.summary.rewardsReached > beforeReport.summary.rewardsReached,
    'rerun should reach more rewards'
  );

  var runtimeSource = fs.readFileSync(path.join(__dirname, 'tick-playtest-runtime.js'), 'utf8');
  assert(runtimeSource.indexOf('parkour') < 0, 'tick runtime must not hard-code parkour');

  console.log('[LlmGuidedTickPlaytestLoop] create -> playpolicy -> tick -> feedback -> repair -> rerun improvement passed');
  console.log('[LlmGuidedTickPlaytestLoop] before rate=' + beforeReport.summary.rewardReachabilityRate + ' after rate=' + afterReport.summary.rewardReachabilityRate);
}

main();
