var deepseekCacheMonitor = require('./deepseek-cache-monitor');
var llm2DecisionRuntime = require('./llm2-decision-runtime');
var semanticFeedback = require('./semantic-feedback');

var LLM2_DEEPSEEK_DECISION_PROVIDER_SCHEMA_VERSION = 1;

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function stablePrefix() {
  return [
    'GameCastle LLM2 real decision provider.',
    'You are replacing only the deterministic decision engine.',
    'Runtime ownership stays outside this provider: routing, context provision, verification, pipeline execution, and Tick playtest.',
    'Output format: strict JSON object.',
    'decisionType slot values: apply_intent, request_context, no_op, reject.',
    'Output slots:',
    '{"decisionType":"apply_intent|request_context|no_op|reject","intentDslLines":[],"requestedContext":[],"reason":"short reason","confidence":0.0}',
    'Intent DSL slot accepts natural gameplay intent lines.',
    'Valid proof vocabulary: candidate_matched, evidence_gap, stable_current_state, template_policy.',
    'candidate_matched selects apply_intent with the proven safeIntentDsl.',
    'evidence_gap selects request_context with one allowed context id.',
    'stable_current_state selects no_op.',
    'template_policy selects reject with ui_template_policy.',
  ].join('\n');
}

function semanticHints(userRequest) {
  return semanticFeedback.requestSemanticHints(userRequest).hints;
}

function semanticInterpretation(userRequest) {
  var hints = semanticHints(userRequest);
  if (hints.indexOf('reward_pacing') >= 0 && hints.indexOf('increase_presence') >= 0) {
    return 'Resolved local meaning: increase reward presence or reward pacing through a safe semantic repair candidate.';
  }
  if (hints.indexOf('pressure_balance') >= 0 && hints.indexOf('soften_pressure') >= 0) {
    return 'Resolved local meaning: soften pressure balance. Use Tick evidence when timing matters.';
  }
  if (hints.indexOf('template_surface') >= 0) {
    return 'Resolved local meaning: UI/icon styling request. This belongs to template policy unless gameplay access is blocked.';
  }
  if (hints.indexOf('stable_current_state') >= 0) {
    return 'Resolved local meaning: current Tick evidence is stable. No gameplay Intent is required.';
  }
  if (hints.indexOf('survival_window') >= 0) {
    return 'Resolved local meaning: survival window is too short. Use Tick evidence before applying a recovery or pressure action.';
  }
  return 'Resolved local meaning: no specific gameplay change was detected.';
}

function candidateIntentLines(intentWorldView) {
  return ((intentWorldView || {}).semanticRepairRecommendations || []).map(function(action) {
    return {
      action: action.action,
      priority: action.priority,
      reason: action.reason,
      experienceDimension: action.experienceDimension || null,
      gameplayRole: action.gameplayRole || null,
      repairVerb: action.repairVerb || null,
      requiresTickEvidence: action.requiresTickEvidence === true,
      safeIntentDsl: action.safeIntentDsl || null,
    };
  }).filter(function(action) {
    return action.action === 'apply_semantic_repair' && action.safeIntentDsl;
  });
}

function promptSafeIntentWorldView(intentWorldView) {
  var view = clone(intentWorldView || {});
  if (Array.isArray(view.semanticRepairRecommendations)) {
    view.semanticRepairRecommendationCount = view.semanticRepairRecommendations.length;
    delete view.semanticRepairRecommendations;
  }
  return view;
}

function promptSafeContextRoute(contextRoute) {
  var route = clone(contextRoute || {});
  if (route.dynamicTail && Array.isArray(route.dynamicTail.semanticRepairCandidates)) {
    route.dynamicTail.semanticRepairCandidateCount = route.dynamicTail.semanticRepairCandidates.length;
    delete route.dynamicTail.semanticRepairCandidates;
  }
  return route;
}

function findMatchedCandidate(hints, candidates) {
  for (var i = 0; i < candidates.length; i++) {
    var candidate = candidates[i];
    var semanticFields = [
      candidate.experienceDimension,
      candidate.gameplayRole,
      candidate.repairVerb,
    ].filter(Boolean);
    var semanticMatch = semanticFields.some(function(field) {
      return hints.indexOf(field) >= 0;
    });
    if (candidate.priority === 'high' && candidate.safeIntentDsl && semanticMatch) {
      return candidate;
    }
  }
  return null;
}

