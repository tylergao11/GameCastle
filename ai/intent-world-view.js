var projectWorld = require('./project-world');
var intentSurfaceGuard = require('./intent-surface-guard');
var semanticFeedback = require('./semantic-feedback');

var INTENT_WORLD_VIEW_SCHEMA_VERSION = 1;

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function safeText(value, fallback) {
  var text = String(value || fallback || '').trim();
  if (!text) return null;
  if (intentSurfaceGuard.detectProhibitedSurface(text).length) return null;
  return text;
}

function safeWorldFromOptions(options) {
  options = options || {};
  if (options.worldContext) return options.worldContext;
  if (options.semanticPlaytestReport && options.semanticPlaytestReport.input) {
    return options.semanticPlaytestReport.input.worldContext;
  }
  return projectWorld.sanitizeProjectWorldForIntentPrompt(options.projectWorld);
}

function allSafeWorldSubjects(worldContext) {
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

function findSubject(worldContext, candidates, fallback) {
  var byName = {};
  allSafeWorldSubjects(worldContext).forEach(function(name) {
    byName[normalizeName(name)] = name;
  });
  for (var i = 0; i < (candidates || []).length; i++) {
    var hit = byName[normalizeName(candidates[i])];
    if (hit) return hit;
  }
  return fallback || null;
}

function hasTickEvent(report, eventType) {
  return ((((report || {}).tickReport || {}).eventLog || []).some(function(event) {
    return event.type === eventType;
  }));
}

function tickSummary(report) {
  return (((report || {}).tickReport || {}).summary) || {};
}

function tickIssues(report) {
  return ((((report || {}).llmReport || {}).tickIssues) || []);
}

function issueDimensions(report) {
  var dimensions = {};
  tickIssues(report).forEach(function(issue) {
    if (issue.dimension) dimensions[issue.dimension] = true;
  });
  return dimensions;
}

function roleBindings(report) {
  return ((((report || {}).playPolicy || {}).roleBindings) || ((((report || {}).llmReport || {}).playPolicy || {}).roleBindings)) || {};
}

function buildSceneIntent(worldContext, report) {
  var bindings = roleBindings(report);
  var actor = safeText(bindings.actorSubject) || findSubject(worldContext, ['Player', 'hero'], 'Player');
  var reward = safeText(bindings.rewardSubject) || findSubject(worldContext, ['coins', 'coin', 'collectibles'], 'collectibles');
  var pressure = safeText(bindings.pressureSubject) || findSubject(worldContext, ['enemies', 'enemy', 'hazards'], 'hazards');
  var actionEntry = safeText(bindings.actionEntrySubject) || findSubject(worldContext, ['JumpButton', 'jump button', 'button'], 'control');
  var movementControl = findSubject(worldContext, ['Joystick', 'joystick'], null);
  var roles = [
    {
      role: 'player_agent',
      subject: actor,
      purpose: 'player agency and route sampling',
      primaryDesignObject: true,
      gameplayRole: 'actor',
    },
    {
      role: 'reward_pacing',
      subject: reward,
      purpose: 'route guidance and reward feedback',
      primaryDesignObject: true,
      feedbackCarrier: true,
      gameplayRole: 'reward',
    },
    {
      role: 'pressure_source',
      subject: pressure,
      purpose: 'risk and avoidance pressure',
      primaryDesignObject: true,
      gameplayRole: 'pressure',
    },
    {
      role: 'action_entry',
      subject: actionEntry,
      purpose: 'jump ability access',
      primaryDesignObject: false,
      uiPolicy: 'supporting input surface only',
      gameplayRole: 'action_entry',
    },
  ];
  if (movementControl) {
    roles.push({
      role: 'action_entry',
      subject: movementControl,
      purpose: 'movement ability access',
      primaryDesignObject: false,
      uiPolicy: 'supporting input surface only',
    });
  }
  return {
    gameplayFirst: true,
    aiFirstNaming: 'experience_dimension -> gameplay_role -> repair_verb -> safe_intent',
    sceneMode: 'single-scene',
    coreLoop: ['move', 'jump', 'collect', 'avoid'],
    roles: roles,
    uiPolicy: {
      role: 'supporting layer only',
      allowed: ['action entry', 'feedback visibility'],
      templateStrategy: 'style, icon, and broad layout come from selectable templates',
      deprioritized: ['visual decoration', 'icon styling', 'button color', 'pixel layout'],
      designerFocus: 'gameplay content first',
    },
  };
}

function buildPlaytestJudgement(report) {
  var summary = tickSummary(report);
  var dimensions = issueDimensions(report);
  return {
    movement: hasTickEvent(report, 'ActorIntent') || hasTickEvent(report, 'AutoRunStarted') ? 'available' : 'unknown',
    jump: ((((report || {}).playPolicy || {}).intents || []).indexOf('jump-when-needed') >= 0) ? 'available' : 'unknown',
    survival: summary.survived === false || dimensions.survival_window ? 'too_harsh' : 'acceptable',
    rewardPacing: dimensions.reward_pacing ? 'too_sparse' : 'acceptable',
    pressure: summary.firstDamageTick !== null && summary.firstDamageTick !== undefined ? 'too_high' : 'acceptable',
    sceneStructure: 'no structural scene change needed',
  };
}

function buildEvidence(report) {
  return tickIssues(report).map(function(issue) {
    var evidence = issue.evidence || {};
    return {
      tick: typeof evidence.tick === 'number' ? evidence.tick : null,
      issue: safeText(issue.kind, 'semantic_issue'),
      experienceDimension: safeText(issue.dimension, null),
      gameplayRole: safeText(issue.gameplayRole, null),
      repairVerb: safeText(issue.repairVerb, null),
      meaning: safeText(issue.message, issue.kind),
      metric: safeText(evidence.metric, null),
      observed: evidence.observed === undefined ? null : evidence.observed,
      expectedAtLeast: evidence.expectedAtLeast === undefined ? null : evidence.expectedAtLeast,
    };
  });
}

function actionFromIssue(issue, line) {
  var base = {
    experienceDimension: safeText(issue.dimension, null),
    gameplayRole: safeText(issue.gameplayRole, null),
    repairVerb: safeText(issue.repairVerb, null),
  };
  if (issue.dimension === 'reward_pacing') {
    return Object.assign(base, {
      action: 'increase_reward_pacing',
      priority: 'high',
      reason: safeText(issue.message, 'collection rate below target'),
      safeIntentDsl: line || null,
    });
  }
  if (issue.dimension === 'survival_window' || issue.dimension === 'pressure_balance') {
    return Object.assign(base, {
      action: 'reduce_pressure',
      priority: 'high',
      reason: safeText(issue.message, 'pressure is too high'),
      safeIntentDsl: line || null,
    });
  }
  if (issue.dimension === 'action_access') {
    return Object.assign(base, {
      action: 'adjust_action_entry',
      priority: 'medium',
      reason: safeText(issue.message, 'action entry is uncomfortable'),
      safeIntentDsl: line || null,
      uiPolicy: 'action entry adjustment only',
    });
  }
  return Object.assign(base, {
    action: 'apply_semantic_repair',
    priority: 'medium',
    reason: safeText(issue.message, issue.kind),
    safeIntentDsl: line || null,
  });
}

function buildExperienceTaxonomy() {
  var mappingView = semanticFeedback.buildSemanticMappingLlmView();
  return {
    naming: mappingView.aiFirstTaxonomy.naming,
    inheritance: mappingView.aiFirstTaxonomy.inheritance,
    dimensions: mappingView.experienceDimensions.map(function(dimension) {
      return {
        dimension: dimension.dimension,
        roles: dimension.roles,
        repairVerbs: dimension.repairVerbs,
      };
    }),
    roles: mappingView.gameplayRoles.map(function(role) {
      return {
        role: role.role,
        abstract: role.abstract,
        extends: role.extends,
      };
    }),
    repairVerbs: mappingView.repairVerbs.map(function(verb) {
      return verb.verb;
    }),
  };
}

function buildRecommendedActions(report) {
  var issues = tickIssues(report);
  var lines = ((((report || {}).llmReport || {}).repairIntentDslLines) || (report || {}).repairIntentDslLines || []);
  if (!issues.length || !lines.length) {
    return [
      {
        action: 'no_op',
        priority: 'high',
        reason: 'Current playtest evidence satisfies the active gameplay goals.',
        safeIntentDsl: null,
      },
    ];
  }
  return issues.map(function(issue, index) {
    return actionFromIssue(issue, lines[index] || lines[0] || null);
  }).filter(function(action) {
    if (!action.safeIntentDsl) return true;
    return intentSurfaceGuard.detectProhibitedSurface(action.safeIntentDsl).length === 0;
  }).concat([
    {
      action: 'no_op',
      priority: 'low',
      reason: 'Use only if the designer chooses not to change gameplay pacing this turn.',
      safeIntentDsl: null,
    },
  ]);
}

function buildContextRequests(report) {
  var requests = [
    {
      id: 'project_world_diff',
      purpose: 'inspect changed semantic objects and latest Intent DSL only when cache misses or the current evidence is ambiguous',
      defaultMode: 'diff',
    },
    {
      id: 'tick_event_window',
      purpose: 'inspect nearby EventLog entries around a reported tick before deciding how to change gameplay',
      defaultMode: 'focused-window',
    },
    {
      id: 'snapshot_summary',
      purpose: 'inspect compact world state around a reported tick without exposing engine coordinates',
      defaultMode: 'semantic-summary',
    },
    {
      id: 'semantic_mapping',
      purpose: 'inspect available issue profiles and safe repair verbs when a candidate action is not enough',
      defaultMode: 'llm-safe-view',
    },
    {
      id: 'ui_template_policy',
      purpose: 'inspect selectable style/icon/layout templates only when an input or feedback surface is the actual problem',
      defaultMode: 'template-choice',
    },
  ];
  var issues = tickIssues(report);
  return {
    policy: 'LLM2 may request more context before choosing an Intent DSL patch; candidate actions are not authoritative.',
    defaultRead: issues.length ? ['tick_event_window', 'project_world_diff'] : ['project_world_diff'],
    available: requests,
  };
}

function buildContextCache(options, worldContext, report) {
  options = options || {};
  var world = options.projectWorld || {};
  var executionReport = options.executionReport || options.lastExecutionReport || {};
  var baseHash = safeText(executionReport.baseSemanticHash, null);
  var targetHash = safeText(executionReport.targetSemanticHash || world.semanticHash, null);
  var cacheHit = !!(baseHash && targetHash && baseHash === targetHash);
  var intentLines = (((worldContext || {}).intent || {}).lastIntentDslLines || []).filter(function(line) {
    return !!safeText(line, null);
  });
  var issues = tickIssues(report);
  return {
    worldVersion: typeof world.worldVersion === 'number' ? world.worldVersion : null,
    baseSemanticHash: baseHash,
    targetSemanticHash: targetHash,
    semanticCacheHit: cacheHit,
    contextMode: cacheHit ? 'diff-only' : 'summary-plus-diff',
    stableFacts: cacheHit
      ? ['ProjectWorld semantic structure unchanged', 'reuse previous scene intent unless tick evidence changed']
      : ['ProjectWorld semantic structure changed or this is the first view'],
    diff: {
      latestIntentDslLines: intentLines.slice(-6),
      changedGameplayEvidence: issues.map(function(issue) {
        return {
          kind: safeText(issue.kind, 'semantic_issue'),
          tick: issue.evidence && typeof issue.evidence.tick === 'number' ? issue.evidence.tick : null,
        };
      }),
    },
  };
}

function buildDecisionTrail(options, report) {
  var provided = (options || {}).decisionTrail;
  if (provided && provided.length) return clone(provided);
  var intentLines = (((safeWorldFromOptions(options) || {}).intent || {}).lastIntentDslLines || []);
  var judgement = buildPlaytestJudgement(report);
  return [
    {
      step: 'latest_world_intent',
      intent: intentLines.length ? intentLines.join(' | ') : 'single-scene gameplay intent',
      result: judgement.rewardPacing === 'too_sparse' ? 'playable but reward pacing low' : 'playable under current evidence',
    },
  ];
}

function assertSafeIntentWorldView(view) {
  var text = JSON.stringify(view);
  if (text.indexOf('"x"') >= 0 || text.indexOf('"y"') >= 0) {
    throw new Error('IntentWorldView must not expose coordinates');
  }
  ['gdjs', 'componentId', 'bridgePlan', 'runtime adapter'].forEach(function(token) {
    if (text.indexOf(token) >= 0) throw new Error('IntentWorldView must not expose ' + token);
  });
  (view.recommendedActions || []).forEach(function(action) {
    if (action.safeIntentDsl && intentSurfaceGuard.detectProhibitedSurface(action.safeIntentDsl).length) {
      throw new Error('IntentWorldView recommended action contains prohibited Intent DSL');
    }
  });
  return view;
}

function buildIntentWorldView(options) {
  options = options || {};
  var report = options.semanticPlaytestReport || {};
  var worldContext = safeWorldFromOptions(options);
  var view = {
    schemaVersion: INTENT_WORLD_VIEW_SCHEMA_VERSION,
    owner: 'IntentWorldView',
    contextKind: 'intent-world-view',
    gameplayFirst: true,
    sceneMode: 'single-scene',
    userGoal: {
      original: safeText(options.userRequest || options.userGoal, null),
      currentRequest: safeText(options.currentRequest, 'decide next gameplay intent from playtest evidence'),
    },
    sceneIntent: buildSceneIntent(worldContext, report),
    experienceTaxonomy: buildExperienceTaxonomy(),
    playtestJudgement: buildPlaytestJudgement(report),
    contextCache: buildContextCache(options, worldContext, report),
    evidence: buildEvidence(report),
    contextRequests: buildContextRequests(report),
    recommendedActions: buildRecommendedActions(report),
    recommendationPolicy: {
      authority: 'candidate-only',
      finalDecisionOwner: 'LLM2',
      guidance: 'Use recommendations as hypotheses from tick evidence, then choose, revise, or ignore them after reading needed context.',
    },
    decisionTrail: buildDecisionTrail(options, report),
    outputContract: {
      allowed: ['Intent DSL', 'no-op'],
      forbidden: ['coordinates', 'engine internals', 'component ids', 'bridge plan', 'visual decoration first'],
    },
  };
  return assertSafeIntentWorldView(view);
}

module.exports = {
  INTENT_WORLD_VIEW_SCHEMA_VERSION: INTENT_WORLD_VIEW_SCHEMA_VERSION,
  buildIntentWorldView: buildIntentWorldView,
  assertSafeIntentWorldView: assertSafeIntentWorldView,
};
