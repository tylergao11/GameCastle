var assert = require('assert');

var semanticFeedback = require('./semantic-feedback');

function testProbeIssuesBecomeNaturalRepairIntent() {
  var mapping = semanticFeedback.loadSemanticMapping();
  assert(mapping.intentLineStrategies.count_more, 'semantic mapping should define semantic count strategy');
  assert(mapping.issueProfiles.route_reward_unreachable, 'semantic mapping should define fallback issue profile');
  var llmView = semanticFeedback.buildSemanticMappingLlmView(mapping);
  var llmJson = JSON.stringify(llmView);
  assert.strictEqual(llmView.view, 'llm-safe-semantic-mapping', 'semantic mapping should expose an LLM-safe view');
  assert.strictEqual(llmView.aiFirstTaxonomy.naming, 'experience_dimension -> gameplay_role -> repair_verb -> safe_intent', 'LLM view should expose AI-first taxonomy naming');
  assert(llmView.experienceDimensions.some(function(dimension) {
    return dimension.dimension === 'reward_pacing' &&
      dimension.roles.indexOf('reward') >= 0 &&
      dimension.repairVerbs.indexOf('increase_presence') >= 0;
  }), 'LLM view should expose generic reward pacing dimension');
  assert(llmView.gameplayRoles.some(function(role) {
    return role.role === 'reward' && role.extends === 'content';
  }), 'LLM view should expose gameplay role inheritance');
  assert(llmView.repairVerbs.some(function(verb) {
    return verb.verb === 'soften_pressure';
  }), 'LLM view should expose generic repair verbs');
  assert(llmView.measurements.some(function(measurement) {
    return measurement.measurement === 'first_failure_tick';
  }), 'LLM view should expose generic Tick measurements');
  assert(llmView.playGoals.length > 0, 'LLM view should expose safe play goals');
  assert(llmView.playIntents.length > 0, 'LLM view should expose safe play intents');
  assert(llmView.eventMeanings.some(function(event) { return event.event === 'RewardReached'; }), 'LLM view should expose safe tick event meanings');
  assert(llmView.tickFeedbackIssues.some(function(issue) { return issue.issue === 'reward_pacing_low'; }), 'LLM view should expose safe tick feedback issues');
  assert(llmJson.indexOf('Reward') >= 0, 'LLM view should include issue meaning from mapping truth');
  assert(llmJson.indexOf('place coins near Player front as trail count 5') >= 0, 'LLM view should include safe Intent example from mapping truth');
  assert(llmView.feedbackIssues.some(function(issue) {
    return issue.issue === 'reward_pacing_low' &&
      issue.dimension === 'reward_pacing' &&
      issue.gameplayRole === 'reward' &&
      issue.repairVerb === 'increase_presence';
  }), 'LLM view should expose issue profile semantic abstraction fields');
  assert(llmJson.indexOf('"template"') < 0, 'LLM view must not expose internal templates');
  assert(llmJson.indexOf('intentLineStrategies') < 0, 'LLM view must not expose internal Intent line strategies');
  assert(llmJson.indexOf('componentId') < 0, 'LLM view must not expose component ids');
  assert(llmJson.indexOf('x=') < 0, 'LLM view must not expose coordinate syntax');

  var world = {
    intent: {
      intentGraph: {
        placements: [
          { subject: 'CoinsGroup', anchor: 'Player', direction: 'front', pattern: 'trail', count: 3 },
          { subject: 'EnemiesGroup', anchor: 'Player', direction: 'far-front', pattern: 'guard', count: 4 },
        ],
      },
    },
  };
  var report = semanticFeedback.analyzeSemanticFeedback({
    projectWorld: world,
    executionReport: {
      runId: 'run_001',
      batchLabel: 'create',
      summary: { total: 1, completed: 1, failed: 0, nextAction: 'done' },
    },
    probeReport: {
      summary: {
        playtestMode: 'single-player',
        ticks: 600,
      },
      issues: [
        {
          kind: 'reward_pacing_low',
          severity: 'high',
          repairVerb: 'increase_presence',
          repair: { subject: 'coins', anchor: 'Player', direction: 'front', pattern: 'trail', delta: 2 },
          evidence: { tick: 180, metric: 'rewardReachabilityRate', observed: 0.4, expectedAtLeast: 0.6 },
        },
        {
          kind: 'probe_control_layout',
          severity: 'medium',
          repairVerb: 'increase_feedback',
          repair: { subject: 'jump button', direction: 'above', amount: 'slightly' },
        },
        {
          kind: 'probe_difficulty',
          severity: 'high',
          repairVerb: 'soften_pressure',
          repair: { subject: 'enemies', anchor: 'Player', direction: 'far-front', pattern: 'guard', delta: 1 },
        },
      ],
    },
  });

  assert.strictEqual(report.schemaVersion, 1, 'semantic feedback schema should be stable');
  assert.strictEqual(report.owner, 'SemanticFeedback', 'report should declare owner');
  assert.strictEqual(report.input.semanticMapping.view, 'llm-safe-semantic-mapping', 'feedback report should carry shared semantic mapping view');
  assert.strictEqual(report.summary.nextAction, 'repair-intent', 'actionable issues should request repair intent');
  assert.deepStrictEqual(report.repairIntentDslLines, [
    'place coins near Player front as trail count 5',
    'adjust JumpButton placement above slightly',
    'place enemies near Player far-front as guard count 3',
  ], 'semantic feedback should produce natural repair Intent DSL lines');
  assert.strictEqual(report.issues[0].evidence.tick, 180, 'semantic feedback should preserve tick evidence');
  assert.strictEqual(report.issues[0].dimension, 'reward_pacing', 'semantic feedback should preserve profile dimension');
  assert.strictEqual(report.issues[0].gameplayRole, 'reward', 'semantic feedback should preserve profile gameplay role');
  assert.strictEqual(report.issues[0].repairVerb, 'increase_presence', 'semantic feedback should preserve profile repair verb');

  var json = JSON.stringify(report.input);
  assert(json.indexOf('"x"') < 0, 'feedback input must not expose x coordinates');
  assert(json.indexOf('bridgePlan') < 0, 'feedback input must not expose bridge plan');
  assert(json.indexOf('componentId') < 0, 'feedback input must not expose component ids');
  assert(report.repairIntentDslText.indexOf('set placement object=') < 0, 'repair must not use internal placement DSL');
  assert(report.repairIntentDslText.indexOf('x=') < 0, 'repair must not use coordinates');
}

