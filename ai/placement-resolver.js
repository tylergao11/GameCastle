var PLACEMENT_PLAN_SCHEMA_VERSION = 1;
var diagnosticRouter = require('./intent-diagnostic-router');
var placementContract = require('./placement-resolution-contract');

var DEFAULT_CONTEXT = {
  screenSize: { width: 800, height: 600 },
  safeArea: { left: 32, right: 32, top: 32, bottom: 32 },
  cameraMode: 'side',
  movementDirection: 'left_to_right',
  worldGravity: 'down',
  objectBounds: {}
};

var DISTANCE = {
  touching: 0,
  near: 32,
  small: 32,
  medium: 64,
  far: 128,
  safe: 96
};

function clone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function mergeContext(context) {
  context = context || {};
  return {
    screenSize: context.screenSize || clone(DEFAULT_CONTEXT.screenSize),
    safeArea: context.safeArea || clone(DEFAULT_CONTEXT.safeArea),
    cameraMode: context.cameraMode || DEFAULT_CONTEXT.cameraMode,
    playerFacing: context.playerFacing,
    movementDirection: context.movementDirection || DEFAULT_CONTEXT.movementDirection,
    worldGravity: context.worldGravity || DEFAULT_CONTEXT.worldGravity,
    groundPlane: context.groundPlane,
    objectBounds: context.objectBounds || {},
    occupiedRegions: context.occupiedRegions || []
  };
}

function addTrace(card, stage, owner) {
  if (!card) return;
  if (!card.ownerTrace) card.ownerTrace = [];
  var exists = card.ownerTrace.some(function(item) {
    return item.stage === stage && item.owner === owner;
  });
  if (!exists) card.ownerTrace.push({ stage: stage, owner: owner });
}

function addCardResolution(card, resolution) {
  if (!card) return;
  if (!card.placementResolutions) card.placementResolutions = [];
  card.placementResolutions.push(clone(resolution));
}

function addCardDiagnostic(card, diagnostic) {
  if (!card) return;
  if (!card.diagnostics) card.diagnostics = [];
  card.diagnostics.push(clone(diagnostic));
}

function marginFor(distance) {
  return DISTANCE[distance || 'safe'] !== undefined ? DISTANCE[distance || 'safe'] : DISTANCE.safe;
}

function screenPoint(direction, context, distance) {
  var screen = context.screenSize;
  var safe = context.safeArea;
  var margin = marginFor(distance);
  var left = safe.left + margin;
  var right = screen.width - safe.right - margin;
  var top = safe.top + margin;
  var bottom = screen.height - safe.bottom - margin;
  var centerX = Math.round(screen.width / 2);
  var centerY = Math.round(screen.height / 2);

  var map = {
    'top-left': { x: left, y: top },
    'top-right': { x: right, y: top },
    'bottom-left': { x: left, y: bottom },
    'bottom-right': { x: right, y: bottom },
    left: { x: left, y: centerY },
    right: { x: right, y: centerY },
    top: { x: centerX, y: top },
    bottom: { x: centerX, y: bottom },
    center: { x: centerX, y: centerY }
  };
  return map[direction] || map.center;
}

function directionToAxis(direction, context) {
  direction = String(direction || 'front');
  if (direction === 'front' || direction === 'far-front') {
    if (context.playerFacing) return context.playerFacing;
    if (context.movementDirection === 'right_to_left') return 'left';
    if (context.movementDirection === 'top_to_bottom') return 'down';
    return 'right';
  }
  if (direction === 'behind') {
    var front = directionToAxis('front', context);
    if (front === 'right') return 'left';
    if (front === 'left') return 'right';
    if (front === 'down') return 'up';
    return 'down';
  }
  return direction;
}

function objectPoint(anchorBounds, direction, context, distance) {
  var axis = directionToAxis(direction, context);
  var far = String(direction || '').indexOf('far') >= 0;
  var gap = far ? DISTANCE.far : marginFor(distance || 'medium');
  var x = anchorBounds.x + anchorBounds.width / 2;
  var y = anchorBounds.y + anchorBounds.height / 2;
  if (axis === 'right') x = anchorBounds.x + anchorBounds.width + gap;
  else if (axis === 'left') x = anchorBounds.x - gap;
  else if (axis === 'up' || axis === 'above') y = anchorBounds.y - gap;
  else if (axis === 'down' || axis === 'below') y = anchorBounds.y + anchorBounds.height + gap;
  return { x: Math.round(x), y: Math.round(y), rewrite: direction + ' -> ' + axis };
}

