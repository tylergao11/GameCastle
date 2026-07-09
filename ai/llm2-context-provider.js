var intentSurfaceGuard = require('./intent-surface-guard');

var LLM2_CONTEXT_PROVIDER_SCHEMA_VERSION = 1;

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function nearestIssueTick(intentWorldView) {
  var evidence = (intentWorldView && intentWorldView.evidence) || [];
  for (var i = 0; i < evidence.length; i++) {
    if (typeof evidence[i].tick === 'number') return evidence[i].tick;
  }
  return 0;
}

function eventsAround(tickReport, centerTick, radius) {
  radius = typeof radius === 'number' ? radius : 120;
  return ((tickReport || {}).eventLog || []).filter(function(event) {
    return typeof event.tick === 'number' && event.tick >= centerTick - radius && event.tick <= centerTick + radius;
  }).map(function(event) {
    return {
      tick: event.tick,
      type: event.type,
      semantic: event.semantic,
      details: summarizeDetails(event.details || {}),
    };
  });
}

function summarizeDetails(details) {
  var safe = {};
  Object.keys(details || {}).sort().forEach(function(key) {
    if (key === 'x' || key === 'y' || key === 'componentId' || key === 'bridgePlan') return;
    var value = details[key];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      safe[key] = value;
    }
  });
  return safe;
}

function snapshotsAround(tickReport, centerTick) {
  return ((tickReport || {}).snapshots || []).map(function(snapshot) {
    return {
      tick: snapshot.tick,
      state: summarizeDetails(snapshot.state || {}),
      metrics: summarizeDetails(snapshot.metrics || {}),
    };
  }).filter(function(snapshot) {
    return typeof snapshot.tick === 'number' && Math.abs(snapshot.tick - centerTick) <= 360;
  });
}

function buildTickEventWindow(options) {
  var centerTick = nearestIssueTick(options.intentWorldView);
  var events = eventsAround(options.tickReport, centerTick, options.radiusTicks || 160);
  return {
    id: 'tick_event_window',
    owner: 'LLM2ContextProvider',
    centerTick: centerTick,
    radiusTicks: options.radiusTicks || 160,
    events: events,
    summary: events.length
      ? 'Focused tick window contains ' + events.length + ' semantic event(s).'
      : 'Focused tick window has no nearby semantic events.',
  };
}

function buildProjectWorldDiff(options) {
  var contextCache = ((options.intentWorldView || {}).contextCache) || {};
  return {
    id: 'project_world_diff',
    owner: 'LLM2ContextProvider',
    baseSemanticHash: contextCache.baseSemanticHash || null,
    targetSemanticHash: contextCache.targetSemanticHash || null,
    semanticCacheHit: !!contextCache.semanticCacheHit,
    latestIntentDslLines: clone(((contextCache.diff || {}).latestIntentDslLines) || []),
    changedGameplayEvidence: clone(((contextCache.diff || {}).changedGameplayEvidence) || []),
    summary: contextCache.semanticCacheHit
      ? 'Semantic world unchanged; use diff evidence only.'
      : 'Semantic world changed or base hash unavailable; use summary plus diff.',
  };
}

function buildSnapshotSummary(options) {
  var centerTick = nearestIssueTick(options.intentWorldView);
  var snapshots = snapshotsAround(options.tickReport, centerTick);
  return {
    id: 'snapshot_summary',
    owner: 'LLM2ContextProvider',
    centerTick: centerTick,
    snapshots: snapshots,
    summary: snapshots.length
      ? 'Snapshot summary is available around tick ' + centerTick + '.'
      : 'No nearby snapshots; use tick evidence and world diff.',
  };
}

function buildUiTemplatePolicy() {
  return {
    id: 'ui_template_policy',
    owner: 'LLM2ContextProvider',
    policy: {
      role: 'supporting template layer',
      allowedDecision: ['choose_style_template', 'choose_icon_template', 'choose_broad_layout_template'],
      forbiddenAsGameplayPatch: ['pixel tuning', 'custom icon prompt loops', 'button skin iteration as gameplay work'],
      gameplayEscalation: 'Only escalate to gameplay decision when input access or feedback visibility blocks play.',
    },
    summary: 'UI/icon requests should be handled through selectable templates, not gameplay Intent DSL.',
  };
}

function buildContextById(id, options) {
  if (id === 'tick_event_window') return buildTickEventWindow(options);
  if (id === 'project_world_diff') return buildProjectWorldDiff(options);
  if (id === 'snapshot_summary') return buildSnapshotSummary(options);
  if (id === 'ui_template_policy') return buildUiTemplatePolicy(options);
  return {
    id: id,
    owner: 'LLM2ContextProvider',
    unavailable: true,
    summary: 'Requested context is not available from this provider.',
  };
}

function assertSafeProvidedContext(value) {
  var text = JSON.stringify(value);
  if (text.indexOf('"x"') >= 0 || text.indexOf('"y"') >= 0) {
    throw new Error('LLM2 Context Provider must not expose coordinates');
  }
  ['gdjs', 'componentId', 'bridgePlan', 'runtime adapter'].forEach(function(token) {
    if (text.indexOf(token) >= 0) throw new Error('LLM2 Context Provider must not expose ' + token);
  });
  if (intentSurfaceGuard.detectProhibitedSurface(text).some(function(hit) { return hit.id === 'component-id'; })) {
    throw new Error('LLM2 Context Provider must not expose component id surface');
  }
  return value;
}

function provideContext(options) {
  options = options || {};
  var requested = options.requestedContext || [];
  var contexts = {};
  requested.forEach(function(id) {
    contexts[id] = buildContextById(id, options);
  });
  var result = {
    schemaVersion: LLM2_CONTEXT_PROVIDER_SCHEMA_VERSION,
    owner: 'LLM2ContextProvider',
    requestedContext: clone(requested),
    contexts: contexts,
    summary: {
      provided: Object.keys(contexts).length,
      missing: Object.keys(contexts).filter(function(id) { return contexts[id].unavailable; }),
    },
  };
  return assertSafeProvidedContext(result);
}

module.exports = {
  LLM2_CONTEXT_PROVIDER_SCHEMA_VERSION: LLM2_CONTEXT_PROVIDER_SCHEMA_VERSION,
  provideContext: provideContext,
  assertSafeProvidedContext: assertSafeProvidedContext,
};
