var assert = require('assert');
var fs = require('fs');
var path = require('path');

var intentCompiler = require('./intent-compiler');
var pipeline = require('./pipeline');
var intentRuntimeCodegen = require('./intent-runtime-codegen');

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

  assert(compiled.bridgePlan.dslLines.length > 0, 'Intent fixture should compile to bridge DSL');
  assert(compiled.bridgePlan.runtimeAdapterRequirements.length >= 5, 'Intent fixture should compile runtime adapter requirements');

  var project = pipeline.emptyProject('IntentPipelineCheck');
  var ops = pipeline.parseDSL(compiled.bridgePlan.dslText);
  assert.strictEqual(ops.length, compiled.bridgePlan.dslLines.length, 'bridge DSL should parse through pipeline parser');
  for (var i = 0; i < ops.length; i++) {
    var result = await pipeline.execute(project, ops[i]);
    assert(result.ok, 'bridge DSL should execute through pipeline executor: ' + compiled.bridgePlan.dslLines[i] + ' -> ' + result.msg);
  }

  var runtimeJs = intentRuntimeCodegen.generate(compiled.bridgePlan.runtimeAdapterRequirements);
  assert(runtimeJs.indexOf('window.GameCastleIntentRuntime') >= 0, 'adapter requirements should generate intent runtime script');
  assert(project.layouts.some(function(layout) { return layout.name === 'Game'; }), 'bridge DSL should create Game scene');

  console.log('[IntentPipelineEntry] Intent fixture compiles to executable bridge DSL and runtime adapters');
}

main().catch(function(error) {
  console.error(error);
  process.exit(1);
});
