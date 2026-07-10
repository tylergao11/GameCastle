var crypto = require('crypto');
var intentSurfaceGuard = require('./intent-surface-guard');
var semanticFeedback = require('./semantic-feedback');

var LLM2_CONTEXT_CACHE_ROUTER_SCHEMA_VERSION = 1;

var CONTEXT_MODES = {
  FULL_HIT: 'full_hit',
  DIFF_HIT: 'diff_hit',
  RECOMMENDED_PACK: 'recommended_pack',
  FULL_MISS: 'full_miss',
};

var CACHE_MODEL = {
  provider: 'deepseek',
  cacheKind: 'text-kv-prefix',
  reusableAcrossModalities: false,
  hitToMissPriceRatio: 50,
  rule: 'Only stable text prefix order/content should be optimized for KV cache. Do not reuse asset, image, or multimodal cache assumptions.',
};

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(value).sort().map(function(key) {
    return JSON.stringify(key) + ':' + stableStringify(value[key]);
  }).join(',') + '}';
}

function shortHash(value) {
  return crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, 12);
}

function safeText(value, fallback) {
  var text = String(value || fallback || '').trim();
  if (!text) return null;
  if (intentSurfaceGuard.detectProhibitedSurface(text).length) return null;
  return text;
}

function assertSafeRouterOutput(route) {
  var text = JSON.stringify(route);
  if (text.indexOf('"x"') >= 0 || text.indexOf('"y"') >= 0) {
    throw new Error('LLM2 Context Cache Router must not expose coordinates');
  }
  ['gdjs', 'componentId', 'bridgePlan', 'runtime adapter'].forEach(function(token) {
    if (text.indexOf(token) >= 0) throw new Error('LLM2 Context Cache Router must not expose ' + token);
  });
  (((route || {}).dynamicTail || {}).semanticRepairCandidates || []).forEach(function(candidate) {
    if (candidate.action !== 'apply_semantic_repair') {
      throw new Error('LLM2 Context Cache Router semantic repair candidates must use apply_semantic_repair');
    }
  });
  return route;
}

function hasTickIssues(intentWorldView) {
  return !!((intentWorldView && intentWorldView.evidence || []).length);
}

function semanticHintsForRequest(text) {
  return semanticFeedback.requestSemanticHints(text).hints;
}

function requestNeedsTickEvidence(hints) {
  return (hints || []).indexOf('needs_tick_evidence') >= 0;
}

function requestIsSemanticIteration(hints) {
  return (hints || []).some(function(hint) {
    return hint !== 'stable_current_state' && hint !== 'route_to_template' && hint !== 'template_surface';
  });
}

function candidateNeedsTickEvidence(actions) {
  return (actions || []).some(function(action) {
    return action && action.requiresTickEvidence === true;
  });
}

function safeSemanticRepairCandidates(actions) {
  var rejected = [];
  var safe = (actions || []).filter(function(action) {
    var ok = action && action.action === 'apply_semantic_repair' && action.safeIntentDsl;
    if (!ok && action) {
      rejected.push({
        reason: 'semantic repair candidate must be apply_semantic_repair with safeIntentDsl',
      });
    }
    return ok;
  }).map(function(action) {
    return {
      action: action.action,
      priority: action.priority || null,
      reason: action.reason || null,
      experienceDimension: action.experienceDimension || null,
      gameplayRole: action.gameplayRole || null,
      repairVerb: action.repairVerb || null,
      requiresTickEvidence: action.requiresTickEvidence === true,
      safeIntentDsl: action.safeIntentDsl,
    };
  });
  return {
    safe: safe,
    rejected: rejected,
  };
}

