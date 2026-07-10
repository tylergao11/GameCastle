var assert = require('assert');
var fs = require('fs');
var path = require('path');

var intentCompiler = require('./intent-compiler');
var diagnosticRouter = require('./intent-diagnostic-router');
var pipeline = require('./pipeline');
var projectWorld = require('./project-world');

async function executeBridgeIntoProject(compiled) {
  var project = pipeline.emptyProject('IntentProjectWorldCheck');
  var ops = pipeline.parseTargetPlan(compiled.bridgePlan.targetPlanText);
  for (var i = 0; i < ops.length; i++) {
    var result = await pipeline.execute(project, ops[i]);
    assert(result.ok, 'bridge target line should execute: ' + compiled.bridgePlan.targetPlanLines[i] + ' -> ' + result.msg);
  }
  return project;
}

function makeIntent(compiled, intentDslText) {
  return {
    artifactKind: 'intent',
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
  }), 'ProjectWorld should retain the last human-facing Intent DSL');
  assert.strictEqual(world.intent.intentGraph.counts.components, compiled.graph.components.length, 'Intent graph count should be recorded');
  assert(world.intent.contracts && world.intent.contracts.intentCompile === 'passed', 'ProjectWorld should retain aggregate Intent contract status');
  assert.strictEqual(world.intent.bridgePlan.targetPlanLines, compiled.bridgePlan.targetPlanLines.length, 'bridge target line count should be recorded');
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
  assert(hasTrace(world.intent.resultCard, 'Emit Target Plan', 'gdjs-bridge'), 'ProjectWorld should retain bridge owner trace');
  assert(world.intent.resultCard.overrides.some(function(item) {
    return item.component === 'system.inventory' && item.key === 'slots';
  }), 'ProjectWorld should retain component override summary');

  var editCompiled = intentCompiler.compileIntentDsl('adjust Fox placement above slightly', {
    placementContext: {
      objectBounds: {
        Fox: { x: 240, y: 320, width: 64, height: 64 }
      }
    }
  });
  var editSummary = projectWorld.summarizeIntentArtifacts(makeIntent(editCompiled, 'adjust Fox placement above slightly'));
  assert.strictEqual(editSummary.intentGraph.counts.edits, 1, 'ProjectWorld should count Intent edit constraints');
  assert(editSummary.intentGraph.edits.some(function(edit) {
    return edit.subject === 'Fox' && edit.dimension === 'placement' && edit.direction === 'above' && edit.amount === 'slightly';
  }), 'ProjectWorld should retain semantic edit constraint summary');
  assert(editSummary.placementPlan.editPlan.edits.some(function(edit) {
    return edit.subject === 'Fox' &&
      edit.emission &&
      edit.emission.routeId === 'semantic-placement-edit';
  }), 'ProjectWorld should retain semantic edit emission evidence');
  assert(editSummary.resultCard.editConstraints.some(function(edit) {
    return edit.subject === 'Fox' && edit.amount === 'slightly';
  }), 'ProjectWorld should retain ResultCard edit summary');

  assert.throws(function() {
    projectWorld.summarizeIntentArtifacts({
      artifactKind: 'intent',
      intentDslText: 'add dash button controls Player near screen bottom-right',
      intentGraph: {
        modules: [],
        things: [],
        components: [],
        relations: [],
        placements: [],
        edits: [],
        bindings: [],
        requirements: [],
        diagnostics: [{ category: 'unknown-component', message: 'dash button needs a component owner' }],
      },
    });
  }, /Diagnostic missing routeId/, 'ProjectWorld must reject unrouted Intent diagnostics');

  var report = projectWorld.makeExecutionReport({
    previousWorld: null,
    world: world,
    targetPlanLines: compiled.bridgePlan.targetPlanLines,
    commandResults: compiled.bridgePlan.targetPlanLines.map(function(line, index) {
      return {
        index: index,
        commandId: 'check_line_' + String(index + 1).padStart(3, '0'),
        ok: true,
        command: line,
        label: line,
        message: 'ok',
      };
    }),
    runIndex: 1,
    batchLabel: 'intent_project_world_check',
    intent: intent,
  });

  assert(report.intent, 'ExecutionReport should include Intent summary');
  assert(report.completed.some(function(item) {
    return item.command === 'create scene name=Game first=true';
  }), 'ExecutionReport should retain original internal target command lines');
  assert(report.intent.contracts && report.intent.contracts.intentCompile === 'passed', 'ExecutionReport should retain aggregate Intent contract status');
  assert(hasTrace(report.intent.resultCard, 'Emit Target Plan', 'gdjs-bridge'), 'ExecutionReport should retain bridge owner trace');
  assert.strictEqual(report.intent.bridgePlan.runtimeAdapterRequirements, compiled.bridgePlan.runtimeAdapterRequirements.length, 'ExecutionReport should include adapter count');
  assert(report.intentFulfillment, 'ExecutionReport should include Intent fulfillment validation');
  assert.strictEqual(report.intentFulfillment.status, 'fulfilled', 'ExecutionReport should mark fulfilled Intent world checks');
  assert.strictEqual(report.summary.intentFulfillment.status, 'fulfilled', 'ExecutionReport summary should include fulfillment status');
  assert.strictEqual(report.summary.intentFulfillment.missing, 0, 'ExecutionReport should not report missing fulfillment checks for the fixture');
  assert(report.intentFulfillment.checks.some(function(check) {
    return check.kind === 'component' && check.subject === 'JumpButton' && check.status === 'fulfilled';
  }), 'ExecutionReport should verify component subjects in ProjectWorld');
  assert(report.intentFulfillment.checks.some(function(check) {
    return check.kind === 'placement' && check.subject === 'CoinsGroup' && check.status === 'fulfilled';
  }), 'ExecutionReport should verify semantic group placement through the placement plan');

  var missingReport = projectWorld.makeExecutionReport({
    previousWorld: null,
    world: {
      schemaVersion: 1,
      worldVersion: 1,
      project: { name: 'MissingCheck', firstScene: 'Game' },
      scenes: [{ name: 'Game', objects: [], instances: [] }],
      globalObjects: [],
      globalVariables: [],
    },
    targetPlanLines: [],
    commandResults: [],
    runIndex: 2,
    batchLabel: 'intent_missing_fulfillment_check',
    intent: makeIntent(editCompiled, 'adjust Fox placement above slightly'),
  });
  assert.strictEqual(missingReport.summary.nextAction, 'route-to-owner', 'missing Intent fulfillment should route to owner');
  assert.strictEqual(missingReport.summary.intentFulfillment.status, 'missing', 'missing report should summarize fulfillment failure');
  assert(missingReport.intentFulfillment.checks.some(function(check) {
    return check.subject === 'Fox' && check.status === 'missing';
  }), 'missing report should identify the missing semantic subject');

  var failedExecutionReport = projectWorld.makeExecutionReport({
    previousWorld: null,
    world: world,
    targetPlanLines: ['create object name=Ghost type=Missing scene=Game'],
    commandResults: [{
      index: 0,
      commandId: 'failed_line_001',
      ok: false,
      command: 'create object name=Ghost type=Missing scene=Game',
      label: 'create object',
      message: 'unsupported object type',
    }],
    runIndex: 3,
    batchLabel: 'intent_failed_runtime_check',
    intent: intent,
  });
  assert.strictEqual(failedExecutionReport.summary.nextAction, 'route-to-owner', 'failed runtime execution should route to owner');
  assert.strictEqual(failedExecutionReport.summary.routedDiagnostics, 1, 'failed runtime execution should summarize routed diagnostics');
  assert.strictEqual(failedExecutionReport.failed[0].commandId, 'failed_line_001', 'failed runtime execution should retain command id');
  assert.strictEqual(failedExecutionReport.failed[0].command, 'create object name=Ghost type=Missing scene=Game', 'failed runtime execution should retain original command');
  assert.strictEqual(failedExecutionReport.routedDiagnostics.length, 1, 'failed runtime execution should include routed diagnostic');
  diagnosticRouter.assertRoutedDiagnostic(failedExecutionReport.routedDiagnostics[0]);
  assert.strictEqual(failedExecutionReport.routedDiagnostics[0].routeId, 'internal-target-execution', 'failed runtime execution should use runtime execution route');
  assert.strictEqual(failedExecutionReport.routedDiagnostics[0].owner, 'runtime-executor', 'failed runtime execution should route to runtime executor');
  assert.strictEqual(failedExecutionReport.routedDiagnostics[0].commandId, 'failed_line_001', 'failed runtime diagnostic should retain command id');
  var safeFailedReportJson = JSON.stringify(projectWorld.sanitizeExecutionReportForIntentPrompt(failedExecutionReport));
  assert(safeFailedReportJson.indexOf('routedDiagnostics') < 0, 'LLM-safe failed report must not expose raw runtime diagnostics');
  assert(safeFailedReportJson.indexOf('create object name=Ghost') < 0, 'LLM-safe failed report must not expose target-plan command text');
  assert(safeFailedReportJson.indexOf('route-to-owner') >= 0, 'LLM-safe failed report should preserve owner-routing summary');

  var safeWorld = projectWorld.sanitizeProjectWorldForIntentPrompt(world);
  var safeReport = projectWorld.sanitizeExecutionReportForIntentPrompt(report);
  var safeJson = JSON.stringify({ world: safeWorld, report: safeReport });
  [
    'componentId',
    'input.jump_button',
    'virtual-joystick',
    'bridgePlan',
    'runtimeAdapterRequirements',
    'gdjs',
    '"x"',
    '"y"',
    'set placement object=',
    'ownerTrace',
    '"instances"',
    '"events"',
    '"eventCount"',
    '"globalObjects"',
    '"globalVariables"',
    '"modules"',
    '"layer"',
    '"type":"number"',
  ].forEach(function(token) {
    assert(safeJson.indexOf(token) < 0, 'ProjectWorld AI-visible sanitizer must not expose ' + token);
  });
  assert(safeWorld.scenes.some(function(scene) {
    return scene.things.some(function(thing) { return thing.name === 'Player'; });
  }), 'ProjectWorld AI-visible sanitizer should expose scene things in world terms');
  assert(safeWorld.scenes.some(function(scene) {
    return scene.placedThings.some(function(thing) { return thing.object === 'Player'; });
  }), 'ProjectWorld AI-visible sanitizer should expose placed things without instance details');
  assert(safeJson.indexOf('Player') >= 0, 'ProjectWorld AI-visible sanitizer should preserve world object names');
  assert(safeJson.indexOf('bottom-left') >= 0, 'ProjectWorld AI-visible sanitizer should preserve natural placement direction');
  assert(safeJson.indexOf('make a mobile platformer') >= 0, 'ProjectWorld AI-visible sanitizer should preserve safe Intent wording');
  assert(safeReport.summary.nextAction === 'done', 'ExecutionReport AI-visible sanitizer should preserve nextAction');
  assert(safeReport.summary.intentFulfillment.status === 'fulfilled', 'ExecutionReport AI-visible sanitizer should preserve safe fulfillment status');

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
