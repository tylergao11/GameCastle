var intentSurfaceGuard = require('./intent-surface-guard');
var llm2ContextCacheRouter = require('./llm2-context-cache-router');
var semanticFeedback = require('./semantic-feedback');

var LLM2_DECISION_RUNTIME_SCHEMA_VERSION = 1;

var DECISION_TYPES = {
  APPLY_INTENT: 'apply_intent',
  REQUEST_CONTEXT: 'request_context',
  NO_OP: 'no_op',
  REJECT: 'reject',
};

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function hasContext(resolvedContext, contextId) {
  return !!(resolvedContext && (resolvedContext[contextId] || (resolvedContext.contexts && resolvedContext.contexts[contextId])));
}

function semanticHintsForRequest(text) {
  return semanticFeedback.requestSemanticHints(text).hints;
}

function requestRoutesToTemplate(hints) {
  return (hints || []).indexOf('route_to_template') >= 0 || (hints || []).indexOf('template_surface') >= 0;
}

function requestNeedsTickEvidence(hints) {
  return (hints || []).indexOf('needs_tick_evidence') >= 0;
}

function safeIntentLines(lines) {
  return (lines || []).map(function(line) {
    return String(line || '').trim();
  }).filter(function(line) {
    return line && !intentSurfaceGuard.detectProhibitedSurface(line).length;
  });
}

function candidateActions(contextRoute) {
  return (((contextRoute || {}).dynamicTail || {}).candidateActions) || [];
}

function semanticIterationMemory(contextRoute) {
  return (((contextRoute || {}).dynamicTail || {}).semanticIterationMemory) || null;
}

function semanticDimensionsByMeasurement() {
  var mapping = semanticFeedback.loadSemanticMapping();
  var byMeasurement = {};
  Object.keys(mapping.experienceDimensions || {}).forEach(function(dimensionId) {
    ((mapping.experienceDimensions[dimensionId] || {}).measurements || []).forEach(function(measurementId) {
      if (!byMeasurement[measurementId]) byMeasurement[measurementId] = [];
      byMeasurement[measurementId].push(dimensionId);
    });
  });
  return byMeasurement;
}

function actionTokens(action) {
  return [
    action.experienceDimension,
    action.gameplayRole,
    action.repairVerb,
    action.action,
  ].filter(Boolean);
}

function memoryRemainingIssues(memory) {
  return (((memory || {}).latest || {}).remainingIssues) || [];
}

function memoryImprovedDimensions(memory) {
  var byMeasurement = semanticDimensionsByMeasurement();
  var dimensions = {};
  ((((memory || {}).latest || {}).improvedMeasurements) || []).forEach(function(measurementId) {
    (byMeasurement[measurementId] || []).forEach(function(dimensionId) {
      dimensions[dimensionId] = true;
    });
  });
  return dimensions;
}

function actionMatchesRemainingIssue(action, issue) {
  return [
    issue.experienceDimension && action.experienceDimension === issue.experienceDimension,
    issue.gameplayRole && action.gameplayRole === issue.gameplayRole,
    issue.repairVerb && action.repairVerb === issue.repairVerb,
  ].filter(Boolean).length;
}

function scoreCandidate(action, requestHints, memory) {
  var score = action.priority === 'high' ? 20 : action.priority === 'medium' ? 10 : 1;
  var tokens = actionTokens(action);
  tokens.forEach(function(token) {
    if ((requestHints || []).indexOf(token) >= 0) score += 8;
  });
  var remainingIssues = memoryRemainingIssues(memory);
  var remainingMatch = 0;
  remainingIssues.forEach(function(issue) {
    remainingMatch += actionMatchesRemainingIssue(action, issue);
  });
  score += remainingMatch * 6;
  var improvedDimensions = memoryImprovedDimensions(memory);
  if (action.experienceDimension && improvedDimensions[action.experienceDimension] && remainingMatch === 0) {
    score -= 12;
  }
  return score;
}

function chooseCandidate(contextRoute, requestHints) {
  var memory = semanticIterationMemory(contextRoute);
  var actions = candidateActions(contextRoute).filter(function(action) {
    return action.action === 'apply_semantic_repair' && action.safeIntentDsl;
  });
  if (!actions.length) return null;
  return actions.map(function(action, index) {
    return {
      action: action,
      index: index,
      score: scoreCandidate(action, requestHints, memory),
    };
  }).sort(function(a, b) {
    if (b.score !== a.score) return b.score - a.score;
    return a.index - b.index;
  })[0].action;
}

function candidateRequiresTickEvidence(candidate) {
  return !!(candidate && candidate.requiresTickEvidence === true);
}

function buildRequestContextDecision(contextRoute, contextIds, reason) {
  return {
    decisionType: DECISION_TYPES.REQUEST_CONTEXT,
    intentDslLines: [],
    requestedContext: contextIds,
    reason: reason,
    confidence: 0.64,
    contextRoute: contextRoute,
  };
}