function cacheKeyFrom(options) {
  var intentWorldView = options.intentWorldView || {};
  var contextCache = intentWorldView.contextCache || {};
  var keyParts = {
    promptVersion: options.promptVersion || 'llm2-intent-v1',
    capabilityVersion: options.capabilityVersion || 'product-modules-current',
    templatePolicyVersion: options.templatePolicyVersion || 'ui-template-policy-v1',
    semanticHash: options.semanticHash || contextCache.targetSemanticHash || (options.projectWorld && options.projectWorld.semanticHash) || null,
  };
  return {
    parts: keyParts,
    value: shortHash(stableStringify(keyParts)),
  };
}

function buildStablePrefix(options, cacheKey) {
  var intentWorldView = options.intentWorldView || {};
  var sceneIntent = intentWorldView.sceneIntent || null;
  return {
    cacheDiscipline: CACHE_MODEL,
    promptVersion: cacheKey.parts.promptVersion,
    capabilityVersion: cacheKey.parts.capabilityVersion,
    templatePolicyVersion: cacheKey.parts.templatePolicyVersion,
    semanticHash: cacheKey.parts.semanticHash,
    invariantRules: [
      'LLM2 outputs Intent DSL or no-op only.',
      'Gameplay content has priority over UI and icon styling.',
      'UI and icon styling use selectable templates unless input access or feedback visibility is the actual issue.',
      'Stable prefix must exclude run ids, timestamps, full tick logs, raw snapshots, generated asset data, and user-turn-only text.',
    ],
    sceneIntent: sceneIntent ? {
      gameplayFirst: sceneIntent.gameplayFirst,
      sceneMode: sceneIntent.sceneMode,
      coreLoop: clone(sceneIntent.coreLoop || []),
      roles: clone(sceneIntent.roles || []),
      uiPolicy: clone(sceneIntent.uiPolicy || null),
    } : null,
  };
}

function buildDynamicTail(options, mode) {
  var intentWorldView = options.intentWorldView || {};
  var contextRequests = intentWorldView.contextRequests || {};
  var evidence = clone(intentWorldView.evidence || []);
  var semanticRepairRecommendations = intentWorldView.semanticRepairRecommendations || [];
  var candidateSafety = safeSemanticRepairCandidates(semanticRepairRecommendations);
  var semanticIterationMemory = clone(intentWorldView.semanticIterationMemory || null);
  var requestText = safeText(options.userRequest || options.currentRequest, null);
  var requestHints = semanticHintsForRequest(requestText);
  var tail = {
    userRequest: requestText,
    requestSemanticHints: requestHints,
    semanticIterationMemory: semanticIterationMemory,
    contextModeHint: intentWorldView.contextCache ? intentWorldView.contextCache.contextMode : null,
    tickEvidence: mode === CONTEXT_MODES.FULL_HIT || mode === CONTEXT_MODES.DIFF_HIT ? evidence : evidence.slice(0, 3),
    semanticRepairCandidates: candidateSafety.safe,
    semanticRepairCandidateAudit: {
      inputCount: semanticRepairRecommendations.length,
      exposedCount: candidateSafety.safe.length,
      rejectedCount: candidateSafety.rejected.length,
      rejected: candidateSafety.rejected,
    },
    recommendationPolicy: clone(intentWorldView.recommendationPolicy || null),
    requestedContext: clone(contextRequests.defaultRead || []),
  };
  if (mode === CONTEXT_MODES.RECOMMENDED_PACK && (
    requestNeedsTickEvidence(requestHints) || candidateNeedsTickEvidence(candidateSafety.safe)
  )) {
    if (tail.requestedContext.indexOf('tick_event_window') < 0) tail.requestedContext.unshift('tick_event_window');
  }
  if (mode === CONTEXT_MODES.FULL_MISS) {
    tail.worldSummaryRequired = true;
  }
  return tail;
}

function estimateCacheRisk(mode, reasons) {
  if (mode === CONTEXT_MODES.FULL_HIT) return 'low';
  if (mode === CONTEXT_MODES.DIFF_HIT) return 'low';
  if (mode === CONTEXT_MODES.RECOMMENDED_PACK) return reasons.indexOf('stable_prefix_unavailable') >= 0 ? 'medium' : 'low';
  return 'high';
}

