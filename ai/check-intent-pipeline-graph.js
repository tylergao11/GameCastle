var assert = require('assert');
var fs = require('fs');
var path = require('path');

var intentCompiler = require('./intent-compiler');
var intentPipelineGraph = require('./intent-pipeline-graph');
var pipeline = require('./pipeline');
var pipelineState = require('./pipeline-state');
var projectWorld = require('./project-world');

function readIntentFixture() {
  return fs.readFileSync(path.join(__dirname, 'fixtures', 'intent-mobile-platformer.dsl'), 'utf8');
}

function lengthOf(list) {
  return (list || []).length;
}

function buildPartialState() {
  return pipelineState.createPipelineState({
    mode: 'intentFixtureNew',
    batchLabel: 'intent_pipeline_graph_check',
    artifactKind: 'intent',
    userRequest: [
      'make a mobile platformer',
      'set placement object=Player x=100 y=400 scene=Game',
      'move Player up 10 pixels',
    ].join('\n'),
    designBrief: {
      theme: 'mobile platformer',
      objects: [{ name: 'Player', kind: 'player', width: 32, height: 48 }],
      rules: ['on key ArrowLeft held -> move Player x=-4 scene=Game'],
      layout: { placements: [{ object: 'Player', x: 100, y: 400 }] },
    },
    diff: {
      isNew: true,
      added: { placements: [{ object: 'Player', x: 100, y: 400 }] },
    },
    projectWorld: null,
  });
}

async function buildRuntimeArtifacts(compiled, intentDslText) {
  var project = pipeline.emptyProject('IntentPipelineGraphCheck');
  var ops = pipeline.parseTargetPlan(compiled.bridgePlan.targetPlanText);
  var commandResults = [];
  for (var i = 0; i < ops.length; i++) {
    var result = await pipeline.execute(project, ops[i]);
    assert(result.ok, 'bridge target plan should execute before graph check: ' + result.msg);
    commandResults.push({
      index: i,
      commandId: 'intent_graph_' + String(i + 1).padStart(3, '0'),
      ok: true,
      label: compiled.bridgePlan.targetPlanLines[i],
      message: result.msg,
    });
  }
  var intent = {
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
    intent: intent,
  });
  var report = projectWorld.makeExecutionReport({
    previousWorld: null,
    world: world,
    targetPlanLines: compiled.bridgePlan.targetPlanLines,
    commandResults: commandResults,
    runIndex: 1,
    batchLabel: 'intent_pipeline_graph_check',
    intent: intent,
  });
  return {
    world: world,
    report: report,
  };
}

