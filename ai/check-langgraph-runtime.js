var assert = require('assert');
var fs = require('fs');
var path = require('path');

var intentCompiler = require('./intent-compiler');
var intentPipelineGraph = require('./intent-pipeline-graph');
var langGraphRuntime = require('./langgraph-runtime');
var pipelineState = require('./pipeline-state');

function readIntentFixture() {
  return fs.readFileSync(path.join(__dirname, 'fixtures', 'intent-mobile-platformer.dsl'), 'utf8');
}

function lengthOf(list) {
  return (list || []).length;
}

function compileFixture(intentDslText) {
  return intentCompiler.compileIntentDsl(intentDslText, {
    placementContext: {
      objectBounds: {
        Player: { x: 100, y: 400, width: 32, height: 48 },
      },
    },
  });
}

function buildPartialState() {
  return pipelineState.createPipelineState({
    mode: 'intentFixtureNew',
    batchLabel: 'official_langgraph_runtime_check',
    artifactKind: 'intent',
    userRequest: [
      'make a mobile platformer',
      'set placement object=Player x=100 y=400 scene=Game',
      'move Player up 10 pixels',
    ].join('\n'),
    creativeVision: 'A mobile platformer with a bold climbing rhythm.',
    creativeChange: { isNew: true, changed: true, previousVision: null, currentVision: 'A mobile platformer with a bold climbing rhythm.' },
    projectWorld: null,
  });
}

function makeHandlers(intentDslText, compiled) {
  return {
    'llm2-intent': async function(view) {
      var safeJson = JSON.stringify(view);
      assert(safeJson.indexOf('set placement object=') < 0, 'official LangGraph LLM2 node must not see target instructions');
      assert(safeJson.indexOf('"x"') < 0, 'official LangGraph LLM2 node must not see raw x/y coordinates');
      assert(safeJson.indexOf('10 pixels') < 0, 'official LangGraph LLM2 node must not see numeric edit deltas');
      assert(!view.state.bridge, 'official LangGraph LLM2 node must not see bridge state');
      return {
        'llm2.intentSlotPacket': { schemaVersion: 1, commands: [{ kind: 'make_game', slots: { description: 'mobile platformer' } }] },
        'llm2.intentSlotCommandCount': 1,
      };
    },
    'intent-compiler': function(view) {
      assert(view.state.llm2.intentSlotPacket, 'official LangGraph compiler node should receive Intent slots');
      assert(!view.state.runtime, 'official LangGraph compiler node must not see runtime state');
      return {
        'compiler.intentDslText': intentDslText,
        'compiler.intentDslLineCount': intentDslText.split(/\r?\n/).filter(Boolean).length,
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
      assert(view.state.intentGraph.graph, 'official LangGraph resolver node should receive Intent Graph');
      assert(!view.state.bridge, 'official LangGraph resolver node must not see bridge state');
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
      assert(view.state.resolver.placementPlan, 'official LangGraph bridge node should receive resolver output');
      assert(!view.state.llm2, 'official LangGraph bridge node must not see LLM2 input');
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
      assert(view.state.bridge.targetPlanText, 'official LangGraph runtime node should receive target plan');
      assert(!view.state.requirement, 'official LangGraph runtime node must not see raw requirement state');
      var targetCount = lengthOf(compiled.bridgePlan.targetPlanLines);
      var world = { schemaVersion: 1, worldVersion: 1, semanticHash: 'langgraph-runtime-check', scenes: [] };
      return {
        'runtime.executionReport': { summary: { nextAction: 'done', total: targetCount, completed: targetCount, failed: 0 } },
        'runtime.summary': { nextAction: 'done', total: targetCount, completed: targetCount, failed: 0 },
        'projectWorld.world': world,
        'projectWorld.sanitizedForLlm2': { worldVersion: world.worldVersion, semanticHash: world.semanticHash },
      };
    },
  };
}

async function main() {
  var langGraphPackage = await langGraphRuntime.loadLangGraphPackage();
  assert.strictEqual(typeof langGraphPackage.StateGraph, 'function', 'official package should expose StateGraph');

  var intentDslText = readIntentFixture();
  var compiled = compileFixture(intentDslText);
  var handlers = makeHandlers(intentDslText, compiled);
  var compiledGraph = await intentPipelineGraph.compileIntentLangGraph(handlers);
  assert(compiledGraph && typeof compiledGraph.invoke === 'function', 'compiled official LangGraph should expose invoke');

  var result = await intentPipelineGraph.runIntentLangGraph(buildPartialState(), handlers, {
    compiledGraph: compiledGraph,
  });
  assert.deepStrictEqual(
    result.graphTrace.map(function(entry) { return entry.node; }),
    intentPipelineGraph.INTENT_PIPELINE_NODE_SEQUENCE,
    'official LangGraph runtime should preserve canonical owner node order'
  );
  pipelineState.validatePipelineState(result.state);

  await assert.rejects(async function() {
    await intentPipelineGraph.runIntentLangGraph(buildPartialState(), {
      'llm2-intent': function() {
        return { 'bridge.bridgePlan': { target: 'gdjs-target-plan' } };
      },
      'intent-compiler': handlers['intent-compiler'],
      resolver: handlers.resolver,
      bridge: handlers.bridge,
      runtime: handlers.runtime,
    });
  }, /may not write/, 'official LangGraph path must keep node write contracts');

  console.log('[LangGraphRuntime] official StateGraph pipeline boundary passed');
}

main().catch(function(error) {
  console.error(error);
  process.exit(1);
});
