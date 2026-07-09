var assert = require('assert');
var fs = require('fs');
var path = require('path');

var semanticFeedback = require('./semantic-feedback');
var intentWorldView = require('./intent-world-view');
var deepseekProvider = require('./llm2-deepseek-decision-provider');
var tickPlaytestRuntime = require('./tick-playtest-runtime');

function readAiFile(fileName) {
  return fs.readFileSync(path.join(__dirname, fileName), 'utf8');
}

function assertNoRequestClassifierHardcoding() {
  [
    'llm2-context-cache-router.js',
    'llm2-decision-runtime.js',
    'llm2-deepseek-decision-provider.js',
  ].forEach(function(fileName) {
    var text = readAiFile(fileName);
    [
      'isThreatDensityRequest',
      'isGameplayIterationRequest',
      'isUiIconOnlyRequest',
      '怪别太密',
      '敌人别太密',
      '金币多一点',
      '按钮换个酷炫图标',
      'enemy too dense',
      'too many enemies',
      'less enemies',
    ].forEach(function(token) {
      assert.strictEqual(text.indexOf(token), -1, fileName + ' must not hard-code request classifier token: ' + token);
    });
  });
  var semanticFeedbackSource = readAiFile('semantic-feedback.js');
  [
    'coins?group',
    'enemies?group',
    "normalizedSubject === 'coins'",
    "normalizedSubject === 'enemies'",
  ].forEach(function(token) {
    assert.strictEqual(semanticFeedbackSource.indexOf(token), -1, 'semantic feedback must not hard-code placement group token: ' + token);
  });
}

