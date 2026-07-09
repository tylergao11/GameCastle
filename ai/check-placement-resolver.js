var assert = require('assert');

var intentCompiler = require('./intent-compiler');
var placementResolver = require('./placement-resolver');

function bySubject(plan, subject) {
  return plan.placements.filter(function(placement) {
    return placement.subject === subject;
  });
}

function hasTrace(card, stage, owner) {
  return card.ownerTrace.some(function(item) {
    return item.stage === stage && item.owner === owner;
  });
}

function hasRoute(placement, routeId, mechanism) {
  return (placement.routeEvidence || []).some(function(item) {
    return item.routeId === routeId && (!mechanism || item.mechanism === mechanism);
  });
}

function run() {
  var text = [
    'make a mobile platformer',
    'add joystick controls Player near screen bottom-left',
    'add jump button controls Player near screen bottom-right',
    'add attack button controls Player near jump button left',
    'add inventory owned by Player with 24 slots near screen right',
    'place coins near Player front as trail count 3'
  ].join('\n');

  var compiled = intentCompiler.compileIntentDsl(text, {
    placementContext: {
      screenSize: { width: 1000, height: 700 },
      safeArea: { left: 20, right: 20, top: 20, bottom: 20 },
      movementDirection: 'left_to_right',
      objectBounds: {
        Player: { x: 120, y: 360, width: 48, height: 96 }
      },
      occupiedRegions: [
        { space: 'ui', x: 24, y: 584, width: 80, height: 80 }
      ]
    }
  });

  assert(compiled.placementPlan, 'compiler should emit a placement plan');
  assert.strictEqual(compiled.placementPlan.placements.length, 5, 'should resolve five placement intents');
  assert(hasTrace(compiled.resultCard, 'Resolve Placement', 'placement-resolver'), 'ResultCard should trace placement resolver');
  assert(
    compiled.resultCard.emitted.indexOf('placement plan placements=5') >= 0,
    'ResultCard emitted summary should include placement plan size'
  );

  var joystick = bySubject(compiled.placementPlan, 'Joystick')[0];
  assert(joystick, 'joystick placement should exist');
  assert.strictEqual(joystick.space, 'ui');
  assert.strictEqual(joystick.layer, 'UI');
  assert(joystick.constraints.indexOf('insideSafeArea') >= 0, 'joystick should stay inside safe area');
  assert(joystick.constraints.indexOf('avoidOverlap') >= 0, 'joystick should avoid occupied UI regions');
  assert(hasRoute(joystick, 'responsive-ui', 'screen-safe-area-placement'), 'joystick should carry responsive UI route evidence');
  assert(hasRoute(joystick, 'ui-overlap', 'ui-overlap-avoidance'), 'joystick should carry overlap route evidence');
  assert(joystick.x >= 52, 'joystick should remain inside the left safe area');
  assert(joystick.x < 260, 'joystick should remain on the left side after overlap repair');

  var jump = bySubject(compiled.placementPlan, 'JumpButton')[0];
  assert(jump.x > 800, 'jump button should resolve near the screen right side');
  assert(jump.y > 550, 'jump button should resolve near the screen bottom side');

  var attack = bySubject(compiled.placementPlan, 'AttackButton')[0];
  assert.strictEqual(attack.space, 'ui', 'attack button should inherit UI space from JumpButton anchor');
  assert.strictEqual(attack.anchor, 'JumpButton', 'attack button should use canonical JumpButton anchor');
  assert(attack.resolved.x < jump.resolved.x, 'attack button should resolve left of the jump button');

  var inventory = bySubject(compiled.placementPlan, 'Inventory')[0];
  assert(inventory.x > 800, 'inventory should resolve near the screen right side');

  var coins = bySubject(compiled.placementPlan, 'CoinsGroup')[0];
  assert(coins, 'coins group placement should exist');
  assert.strictEqual(coins.directionRewrite, 'front -> right');
  assert(hasRoute(coins, 'front-direction-context', 'contextual-direction-rewrite'), 'coins should carry front direction route evidence');
  assert(hasRoute(coins, 'semantic-pattern-placement', 'pattern-placement'), 'coins should carry pattern placement route evidence');
  assert(coins.emission && coins.emission.mechanism === 'semantic-group-placement-rewrite', 'coins should carry group placement emission metadata');
  assert(coins.emission.routeId === 'semantic-pattern-placement', 'group placement emission should route through semantic pattern placement');
  assert.strictEqual(coins.points.length, 3, 'trail count should become three placement points');
  assert(coins.points[1].x > coins.points[0].x, 'front trail should advance to the right');

  var unresolved = placementResolver.resolvePlacements({
    placements: [
      {
        subject: 'EnemyGroup',
        anchor: 'Boss',
        space: 'object_relative',
        direction: 'behind'
      }
    ]
  }, {
    objectBounds: {}
  });
  assert.strictEqual(unresolved.diagnostics.length, 1, 'missing anchor should produce a placement diagnostic');
  assert.strictEqual(unresolved.diagnostics[0].category, 'missing-anchor');

  assert.strictEqual(
    placementResolver.directionToAxis('front', { movementDirection: 'right_to_left' }),
    'left',
    'front should inherit from movement direction'
  );

  console.log('[PlacementResolver] semantic placement plan passed');
}

run();
