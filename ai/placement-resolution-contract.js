var intentSurfaceGuard = require('./intent-surface-guard');

var ALLOWED_MECHANISMS = {
  'screen-safe-area-placement': true,
  'ui-overlap-avoidance': true,
  'contextual-direction-rewrite': true,
  'object-relative-placement': true,
  'pattern-placement': true
};

var ALLOWED_EMISSION_MECHANISMS = {
  'semantic-group-placement-rewrite': true
};

function assertRouteEvidence(item, placement) {
  if (!item) throw new Error('Missing placement route evidence');
  if (!item.owner) throw new Error('Placement route evidence missing owner: ' + placement.subject);
  if (item.owner !== 'placement-resolver') throw new Error('Placement route owner must be placement-resolver: ' + placement.subject);
  if (!item.mechanism) throw new Error('Placement route evidence missing mechanism: ' + placement.subject);
  if (!ALLOWED_MECHANISMS[item.mechanism]) throw new Error('Placement route mechanism is not allowed: ' + item.mechanism);
  if (!item.routeId) throw new Error('Placement route evidence missing routeId: ' + placement.subject);
  if (!item.routeMechanism) throw new Error('Placement route evidence missing routeMechanism: ' + placement.subject);
  var route = intentSurfaceGuard.getBridgeIssueRoute(item.routeId);
  if (route.routeOwner !== item.owner) {
    throw new Error('Placement route owner mismatch for ' + item.routeId + ': expected ' + route.routeOwner + ', got ' + item.owner);
  }
  if (route.routeMechanism !== item.routeMechanism) {
    throw new Error('Placement route mechanism mismatch for ' + item.routeId + ': expected ' + route.routeMechanism + ', got ' + item.routeMechanism);
  }
}

function assertPlacement(placement) {
  if (!placement) throw new Error('Missing placement');
  if (placement.unresolved) return true;
  if (!placement.subject) throw new Error('Resolved placement missing subject');
  if (!placement.resolved) throw new Error('Resolved placement missing resolved point: ' + placement.subject);
  if (!Array.isArray(placement.routeEvidence) || !placement.routeEvidence.length) {
    throw new Error('Resolved placement missing routeEvidence: ' + placement.subject);
  }
  placement.routeEvidence.forEach(function(item) {
    assertRouteEvidence(item, placement);
  });
  if ((placement.pattern && placement.pattern !== 'single') || placement.count > 1) {
    if (!placement.emission) throw new Error('Pattern placement missing emission metadata: ' + placement.subject);
    if (!placement.emission.mechanism) throw new Error('Pattern placement emission missing mechanism: ' + placement.subject);
    if (!ALLOWED_EMISSION_MECHANISMS[placement.emission.mechanism]) {
      throw new Error('Pattern placement emission mechanism is not allowed: ' + placement.emission.mechanism);
    }
    if (!placement.emission.routeId) throw new Error('Pattern placement emission missing routeId: ' + placement.subject);
    if (!placement.emission.routeMechanism) throw new Error('Pattern placement emission missing routeMechanism: ' + placement.subject);
    var route = intentSurfaceGuard.getBridgeIssueRoute(placement.emission.routeId);
    if (route.routeOwner !== 'placement-resolver') {
      throw new Error('Pattern placement emission route owner mismatch for ' + placement.emission.routeId + ': expected placement-resolver, got ' + route.routeOwner);
    }
    if (route.routeMechanism !== placement.emission.routeMechanism) {
      throw new Error('Pattern placement emission route mechanism mismatch for ' + placement.emission.routeId + ': expected ' + route.routeMechanism + ', got ' + placement.emission.routeMechanism);
    }
  }
  return true;
}

function assertPlan(plan) {
  (plan.placements || []).forEach(assertPlacement);
  return true;
}

module.exports = {
  assertPlacement: assertPlacement,
  assertPlan: assertPlan
};
