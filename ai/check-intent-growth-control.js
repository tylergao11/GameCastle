var assert = require('assert');

var intentCompiler = require('./intent-compiler');
var intentSurfaceGuard = require('./intent-surface-guard');
var intentGrowthControl = require('./intent-growth-control');

function main() {
  var intentText = [
    'make a mobile platformer',
    'add joystick controls Player near screen bottom-left',
    'add jump button controls Player near screen bottom-right',
    'add attack button controls Player near jump button left',
    'add inventory owned by Player with 24 slots near screen right',
    'place coins near Player front as trail count 3'
  ].join('\n');

  intentSurfaceGuard.assertIntentSurfaceAllowed(intentText);

  var compiled = intentCompiler.compileIntentDsl(intentText, {
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

  var evidence = intentGrowthControl.assertRouteEvidence(compiled);
  [
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
  ].forEach(function(id) {
    assert(evidence[id] && evidence[id].length, 'expected route evidence for ' + id);
  });

  var machineText = [
    'on touch button pointerId=1',
    'deadZone=0.15',
    'place at x=120 y=480',
    'screenWidth minus 96',
    'frontInPlatformer',
    'collision mask rectangle Player',
    'set gdjs parameter 2 to Player',
    'create inventory slot object one by one',
    'save inventory with gdjs storage key player',
    'send touch event over network'
  ].join('\n');
  var violations = intentSurfaceGuard.detectProhibitedSurface(machineText);
  assert(
    violations.some(function(item) { return item.id === 'coordinates'; }),
    'growth-control examples should still reject coordinate expansion'
  );
  assert(
    violations.some(function(item) { return item.id === 'key-value-machine-fields'; }),
    'growth-control examples should still reject key=value expansion'
  );

  console.log('[IntentGrowthControl] bridge issue routes have owner-bound evidence and no LLM2 syntax expansion');
}

main();
