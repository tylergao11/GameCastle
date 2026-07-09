var projectWorld = require('./project-world');
var semanticFeedback = require('./semantic-feedback');
var tickPlaytestRuntime = require('./tick-playtest-runtime');
var intentWorldView = require('./intent-world-view');

var SEMANTIC_PLAYTEST_SCHEMA_VERSION = 1;

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function safeWorldObjects(worldContext) {
  var names = {};
  ((worldContext || {}).scenes || []).forEach(function(scene) {
    (scene.things || []).forEach(function(thing) {
      if (thing.name) names[thing.name] = true;
    });
    (scene.placedThings || []).forEach(function(thing) {
      if (thing.object) names[thing.object] = true;
    });
  });
  return Object.keys(names);
}

function aliasIndex(semanticMappingView) {
  var bySubject = {};
  (semanticMappingView.subjectAliases || []).forEach(function(entry) {
    var subject = normalizeName(entry.subject);
    if (!bySubject[subject]) bySubject[subject] = [];
    bySubject[subject].push(entry.alias);
    bySubject[subject].push(entry.subject);
  });
  return bySubject;
}

function findRole(semanticMappingView, roleId) {
  return (semanticMappingView.gameplayRoles || []).find(function(role) {
    return role.role === roleId;
  }) || null;
}

function resolveRoleSubject(worldContext, semanticMappingView, roleId, fallbackSubject) {
  var role = findRole(semanticMappingView, roleId);
  var objects = safeWorldObjects(worldContext);
  var aliases = aliasIndex(semanticMappingView);
  var candidates = {};
  ((role && role.fallbackSubjects) || [fallbackSubject]).forEach(function(subject) {
    candidates[subject] = true;
    (aliases[normalizeName(subject)] || []).forEach(function(alias) {
      candidates[alias] = true;
    });
  });
  var candidateList = Object.keys(candidates);
  for (var i = 0; i < objects.length; i++) {
    var objectName = objects[i];
    var normalizedObject = normalizeName(objectName);
    for (var j = 0; j < candidateList.length; j++) {
      if (normalizedObject === normalizeName(candidateList[j])) {
        return candidateList[j];
      }
    }
  }
  return fallbackSubject;
}

function eventExists(semanticMappingView, eventName) {
  return (semanticMappingView.eventMeanings || []).some(function(event) {
    return event.event === eventName;
  });
}

function buildPlayPolicy(options) {
  options = options || {};
  var worldContext = options.worldContext;
  var semanticMappingView = options.semanticMappingView;
  if (!worldContext) throw new Error('SemanticPlaytestAgent requires worldContext');
  if (!semanticMappingView || semanticMappingView.view !== 'llm-safe-semantic-mapping') {
    throw new Error('SemanticPlaytestAgent requires LLM-safe semantic mapping view');
  }
  if (!eventExists(semanticMappingView, 'ActorIntent')) {
    throw new Error('SemanticPlaytestAgent requires ActorIntent event meaning');
  }
  var policy = tickPlaytestRuntime.buildDefaultPlayPolicy({
    owner: 'SemanticPlaytestAgent',
    durationTicks: options.durationTicks || 600,
    goals: (semanticMappingView.playGoals || []).map(function(goal) { return goal.goal; }).filter(function(goal) {
      return goal === 'survive' || goal === 'collect';
    }),
    intents: (semanticMappingView.playIntents || []).map(function(intent) { return intent.intent; }).filter(function(intent) {
      return ['move-forward', 'jump-when-needed', 'collect-reachable', 'avoid-threats'].indexOf(intent) >= 0;
    }),
    thresholds: {
      minRewardReachabilityRate: options.minRewardReachabilityRate || 0.6,
      minSurvivalTicks: options.minSurvivalTicks || 480,
      maxEarlyPressure: options.maxEarlyPressure || 1,
    },
    roleBindings: {
      actorSubject: resolveRoleSubject(worldContext, semanticMappingView, 'actor', 'Player'),
      rewardSubject: resolveRoleSubject(worldContext, semanticMappingView, 'reward', 'collectibles'),
      pressureSubject: resolveRoleSubject(worldContext, semanticMappingView, 'pressure', 'hazards'),
      actionEntrySubject: resolveRoleSubject(worldContext, semanticMappingView, 'action_entry', 'control'),
    },
  });
  if (!policy.goals.length) policy.goals = ['survive', 'collect'];
  if (!policy.intents.length) policy.intents = ['move-forward', 'collect-reachable'];
  return tickPlaytestRuntime.validatePlayPolicy(policy);
}

