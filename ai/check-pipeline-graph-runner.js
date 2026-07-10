var assert = require('assert');
var fs = require('fs');
var path = require('path');

var intentCompiler = require('./intent-compiler');
var pipeline = require('./pipeline');
var pipelineGraphRunner = require('./pipeline-graph-runner');
var pipelineState = require('./pipeline-state');
var projectWorld = require('./project-world');

async function buildState() {
  var fixturePath = path.join(__dirname, 'fixtures', 'intent-mobile-platformer.dsl');
  var intentDslText = fs.readFileSync(fixturePath, 'utf8');
  var compiled = intentCompiler.compileIntentDsl(intentDslText, {
    placementContext: {
      objectBounds: {
        Player: { x: 100, y: 400, width: 32, height: 48 },
      },
    },
  });
  var project = pipeline.emptyProject('PipelineGraphRunnerCheck');
  var ops = pipeline.parseTargetPlan(compiled.bridgePlan.targetPlanText);
  for (var i = 0; i < ops.length; i++) {
    var result = await pipeline.execute(project, ops[i]);
    assert(result.ok, 'bridge target plan should execute before graph runner check: ' + result.msg);
  }
  var intentArtifacts = {
    artifactKind: 'intent',
    intentDslText: intentDslText,
    intentGraph: compiled.graph,
    placementPlan: compiled.placementPlan,
    bridgePlan: compiled.bridgePlan,
    intentContracts: compiled.contracts,
    compileResultCard: compiled.resultCard,
    runtimeAdapterRequirements: compiled.bridgePlan.runtimeAdapterRequirements,
  };
  var world = projectWorld.buildProjectWorld(project, null, {
    modules: compiled.bridgePlan.installedModules,
    intent: intentArtifacts,
  });
  var report = projectWorld.makeExecutionReport({
    previousWorld: null,
    world: world,
    targetPlanLines: compiled.bridgePlan.targetPlanLines,
    commandResults: compiled.bridgePlan.targetPlanLines.map(function(line, index) {
      return {
        index: index,
        commandId: 'graph_runner_' + String(index + 1).padStart(3, '0'),
        ok: true,
        label: line,
        message: 'ok',
      };
    }),
    runIndex: 1,
    batchLabel: 'pipeline_graph_runner_check',
    intent: intentArtifacts,
  });
  return pipelineState.createPipelineState({
    mode: 'intentFixtureNew',
    batchLabel: 'pipeline_graph_runner_check',
    artifactKind: 'intent',
    userRequest: 'make a mobile platformer',
    designBrief: { theme: 'mobile platformer', objects: [], rules: [], layout: { placements: [] } },
    diff: { isNew: true },
    intentDslText: intentDslText,
    intentGraph: compiled.graph,
    placementPlan: compiled.placementPlan,
    bridgePlan: compiled.bridgePlan,
    intentContracts: compiled.contracts,
    compileResultCard: compiled.resultCard,
    targetPlanText: compiled.bridgePlan.targetPlanText,
    executionReport: report,
    projectWorld: world,
  });
}

function buildPartialState() {
  return pipelineState.createPipelineState({
    mode: 'intentFixtureNew',
    batchLabel: 'pipeline_graph_runner_partial_check',
    artifactKind: 'intent',
    userRequest: [
      'make a mobile platformer',
      'set placement object=Player x=100 y=400 scene=Game',
    ].join('\n'),
    designBrief: {
      theme: 'mobile platformer',
      objects: [{ name: 'Player', kind: 'player', width: 32, height: 48 }],
      rules: [],
      layout: { placements: [{ object: 'Player', x: 100, y: 400 }] },
    },
    diff: { isNew: true },
    projectWorld: null,
  });
}

function readIntentFixture() {
  var fixturePath = path.join(__dirname, 'fixtures', 'intent-mobile-platformer.dsl');
  return fs.readFileSync(fixturePath, 'utf8');
}

