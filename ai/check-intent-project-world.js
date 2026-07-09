var assert = require('assert');
var fs = require('fs');
var path = require('path');

var intentCompiler = require('./intent-compiler');
var pipeline = require('./pipeline');
var projectWorld = require('./project-world');

async function executeBridgeIntoProject(compiled) {
  var project = pipeline.emptyProject('IntentProjectWorldCheck');
  var ops = pipeline.parseDSL(compiled.bridgePlan.dslText);
  for (var i = 0; i < ops.length; i++) {
    var result = await pipeline.execute(project, ops[i]);
    assert(result.ok, 'bridge DSL should execute: ' + compiled.bridgePlan.dslLines[i] + ' -> ' + result.msg);
  }
  return project;
}

function makeIntent(compiled, intentDslText) {
  return {
    patchKind: 'intent',
    intentDslText: intentDslText,
    intentGraph: compiled.graph,
    placementPlan: compiled.placementPlan,
    bridgePlan: compiled.bridgePlan,
    intentContracts: compiled.contracts,
    compileResultCard: compiled.resultCard,
    runtimeAdapterRequirements: compiled.bridgePlan.runtimeAdapterRequirements,
  };
}

function hasTrace(card, stage, owner) {
  return (card.ownerTrace || []).some(function(item) {
    return item.stage === stage && item.owner === owner;
  });
}

async function main() {
  var fixturePath = path.join(__dirname, 'fixtures', 'intent-mobile-platformer.dsl');
  var intentDslText = fs.readFileSync(fixturePath, 'utf8');
  var compiled = intentCompiler.compileIntentDsl(intentDslText, {
    placementContext: {
      objectBounds: {
        Player: { x: 100, y: 400, width: 32, height: 48 }
      }
    }
  });
  var project = await executeBridgeIntoProject(compiled);
  var intent = makeIntent(compiled, intentDslText);
  var world = projectWorld.buildProjectWorld(project, null, {
    modules: compiled.bridgePlan.installedModules,
    intent: intent,
  });

  assert(world.intent, 'ProjectWorld should include Intent summary');
  assert(world.intent.intentDslLines.some(function(line) {
    return line.indexOf('make a mobile platformer') >= 0;
  }), 'ProjectWorld should retain the last human-facing Intent DSL patch');
  assert.strictEqual(world.intent.intentGraph.counts.components, compiled.graph.components.length, 'Intent graph count should be recorded');
  assert(world.intent.contracts && world.intent.contracts.intentCompile === 'passed', 'ProjectWorld should retain aggregate Intent contract status');
  assert.strictEqual(world.intent.bridgePlan.internalDslLines, compiled.bridgePlan.dslLines.length, 'bridge DSL line count should be recorded');
  assert(world.intent.bridgePlan.contracts && world.intent.bridgePlan.contracts.emission === 'passed', 'ProjectWorld should retain bridge contract status');
  assert(world.intent.placementPlan.placements.some(function(placement) {
    return (placement.routeEvidence || []).some(function(item) {
      return item.routeId === 'responsive-ui' && item.mechanism === 'screen-safe-area-placement';
    });
  }), 'ProjectWorld should retain placement route evidence');
  assert(world.intent.placementPlan.placements.some(function(placement) {
    return placement.subject === 'CoinsGroup' &&
      placement.emission &&
      placement.emission.routeId === 'semantic-pattern-placement';
  }), 'ProjectWorld should retain semantic group placement emission evidence');
  assert(world.intent.bridgePlan.emittedMechanisms['component-placement-rewrite'] > 0, 'bridge emission mechanisms should be recorded');
  assert(world.intent.bridgePlan.emittedRoutes['awkward-gdjs-parameters'] > 0, 'bridge emission route evidence should be recorded');
  assert.strictEqual(world.intent.runtimeAdapterRequirements.length, compiled.bridgePlan.runtimeAdapterRequirements.length, 'runtime adapter requirements should be summarized');
  assert(world.intent.runtimeAdapterRequirements.some(function(item) {
    return item.adapter === 'virtual-joystick' && item.routeId === 'touch-multitouch-state' && item.routeOwner === 'runtime-adapter' && item.mechanism === 'touch-axis-adapter';
  }), 'ProjectWorld should retain runtime adapter route evidence');
  assert(hasTrace(world.intent.resultCard, 'Emit Internal DSL', 'gdjs-bridge'), 'ProjectWorld should retain bridge owner trace');
  assert(world.intent.resultCard.overrides.some(function(item) {
    return item.component === 'system.inventory' && item.key === 'slots';
  }), 'ProjectWorld should retain component override summary');

  var report = projectWorld.makeExecutionReport({
    previousWorld: null,
    world: world,
    dslLines: compiled.bridgePlan.dslLines,
    commandResults: compiled.bridgePlan.dslLines.map(function(line, index) {
      return {
        index: index,
        commandId: 'check_line_' + String(index + 1).padStart(3, '0'),
        ok: true,
        label: line,
        message: 'ok',
      };
    }),
    runIndex: 1,
    batchLabel: 'intent_project_world_check',
    intent: intent,
  });

  assert(report.intent, 'ExecutionReport should include Intent summary');
  assert(report.intent.contracts && report.intent.contracts.intentCompile === 'passed', 'ExecutionReport should retain aggregate Intent contract status');
  assert(hasTrace(report.intent.resultCard, 'Emit Internal DSL', 'gdjs-bridge'), 'ExecutionReport should retain bridge owner trace');
  assert.strictEqual(report.intent.bridgePlan.runtimeAdapterRequirements, compiled.bridgePlan.runtimeAdapterRequirements.length, 'ExecutionReport should include adapter count');

  var sameStructureDifferentWords = makeIntent(compiled, intentDslText.replace('make a mobile platformer', 'make a compact mobile platformer'));
  var sameWorld = projectWorld.buildProjectWorld(project, null, {
    modules: compiled.bridgePlan.installedModules,
    intent: sameStructureDifferentWords,
  });
  assert.strictEqual(world.semanticHash, sameWorld.semanticHash, 'raw Intent wording should not affect semantic hash');

  var inheritedWorld = projectWorld.buildProjectWorld(project, world, {
    modules: compiled.bridgePlan.installedModules,
  });
  assert(inheritedWorld.intent, 'ProjectWorld should inherit previous Intent summary when a later internal patch has none');

  console.log('[IntentProjectWorld] ProjectWorld and ExecutionReport retain Intent/Bridge summaries');
}

main().catch(function(error) {
  console.error(error);
  process.exit(1);
});