function summarizeIssueForUser(issue) {
  var evidence = issue.evidence || {};
  if (issue.dimension === 'reward_pacing') {
    return 'Tick ' + evidence.tick + ': reward pacing metric was ' + evidence.observed + ', below the target ' + evidence.expectedAtLeast + '.';
  }
  if (issue.dimension === 'survival_window') {
    return 'Tick ' + evidence.tick + ': the actor failed before the minimum survival target.';
  }
  return 'Tick ' + (evidence.tick === undefined ? 'unknown' : evidence.tick) + ': ' + (issue.message || issue.kind);
}

function buildUserReport(tickReport, semanticReport) {
  var issues = semanticReport.issues || [];
  return {
    schemaVersion: SEMANTIC_PLAYTEST_SCHEMA_VERSION,
    audience: 'user',
    status: issues.length ? 'needs-iteration' : 'playable',
    summary: issues.length
      ? '试玩发现 ' + issues.length + ' 个可改进点，已生成可执行修改意图。'
      : '试玩未发现需要自动修复的问题。',
    highlights: [
      'Simulated ' + tickReport.summary.durationTicks + ' ticks.',
      'Reward events reached ' + tickReport.summary.rewardsReached + '/' + tickReport.summary.rewardsAvailable + '.',
      'Survived: ' + (tickReport.summary.survived ? 'yes' : 'no') + '.',
    ],
    issues: issues.map(summarizeIssueForUser),
    suggestedIntent: semanticReport.repairIntentDslLines || [],
  };
}

function buildLlmReport(tickReport, semanticReport, playPolicy) {
  return {
    schemaVersion: SEMANTIC_PLAYTEST_SCHEMA_VERSION,
    audience: 'llm',
    nextAction: semanticReport.summary.nextAction,
    playPolicy: clone(playPolicy),
    tickSummary: clone(tickReport.summary),
    tickIssues: clone(semanticReport.issues || []),
    repairIntentDslText: semanticReport.repairIntentDslText,
    repairIntentDslLines: clone(semanticReport.repairIntentDslLines || []),
  };
}

function runSemanticPlaytest(options) {
  options = options || {};
  var world = options.projectWorld;
  var mapping = semanticFeedback.validateSemanticMapping(options.semanticMapping || semanticFeedback.loadSemanticMapping());
  var mappingView = semanticFeedback.buildSemanticMappingLlmView(mapping);
  var safeWorld = options.worldContext || projectWorld.sanitizeProjectWorldForIntentPrompt(world);
  var playPolicy = options.playPolicy || buildPlayPolicy({
    worldContext: safeWorld,
    semanticMappingView: mappingView,
    durationTicks: options.durationTicks,
    minRewardReachabilityRate: options.minRewardReachabilityRate,
    minSurvivalTicks: options.minSurvivalTicks,
    maxEarlyPressure: options.maxEarlyPressure,
  });
  var tickReport = tickPlaytestRuntime.runTickPlaytest({
    projectWorld: world,
    semanticMapping: mapping,
    playPolicy: playPolicy,
  });
  var semanticReport = semanticFeedback.analyzeSemanticFeedback({
    projectWorld: world,
    executionReport: options.executionReport,
    probeReport: {
      summary: {
        mode: 'semantic-playtest-agent',
        durationTicks: tickReport.summary.durationTicks,
        rewardReachabilityRate: tickReport.summary.rewardReachabilityRate,
        survived: tickReport.summary.survived,
      },
      issues: tickReport.feedbackIssues,
    },
  });
  var report = {
    schemaVersion: SEMANTIC_PLAYTEST_SCHEMA_VERSION,
    owner: 'SemanticPlaytestAgent',
    input: {
      worldContext: safeWorld,
      semanticMapping: mappingView,
    },
    playPolicy: playPolicy,
    tickReport: tickReport,
    llmReport: buildLlmReport(tickReport, semanticReport, playPolicy),
    userReport: buildUserReport(tickReport, semanticReport),
    repairIntentDslText: semanticReport.repairIntentDslText,
    repairIntentDslLines: semanticReport.repairIntentDslLines,
    summary: {
      nextAction: semanticReport.summary.nextAction,
      issues: semanticReport.summary.issues,
      actionable: semanticReport.summary.actionable,
      repairLines: semanticReport.summary.repairLines,
      tickEvents: tickReport.eventLog.length,
      snapshots: tickReport.snapshots.length,
    },
  };
  report.intentWorldView = intentWorldView.buildIntentWorldView({
    projectWorld: world,
    semanticPlaytestReport: report,
    executionReport: options.executionReport,
    decisionTrail: options.decisionTrail,
    userGoal: options.userGoal,
  });
  return report;
}

module.exports = {
  SEMANTIC_PLAYTEST_SCHEMA_VERSION: SEMANTIC_PLAYTEST_SCHEMA_VERSION,
  buildPlayPolicy: buildPlayPolicy,
  runSemanticPlaytest: runSemanticPlaytest,
};