function hasResolvedContext(options, contextId) {
  var resolvedContext = options.resolvedContext || {};
  return !!(resolvedContext[contextId] || (resolvedContext.contexts && resolvedContext.contexts[contextId]));
}

function buildProofSlots(options) {
  var hints = semanticHints(options.userRequest);
  var candidates = candidateIntentLines(options.intentWorldView);
  var matchedCandidate = findMatchedCandidate(hints, candidates);
  if (hints.indexOf('ui_template_request') >= 0 || hints.indexOf('template_surface') >= 0 || hints.indexOf('route_to_template') >= 0) {
    return {
      proof: 'template_policy',
      resolvedDecisionType: 'reject',
      provenIntentDslLines: [],
      requestedContext: ['ui_template_policy'],
      reason: 'local semantic hints identify a UI template policy request',
    };
  }
  if (hints.indexOf('stable_current_state') >= 0) {
    return {
      proof: 'stable_current_state',
      resolvedDecisionType: 'no_op',
      provenIntentDslLines: [],
      requestedContext: [],
      reason: 'local semantic hints and semantic repair candidates indicate stable current state',
    };
  }
  if (matchedCandidate && (hints.indexOf('needs_tick_evidence') >= 0 || matchedCandidate.requiresTickEvidence === true) && !hasResolvedContext(options, 'tick_event_window')) {
    return {
      proof: 'evidence_gap',
      resolvedDecisionType: 'request_context',
      provenIntentDslLines: [],
      requestedContext: ['tick_event_window'],
      matchedAction: matchedCandidate.action,
      reason: 'local semantic hints found a safe candidate, and Tick evidence is required before applying it',
    };
  }
  if (matchedCandidate) {
    return {
      proof: 'candidate_matched',
      resolvedDecisionType: 'apply_intent',
      provenIntentDslLines: [matchedCandidate.safeIntentDsl],
      matchedAction: matchedCandidate.action,
      reason: 'local semantic hints match a high-priority safeIntentDsl candidate',
    };
  }
  return {
    proof: 'model_decides',
    resolvedDecisionType: null,
    provenIntentDslLines: [],
    reason: 'no local proof slot resolved the decision',
  };
}

function allowedRequestedContextIds(intentWorldView) {
  var available = (((intentWorldView || {}).contextRequests || {}).available || []).map(function(item) {
    return item.id;
  }).filter(Boolean);
  if (!available.length) {
    available = ['tick_event_window', 'project_world_diff', 'snapshot_summary', 'ui_template_policy'];
  }
  return available;
}

function dynamicPrompt(options) {
  var hints = semanticHints(options.userRequest);
  var candidates = candidateIntentLines(options.intentWorldView);
  var allowedContext = allowedRequestedContextIds(options.intentWorldView);
  var proofSlots = buildProofSlots(options);
  var safeIntentWorldView = promptSafeIntentWorldView(options.intentWorldView);
  var safeContextRoute = promptSafeContextRoute(options.contextRoute);
  return [
    'slot:user_request',
    options.userRequest || '',
    '',
    'slot:local_semantic_interpretation',
    semanticInterpretation(options.userRequest),
    '',
    'slot:semantic_hints',
    JSON.stringify(hints, null, 2),
    '',
    'slot:candidate_safe_actions',
    JSON.stringify(candidates, null, 2),
    '',
    'slot:local_proof',
    JSON.stringify(proofSlots, null, 2),
    '',
    'slot:decision_rule',
    'candidate_matched => decisionType apply_intent, intentDslLines = provenIntentDslLines',
    'evidence_gap => decisionType request_context, requestedContext = one allowed id',
    'stable_current_state => decisionType no_op',
    'template_policy => decisionType reject, requestedContext = ["ui_template_policy"]',
    '',
    'slot:allowed_requested_context_ids',
    JSON.stringify(allowedContext, null, 2),
    '',
    'slot:context_route',
    JSON.stringify(safeContextRoute, null, 2),
    '',
    'slot:intent_world_view',
    JSON.stringify(safeIntentWorldView, null, 2),
    '',
    'slot:resolved_context',
    JSON.stringify(options.resolvedContext || null, null, 2),
    '',
    'slot:required_output',
    '{"decisionType":"","intentDslLines":[],"requestedContext":[],"reason":"","confidence":0}',
  ].join('\n');
}

