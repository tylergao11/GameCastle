var assert = require('assert');
var fs = require('fs');
var path = require('path');

var intentCompiler = require('./intent-compiler');
var pipeline = require('./pipeline');
var intentRuntimeCodegen = require('./intent-runtime-codegen');

async function testInternalMoveActionBoundary() {
  var relativeProject = pipeline.emptyProject('RelativeMoveBoundaryCheck');
  var relativeOps = pipeline.parseTargetPlan([
    'create scene name=Game first=true',
    'on key ArrowRight held -> move Player x=+4 scene=Game',
  ].join('\n'));
  for (var i = 0; i < relativeOps.length; i++) {
    var relativeResult = await pipeline.execute(relativeProject, relativeOps[i]);
    assert(relativeResult.ok, 'signed relative move should remain valid internal target syntax: ' + relativeResult.msg);
  }

  var absoluteProject = pipeline.emptyProject('AbsoluteMoveBoundaryCheck');
  var absoluteOps = pipeline.parseTargetPlan([
    'create scene name=Game first=true',
    'on key ArrowRight held -> move Player x=100 y=200 scene=Game',
  ].join('\n'));
  var sceneResult = await pipeline.execute(absoluteProject, absoluteOps[0]);
  assert(sceneResult.ok, 'setup scene should execute');
  var absoluteResult = await pipeline.execute(absoluteProject, absoluteOps[1]);
  assert.strictEqual(absoluteResult.ok, false, 'unsigned absolute move syntax must stay outside the internal target boundary');
  assert(/signed relative x\/y/.test(absoluteResult.msg), 'absolute move failure should explain the relative move requirement');
}

async function testInternalEventParserRejectsPlaceholders() {
  var unknownActionProject = pipeline.emptyProject('UnknownActionBoundaryCheck');
  var unknownActionOps = pipeline.parseTargetPlan([
    'create scene name=Game first=true',
    'on start -> unsupported_action Player scene=Game',
  ].join('\n'));
  var setupResult = await pipeline.execute(unknownActionProject, unknownActionOps[0]);
  assert(setupResult.ok, 'setup scene should execute');
  var unknownActionResult = await pipeline.execute(unknownActionProject, unknownActionOps[1]);
  assert.strictEqual(unknownActionResult.ok, false, 'unsupported event actions must not be silently dropped');
  assert(/unsupported event action/.test(unknownActionResult.msg), 'unknown action failure should explain the unsupported event action');
  assert.strictEqual(unknownActionProject.layouts[0].events.length, 0, 'failed event parse must not add a placeholder event');

  var missingActionProject = pipeline.emptyProject('MissingActionBoundaryCheck');
  var missingActionOps = pipeline.parseTargetPlan([
    'create scene name=Game first=true',
    'on start -> scene=Game',
  ].join('\n'));
  var missingSetupResult = await pipeline.execute(missingActionProject, missingActionOps[0]);
  assert(missingSetupResult.ok, 'setup scene should execute');
  var missingActionResult = await pipeline.execute(missingActionProject, missingActionOps[1]);
  assert.strictEqual(missingActionResult.ok, false, 'events without actions must fail instead of creating placeholders');
  assert(/at least one action|unsupported event action/.test(missingActionResult.msg), 'missing action failure should explain the action requirement');
  assert.strictEqual(missingActionProject.layouts[0].events.length, 0, 'missing action must not add a placeholder event');
}

function testTargetPlanParserRejectsMalformedLines() {
  assert.throws(function() {
    pipeline.parseTargetPlan('create object name="Broken type=ShapePainter scene=Game');
  }, /Unclosed quote/, 'internal target parser must reject malformed quoted lines');
}

async function main() {
  testTargetPlanParserRejectsMalformedLines();
  await testInternalMoveActionBoundary();
  await testInternalEventParserRejectsPlaceholders();

  var fixturePath = path.join(__dirname, 'fixtures', 'intent-mobile-platformer.dsl');
  var intentDslText = fs.readFileSync(fixturePath, 'utf8');
  var compiled = intentCompiler.compileIntentDsl(intentDslText, {
    placementContext: {
      objectBounds: {
        Player: { x: 100, y: 400, width: 32, height: 48 }
      }
    }
  });

  assert(compiled.bridgePlan.targetPlanLines.length > 0, 'Intent fixture should compile to bridge target lines');
  assert(compiled.bridgePlan.runtimeAdapterRequirements.length >= 5, 'Intent fixture should compile runtime adapter requirements');

  var project = pipeline.emptyProject('IntentPipelineCheck');
  var ops = pipeline.parseTargetPlan(compiled.bridgePlan.targetPlanText);
  assert.strictEqual(ops.length, compiled.bridgePlan.targetPlanLines.length, 'bridge target lines should parse through pipeline parser');
  for (var i = 0; i < ops.length; i++) {
    var result = await pipeline.execute(project, ops[i]);
    assert(result.ok, 'bridge target line should execute through pipeline executor: ' + compiled.bridgePlan.targetPlanLines[i] + ' -> ' + result.msg);
  }

  var runtimeJs = intentRuntimeCodegen.generate(compiled.bridgePlan.runtimeAdapterRequirements);
  assert(runtimeJs.indexOf('window.GameCastleIntentRuntime') >= 0, 'adapter requirements should generate intent runtime script');
  assert(project.layouts.some(function(layout) { return layout.name === 'Game'; }), 'bridge target plan should create Game scene');

  console.log('[IntentPipelineEntry] Intent fixture compiles to executable bridge target lines and runtime adapters');
}

main().catch(function(error) {
  console.error(error);
  process.exit(1);
});