function routeMode(options) {
  options = options || {};
  var intentWorldView = options.intentWorldView || {};
  var contextCache = intentWorldView.contextCache || {};
  var requestText = options.userRequest || options.currentRequest || '';
  var requestHints = semanticHintsForRequest(requestText);
  var failureCount = Number(options.consecutiveFailureCount || options.consecutiveWrongTurns || 0);
  var semanticCacheHit = !!contextCache.semanticCacheHit;
  var hasStablePrefix = options.hasStablePrefix !== false;
  var isNewProject = options.projectMode === 'new' || options.isNewProject === true || !contextCache.baseSemanticHash;
  var reasons = [];

  if (failureCount >= 2) {
    reasons.push('consecutive_failures');
    if (hasStablePrefix) return { mode: CONTEXT_MODES.FULL_HIT, reasons: reasons };
    reasons.push('stable_prefix_unavailable');
    return { mode: CONTEXT_MODES.FULL_MISS, reasons: reasons };
  }

  if (isNewProject) {
    reasons.push('new_project_or_no_base_semantic_hash');
    return { mode: CONTEXT_MODES.FULL_MISS, reasons: reasons };
  }

  if (requestNeedsTickEvidence(requestHints) || candidateNeedsTickEvidence(intentWorldView.semanticRepairRecommendations || [])) {
    reasons.push('focused_tick_evidence_request');
    return { mode: CONTEXT_MODES.RECOMMENDED_PACK, reasons: reasons };
  }

  if (semanticCacheHit && requestIsSemanticIteration(requestHints)) {
    reasons.push('same_semantic_world_gameplay_iteration');
    return { mode: CONTEXT_MODES.DIFF_HIT, reasons: reasons };
  }

  if (semanticCacheHit) {
    reasons.push('semantic_hash_unchanged');
    return { mode: CONTEXT_MODES.DIFF_HIT, reasons: reasons };
  }

  if (hasStablePrefix && hasTickIssues(intentWorldView)) {
    reasons.push('stable_prefix_available_with_new_tick_evidence');
    return { mode: CONTEXT_MODES.FULL_HIT, reasons: reasons };
  }

  reasons.push('stable_prefix_unavailable');
  return { mode: CONTEXT_MODES.RECOMMENDED_PACK, reasons: reasons };
}

function routeLlm2Context(options) {
  options = options || {};
  var routed = routeMode(options);
  var cacheKey = cacheKeyFrom(options);
  var stablePrefix = buildStablePrefix(options, cacheKey);
  var dynamicTail = buildDynamicTail(options, routed.mode);
  var route = {
    schemaVersion: LLM2_CONTEXT_CACHE_ROUTER_SCHEMA_VERSION,
    owner: 'LLM2ContextCacheRouter',
    providerCacheModel: clone(CACHE_MODEL),
    contextMode: routed.mode,
    cacheKey: cacheKey,
    stablePrefix: stablePrefix,
    dynamicTail: dynamicTail,
    estimatedCacheRisk: estimateCacheRisk(routed.mode, routed.reasons),
    reason: routed.reasons.join('; '),
    routingPolicy: {
      priority: ['diff_hit', 'full_hit', 'recommended_pack', 'full_miss'],
      fullMissPolicy: 'Use only for new projects, unavailable stable prefix, or repeated failures without a trusted prefix.',
      recommendedPackPolicy: 'Small candidate context is a triage pack, not a guarantee of correctness.',
    },
  };
  return assertSafeRouterOutput(route);
}

module.exports = {
  LLM2_CONTEXT_CACHE_ROUTER_SCHEMA_VERSION: LLM2_CONTEXT_CACHE_ROUTER_SCHEMA_VERSION,
  CONTEXT_MODES: CONTEXT_MODES,
  CACHE_MODEL: CACHE_MODEL,
  routeLlm2Context: routeLlm2Context,
  assertSafeRouterOutput: assertSafeRouterOutput,
};