function makeHandlers(intentDslText, compiled, runtimeArtifacts) {
  return {
    'llm2-intent': async function(view) {
      var safeJson = JSON.stringify(view);
      assert(safeJson.indexOf('set placement object=') < 0, 'canonical graph LLM2 view must not expose target-plan instructions');
      assert(safeJson.indexOf('"x"') < 0, 'canonical graph LLM2 view must not expose raw coordinates');
      assert(safeJson.indexOf('10 pixels') < 0, 'canonical graph LLM2 view must not expose numeric deltas');
      assert(!view.state.bridge, 'canonical graph LLM2 view must not receive bridge state');
      return {
        'llm2.intentDslText': intentDslText,
        'llm2.intentDslLineCount': intentDslText.split(/\r?\n/).filter(Boolean).length,
      };
    },
    'intent-compiler': function(view) {
      assert(view.state.llm2.intentDslText, 'canonical graph compiler should receive Intent DSL');
      assert(!view.state.bridge, 'canonical graph compiler must not receive bridge state');
      return {
        'intentGraph.graph': compiled.graph,
        'intentGraph.summary': {
          things: lengthOf(compiled.graph.things),
          components: lengthOf(compiled.graph.components),
          relations: lengthOf(compiled.graph.relations),
          placements: lengthOf(compiled.graph.placements),
          edits: lengthOf(compiled.graph.edits),
          bindings: lengthOf(compiled.graph.bindings),
          requirements: lengthOf(compiled.graph.requirements),
          diagnostics: lengthOf(compiled.graph.diagnostics),
        },
        'compiler.contracts': compiled.contracts,
        'compiler.resultCard': compiled.resultCard,
        'compiler.resultCardSummary': {
          resolved: lengthOf(compiled.resultCard.resolved),
          rewrites: lengthOf(compiled.resultCard.rewrites),
          overrides: lengthOf(compiled.resultCard.overrides),
          editConstraints: lengthOf(compiled.resultCard.editConstraints),
          autoAdded: lengthOf(compiled.resultCard.autoAdded),
          diagnostics: lengthOf(compiled.resultCard.diagnostics),
          warnings: lengthOf(compiled.resultCard.warnings),
          ownerTrace: compiled.resultCard.ownerTrace,
        },
      };
    },
    resolver: function(view) {
      assert(view.state.intentGraph.graph, 'canonical graph resolver should receive Intent Graph');
      assert(!view.state.bridge, 'canonical graph resolver must not receive bridge state');
      return {
        'resolver.placementPlan': compiled.placementPlan,
        'resolver.summary': {
          placements: lengthOf(compiled.placementPlan.placements),
          edits: lengthOf(compiled.placementPlan.editPlan && compiled.placementPlan.editPlan.edits),
          diagnostics: lengthOf(compiled.placementPlan.diagnostics),
        },
      };
    },
    bridge: function(view) {
      assert(view.state.resolver.placementPlan, 'canonical graph bridge should receive resolver output');
      assert(view.state.compiler.contracts, 'canonical graph bridge should receive compiler contracts');
      assert(!view.state.llm2, 'canonical graph bridge must not receive LLM2 input');
      return {
        'bridge.bridgePlan': compiled.bridgePlan,
        'bridge.summary': {
          target: compiled.bridgePlan.target,
          targetPlanLines: lengthOf(compiled.bridgePlan.targetPlanLines),
          runtimeAdapterRequirements: lengthOf(compiled.bridgePlan.runtimeAdapterRequirements),
          diagnostics: lengthOf(compiled.bridgePlan.diagnostics),
        },
        'bridge.targetPlanText': compiled.bridgePlan.targetPlanText,
        'bridge.targetPlanLineCount': lengthOf(compiled.bridgePlan.targetPlanLines),
      };
    },
    runtime: function(view) {
      assert(view.state.bridge.targetPlanText, 'canonical graph runtime should receive internal target plan');
      assert(!view.state.requirement, 'canonical graph runtime must not receive raw requirement');
      return {
        'runtime.executionReport': runtimeArtifacts.report,
        'runtime.summary': runtimeArtifacts.report.summary,
        'projectWorld.world': runtimeArtifacts.world,
        'projectWorld.sanitizedForLlm2': projectWorld.sanitizeProjectWorldForIntentPrompt(runtimeArtifacts.world),
      };
    },
  };
}