function main() {
  var mapping = semanticFeedback.loadSemanticMapping();
  var view = semanticFeedback.buildSemanticMappingLlmView(mapping);
  assertNoRequestClassifierHardcoding();

  assert.strictEqual(view.aiFirstTaxonomy.naming, 'experience_dimension -> gameplay_role -> repair_verb -> safe_intent', 'taxonomy should use AI-first naming');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(view, 'playRoles'), false, 'LLM-safe taxonomy must not expose legacy playRoles');
  assert(view.experienceDimensions.length >= 8, 'taxonomy should cover broad experience dimensions');
  ['route_readability', 'content_density', 'phase_flow', 'remix_style'].forEach(function(dimensionId) {
    assert(view.experienceDimensions.some(function(dimension) {
      return dimension.dimension === dimensionId;
    }), 'taxonomy should expose ' + dimensionId);
  });
  assert(view.gameplayRoles.some(function(role) {
    return role.role === 'reward' && role.extends === 'content';
  }), 'taxonomy should model gameplay role inheritance');
  assert(view.gameplayRoles.some(function(role) {
    return role.role === 'pressure' && role.extends === 'content';
  }), 'taxonomy should avoid reward/pressure as unrelated hard-coded islands');
  view.gameplayRoles.forEach(function(role) {
    if (role.abstract) return;
    assert(role.extends, 'concrete gameplay role must inherit an abstract role: ' + role.role);
    assert(view.gameplayRoles.some(function(parent) {
      return parent.role === role.extends && parent.abstract === true;
    }), 'concrete gameplay role parent must be abstract: ' + role.role + ' -> ' + role.extends);
  });
  assert(view.repairVerbs.some(function(verb) {
    return verb.verb === 'cluster_near_route';
  }), 'taxonomy should expose generic repair verbs');
  assert(view.measurements.some(function(measurement) {
    return measurement.measurement === 'pressure_count_window';
  }), 'taxonomy should expose generic Tick measurements');
  ['reward_reachability', 'pressure_count_window', 'first_failure_tick', 'survival_rate'].forEach(function(measurementId) {
    var measurement = view.measurements.find(function(item) { return item.measurement === measurementId; });
    assert(measurement && measurement.summaryField, 'measurement should expose summary field: ' + measurementId);
    assert(measurement && measurement.improvement, 'measurement should expose improvement direction: ' + measurementId);
  });
  var improvement = semanticFeedback.compareSemanticTickSummaries({
    semanticMapping: mapping,
    beforeSummary: {
      rewardReachabilityRate: 0.4,
      pressureSeen: 3,
      firstDeathTick: 300,
      survived: false,
    },
    afterSummary: {
      rewardReachabilityRate: 0.8,
      pressureSeen: 1,
      firstDeathTick: null,
      survived: true,
    },
    issues: [
      { dimension: 'reward_pacing', evidence: { metric: 'rewardReachabilityRate' } },
      { dimension: 'pressure_balance', evidence: { metric: 'pressureSeen' } },
      { dimension: 'survival_window', evidence: { metric: 'firstDeathTick' } },
    ],
  });
  assert.strictEqual(improvement.improved, true, 'semantic improvement comparison should detect multi-measurement improvement');
  assert(improvement.measurements.some(function(item) {
    return item.measurement === 'pressure_count_window' && item.status === 'improved';
  }), 'pressure decrease should count as improvement');
  assert(view.requestSemantics.slots.some(function(slot) {
    return slot.slot === 'more_collectibles' && slot.hints.indexOf('reward_pacing') >= 0;
  }), 'taxonomy should own request slot semantics');
  ['route_unclear', 'content_sparse', 'phase_reward_missing', 'remix_runner', 'remix_survivor'].forEach(function(slotId) {
    assert(view.requestSemantics.slots.some(function(slot) {
      return slot.slot === slotId;
    }), 'taxonomy should own request slot ' + slotId);
  });
  assert(view.requestSemantics.signals.some(function(signal) {
    return signal.hints.indexOf('pressure_balance') >= 0 && signal.terms.indexOf('敌人') >= 0;
  }), 'taxonomy should own natural request signals');
  [
    ['怪别太密', 'REQUEST_SLOT:enemy_density', 'needs_tick_evidence'],
    ['这里不好躲', 'REQUEST_SLOT:route_unclear', 'route_readability'],
    ['这个玩法节奏有点空', 'REQUEST_SLOT:content_sparse', 'content_density'],
    ['改得更像割草', 'REQUEST_SLOT:remix_survivor', 'remix_style'],
  ].forEach(function(pair) {
    var naturalHints = semanticFeedback.requestSemanticHints(pair[0], mapping).hints;
    var slotHints = semanticFeedback.requestSemanticHints(pair[1], mapping).hints;
    assert(naturalHints.indexOf(pair[2]) >= 0, 'natural request should resolve hint ' + pair[2] + ': ' + pair[0]);
    assert(slotHints.indexOf(pair[2]) >= 0, 'request slot should resolve hint ' + pair[2] + ': ' + pair[1]);
  });
  view.requestSemantics.slots.concat(view.requestSemantics.signals).forEach(function(entry) {
    entry.hints.forEach(function(hint) {
      var known = view.experienceDimensions.some(function(dimension) { return dimension.dimension === hint; }) ||
        view.gameplayRoles.some(function(role) { return role.role === hint; }) ||
        view.repairVerbs.some(function(verb) { return verb.verb === hint; }) ||
        view.measurements.some(function(measurement) { return measurement.measurement === hint; }) ||
        ['needs_tick_evidence', 'stable_current_state'].indexOf(hint) >= 0;
      assert(known, 'request semantic hint must be declared in taxonomy or control flags: ' + hint);
    });
  });

  var worldView = intentWorldView.buildIntentWorldView({
    worldContext: { scenes: [] },
    semanticPlaytestReport: {
      playPolicy: { intents: ['jump-when-needed'], roleBindings: {} },
      tickReport: {
        summary: {
          rewardReachabilityRate: 0.4,
          firstDamageTick: null,
          survived: true,
        },
      },
      llmReport: {
        tickIssues: [{
          kind: 'reward_pacing_low',
          dimension: 'reward_pacing',
          gameplayRole: 'reward',
          repairVerb: 'increase_presence',
          message: 'reward role presence is below target',
          evidence: { tick: 180, metric: 'rewardReachabilityRate', observed: 0.4, expectedAtLeast: 0.6 },
        }],
        repairIntentDslLines: ['place coins near Player front as trail count 5'],
      },
    },
  });
  assert.strictEqual(worldView.experienceTaxonomy.naming, view.aiFirstTaxonomy.naming, 'IntentWorldView should carry taxonomy naming');
  assert.strictEqual(worldView.evidence[0].experienceDimension, 'reward_pacing', 'evidence should use experience dimension');
  assert.strictEqual(worldView.recommendedActions[0].repairVerb, 'increase_presence', 'recommended action should use repair verb');

  var policy = tickPlaytestRuntime.buildDefaultPlayPolicy({
    roleBindings: {
      actorSubject: 'Player',
      rewardSubject: 'coins',
      pressureSubject: 'enemies',
      actionEntrySubject: 'JumpButton',
    },
  });
  assert.strictEqual(policy.roleBindings.actorSubject, 'Player', 'policy should use actor role binding');
  assert.strictEqual(policy.roleBindings.rewardSubject, 'coins', 'policy should use reward role binding');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(policy.roleBindings, 'playerSubject'), false, 'policy must not expose legacy playerSubject');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(policy.roleBindings, 'collectibleSubject'), false, 'policy must not expose legacy collectibleSubject');

  var prompt = deepseekProvider.dynamicPrompt({
    userRequest: 'REQUEST_SLOT:more_collectibles',
    intentWorldView: worldView,
    contextRoute: { contextMode: 'diff_hit' },
  });
  assert(prompt.indexOf('reward_pacing') >= 0, 'DeepSeek prompt should expose generic experience dimension');
  assert(prompt.indexOf('increase_presence') >= 0, 'DeepSeek prompt should expose generic repair verb');
  assert(prompt.indexOf('experience_dimension -> gameplay_role -> repair_verb -> safe_intent') >= 0, 'DeepSeek prompt should expose AI-first taxonomy naming');
  assert(prompt.indexOf('componentId') < 0, 'DeepSeek prompt should not expose component ids');
  assert(prompt.indexOf('bridgePlan') < 0, 'DeepSeek prompt should not expose bridge plan');

  console.log('[LLM2SemanticTaxonomy] AI-first taxonomy, inheritance, and prompt slots passed');
}

main();
