var assert = require('assert');
var fs = require('fs');
var path = require('path');

var fullCreativeLoop = require('./full-creative-loop');

var ROOT = path.join(__dirname, '..');
var OUTPUT_DIR = path.join(ROOT, 'output');

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, fileName), 'utf8'));
}

function readText(fileName) {
  return fs.readFileSync(path.join(OUTPUT_DIR, fileName), 'utf8');
}

function assertExists(fileName) {
  assert(fs.existsSync(path.join(OUTPUT_DIR, fileName)), fileName + ' should exist');
}

function assertNoMachineLeak(value, label) {
  var text = JSON.stringify(value);
  assert(text.indexOf('"x"') < 0, label + ' should not expose x coordinates');
  assert(text.indexOf('"y"') < 0, label + ' should not expose y coordinates');
  assert(text.indexOf('componentId') < 0, label + ' should not expose component ids');
  assert(text.indexOf('bridgePlan') < 0, label + ' should not expose bridge plan');
  assert(text.indexOf('gdjs') < 0, label + ' should not expose gdjs internals');
}

function makeThreatIntentWorldView() {
  return {
    owner: 'IntentWorldView',
    contextCache: {
      baseSemanticHash: 'hash_a',
      targetSemanticHash: 'hash_a',
      semanticCacheHit: true,
    },
    evidence: [{ tick: 220, issue: 'pressure_balance_high', meaning: 'pressure balance high' }],
    contextRequests: {
      defaultRead: ['tick_event_window', 'project_world_diff'],
      available: [{ id: 'tick_event_window' }, { id: 'project_world_diff' }],
    },
    recommendedActions: [
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
    recommendationPolicy: {
      authority: 'candidate-only',
      finalDecisionOwner: 'LLM2',
    },
  };
}

function main() {
  var report = fullCreativeLoop.runFullCreativeLoop({
    userRequest: '做一个手机跑酷游戏，金币多一点，别太难',
  });
  assert.strictEqual(report.owner, 'FullCreativeLoop', 'report should declare owner');
  assert.strictEqual(report.mode, 'deterministic-mock-llm-single-player', 'loop should use deterministic Mock LLM mode');
  assert.strictEqual(report.summary.nextAction, 'done', 'full creative loop should finish after repair');
  assert(report.mockLlm.initialIntent.intentDslText.indexOf('make a mobile parkour platformer') >= 0, 'Mock LLM should generate initial Intent DSL');
  assert.strictEqual(report.mockLlm.repairDecision.decisionSource, 'llm2-context-cache-router.dynamicTail.candidateActions', 'Mock LLM repair should read routed candidate actions');
  assert.strictEqual(report.mockLlm.repairDecision.decision.owner, 'LLM2DecisionRuntime', 'Mock LLM repair should run through Decision Runtime');
  assert.strictEqual(report.mockLlm.repairDecision.decision.decisionType, 'apply_intent', 'repair decision should apply Intent DSL');
  assert.strictEqual(report.mockLlm.repairDecision.decision.verifier.passed, true, 'repair decision verifier should pass');
  assert(report.mockLlm.repairDecision.contextRoute, 'Mock LLM repair should expose context route');
  assert.strictEqual(report.mockLlm.repairDecision.contextRoute.providerCacheModel.cacheKind, 'text-kv-prefix', 'context route should model DeepSeek text KV prefix cache');
  assert.strictEqual(report.mockLlm.repairDecision.contextRoute.providerCacheModel.reusableAcrossModalities, false, 'context route should not reuse multimodal cache assumptions');
  assert.strictEqual(report.mockLlm.repairDecision.contextReadPolicy.recommendationAuthority, 'candidate-only', 'Mock LLM should treat recommendations as candidates');
  assert(report.mockLlm.repairDecision.contextReadPolicy.available.indexOf('tick_event_window') >= 0, 'Mock LLM should have access to focused tick context');
  assert.strictEqual(report.mockLlm.repairDecision.selectedAction.action, 'apply_semantic_repair', 'Mock LLM should choose the unified semantic repair action');
  assert.strictEqual(report.mockLlm.repairDecision.selectedAction.experienceDimension, 'reward_pacing', 'Mock LLM should preserve gameplay pacing dimension');
  assert.strictEqual(report.mockLlm.repairDecision.selectedAction.repairVerb, 'increase_presence', 'Mock LLM should preserve the repair verb');
  assert.strictEqual(report.mockLlm.repairDecision.selectedAction.repairAction, undefined, 'Mock LLM should not expose internal repair action ids');
  assert(report.mockLlm.repairDecision.repairIntentDslText.indexOf('place ') >= 0, 'Mock LLM should choose executable repair Intent');
  assert(report.create.semanticPlaytest.tickReport.eventLog.length > 0, 'create playtest should include EventLog');
  assert(report.create.semanticPlaytest.tickReport.snapshots.length > 0, 'create playtest should include Snapshot');
  assert.strictEqual(report.create.intentWorldView.owner, 'IntentWorldView', 'create should include IntentWorldView');
  assert.strictEqual(report.create.intentWorldView.sceneIntent.uiPolicy.role, 'supporting layer only', 'create IntentWorldView should keep UI supporting');
  assert(report.create.llmReport.tickIssues[0].evidence.tick >= 0, 'create LLM report should preserve tick evidence');
  assert(report.repair.semanticPlaytest.tickReport.eventLog.length > 0, 'repair playtest should include EventLog');
  assert.strictEqual(report.repair.intentWorldView.owner, 'IntentWorldView', 'repair should include IntentWorldView');
  assert(report.comparison.improved, 'repair pass should improve metrics');
  assert.strictEqual(report.comparison.semanticImprovement.view, 'semantic-tick-improvement-comparison', 'full loop should report semantic improvement comparison');
  assert(report.comparison.semanticImprovement.measurements.some(function(item) {
    return item.measurement === 'reward_reachability' && item.status === 'improved';
  }), 'full loop should prove reward reachability improved');
  assert(report.comparison.collectibleCollectionRateAfter > report.comparison.collectibleCollectionRateBefore, 'collection rate should improve');
  assert(report.comparison.collectiblesCollectedAfter > report.comparison.collectiblesCollectedBefore, 'collected count should improve');
  assert(report.finalUserSummary.indexOf('已完成一次自动创作闭环') >= 0, 'loop should produce final user summary');
  assertNoMachineLeak(report.mockLlm, 'Mock LLM output');

  var threatRepair = fullCreativeLoop.mockRepairModel(makeThreatIntentWorldView(), {
    userRequest: '怪别太密',
    projectMode: 'continue',
    tickReport: {
      eventLog: [
        { tick: 220, type: 'PressureDetected', semantic: 'pressure detected', details: { subject: 'pressure', count: 4 } },
        { tick: 260, type: 'ActorDamaged', semantic: 'actor damaged', details: { subject: 'actor', source: 'pressure' } },
      ],
      snapshots: [
        { tick: 300, state: { player: 'hurt' }, metrics: { threatsSeen: 4 } },
      ],
    },
  });
  assert.strictEqual(threatRepair.providedContext.owner, 'LLM2ContextProvider', 'threat repair should use ContextProvider');
  assert.strictEqual(threatRepair.providedContext.contexts.tick_event_window.events.length, 2, 'ContextProvider should provide focused tick window');
  assert.strictEqual(threatRepair.decision.decisionType, 'apply_intent', 'threat repair should apply after context');
  assert.strictEqual(threatRepair.repairIntentDslLines[0], 'reduce enemy pressure near Player early route', 'threat repair should use second decision Intent DSL');

  [
    'full-creative-loop-create.intent.dsl',
    'full-creative-loop-before-semantic-playtest-report.json',
    'full-creative-loop-before-semantic-playtest-llm-report.json',
    'full-creative-loop-before-semantic-playtest-user-report.json',
    'full-creative-loop-before-intent-world-view.json',
    'full-creative-loop-before-repair.intent.dsl',
    'full-creative-loop-repair-context-route.json',
    'full-creative-loop-repair.intent.dsl',
    'full-creative-loop-after-semantic-playtest-report.json',
    'full-creative-loop-after-semantic-playtest-llm-report.json',
    'full-creative-loop-after-semantic-playtest-user-report.json',
    'full-creative-loop-after-intent-world-view.json',
    'full-creative-loop-report.json',
    'full-creative-loop-user-summary.txt',
  ].forEach(assertExists);

  var savedReport = readJson('full-creative-loop-report.json');
  var savedRoute = readJson('full-creative-loop-repair-context-route.json');
  var savedSummary = readText('full-creative-loop-user-summary.txt');
  assert.strictEqual(savedReport.summary.nextAction, 'done', 'saved report should be done');
  assert.strictEqual(savedRoute.owner, 'LLM2ContextCacheRouter', 'saved route should be owned by router');
  assert(savedSummary.indexOf('修复有效') >= 0, 'saved user summary should explain improvement');

  console.log('[FullCreativeLoop] deterministic mock LLM create -> playtest -> repair -> rerun passed');
  console.log('[FullCreativeLoop] before rate=' + report.comparison.collectibleCollectionRateBefore + ' after rate=' + report.comparison.collectibleCollectionRateAfter);
}

main();
