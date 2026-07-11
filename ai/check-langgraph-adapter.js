var assert = require('assert');
var fs = require('fs');
var path = require('path');

var intentCompiler = require('./intent-compiler');
var langGraphAdapter = require('./langgraph-adapter');
var pipelineState = require('./pipeline-state');

function readIntentFixture() {
  return fs.readFileSync(path.join(__dirname, 'fixtures', 'intent-mobile-platformer.dsl'), 'utf8');
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

function lengthOf(list) {
  return (list || []).length;
}

function buildPartialState() {
  return pipelineState.createPipelineState({
    mode: 'intentFixtureNew',
    batchLabel: 'langgraph_adapter_partial_check',
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

async function main() {
  var intentDslText = readIntentFixture();
  var compiled = compileFixture(intentDslText);
  var graphState = langGraphAdapter.makeLangGraphState(buildPartialState());

  var llm2Node = langGraphAdapter.makeLangGraphNode('llm2-intent', async function(view) {
    var safeJson = JSON.stringify(view);
    assert(safeJson.indexOf('set placement object=') < 0, 'LangGraph LLM2 view must not expose target instructions');
    assert(safeJson.indexOf('"x"') < 0, 'LangGraph LLM2 view must not expose raw coordinates');
    assert(safeJson.indexOf('10 pixels') < 0, 'LangGraph LLM2 view must not expose numeric edit deltas');
    assert(!view.state.bridge, 'LangGraph LLM2 view must not include bridge state');
    return {
      'llm2.intentSlotPacket': { schemaVersion: 1, commands: [{ kind: 'make_game', slots: { description: 'mobile platformer' } }] },
      'llm2.intentSlotCommandCount': 1,
    };
  }, { allowPartial: true });

  var compilerNode = langGraphAdapter.makeLangGraphNode('intent-compiler', function(view) {
    assert(view.state.llm2.intentSlotPacket, 'LangGraph compiler view should receive Intent slots');
    assert(!view.state.runtime, 'LangGraph compiler view must not include runtime state');
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
  }, { allowPartial: true });

  var resolverNode = langGraphAdapter.makeLangGraphNode('resolver', function(view) {
    assert(view.state.intentGraph.graph, 'LangGraph resolver view should receive Intent Graph');
    assert(!view.state.bridge, 'LangGraph resolver view must not include bridge state');
    return {
      'resolver.placementPlan': compiled.placementPlan,
      'resolver.summary': {
        placements: lengthOf(compiled.placementPlan.placements),
        edits: lengthOf(compiled.placementPlan.editPlan && compiled.placementPlan.editPlan.edits),
        diagnostics: lengthOf(compiled.placementPlan.diagnostics),
      },
    };
  }, { allowPartial: true });

  var bridgeNode = langGraphAdapter.makeLangGraphNode('bridge', function(view) {
    assert(view.state.resolver.placementPlan, 'LangGraph bridge view should receive resolver output');
    assert(!view.state.llm2, 'LangGraph bridge view must not include LLM2 input');
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
  }, { allowPartial: true });

  var runtimeNode = langGraphAdapter.makeLangGraphNode('runtime', function(view) {
    assert(view.state.bridge.targetPlanText, 'LangGraph runtime view should receive target plan');
    assert(!view.state.requirement, 'LangGraph runtime view must not include raw requirement');
    var targetCount = lengthOf(compiled.bridgePlan.targetPlanLines);
    var world = { schemaVersion: 1, worldVersion: 1, semanticHash: 'adapter-check', scenes: [] };
    return {
      'runtime.executionReport': { summary: { nextAction: 'done', total: targetCount, completed: targetCount, failed: 0 } },
      'runtime.summary': { nextAction: 'done', total: targetCount, completed: targetCount, failed: 0 },
      'projectWorld.world': world,
      'projectWorld.sanitizedForLlm2': { worldVersion: world.worldVersion, semanticHash: world.semanticHash },
    };
  }, { allowPartial: true });

  graphState = await llm2Node(graphState);
  graphState = await compilerNode(graphState);
  graphState = await resolverNode(graphState);
  graphState = await bridgeNode(graphState);
  graphState = await runtimeNode(graphState);

  assert.strictEqual(graphState.graphTrace.length, 5, 'LangGraph adapter should record each node trace');
  assert.deepStrictEqual(graphState.graphTrace[0].reads, ['llm2.nodeInput'], 'LangGraph adapter should trace sanitized LLM2 read');
  assert(graphState.graphTrace[0].writes.indexOf('llm2.intentSlotPacket') >= 0, 'LangGraph adapter should trace LLM2 slot writes');
  pipelineState.validatePipelineState(graphState.pipelineState);

  var illegalNode = langGraphAdapter.makeLangGraphNode('llm2-intent', function() {
    return { 'bridge.bridgePlan': { target: 'gdjs-target-plan' } };
  }, { allowPartial: true });
  await assert.rejects(function() {
    return illegalNode(langGraphAdapter.makeLangGraphState(buildPartialState()));
  }, /may not write/, 'LangGraph adapter must reject out-of-contract LLM2 writes');

  var malformedNode = langGraphAdapter.makeLangGraphNode('llm2-intent', function() {
    return null;
  }, { allowPartial: true });
  await assert.rejects(function() {
    return malformedNode(langGraphAdapter.makeLangGraphState(buildPartialState()));
  }, /path-object state update/, 'LangGraph adapter must reject malformed node output');

  assert.throws(function() {
    langGraphAdapter.unwrapPipelineState({ graphTrace: [] });
  }, /pipelineState/, 'LangGraph adapter should require the PipelineState channel');

  console.log('[LangGraphAdapter] contract-bound node adapter passed');
}

main().catch(function(error) {
  console.error(error);
  process.exit(1);
});