function buildMockDecision(options) {
  options = options || {};
  var contextRoute = options.contextRoute || llm2ContextCacheRouter.routeLlm2Context({
    projectWorld: options.projectWorld,
    intentWorldView: options.intentWorldView,
    semanticHash: options.semanticHash,
    userRequest: options.userRequest,
    currentRequest: options.currentRequest,
    projectMode: options.projectMode,
    consecutiveFailureCount: options.consecutiveFailureCount,
    hasStablePrefix: options.hasStablePrefix,
  });
  var requestText = options.userRequest || options.currentRequest || '';
  var requestHints = semanticHintsForRequest(requestText);
  var resolvedContext = options.resolvedContext || {};

  if (requestRoutesToTemplate(requestHints)) {
    return {
      decisionType: DECISION_TYPES.REJECT,
      intentDslLines: [],
      requestedContext: ['ui_template_policy'],
      reason: 'UI/icon styling is template policy, not a gameplay decision.',
      confidence: 0.82,
      contextRoute: contextRoute,
    };
  }

  if (requestNeedsTickEvidence(requestHints) && contextRoute.contextMode === 'recommended_pack' && !hasContext(resolvedContext, 'tick_event_window')) {
    return buildRequestContextDecision(
      contextRoute,
      ['tick_event_window'],
      'This semantic request needs focused Tick evidence before changing gameplay.'
    );
  }

  var selected = chooseCandidate(contextRoute, requestHints);
  if (candidateRequiresTickEvidence(selected) && !hasContext(resolvedContext, 'tick_event_window')) {
    return buildRequestContextDecision(
      contextRoute,
      ['tick_event_window'],
      'Candidate action requires focused Tick evidence before applying safe Intent DSL.'
    );
  }
  if (selected) {
    return {
      decisionType: DECISION_TYPES.APPLY_INTENT,
      intentDslLines: safeIntentLines([selected.safeIntentDsl]),
      requestedContext: [],
      selectedAction: {
        action: selected.action,
        priority: selected.priority,
        reason: selected.reason,
        experienceDimension: selected.experienceDimension || null,
        gameplayRole: selected.gameplayRole || null,
        repairVerb: selected.repairVerb || null,
      },
      reason: 'Apply safe Intent DSL chosen from routed candidate actions and available context.',
      confidence: hasContext(resolvedContext, 'tick_event_window') ? 0.78 : 0.7,
      contextRoute: contextRoute,
    };
  }

  return {
    decisionType: DECISION_TYPES.NO_OP,
    intentDslLines: [],
    requestedContext: [],
    reason: 'No gameplay issue requires a patch under current evidence.',
    confidence: 0.76,
    contextRoute: contextRoute,
  };
}

function verifyDecision(decision) {
  var errors = [];
  var warnings = [];
  if (!decision || !decision.decisionType) {
    errors.push('missing_decision_type');
  }
  if (decision && [
    DECISION_TYPES.APPLY_INTENT,
    DECISION_TYPES.REQUEST_CONTEXT,
    DECISION_TYPES.NO_OP,
    DECISION_TYPES.REJECT,
  ].indexOf(decision.decisionType) < 0) {
    errors.push('unsupported_decision_type');
  }
  var lines = decision ? decision.intentDslLines || [] : [];
  if (decision && decision.decisionType === DECISION_TYPES.APPLY_INTENT && !lines.length) {
    errors.push('apply_intent_requires_intent_dsl');
  }
  if (decision && decision.decisionType !== DECISION_TYPES.APPLY_INTENT && lines.length) {
    errors.push('non_apply_decision_must_not_emit_intent_dsl');
  }
  lines.forEach(function(line) {
    var hits = intentSurfaceGuard.detectProhibitedSurface(line);
    if (hits.length) errors.push('prohibited_intent_surface:' + hits.map(function(hit) { return hit.id; }).join(','));
  });
  if (decision && decision.decisionType === DECISION_TYPES.REQUEST_CONTEXT && !(decision.requestedContext || []).length) {
    errors.push('request_context_requires_context_ids');
  }
  if (decision && decision.contextRoute && decision.contextRoute.providerCacheModel && decision.contextRoute.providerCacheModel.reusableAcrossModalities !== false) {
    errors.push('deepseek_kv_cache_must_not_be_multimodal_cache');
  }
  if (decision && decision.decisionType === DECISION_TYPES.REJECT && (decision.requestedContext || []).indexOf('ui_template_policy') < 0) {
    warnings.push('reject_without_ui_template_policy_context');
  }
  return {
    owner: 'LLM2DecisionVerifier',
    passed: errors.length === 0,
    errors: errors,
    warnings: warnings,
  };
}

function runDecisionRuntime(options) {
  var decision = buildMockDecision(options || {});
  decision.schemaVersion = LLM2_DECISION_RUNTIME_SCHEMA_VERSION;
  decision.owner = 'LLM2DecisionRuntime';
  decision.engine = 'deterministic-mock';
  decision.verifier = verifyDecision(decision);
  if (!decision.verifier.passed) {
    decision.decisionType = DECISION_TYPES.REJECT;
    decision.intentDslLines = [];
    decision.reason = 'Decision verifier rejected unsafe or invalid output.';
  }
  return decision;
}

function assertVerifiedDecision(decision) {
  if (!decision || !decision.verifier || !decision.verifier.passed) {
    throw new Error('LLM2 Decision Runtime output failed verification: ' + JSON.stringify(decision && decision.verifier));
  }
  return decision;
}

module.exports = {
  LLM2_DECISION_RUNTIME_SCHEMA_VERSION: LLM2_DECISION_RUNTIME_SCHEMA_VERSION,
  DECISION_TYPES: DECISION_TYPES,
  runDecisionRuntime: runDecisionRuntime,
  buildMockDecision: buildMockDecision,
  verifyDecision: verifyDecision,
  assertVerifiedDecision: assertVerifiedDecision,
};
