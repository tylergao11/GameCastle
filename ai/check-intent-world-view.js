var assert = require('assert');
var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');

var intentWorldView = require('./intent-world-view');

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

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, fileName), 'utf8'));
}

function assertNoMachineLeak(value, label) {
  var text = JSON.stringify(value);
  assert(text.indexOf('"x"') < 0, label + ' must not expose x coordinates');
  assert(text.indexOf('"y"') < 0, label + ' must not expose y coordinates');
  assert(text.indexOf('componentId') < 0, label + ' must not expose component ids');
  assert(text.indexOf('bridgePlan') < 0, label + ' must not expose bridge plan');
  assert(text.indexOf('gdjs') < 0, label + ' must not expose gdjs internals');
}

function roleByName(view, roleName) {
  return view.sceneIntent.roles.filter(function(role) {
    return role.role === roleName;
  });
}

function main() {
  run([
    'ai/pipeline.js',
    '--intent-dsl-file',
    'ai/fixtures/intent-parkour-real.dsl',
    '--batch-label',
    'intent_world_view_check',
  ], 'intent world view pipeline');

  var view = readJson('intent-world-view.json');
  intentWorldView.assertSafeIntentWorldView(view);
  assert.strictEqual(view.owner, 'IntentWorldView', 'view should declare IntentWorldView owner');
  assert.strictEqual(view.contextKind, 'intent-world-view', 'view should declare context kind');
  assert.strictEqual(view.gameplayFirst, true, 'view should be gameplay first');
  assert.strictEqual(view.sceneMode, 'single-scene', 'view should target one active scene');
  assert.strictEqual(view.sceneIntent.gameplayFirst, true, 'scene intent should be gameplay first');
  assert.strictEqual(view.sceneIntent.aiFirstNaming, 'experience_dimension -> gameplay_role -> repair_verb -> safe_intent', 'scene intent should expose AI-first taxonomy naming');
  assert.strictEqual(view.experienceTaxonomy.naming, 'experience_dimension -> gameplay_role -> repair_verb -> safe_intent', 'view should expose AI-first taxonomy');
  assert(view.experienceTaxonomy.dimensions.some(function(dimension) {
    return dimension.dimension === 'reward_pacing' && dimension.roles.indexOf('reward') >= 0;
  }), 'view should expose generic reward pacing dimension');
  assert(view.experienceTaxonomy.roles.some(function(role) {
    return role.role === 'reward' && role.extends === 'content';
  }), 'view should expose gameplay role inheritance');
  assert(view.experienceTaxonomy.repairVerbs.indexOf('increase_presence') >= 0, 'view should expose generic repair verbs');
  assert.strictEqual(view.sceneIntent.uiPolicy.role, 'supporting layer only', 'UI should be supporting only');
  assert(view.sceneIntent.uiPolicy.templateStrategy.indexOf('templates') >= 0, 'UI/icon/layout should be template driven');
  assert.strictEqual(view.sceneIntent.uiPolicy.designerFocus, 'gameplay content first', 'designer focus should stay on gameplay');
  assert.strictEqual(view.contextCache.contextMode, 'summary-plus-diff', 'new run should provide summary plus diff');
  assert.strictEqual(view.contextCache.semanticCacheHit, false, 'new run should not claim semantic cache hit');
  assert(view.contextCache.targetSemanticHash, 'view should expose semantic hash for context cache decisions');
  assert(view.contextCache.diff.latestIntentDslLines.length > 0, 'view should include latest Intent DSL diff lines');
  assert(view.contextCache.diff.changedGameplayEvidence.length > 0, 'view should include tick evidence diff');
  assert.strictEqual(view.recommendationPolicy.authority, 'candidate-only', 'recommended actions should be candidate-only');
  assert.strictEqual(view.recommendationPolicy.finalDecisionOwner, 'LLM2', 'LLM2 should own the final gameplay edit decision');
  assert(view.contextRequests.defaultRead.indexOf('tick_event_window') >= 0, 'LLM2 should be able to request focused tick context');
  assert(view.contextRequests.available.some(function(request) { return request.id === 'project_world_diff'; }), 'LLM2 should be able to request world diff context');
  assert(view.contextRequests.available.some(function(request) { return request.id === 'ui_template_policy'; }), 'LLM2 should be able to request UI template policy when needed');

  assert.strictEqual(roleByName(view, 'player_agent')[0].primaryDesignObject, true, 'player role should be primary gameplay object');
  assert.strictEqual(roleByName(view, 'reward_pacing')[0].primaryDesignObject, true, 'reward pacing should be primary gameplay object');
  assert.strictEqual(roleByName(view, 'pressure_source')[0].primaryDesignObject, true, 'pressure source should be primary gameplay object');
  roleByName(view, 'action_entry').forEach(function(role) {
    assert.strictEqual(role.primaryDesignObject, false, role.subject + ' should be supporting input surface');
    assert(role.uiPolicy.indexOf('supporting') >= 0, role.subject + ' should carry supporting UI policy');
  });

  assert.strictEqual(view.playtestJudgement.rewardPacing, 'too_sparse', 'fixture should expose sparse reward pacing');
  assert(view.evidence[0].tick >= 0, 'view should preserve tick evidence');
  assert.strictEqual(view.evidence[0].experienceDimension, 'reward_pacing', 'view evidence should carry experience dimension');
  assert.strictEqual(view.evidence[0].gameplayRole, 'reward', 'view evidence should carry gameplay role');
  assert.strictEqual(view.evidence[0].repairVerb, 'increase_presence', 'view evidence should carry repair verb');
  assert(view.recommendedActions.some(function(action) {
    return action.action === 'increase_reward_pacing' &&
      action.experienceDimension === 'reward_pacing' &&
      action.gameplayRole === 'reward' &&
      action.repairVerb === 'increase_presence' &&
      action.priority === 'high' &&
      action.safeIntentDsl === 'place coins near Player front as trail count 5';
  }), 'view should recommend gameplay repair intent');
  assert(view.recommendedActions.some(function(action) {
    return action.action === 'no_op';
  }), 'view should keep no-op as an explicit choice');
  assertNoMachineLeak(view, 'IntentWorldView');

  var cachedView = intentWorldView.buildIntentWorldView({
    projectWorld: {
      semanticHash: view.contextCache.targetSemanticHash,
      worldVersion: view.contextCache.worldVersion,
    },
    worldContext: {
      intent: {
        lastIntentDslLines: ['place coins near Player front as trail count 5'],
      },
      scenes: [],
    },
    semanticPlaytestReport: {
      llmReport: { tickIssues: [] },
      tickReport: { summary: { survived: true } },
      playPolicy: { intents: ['jump-when-needed'], roleBindings: {} },
    },
    executionReport: {
      baseSemanticHash: view.contextCache.targetSemanticHash,
      targetSemanticHash: view.contextCache.targetSemanticHash,
    },
  });
  assert.strictEqual(cachedView.contextCache.semanticCacheHit, true, 'matching semantic hashes should be cache hit');
  assert.strictEqual(cachedView.contextCache.contextMode, 'diff-only', 'cache hit should move LLM2 to diff-only context');

  console.log('[IntentWorldView] gameplay-first LLM2 context, template UI policy, tick evidence, safe actions passed');
}

main();
