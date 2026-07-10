var intentSurfaceGuard = require('./intent-surface-guard');

function clone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function nextActionForOwner(owner) {
  if (owner === 'llm2-intent') return 'intent-repair';
  return 'route-to-owner';
}

function routeDiagnostic(routeId, diagnostic, options) {
  diagnostic = diagnostic || {};
  var route = intentSurfaceGuard.getBridgeIssueRoute(routeId, options);
  var routed = clone(diagnostic) || {};
  routed.routeId = route.id;
  routed.routeOwner = route.routeOwner;
  routed.routeMechanism = route.routeMechanism;
  routed.owner = route.routeOwner;
  routed.nextAction = nextActionForOwner(route.routeOwner);
  routed.prohibitedDslExpansions = clone(route.prohibitedDslExpansions || []);
  routed.resultCardEvidence = clone(route.resultCardEvidence || []);
  return routed;
}

function assertRoutedDiagnostic(diagnostic) {
  if (!diagnostic) throw new Error('Missing diagnostic');
  if (!diagnostic.routeId) throw new Error('Diagnostic missing routeId: ' + (diagnostic.category || diagnostic.message || 'unknown'));
  if (!diagnostic.owner) throw new Error('Diagnostic missing owner: ' + diagnostic.routeId);
  if (!diagnostic.routeOwner) throw new Error('Diagnostic missing routeOwner: ' + diagnostic.routeId);
  if (diagnostic.owner !== diagnostic.routeOwner) {
    throw new Error('Diagnostic owner mismatch for ' + diagnostic.routeId + ': ' + diagnostic.owner + ' !== ' + diagnostic.routeOwner);
  }
  if (!diagnostic.routeMechanism) throw new Error('Diagnostic missing routeMechanism: ' + diagnostic.routeId);
  if (!diagnostic.nextAction) throw new Error('Diagnostic missing nextAction: ' + diagnostic.routeId);
  if (diagnostic.nextAction === 'intent-repair' && diagnostic.owner !== 'llm2-intent') {
    throw new Error('Only llm2-intent diagnostics can request intent repair: ' + diagnostic.routeId);
  }
  if (diagnostic.nextAction !== 'intent-repair' && diagnostic.owner === 'llm2-intent') {
    throw new Error('llm2-intent diagnostics must use intent-repair nextAction: ' + diagnostic.routeId);
  }
  return true;
}

function assertAllRouted(diagnostics) {
  (diagnostics || []).forEach(assertRoutedDiagnostic);
  return true;
}

function classifyDiagnostics(diagnostics) {
  diagnostics = diagnostics || [];
  assertAllRouted(diagnostics);
  var routed = diagnostics;
  var routeToOwner = routed.filter(function(diagnostic) {
    return diagnostic.nextAction === 'route-to-owner';
  });
  var intentRepair = routed.filter(function(diagnostic) {
    return diagnostic.nextAction === 'intent-repair';
  });
  return {
    total: diagnostics.length,
    routed: routed.length,
    routeToOwner: routeToOwner,
    intentRepair: intentRepair,
    nextAction: routeToOwner.length ? 'route-to-owner' : (intentRepair.length ? 'intent-repair' : 'done')
  };
}

function describeDiagnostics(diagnostics) {
  return (diagnostics || []).map(function(diagnostic) {
    return [
      diagnostic.routeId || diagnostic.category || 'diagnostic',
      diagnostic.owner || diagnostic.routeOwner || 'unknown-owner',
      diagnostic.nextAction || 'unrouted',
      diagnostic.message || ''
    ].join(': ');
  }).join('\n');
}

module.exports = {
  routeDiagnostic: routeDiagnostic,
  assertRoutedDiagnostic: assertRoutedDiagnostic,
  assertAllRouted: assertAllRouted,
  classifyDiagnostics: classifyDiagnostics,
  describeDiagnostics: describeDiagnostics
};