async function main() {
  var intentDslText = readIntentFixture();
  var compiled = require('./intent-compiler').compileIntentDsl(intentDslText, {
    placementContext: {
      objectBounds: {
        Player: { x: 100, y: 400, width: 32, height: 48 },
      },
    },
  });
  var runtimeArtifacts = await buildRuntimeArtifacts(compiled, intentDslText);
  var handlers = makeHandlers(intentDslText, compiled, runtimeArtifacts);

  assert.deepStrictEqual(intentPipelineGraph.INTENT_PIPELINE_NODE_SEQUENCE, [
    'llm2-intent',
    'intent-compiler',
    'resolver',
    'bridge',
    'runtime',
  ], 'canonical graph sequence should define the AI-first owner order');

  var steps = intentPipelineGraph.makeIntentPipelineSteps(handlers);
  assert.deepStrictEqual(steps.map(function(step) { return step.node; }), intentPipelineGraph.INTENT_PIPELINE_NODE_SEQUENCE, 'canonical steps should follow one graph sequence');

  var result = await intentPipelineGraph.runIntentPipelineGraph(buildPartialState(), handlers);
  assert.strictEqual(result.trace.length, 5, 'canonical graph should execute five owner nodes');
  assert.deepStrictEqual(result.trace[0].reads, ['llm2.nodeInput'], 'canonical graph should trace LLM2 sanitized read');
  assert(result.trace[0].writes.indexOf('llm2.intentDslText') >= 0, 'canonical graph should trace LLM2 Intent write');
  assert.strictEqual(result.state.runtime.summary.nextAction, 'done', 'canonical graph should produce runtime summary');
  assert(result.state.projectWorld.sanitizedForLlm2, 'canonical graph should produce LLM2-safe ProjectWorld');
  pipelineState.validatePipelineState(result.state);

  var artifactState = await intentPipelineGraph.makePipelineStateFromArtifacts({
    mode: 'intentFixtureNew',
    batchLabel: 'intent_pipeline_graph_artifact_check',
    artifactKind: 'intent',
    userRequest: 'make a mobile platformer\nset placement object=Player x=100 y=400 scene=Game',
    designBrief: {
      theme: 'mobile platformer',
      objects: [{ name: 'Player', kind: 'player', width: 32, height: 48 }],
      rules: [],
      layout: { placements: [{ object: 'Player', x: 100, y: 400 }] },
    },
    diff: { isNew: true },
    intentDslText: intentDslText,
    intentGraph: compiled.graph,
    placementPlan: compiled.placementPlan,
    bridgePlan: compiled.bridgePlan,
    intentContracts: compiled.contracts,
    compileResultCard: compiled.resultCard,
    targetPlanText: compiled.bridgePlan.targetPlanText,
    executionReport: runtimeArtifacts.report,
    projectWorld: runtimeArtifacts.world,
  });
  assert.deepStrictEqual(
    artifactState.graphTrace.map(function(item) { return item.node; }),
    intentPipelineGraph.INTENT_PIPELINE_NODE_SEQUENCE,
    'artifact replay should persist canonical graph trace'
  );
  assert.strictEqual(artifactState.runtime.summary.nextAction, 'done', 'artifact replay should preserve runtime summary');
  assert.strictEqual(artifactState.projectWorld.world.semanticHash, runtimeArtifacts.world.semanticHash, 'artifact replay should preserve ProjectWorld');

  var safeJson = JSON.stringify({
    runner: result.state.llm2.nodeInput,
    artifactReplay: artifactState.llm2.nodeInput,
  });
  [
    'componentId',
    'bridgePlan',
    'runtimeAdapterRequirements',
    'set placement object=',
    '"x"',
    '"y"',
    '10 pixels',
    '"instances"',
    '"events"',
    '"globalVariables"',
    '"modules"',
  ].forEach(function(token) {
    assert(safeJson.indexOf(token) < 0, 'canonical graph LLM2 input must not expose ' + token);
  });

  var langGraphNodes = intentPipelineGraph.makeIntentLangGraphNodes(handlers);
  var graphState = intentPipelineGraph.makeIntentLangGraphState(buildPartialState());
  for (var i = 0; i < intentPipelineGraph.INTENT_PIPELINE_NODE_SEQUENCE.length; i++) {
    graphState = await langGraphNodes[intentPipelineGraph.INTENT_PIPELINE_NODE_SEQUENCE[i]](graphState);
  }
  assert.strictEqual(graphState.graphTrace.length, 5, 'canonical LangGraph nodes should trace each owner node');
  pipelineState.validatePipelineState(graphState.pipelineState);

  assert.throws(function() {
    intentPipelineGraph.makeIntentPipelineSteps(Object.assign({}, handlers, { extra: function() {} }));
  }, /does not define node/, 'canonical graph should reject undeclared nodes');

  var missing = Object.assign({}, handlers);
  delete missing.bridge;
  assert.throws(function() {
    intentPipelineGraph.makeIntentPipelineSteps(missing);
  }, /missing handler/, 'canonical graph should require every owner node');

  console.log('[IntentPipelineGraph] canonical graph entry and LangGraph handoff passed');
}

main().catch(function(error) {
  console.error(error);
  process.exit(1);
});