async function main() {
  var state = await buildState();
  var result = pipelineGraphRunner.runGraph(state, [{
    node: 'llm2-intent',
    run: function(view) {
      assert(view.state.llm2.nodeInput, 'runner should pass sanitized LLM2 node input');
      assert(!view.state.bridge, 'runner should not pass bridge state to LLM2');
      return {
        'llm2.intentDslText': 'adjust Fox placement above slightly',
        'llm2.intentDslLineCount': 1,
      };
    },
  }]);
  assert.strictEqual(result.trace.length, 1, 'runner should record one graph step');
  assert.deepStrictEqual(result.trace[0].reads, ['llm2.nodeInput'], 'runner trace should record contract reads');
  assert.deepStrictEqual(result.trace[0].writes.sort(), ['llm2.intentDslLineCount', 'llm2.intentDslText'].sort(), 'runner trace should record state update writes');
  assert.strictEqual(result.state.llm2.intentDslText, 'adjust Fox placement above slightly', 'runner should apply legal LLM2 update');

  assert.throws(function() {
    pipelineGraphRunner.runGraph(state, [{
      node: 'llm2-intent',
      run: function() {
        return { 'bridge.bridgePlan': { target: 'gdjs-target-plan' } };
      },
    }]);
  }, /may not write/, 'runner should reject node updates outside the contract');

  assert.throws(function() {
    pipelineGraphRunner.runGraph(state, [{
      node: 'llm2-intent',
      run: function() { return null; },
    }]);
  }, /path-object state update/, 'runner should reject non-object node output');

  var partialState = buildPartialState();
  assert.throws(function() {
    pipelineState.validatePipelineState(partialState);
  }, /requires llm2\.intentDslText/, 'strict validation should reject incomplete graph state');
  pipelineState.validatePipelineState(partialState, { allowPartial: true });
  var partialResult = pipelineGraphRunner.runGraph(partialState, [{
    node: 'llm2-intent',
    run: function(view) {
      var inputJson = JSON.stringify(view);
      assert(inputJson.indexOf('set placement object=Player') < 0, 'partial LLM2 view should sanitize target instructions from user request');
      assert(inputJson.indexOf('"x"') < 0, 'partial LLM2 view should not expose raw coordinates');
      assert(inputJson.indexOf('make a mobile platformer') >= 0, 'partial LLM2 view should preserve safe request');
      return {
        'llm2.intentDslText': 'make a mobile platformer',
        'llm2.intentDslLineCount': 1,
      };
    },
  }], { allowPartial: true });
  assert.strictEqual(partialResult.trace[0].partial, true, 'runner trace should mark partial execution');
  assert.strictEqual(partialResult.state.llm2.intentDslText, 'make a mobile platformer', 'partial runner should apply LLM2 update');
  assert.throws(function() {
    pipelineGraphRunner.runGraph(partialState, [{
      node: 'llm2-intent',
      run: function() {
        return { 'bridge.bridgePlan': { target: 'gdjs-target-plan' } };
      },
    }], { allowPartial: true });
  }, /may not write/, 'partial runner should still reject out-of-contract writes');

  var fixtureIntentDsl = readIntentFixture();
  var compiled = intentCompiler.compileIntentDsl(fixtureIntentDsl, {
    placementContext: {
      objectBounds: {
        Player: { x: 100, y: 400, width: 32, height: 48 },
      },
    },
  });
  var completeState = await buildState();
  var chainResult = pipelineGraphRunner.runGraph(buildPartialState(), [{
    node: 'llm2-intent',
    run: function(view) {
      assert(view.state.llm2.nodeInput, 'full graph LLM2 step should receive sanitized node input');
      return {
        'llm2.intentDslText': fixtureIntentDsl,
        'llm2.intentDslLineCount': fixtureIntentDsl.split(/\r?\n/).filter(Boolean).length,
      };
    },
  }, {
    node: 'intent-compiler',
    run: function(view) {
      assert(view.state.llm2.intentDslText, 'compiler step should read Intent DSL');
      assert(!view.state.bridge, 'compiler step should not receive bridge state');
      return {
        'intentGraph.graph': compiled.graph,
        'intentGraph.summary': completeState.intentGraph.summary,
        'compiler.contracts': compiled.contracts,
        'compiler.resultCard': compiled.resultCard,
        'compiler.resultCardSummary': completeState.compiler.resultCardSummary,
      };
    },
  }, {
    node: 'resolver',
    run: function(view) {
      assert(view.state.intentGraph.graph, 'resolver step should read Intent Graph');
      assert(!view.state.bridge, 'resolver step should not receive bridge state');
      return {
        'resolver.placementPlan': compiled.placementPlan,
        'resolver.summary': completeState.resolver.summary,
      };
    },
  }, {
    node: 'bridge',
    run: function(view) {
      assert(view.state.resolver.placementPlan, 'bridge step should read Placement Plan');
      assert(view.state.compiler.contracts, 'bridge step should read compiler contracts');
      assert(!view.state.runtime, 'bridge step should not receive runtime state');
      return {
        'bridge.bridgePlan': compiled.bridgePlan,
        'bridge.summary': completeState.bridge.summary,
        'bridge.targetPlanText': compiled.bridgePlan.targetPlanText,
        'bridge.targetPlanLineCount': compiled.bridgePlan.targetPlanLines.length,
      };
    },
  }, {
    node: 'runtime',
    run: function(view) {
      assert(view.state.bridge.targetPlanText, 'runtime step should read internal target plan');
      assert(!view.state.llm2, 'runtime step should not receive LLM2 state');
      return {
        'runtime.executionReport': completeState.runtime.executionReport,
        'runtime.summary': completeState.runtime.summary,
        'projectWorld.world': completeState.projectWorld.world,
        'projectWorld.sanitizedForLlm2': completeState.projectWorld.sanitizedForLlm2,
      };
    },
  }], { allowPartial: true });
  assert.strictEqual(chainResult.trace.length, 5, 'full graph runner should execute five contract-bound steps');
  chainResult.trace.forEach(function(item) {
    assert.strictEqual(item.partial, true, 'full graph runner trace should mark partial execution');
  });
  pipelineState.validatePipelineState(chainResult.state);
  assert.strictEqual(chainResult.state.bridge.targetPlanLineCount, compiled.bridgePlan.targetPlanLines.length, 'full graph runner should produce bridge state');
  assert.strictEqual(chainResult.state.runtime.summary.nextAction, 'done', 'full graph runner should produce runtime summary');
  assert(chainResult.state.projectWorld.sanitizedForLlm2, 'full graph runner should produce sanitized ProjectWorld projection');

  console.log('[PipelineGraphRunner] contract-bound view/update runner passed');
}

main().catch(function(error) {
  console.error(error);
  process.exit(1);
});