function testUnsupportedIssueRoutesToOwnerWithoutRepairLine() {
  var report = semanticFeedback.analyzeSemanticFeedback({
    issues: [
      { kind: 'shader_compile_failed', subject: 'Player' },
    ],
  });
  assert.strictEqual(report.summary.actionable, 0, 'unsupported issue should not be actionable');
  assert.strictEqual(report.summary.repairLines, 0, 'unsupported issue should not generate repair lines');
  assert.strictEqual(report.issues[0].nextAction, 'route-to-owner', 'unsupported issue should route to owner');
}

function testIssueKindProfilesAreFallbackOnly() {
  var report = semanticFeedback.analyzeSemanticFeedback({
    projectWorld: {
      intent: {
        intentGraph: {
          placements: [{ subject: 'CoinsGroup', anchor: 'Player', direction: 'front', pattern: 'trail', count: 2 }],
        },
      },
    },
    issues: [
      { kind: 'route_reward_unreachable', subject: 'coins' },
    ],
  });
  assert.deepStrictEqual(report.repairIntentDslLines, [
    'place coins near Player front as trail count 4',
  ], 'known issue profiles should remain fallback defaults');
}

function testCountRepairUsesRuntimeWorldInstances() {
  var report = semanticFeedback.analyzeSemanticFeedback({
    projectWorld: {
      scenes: [
        {
          instances: [
            { object: 'Coin' },
            { object: 'Coin' },
            { object: 'Coin' },
            { object: 'Coin' },
            { object: 'Coin' },
            { object: 'Coin' },
          ],
        },
      ],
      intent: {
        intentGraph: {
          placements: [{ subject: 'CoinsGroup', anchor: 'Player', direction: 'front', pattern: 'trail', count: 3 }],
        },
      },
    },
    issues: [
      { kind: 'reward_pacing_low', subject: 'coins' },
    ],
  });
  assert.deepStrictEqual(report.repairIntentDslLines, [
    'place coins near Player front as trail count 8',
  ], 'count repair should use current ProjectWorld instances as the count floor');
}

function testSemanticComparisonUsesGuardMeasurements() {
  var comparison = semanticFeedback.compareSemanticTickSummaries({
    beforeSummary: {
      rewardReachabilityRate: 0.4,
      pressureSeen: 0,
      firstDamageTick: null,
      firstDeathTick: null,
      survived: true,
    },
    afterSummary: {
      rewardReachabilityRate: 0.8,
      pressureSeen: 4,
      firstDamageTick: 260,
      firstDeathTick: 300,
      survived: false,
    },
    issues: [
      {
        kind: 'reward_pacing_low',
        dimension: 'reward_pacing',
        evidence: { metric: 'rewardReachabilityRate' },
      },
    ],
  });
  assert.strictEqual(comparison.view, 'semantic-tick-improvement-comparison', 'comparison should use the semantic tick view');
  assert.strictEqual(comparison.improved, false, 'reward improvement must not pass when guard metrics regress');
  assert.strictEqual(comparison.regressed, true, 'guard metric regression should fail the comparison');
  assert(comparison.measurements.some(function(item) {
    return item.measurement === 'reward_reachability' && item.status === 'improved';
  }), 'comparison should still include the issue-targeted reward improvement');
  assert(comparison.measurements.some(function(item) {
    return item.measurement === 'survival_rate' && item.status === 'worsened';
  }), 'comparison should include global survival regression guard');
  assert(comparison.measurements.some(function(item) {
    return item.measurement === 'pressure_count_window' && item.status === 'worsened';
  }), 'comparison should include global pressure regression guard');
}

function main() {
  testProbeIssuesBecomeNaturalRepairIntent();
  testUnsupportedIssueRoutesToOwnerWithoutRepairLine();
  testIssueKindProfilesAreFallbackOnly();
  testCountRepairUsesRuntimeWorldInstances();
  testSemanticComparisonUsesGuardMeasurements();
  console.log('[SemanticFeedback] probe issues map to safe repair Intent DSL');
}

main();
