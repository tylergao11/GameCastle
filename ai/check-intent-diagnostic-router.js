var assert = require('assert');

var diagnosticRouter = require('./intent-diagnostic-router');
var intentCompiler = require('./intent-compiler');
var placementResolver = require('./placement-resolver');
var gdjsBridge = require('./gdjs-bridge');

function assertRoute(diagnostic, routeId, owner, nextAction) {
  diagnosticRouter.assertRoutedDiagnostic(diagnostic);
  assert.strictEqual(diagnostic.routeId, routeId, 'routeId should match');
  assert.strictEqual(diagnostic.owner, owner, 'owner should match route owner');
  assert.strictEqual(diagnostic.routeOwner, owner, 'routeOwner should match');
  assert.strictEqual(diagnostic.nextAction, nextAction, 'nextAction should match owner class');
  assert(Array.isArray(diagnostic.prohibitedDslExpansions), 'diagnostic should carry prohibited expansions');
}

function testCompilerUnknownComponentRoutesToCatalog() {
  var compiled = intentCompiler.compileIntentDsl('add dash button controls Player near screen bottom-right');
  assert.strictEqual(compiled.graph.diagnostics.length, 1, 'unknown natural component should produce one graph diagnostic');
  assertRoute(compiled.graph.diagnostics[0], 'new-reusable-game-system', 'component-catalog', 'route-to-owner');
  assertRoute(compiled.resultCard.diagnostics[0], 'new-reusable-game-system', 'component-catalog', 'route-to-owner');
}

function testPlacementMissingAnchorRoutesToPlacementResolver() {
  var plan = placementResolver.resolvePlacements({
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
  assert.strictEqual(plan.diagnostics.length, 1, 'missing anchor should produce one placement diagnostic');
  assertRoute(plan.diagnostics[0], 'missing-placement-anchor', 'placement-resolver', 'route-to-owner');
}

function testBridgeUnknownComponentRoutesToCatalog() {
  var plan = gdjsBridge.compileBridge({
    graph: {
      modules: [],
      components: [
        {
          componentId: 'system.crafting',
          thing: 'Crafting',
          config: {}
        }
      ],
      things: [],
      placements: []
    },
    placementPlan: { placements: [] },
    resultCard: {
      emitted: [],
      diagnostics: [],
      ownerTrace: []
    }
  });
  assert.strictEqual(plan.diagnostics.length, 1, 'unknown bridge component should produce one diagnostic');
  assertRoute(plan.diagnostics[0], 'new-reusable-game-system', 'component-catalog', 'route-to-owner');
}

function main() {
  testCompilerUnknownComponentRoutesToCatalog();
  testPlacementMissingAnchorRoutesToPlacementResolver();
  testBridgeUnknownComponentRoutesToCatalog();
  console.log('[IntentDiagnosticRouter] owner-routed diagnostics passed');
}

main();
