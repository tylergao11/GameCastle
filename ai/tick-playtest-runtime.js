var projectWorld = require('./project-world');
var semanticFeedback = require('./semantic-feedback');

var TICK_PLAYTEST_SCHEMA_VERSION = 1;

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function normalizeText(value) {
  return String(value || '').trim();
}

function firstScene(world) {
  return ((world || {}).scenes || [])[0] || { objects: [], instances: [] };
}

function objectNames(world) {
  var scene = firstScene(world);
  var names = {};
  (scene.objects || []).forEach(function(object) {
    if (object.name) names[object.name] = true;
  });
  (scene.instances || []).forEach(function(instance) {
    if (instance.object) names[instance.object] = true;
  });
  return Object.keys(names);
}

function normalizeSubjectName(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function candidateNames(mapping, subject, fallback) {
  var aliases = (mapping || {}).subjectAliases || {};
  var normalizedSubject = normalizeSubjectName(subject);
  var candidates = {};
  (fallback || []).forEach(function(name) { candidates[name] = true; });
  Object.keys(aliases).forEach(function(alias) {
    if (normalizeSubjectName(aliases[alias]) === normalizedSubject) {
      candidates[alias] = true;
      candidates[aliases[alias]] = true;
    }
  });
  if (subject) candidates[subject] = true;
  return Object.keys(candidates);
}

function resolveObjectRole(world, candidates) {
  var names = objectNames(world);
  var byNormalized = {};
  names.forEach(function(name) {
    byNormalized[normalizeSubjectName(name)] = name;
  });
  for (var i = 0; i < candidates.length; i++) {
    var normalized = normalizeSubjectName(candidates[i]);
    if (byNormalized[normalized]) return byNormalized[normalized];
  }
  return null;
}

function instancesByRole(world, objectName) {
  if (!objectName) return [];
  return (firstScene(world).instances || []).filter(function(instance) {
    return instance.object === objectName;
  });
}

function hasObjectRole(world, objectName) {
  return Boolean(objectName && objectNames(world).indexOf(objectName) >= 0);
}

function hasEventContaining(world, text) {
  var needle = normalizeText(text);
  return (firstScene(world).events || []).some(function(event) {
    return String(event.text || '').indexOf(needle) >= 0;
  });
}

function buildRoleBindings(world, mapping, policy) {
  var bindings = policy.roleBindings || {};
  return {
    actorObject: resolveObjectRole(world, candidateNames(mapping, bindings.actorSubject || 'Player', ['Player', 'Hero'])),
    rewardObject: resolveObjectRole(world, candidateNames(mapping, bindings.rewardSubject || 'collectibles', ['Collectible', 'Coin', 'Gem', 'Star'])),
    pressureObject: resolveObjectRole(world, candidateNames(mapping, bindings.pressureSubject || 'hazards', ['Enemy', 'Hazard', 'Obstacle'])),
    actionEntryObject: resolveObjectRole(world, candidateNames(mapping, bindings.actionEntrySubject || 'control', ['JumpButton', 'Button'])),
    rewardSubject: bindings.rewardSubject || 'collectibles',
    pressureSubject: bindings.pressureSubject || 'hazards',
  };
}

function buildWorldFacts(world, mapping, policy) {
  var roles = buildRoleBindings(world, mapping || {}, policy || {});
  return {
    roles: roles,
    actorPresent: hasObjectRole(world, roles.actorObject),
    actionEntryPresent: hasObjectRole(world, roles.actionEntryObject),
    rewardCount: instancesByRole(world, roles.rewardObject).length,
    pressureCount: instancesByRole(world, roles.pressureObject).length,
    rewardRule: Boolean(roles.actorObject && roles.rewardObject && hasEventContaining(world, roles.actorObject + ' ' + roles.rewardObject)),
    pressureRule: Boolean(roles.actorObject && roles.pressureObject && hasEventContaining(world, roles.actorObject + ' ' + roles.pressureObject)),
  };
}

function buildDefaultPlayPolicy(options) {
  options = options || {};
  return {
    schemaVersion: TICK_PLAYTEST_SCHEMA_VERSION,
    owner: options.owner || 'LLMPlayPolicy',
    view: 'llm-guided-play-policy',
    mode: 'single-player-tick-pseudo-run',
    durationTicks: Number(options.durationTicks || 600),
    goals: options.goals || ['survive', 'collect'],
    intents: options.intents || ['move-forward', 'jump-when-needed', 'collect-reachable', 'avoid-threats'],
    thresholds: {
      minRewardReachabilityRate: Number((options.thresholds && options.thresholds.minRewardReachabilityRate) || 0.6),
      minSurvivalTicks: Number((options.thresholds && options.thresholds.minSurvivalTicks) || 480),
      maxEarlyPressure: Number((options.thresholds && options.thresholds.maxEarlyPressure) || 1),
    },
    roleBindings: {
      actorSubject: ((options.roleBindings || {}).actorSubject) || 'Player',
      rewardSubject: ((options.roleBindings || {}).rewardSubject) || 'collectibles',
      pressureSubject: ((options.roleBindings || {}).pressureSubject) || 'hazards',
      actionEntrySubject: ((options.roleBindings || {}).actionEntrySubject) || 'control',
    },
  };
}

function validatePlayPolicy(policy) {
  if (!policy || typeof policy !== 'object') throw new Error('PlayPolicy must be an object');
  if (policy.schemaVersion !== TICK_PLAYTEST_SCHEMA_VERSION) throw new Error('PlayPolicy schemaVersion mismatch');
  if (policy.view !== 'llm-guided-play-policy') throw new Error('PlayPolicy view mismatch');
  if (!Array.isArray(policy.goals) || !policy.goals.length) throw new Error('PlayPolicy goals required');
  if (!Array.isArray(policy.intents) || !policy.intents.length) throw new Error('PlayPolicy intents required');
  if (!policy.durationTicks || policy.durationTicks < 1) throw new Error('PlayPolicy durationTicks must be positive');
  return policy;
}

function eventMeaning(mapping, type) {
  return ((mapping || {}).eventMeanings || {})[type] || type;
}

function pushEvent(target, mapping, tick, type, details) {
  target.push({
    tick: tick,
    type: type,
    semantic: eventMeaning(mapping, type),
    details: details || {},
  });
}

function makeSnapshot(tick, state, metrics) {
  return {
    tick: tick,
    state: clone(state),
    metrics: clone(metrics),
  };
}

function reachableRewardsForPolicy(facts, policy) {
  if (!facts.rewardRule || facts.rewardCount <= 0) return 0;
  var baseReachable = Math.max(1, facts.rewardCount - 4);
  if (policy.intents.indexOf('collect-reachable') >= 0) baseReachable += 1;
  return Math.min(facts.rewardCount, baseReachable);
}

function shouldDamage(facts, policy) {
  if (!facts.pressureRule || facts.pressureCount <= 0) return false;
  var earlyPressureBudget = (policy.thresholds && policy.thresholds.maxEarlyPressure) || 1;
  return facts.pressureCount > earlyPressureBudget + 1;
}

function runTickPlaytest(options) {
  options = options || {};
  var world = options.projectWorld;
  var mapping = semanticFeedback.validateSemanticMapping(options.semanticMapping || semanticFeedback.loadSemanticMapping());
  var policy = validatePlayPolicy(options.playPolicy || buildDefaultPlayPolicy());
  var facts = buildWorldFacts(world, mapping, policy);
  var eventLog = [];
  var snapshots = [];
  var state = {
    actor: facts.actorPresent ? 'ready' : 'missing',
    score: 0,
    reachedRewards: 0,
    missedRewards: 0,
    health: 1,
  };

  pushEvent(eventLog, mapping, 0, 'ActorSpawned', { actorPresent: facts.actorPresent });
  pushEvent(eventLog, mapping, 1, 'ActorIntent', { intent: 'move-forward' });
  pushEvent(eventLog, mapping, 20, 'AutoRunStarted', { policy: 'move-forward' });

  var reachableRewards = reachableRewardsForPolicy(facts, policy);
  var rewardTickStep = Math.max(24, Math.floor(policy.durationTicks / Math.max(1, facts.rewardCount + 2)));
  for (var rewardIndex = 0; rewardIndex < facts.rewardCount; rewardIndex++) {
    var tick = 60 + rewardIndex * rewardTickStep;
    if (rewardIndex < reachableRewards) {
      state.reachedRewards += 1;
      state.score += 1;
      pushEvent(eventLog, mapping, tick, 'RewardReached', {
        subject: facts.roles.rewardSubject,
        reached: state.reachedRewards,
        available: facts.rewardCount,
      });
    } else {
      state.missedRewards += 1;
      pushEvent(eventLog, mapping, tick, 'RewardMissed', {
        subject: facts.roles.rewardSubject,
        missed: state.missedRewards,
        available: facts.rewardCount,
      });
    }
  }

  if (facts.pressureCount > 0) {
    pushEvent(eventLog, mapping, 220, 'PressureDetected', {
      subject: facts.roles.pressureSubject,
      count: facts.pressureCount,
    });
  }

  var damaged = shouldDamage(facts, policy);
  if (damaged) {
    state.health = 0;
    pushEvent(eventLog, mapping, 260, 'ActorDamaged', { subject: facts.roles.actorObject || 'actor', source: facts.roles.pressureSubject });
    pushEvent(eventLog, mapping, 300, 'ActorFailed', { subject: facts.roles.actorObject || 'actor' });
  }

  var rewardReachabilityRate = facts.rewardCount ? state.reachedRewards / facts.rewardCount : 1;
  var survived = state.health > 0;
  var metrics = {
    rewardsAvailable: facts.rewardCount,
    rewardsReached: state.reachedRewards,
    rewardsMissed: state.missedRewards,
    rewardReachabilityRate: Number(rewardReachabilityRate.toFixed(3)),
    pressureSeen: facts.pressureCount,
    meaningfulEventCount: eventLog.filter(function(event) {
      return ['RewardReached', 'RewardMissed', 'PressureDetected', 'ActorDamaged', 'ActorFailed', 'PhaseTransitioned'].indexOf(event.type) >= 0;
    }).length,
    phaseTransitions: eventLog.filter(function(event) { return event.type === 'PhaseTransitioned'; }).length,
    feedbackEventCount: eventLog.filter(function(event) { return event.type === 'RewardReached'; }).length,
    survived: survived,
  };
  snapshots.push(makeSnapshot(0, { actor: 'ready', score: 0 }, { rewardsAvailable: facts.rewardCount }));
  snapshots.push(makeSnapshot(Math.floor(policy.durationTicks / 2), state, metrics));
  snapshots.push(makeSnapshot(policy.durationTicks, state, metrics));

  var report = {
    schemaVersion: TICK_PLAYTEST_SCHEMA_VERSION,
    owner: 'TickPlaytestRuntime',
    mode: policy.mode,
    input: {
      worldContext: projectWorld.sanitizeProjectWorldForIntentPrompt(world),
      playPolicy: clone(policy),
      semanticMapping: semanticFeedback.buildSemanticMappingLlmView(mapping),
    },
    facts: facts,
    eventLog: eventLog,
    snapshots: snapshots,
    summary: {
      durationTicks: policy.durationTicks,
      rewardsAvailable: facts.rewardCount,
      rewardsReached: state.reachedRewards,
      rewardsMissed: state.missedRewards,
      collectiblesAvailable: facts.rewardCount,
      collectiblesCollected: state.reachedRewards,
      collectiblesMissed: state.missedRewards,
      rewardReachabilityRate: metrics.rewardReachabilityRate,
      collectibleCollectionRate: metrics.rewardReachabilityRate,
      pressureSeen: facts.pressureCount,
      meaningfulEventCount: metrics.meaningfulEventCount,
      phaseTransitions: metrics.phaseTransitions,
      feedbackEventCount: metrics.feedbackEventCount,
      firstDamageTick: damaged ? 260 : null,
      firstDeathTick: damaged ? 300 : null,
      survived: survived,
    },
  };
  report.feedbackIssues = analyzeTickRun({ report: report, playPolicy: policy, semanticMapping: mapping });
  return report;
}

function findFirstEvent(report, types) {
  var lookup = {};
  types.forEach(function(type) { lookup[type] = true; });
  return (report.eventLog || []).find(function(event) { return lookup[event.type]; }) || null;
}

function countEvents(report, types) {
  var lookup = {};
  types.forEach(function(type) { lookup[type] = true; });
  return (report.eventLog || []).filter(function(event) { return lookup[event.type]; }).length;
}

function cloneRepairWithPolicyBindings(repair, policy, profile) {
  repair = clone(repair || {});
  var bindings = (policy || {}).roleBindings || {};
  var roleBindingByGameplayRole = {
    actor: 'actorSubject',
    reward: 'rewardSubject',
    pressure: 'pressureSubject',
    action_entry: 'actionEntrySubject',
  };
  var subjectBinding = roleBindingByGameplayRole[(profile || {}).gameplayRole];
  if (subjectBinding && bindings[subjectBinding]) repair.subject = bindings[subjectBinding];
  if (bindings.actorSubject) repair.anchor = bindings.actorSubject;
  return repair;
}

function buildIssue(mapping, policy, issueId, severity, evidence) {
  var tickIssue = (mapping.tickFeedbackIssues || {})[issueId];
  if (!tickIssue) throw new Error('Unknown tick feedback issue: ' + issueId);
  var profile = (mapping.issueProfiles || {})[tickIssue.issueProfile];
  if (!profile) throw new Error('Unknown issue profile for tick issue: ' + issueId + ' -> ' + tickIssue.issueProfile);
  return {
    kind: tickIssue.issueProfile,
    category: profile.category,
    dimension: profile.dimension,
    gameplayRole: profile.gameplayRole,
    repairVerb: profile.repairVerb,
    severity: severity || 'medium',
    message: tickIssue.meaning,
    repair: cloneRepairWithPolicyBindings(profile.repair, policy, profile),
    evidence: evidence,
  };
}

function analyzeTickRun(options) {
  options = options || {};
  var report = options.report || {};
  var policy = options.playPolicy || {};
  var mapping = options.semanticMapping || semanticFeedback.loadSemanticMapping();
  var thresholds = policy.thresholds || {};
  var issues = [];
  var minRewardReachabilityRate = Number(thresholds.minRewardReachabilityRate || 0.6);
  if (report.summary && report.summary.rewardReachabilityRate < minRewardReachabilityRate) {
    var rewardIssue = mapping.tickFeedbackIssues.reward_pacing_low;
    var rewardEvent = findFirstEvent(report, rewardIssue.evidenceEvents || ['RewardMissed']);
    issues.push(buildIssue(mapping, policy, 'reward_pacing_low', 'high', {
        tick: rewardEvent ? rewardEvent.tick : report.summary.durationTicks,
        events: rewardIssue.evidenceEvents || [],
        metric: 'rewardReachabilityRate',
        observed: report.summary.rewardReachabilityRate,
        expectedAtLeast: minRewardReachabilityRate,
      }));
  }
  var maxEarlyPressure = Number(thresholds.maxEarlyPressure || 1);
  if (report.summary && Number(report.summary.pressureSeen || 0) > maxEarlyPressure) {
    var pressureIssue = mapping.tickFeedbackIssues.pressure_balance_high;
    var pressureEvent = findFirstEvent(report, pressureIssue.evidenceEvents || ['PressureDetected']);
    issues.push(buildIssue(mapping, policy, 'pressure_balance_high', 'high', {
        tick: pressureEvent ? pressureEvent.tick : 0,
        events: pressureIssue.evidenceEvents || [],
        metric: 'pressureSeen',
        observed: Number(report.summary.pressureSeen || 0),
        expectedAtMost: maxEarlyPressure,
      }));
  }
  if (
    report.summary &&
    Number(report.summary.rewardsMissed || 0) > 0 &&
    report.summary.rewardReachabilityRate < Number(thresholds.minRouteRewardReachabilityRate || 0.8)
  ) {
    var routeIssue = mapping.tickFeedbackIssues.route_readability_low;
    var routeEvent = findFirstEvent(report, routeIssue.evidenceEvents || ['RewardMissed']);
    issues.push(buildIssue(mapping, policy, 'route_readability_low', 'medium', {
        tick: routeEvent ? routeEvent.tick : report.summary.durationTicks,
        events: routeIssue.evidenceEvents || [],
        metric: 'rewardReachabilityRate',
        observed: report.summary.rewardReachabilityRate,
        expectedAtLeast: Number(thresholds.minRouteRewardReachabilityRate || 0.8),
      }));
  }
  if (
    report.summary &&
    Number(report.summary.meaningfulEventCount || 0) < Number(thresholds.minMeaningfulEventCount || 1)
  ) {
    var contentIssue = mapping.tickFeedbackIssues.content_density_low;
    var contentEvent = findFirstEvent(report, contentIssue.evidenceEvents || ['ActorIntent']);
    issues.push(buildIssue(mapping, policy, 'content_density_low', 'medium', {
        tick: contentEvent ? contentEvent.tick : 0,
        events: contentIssue.evidenceEvents || [],
        metric: 'meaningfulEventCount',
        observed: Number(report.summary.meaningfulEventCount || 0),
        expectedAtLeast: Number(thresholds.minMeaningfulEventCount || 1),
      }));
  }
  if (report.summary && report.summary.firstDeathTick !== null && report.summary.firstDeathTick < Number(thresholds.minSurvivalTicks || 480)) {
    var deathIssue = mapping.tickFeedbackIssues.survival_window_short;
    var deathEvent = findFirstEvent(report, deathIssue.evidenceEvents || ['ActorFailed']);
    issues.push(buildIssue(mapping, policy, 'survival_window_short', 'high', {
        tick: deathEvent ? deathEvent.tick : report.summary.firstDeathTick,
        events: deathIssue.evidenceEvents || [],
        metric: 'firstDeathTick',
        observed: report.summary.firstDeathTick,
        expectedAtLeast: thresholds.minSurvivalTicks || 480,
      }));
  }
  var phaseTransitions = countEvents(report, ['PhaseTransitioned']);
  if (phaseTransitions > 0 && countEvents(report, ['RewardReached']) < phaseTransitions) {
    var phaseIssue = mapping.tickFeedbackIssues.phase_feedback_missing;
    var phaseEvent = findFirstEvent(report, phaseIssue.evidenceEvents || ['PhaseTransitioned']);
    issues.push(buildIssue(mapping, policy, 'phase_feedback_missing', 'medium', {
        tick: phaseEvent ? phaseEvent.tick : 0,
        events: phaseIssue.evidenceEvents || [],
        metric: 'feedbackEventCount',
        observed: countEvents(report, ['RewardReached']),
        expectedAtLeast: phaseTransitions,
      }));
  }
  return issues;
}

module.exports = {
  TICK_PLAYTEST_SCHEMA_VERSION: TICK_PLAYTEST_SCHEMA_VERSION,
  buildDefaultPlayPolicy: buildDefaultPlayPolicy,
  validatePlayPolicy: validatePlayPolicy,
  buildWorldFacts: buildWorldFacts,
  runTickPlaytest: runTickPlaytest,
  analyzeTickRun: analyzeTickRun,
};
