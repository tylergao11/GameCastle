var intentSurfaceGuard = require('./intent-surface-guard');

function hasTrace(card, stage, owner) {
  return !!(card && card.ownerTrace || []).some(function(item) {
    return item.stage === stage && item.owner === owner;
  });
}

function hasAdapter(plan, adapter) {
  return !!(plan.runtimeAdapterRequirements || []).some(function(requirement) {
    return requirement.adapter === adapter;
  });
}

function hasAdapterRoute(plan, adapter, routeId, mechanism) {
  return !!(plan.runtimeAdapterRequirements || []).some(function(requirement) {
    return requirement.adapter === adapter &&
      requirement.routeId === routeId &&
      (!mechanism || requirement.mechanism === mechanism);
  });
}

function hasComponent(graph, componentId) {
  return (graph.components || []).find(function(component) {
    return component.componentId === componentId;
  }) || null;
}

function hasBinding(graph, inputKind) {
  return !!(graph.bindings || []).some(function(binding) {
    return binding.inputKind === inputKind;
  });
}

function hasEmission(plan, owner, mechanism, routeId) {
  return !!(plan.emitted || []).some(function(item) {
    return item.owner === owner &&
      item.mechanism === mechanism &&
      (!routeId || item.routeId === routeId);
  });
}

function hasPlacement(plan, predicate) {
  return !!(plan.placements || []).some(predicate);
}

function hasPlacementRoute(plan, routeId, mechanism) {
  return !!(plan.placements || []).some(function(placement) {
    return (placement.routeEvidence || []).some(function(item) {
      return item.routeId === routeId && (!mechanism || item.mechanism === mechanism);
    });
  });
}

function addEvidence(evidence, id, owner, mechanism, proof) {
  if (!evidence[id]) evidence[id] = [];
  evidence[id].push({
    owner: owner,
    mechanism: mechanism,
    proof: proof
  });
}

function collectRouteEvidence(compiled) {
  var graph = compiled.graph || {};
  var placementPlan = compiled.placementPlan || {};
  var bridgePlan = compiled.bridgePlan || {};
  var card = compiled.resultCard || {};
  var evidence = {};

  if (hasAdapterRoute(bridgePlan, 'virtual-joystick', 'touch-multitouch-state', 'touch-axis-adapter')) {
    addEvidence(evidence, 'touch-multitouch-state', 'runtime-adapter', 'bridge-target-rewrite', 'virtual-joystick adapter requirement');
  }

  var joystick = hasComponent(graph, 'input.virtual_joystick');
  if (joystick && joystick.config && joystick.config.deadZone === 'standard') {
    addEvidence(evidence, 'joystick-dead-zone', 'component-manifest', 'inheritance-defaults', 'deadZone/radius/axis smoothing inherited from component manifest');
  }

  if (hasPlacementRoute(placementPlan, 'responsive-ui', 'screen-safe-area-placement')) {
    addEvidence(evidence, 'responsive-ui', 'placement-resolver', 'placement-contract', 'UI placement resolved inside safe area');
  }

  if (hasPlacementRoute(placementPlan, 'ui-overlap', 'ui-overlap-avoidance')) {
    addEvidence(evidence, 'ui-overlap', 'placement-resolver', 'avoidance-rewrite', 'overlapping UI control moved by placement resolver');
  }

  if (hasPlacementRoute(placementPlan, 'front-direction-context', 'contextual-direction-rewrite')) {
    addEvidence(evidence, 'front-direction-context', 'placement-resolver', 'contextual-direction-rewrite', 'front/behind resolved from movement context');
  }

  if (hasEmission(bridgePlan, 'gdjs-bridge', 'semantic-group-placement-rewrite', 'semantic-pattern-placement')) {
    addEvidence(evidence, 'semantic-pattern-placement', 'placement-resolver', 'placement-contract', 'semantic group placement emission inherited placement evidence');
  }

  if (hasEmission(bridgePlan, 'gdjs-bridge', 'component-object-expansion', 'collision-mask-setup')) {
    addEvidence(evidence, 'collision-mask-setup', 'gdjs-bridge', 'target-code-expansion', 'component object details emitted as target-plan instructions, not Intent syntax');
  }

  if (hasEmission(bridgePlan, 'gdjs-bridge', 'component-placement-rewrite', 'awkward-gdjs-parameters')) {
    addEvidence(evidence, 'awkward-gdjs-parameters', 'gdjs-bridge', 'target-rewrite', 'component object placement emitted as target-plan line');
  }

  if (hasComponent(graph, 'system.inventory') && hasEmission(bridgePlan, 'gdjs-bridge', 'component-config-expansion', 'inventory-expansion')) {
    addEvidence(evidence, 'inventory-expansion', 'component-expander', 'component-expansion', 'inventory component expands to storage variable and UI object');
  }

  if (hasAdapterRoute(bridgePlan, 'inventory-storage', 'inventory-persistence', 'inventory-storage-adapter')) {
    addEvidence(evidence, 'inventory-persistence', 'runtime-adapter', 'adapter-config', 'inventory-storage adapter requirement');
  }

  if ((hasBinding(graph, 'joystick_axis') || hasBinding(graph, 'touch_button')) && hasTrace(card, 'Compile Bindings', 'binding-compiler')) {
    addEvidence(evidence, 'networked-touch-input', 'binding-compiler', 'action-to-network-input-binding', 'touch controls compiled into action/input bindings');
  }

  return evidence;
}

function routeById(routes) {
  var byId = {};
  (routes || []).forEach(function(route) {
    byId[route.id] = route;
  });
  return byId;
}

function assertRouteEvidence(compiled, options) {
  options = options || {};
  var rules = options.rules || intentSurfaceGuard.loadRules();
  var routes = routeById(rules.bridgeIssueRoutes || []);
  var evidence = collectRouteEvidence(compiled);
  var required = options.requiredRoutes || [
    'touch-multitouch-state',
    'joystick-dead-zone',
    'responsive-ui',
    'ui-overlap',
    'front-direction-context',
    'semantic-pattern-placement',
    'collision-mask-setup',
    'awkward-gdjs-parameters',
    'inventory-expansion',
    'inventory-persistence',
    'networked-touch-input'
  ];

  required.forEach(function(id) {
    if (!routes[id]) throw new Error('Growth control route is not declared: ' + id);
    if (!evidence[id] || !evidence[id].length) throw new Error('Growth control route has no compile evidence: ' + id);
    evidence[id].forEach(function(item) {
      if (item.owner !== routes[id].routeOwner) {
        throw new Error('Growth control owner mismatch for ' + id + ': expected ' + routes[id].routeOwner + ', got ' + item.owner);
      }
      if (item.mechanism !== routes[id].routeMechanism) {
        throw new Error('Growth control mechanism mismatch for ' + id + ': expected ' + routes[id].routeMechanism + ', got ' + item.mechanism);
      }
    });
  });

  (rules.bridgeIssueRoutes || []).forEach(function(route) {
    if (route.routeOwner === 'llm2-intent') {
      throw new Error('Bridge issue route must not default to LLM2 intent repair: ' + route.id);
    }
    if (!route.prohibitedDslExpansions || !route.prohibitedDslExpansions.length) {
      throw new Error('Bridge issue route missing prohibited DSL expansions: ' + route.id);
    }
  });

  return evidence;
}

module.exports = {
  collectRouteEvidence: collectRouteEvidence,
  assertRouteEvidence: assertRouteEvidence
};