function extractJsonObject(text) {
  text = String(text || '').trim();
  var fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) text = fence[1].trim();
  var start = text.indexOf('{');
  var end = text.lastIndexOf('}');
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  return JSON.parse(text);
}

async function readSse(response) {
  var text = '';
  var usage = {};
  var events = [];
  var reader = response.body.getReader();
  var decoder = new TextDecoder();
  var buffer = '';
  while (true) {
    var chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    var lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || line.indexOf('data: ') !== 0) continue;
      var raw = line.substring(6);
      if (raw === '[DONE]') continue;
      var event;
      try {
        event = JSON.parse(raw);
      } catch (e) {
        continue;
      }
      events.push(event.type || 'unknown');
      if (event.type === 'response.output_text.delta' || event.type === 'response.text.delta') {
        text += (event.data && event.data.delta) || event.delta || '';
      }
      if (event.type === 'response.completed') {
        usage = (event.data && event.data.response && event.data.response.usage) ||
          (event.response && event.response.usage) ||
          event.usage ||
          usage;
      }
    }
  }
  return {
    text: text,
    usage: usage,
    events: events,
  };
}

async function callProvider(options) {
  var fetchImpl = options.fetchImpl || fetch;
  var response = await fetchImpl(String(options.endpoint || 'http://127.0.0.1:18081/v1').replace(/\/$/, '') + '/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + (options.apiKey || ''),
    },
    body: JSON.stringify({
      model: options.model || 'deepseek-v4-flash',
      input: [
        { role: 'system', content: stablePrefix() },
        { role: 'user', content: dynamicPrompt(options) },
      ],
      max_output_tokens: options.maxTokens || 512,
      reasoning_effort: options.reasoningEffort || 'low',
      stream: true,
    }),
  });
  if (!response.ok) {
    var errText = '';
    try { errText = await response.text(); } catch (e) {}
    throw new Error('LLM2 DeepSeek decision HTTP ' + response.status + ': ' + errText.slice(0, 300));
  }
  return readSse(response);
}

function normalizeDecision(rawDecision, options) {
  var proofSlots = buildProofSlots(options);
  var modelRawDecisionType = rawDecision.decisionType || 'unknown';
  if (proofSlots.resolvedDecisionType === 'apply_intent') {
    rawDecision = {
      decisionType: 'apply_intent',
      intentDslLines: proofSlots.provenIntentDslLines,
      requestedContext: [],
      reason: 'Proof slot candidate_matched selected safe Intent DSL. Model raw decision: ' + modelRawDecisionType,
      confidence: Math.max(Number(rawDecision.confidence || 0), 0.8),
      proofApplied: true,
    };
  } else if (proofSlots.resolvedDecisionType === 'request_context') {
    rawDecision = {
      decisionType: 'request_context',
      intentDslLines: [],
      requestedContext: proofSlots.requestedContext || ['tick_event_window'],
      reason: 'Proof slot evidence_gap selected Tick context. Model raw decision: ' + modelRawDecisionType,
      confidence: Math.max(Number(rawDecision.confidence || 0), 0.74),
      proofApplied: true,
    };
  } else if (proofSlots.resolvedDecisionType === 'no_op') {
    rawDecision = {
      decisionType: 'no_op',
      intentDslLines: [],
      requestedContext: [],
      reason: 'Proof slot stable_current_state selected no_op. Model raw decision: ' + modelRawDecisionType,
      confidence: Math.max(Number(rawDecision.confidence || 0), 0.78),
      proofApplied: true,
    };
  } else if (proofSlots.resolvedDecisionType === 'reject') {
    rawDecision = {
      decisionType: 'reject',
      intentDslLines: [],
      requestedContext: proofSlots.requestedContext || ['ui_template_policy'],
      reason: 'Proof slot template_policy selected reject. Model raw decision: ' + modelRawDecisionType,
      confidence: Math.max(Number(rawDecision.confidence || 0), 0.8),
      proofApplied: true,
    };
  }
  var decision = {
    schemaVersion: llm2DecisionRuntime.LLM2_DECISION_RUNTIME_SCHEMA_VERSION,
    owner: 'LLM2DecisionRuntime',
    engine: 'deepseek',
    decisionType: rawDecision.decisionType,
    intentDslLines: Array.isArray(rawDecision.intentDslLines) ? rawDecision.intentDslLines : [],
    requestedContext: Array.isArray(rawDecision.requestedContext) ? rawDecision.requestedContext : [],
    reason: rawDecision.reason || 'DeepSeek decision provider output.',
    confidence: Number(rawDecision.confidence || 0),
    contextRoute: clone(options.contextRoute || null),
  };
  if (rawDecision.selectedAction) decision.selectedAction = clone(rawDecision.selectedAction);
  decision.proof = {
    slots: proofSlots,
    applied: rawDecision.proofApplied === true,
    rawDecisionType: modelRawDecisionType,
  };
  decision.verifier = llm2DecisionRuntime.verifyDecision(decision);
  if (decision.decisionType === 'request_context') {
    var allowed = allowedRequestedContextIds(options.intentWorldView);
    var invalid = (decision.requestedContext || []).filter(function(id) {
      return allowed.indexOf(id) < 0;
    });
    if (invalid.length) {
      decision.verifier.passed = false;
      decision.verifier.errors.push('requested_context_id_not_allowed:' + invalid.join(','));
    }
  }
  if (!decision.verifier.passed) {
    decision.decisionType = llm2DecisionRuntime.DECISION_TYPES.REJECT;
    decision.intentDslLines = [];
    decision.reason = 'DeepSeek decision was rejected by LLM2DecisionVerifier.';
  }
  return decision;
}