function overlaps(a, b) {
  return a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y;
}

function regionForPoint(point) {
  return { x: point.x - 32, y: point.y - 32, width: 64, height: 64 };
}

function isInsideSafeArea(region, context, space) {
  if (space !== 'ui') return true;
  var screen = context.screenSize;
  var safe = context.safeArea;
  return region.x >= safe.left &&
    region.y >= safe.top &&
    region.x + region.width <= screen.width - safe.right &&
    region.y + region.height <= screen.height - safe.bottom;
}

function hasOverlap(region, context, space) {
  return (context.occupiedRegions || []).some(function(occupied) {
    if (occupied.space && occupied.space !== space) return false;
    return overlaps(region, occupied);
  });
}

function avoidOccupied(point, context, space) {
  var originalRegion = regionForPoint(point);
  if (!hasOverlap(originalRegion, context, space) && isInsideSafeArea(originalRegion, context, space)) {
    return { point: { x: point.x, y: point.y }, moved: false };
  }

  var offsets = [
    { x: 80, y: 0 },
    { x: -80, y: 0 },
    { x: 0, y: -80 },
    { x: 0, y: 80 },
    { x: 160, y: 0 },
    { x: -160, y: 0 },
    { x: 0, y: -160 },
    { x: 0, y: 160 },
    { x: 160, y: -80 },
    { x: -160, y: -80 },
    { x: 160, y: 80 },
    { x: -160, y: 80 }
  ];

  for (var i = 0; i < offsets.length; i++) {
    var candidate = {
      x: point.x + offsets[i].x,
      y: point.y + offsets[i].y
    };
    var region = regionForPoint(candidate);
    if (!hasOverlap(region, context, space) && isInsideSafeArea(region, context, space)) {
      return { point: candidate, moved: true };
    }
  }

  return { point: { x: point.x, y: point.y }, moved: false };
}

function boundsFromResolved(resolved) {
  if (!resolved || !resolved.resolved) return null;
  return {
    x: resolved.resolved.x - 32,
    y: resolved.resolved.y - 32,
    width: 64,
    height: 64,
    space: resolved.space
  };
}

function route(owner, mechanism, routeId, routeMechanism) {
  return {
    owner: owner,
    mechanism: mechanism,
    routeId: routeId,
    routeMechanism: routeMechanism
  };
}