async function runDeepSeekDecisionProvider(options) {
  options = Object.assign({
    endpoint: process.env.LLM_ENDPOINT || 'http://127.0.0.1:18081/v1',
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    model: process.env.LLM_MODEL || process.env.GAMECASTLE_INTENT_MODEL || 'deepseek-v4-flash',
    threshold: 0.9,
  }, options || {});
  var response = await callProvider(options);
  var rawDecision;
  try {
    rawDecision = extractJsonObject(response.text);
  } catch (e) {
    rawDecision = {
      decisionType: llm2DecisionRuntime.DECISION_TYPES.REJECT,
      intentDslLines: [],
      requestedContext: [],
      reason: 'DeepSeek output was not parseable strict JSON: ' + String(e.message || e),
      confidence: 0,
    };
  }
  var decision = normalizeDecision(rawDecision, options);
  var cacheGate = deepseekCacheMonitor.evaluateCacheGate(response.usage, options.threshold);
  return {
    schemaVersion: LLM2_DEEPSEEK_DECISION_PROVIDER_SCHEMA_VERSION,
    owner: 'LLM2DeepSeekDecisionProvider',
    provider: {
      endpoint: options.endpoint,
      model: options.model,
      cacheKind: 'deepseek-text-kv-prefix',
    },
    input: {
      userRequest: options.userRequest,
      contextMode: options.contextRoute && options.contextRoute.contextMode,
    },
    rawText: response.text,
    sseEvents: response.events,
    usage: response.usage,
    cacheGate: cacheGate,
    decision: decision,
    summary: {
      passed: decision.verifier && decision.verifier.passed && cacheGate.passed,
      decisionType: decision.decisionType,
      verifierPassed: !!(decision.verifier && decision.verifier.passed),
      cacheGatePassed: cacheGate.passed,
      cacheHitRate: cacheGate.hitRate,
    },
  };
}

module.exports = {
  LLM2_DEEPSEEK_DECISION_PROVIDER_SCHEMA_VERSION: LLM2_DEEPSEEK_DECISION_PROVIDER_SCHEMA_VERSION,
  stablePrefix: stablePrefix,
  semanticHints: semanticHints,
  semanticInterpretation: semanticInterpretation,
  buildProofSlots: buildProofSlots,
  dynamicPrompt: dynamicPrompt,
  extractJsonObject: extractJsonObject,
  runDeepSeekDecisionProvider: runDeepSeekDecisionProvider,
};