function resolveSingle(placement, graph, context, resolvedBounds) {
  var space = (placement.space === 'screen' || placement.space === 'ui' || placement.space === 'ui_relative')
    ? 'ui'
    : (placement.space || 'world');
  var direction = placement.direction || 'center';
  var anchor = placement.anchor;
  var source = {
    subject: placement.subject,
    anchor: anchor,
    direction: direction,
    distance: placement.distance,
    pattern: placement.pattern,
    count: placement.count
  };

  if (String(anchor).toLowerCase() === 'screen' || String(anchor).toLowerCase() === 'screen.safearea') {
    var screen = screenPoint(direction, context, placement.distance);
    var avoided = avoidOccupied(screen, context, 'ui');
    var screenEvidence = [
      route('placement-resolver', 'screen-safe-area-placement', 'responsive-ui', 'placement-contract')
    ];
    if (avoided.moved) {
      screenEvidence.push(route('placement-resolver', 'ui-overlap-avoidance', 'ui-overlap', 'avoidance-rewrite'));
    }
    return {
      subject: placement.subject,
      space: 'ui',
      anchor: 'screen.safeArea',
      x: avoided.point.x,
      y: avoided.point.y,
      layer: 'UI',
      constraints: avoided.moved ? ['insideSafeArea', 'avoidOverlap'] : ['insideSafeArea'],
      routeEvidence: screenEvidence,
      source: source,
      resolved: { x: avoided.point.x, y: avoided.point.y }
    };
  }

  var anchorBounds = context.objectBounds[anchor] || resolvedBounds[anchor];
  if (!anchorBounds) {
    var unresolved = {
      subject: placement.subject,
      space: space,
      anchor: anchor,
      unresolved: true,
      source: source,
      diagnostic: {
        stage: 'Resolve Placement',
        category: 'missing-anchor',
        intentSubject: placement.subject,
        message: 'Missing placement anchor bounds: ' + anchor
      }
    };
    unresolved.diagnostic = diagnosticRouter.routeDiagnostic('missing-placement-anchor', unresolved.diagnostic);
    return unresolved;
  }

  var base = objectPoint(anchorBounds, direction, context, placement.distance);
  var count = placement.count || 1;
  var pattern = placement.pattern || 'single';
  var points = [];
  for (var i = 0; i < count; i++) {
    var next = { x: base.x, y: base.y };
    if (pattern === 'trail' || pattern === 'line') {
      var axis = directionToAxis(direction, context);
      var spacing = 48;
      if (axis === 'right') next.x += i * spacing;
      else if (axis === 'left') next.x -= i * spacing;
      else if (axis === 'down') next.y += i * spacing;
      else next.y -= i * spacing;
    } else if (pattern === 'stairs') {
      next.x += i * 64;
      next.y -= i * 40;
    } else if (pattern === 'guard') {
      next.x += i * 40;
      next.y += (i % 2 === 0 ? -24 : 24);
    }
    points.push({ x: Math.round(next.x), y: Math.round(next.y) });
  }

  var objectEvidence = [
    route('placement-resolver', 'object-relative-placement', 'object-relative-placement', 'placement-contract')
  ];
  if (base.rewrite && base.rewrite !== direction + ' -> ' + direction) {
    objectEvidence.push(route('placement-resolver', 'contextual-direction-rewrite', 'front-direction-context', 'contextual-direction-rewrite'));
  }
  if (pattern !== 'single' || count > 1) {
    objectEvidence.push(route('placement-resolver', 'pattern-placement', 'semantic-pattern-placement', 'placement-contract'));
  }
  var emission = (pattern !== 'single' || count > 1) ? {
    mechanism: 'semantic-group-placement-rewrite',
    routeId: 'semantic-pattern-placement',
    routeMechanism: 'placement-contract'
  } : undefined;

  return {
    subject: placement.subject,
    space: space,
    anchor: anchor,
    layer: space === 'ui' ? 'UI' : undefined,
    directionRewrite: base.rewrite,
    routeEvidence: objectEvidence,
    emission: emission,
    pattern: pattern,
    count: count,
    points: points,
    source: source,
    resolved: points[0]
  };
}

function resolvePlacements(graph, context, options) {
  options = options || {};
  context = mergeContext(context);
  var card = options.resultCard;
  addTrace(card, 'Resolve Placement', 'placement-resolver');

  var plan = {
    schemaVersion: PLACEMENT_PLAN_SCHEMA_VERSION,
    context: {
      screenSize: context.screenSize,
      safeArea: context.safeArea,
      cameraMode: context.cameraMode,
      movementDirection: context.movementDirection,
      playerFacing: context.playerFacing,
      worldGravity: context.worldGravity
    },
    placements: [],
    diagnostics: []
  };
  var resolvedBounds = {};
  Object.keys(context.objectBounds || {}).forEach(function(key) {
    resolvedBounds[key] = context.objectBounds[key];
  });

  (graph.placements || []).forEach(function(placement) {
    var resolved = resolveSingle(placement, graph, context, resolvedBounds);
    if (resolved.diagnostic) {
      plan.diagnostics.push(resolved.diagnostic);
      addCardDiagnostic(card, resolved.diagnostic);
    }
    plan.placements.push(resolved);
    var bounds = boundsFromResolved(resolved);
    if (bounds) resolvedBounds[resolved.subject] = bounds;
    addCardResolution(card, resolved);
  });

  placementContract.assertPlan(plan);
  return plan;
}

module.exports = {
  PLACEMENT_PLAN_SCHEMA_VERSION: PLACEMENT_PLAN_SCHEMA_VERSION,
  resolvePlacements: resolvePlacements,
  directionToAxis: directionToAxis
};
