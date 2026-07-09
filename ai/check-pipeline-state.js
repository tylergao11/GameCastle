var assert = require('assert');
var fs = require('fs');
var path = require('path');

var intentCompiler = require('./intent-compiler');
var pipeline = require('./pipeline');
var pipelineState = require('./pipeline-state');
var intentPipelineGraph = require('./intent-pipeline-graph');
var projectWorld = require('./project-world');

async function executeBridgeIntoProject(compiled) {
  var project = pipeline.emptyProject('PipelineStateCheck');
  var ops = pipeline.parseDSL(compiled.bridgePlan.dslText);
  for (var i = 0; i < ops.length; i++) {
    var result = await pipeline.execute(project, ops[i]);
    assert(result.ok, 'bridge DSL should execute: ' + compiled.bridgePlan.dslLines[i] + ' -> ' + result.msg);
  }
  return project;
}

function assertHasPath(value, pathName, message) {
  var current = value;
  String(pathName || '').split('.').forEach(function(part) {
    current = current && current[part];
  });
  assert(current !== undefined && current !== null, message || ('expected path ' + pathName));
}

function assertMissingTopLevelExcept(view, allowedRoots, nodeName) {
  Object.keys(view.state || {}).forEach(function(root) {
    assert(allowedRoots.indexOf(root) >= 0, nodeName + ' view should not include root ' + root);
  });
}

function samplePatchValue(pathName, state) {
  if (pathName === 'intentGraph.graph') return state.intentGraph.graph;
  if (pathName === 'intentGraph.summary') return state.intentGraph.summary;
  if (pathName === 'compiler.contracts') return state.compiler.contracts;
  if (pathName === 'compiler.resultCard') return state.compiler.resultCard;
  if (pathName === 'compiler.resultCardSummary') return state.compiler.resultCardSummary;
  if (pathName === 'resolver.placementPlan') return state.resolver.placementPlan;
  if (pathName === 'resolver.summary') return state.resolver.summary;
  if (pathName === 'bridge.bridgePlan') return state.bridge.bridgePlan;
  if (pathName === 'bridge.summary') return state.bridge.summary;
  if (pathName === 'bridge.internalDslText') return state.bridge.internalDslText;
  if (pathName === 'bridge.internalDslLineCount') return state.bridge.internalDslLineCount;
  if (pathName === 'runtime.executionReport') return state.runtime.executionReport;
  if (pathName === 'runtime.summary') return state.runtime.summary;
  if (pathName === 'projectWorld.world') return state.projectWorld.world;
  if (pathName === 'projectWorld.sanitizedForLlm2') return state.projectWorld.sanitizedForLlm2;
  return 'sample';
}

function assertNodeContractRoundTrip(state, nodeName) {
  var contract = pipelineState.getNodeContract(nodeName);
  var view = pipelineState.makeNodeStateView(state, nodeName);
  assert.deepStrictEqual(view.reads, contract.reads, nodeName + ' view should expose declared reads');
  (contract.reads || []).forEach(function(pathName) {
    assertHasPath(view.state, pathName, nodeName + ' view should include ' + pathName);
  });
  assertMissingTopLevelExcept(view, (contract.reads || []).map(function(pathName) {
    return pathName.split('.')[0];
  }), nodeName);

  var legalPatch = {};
  (contract.writes || []).forEach(function(pathName) {
    legalPatch[pathName] = samplePatchValue(pathName, state);
  });
  if (Object.keys(legalPatch).length) {
    var patched = pipelineState.applyNodeStatePatch(state, nodeName, legalPatch);
    pipelineState.validatePipelineState(patched);
  }
  assert.throws(function() {
    pipelineState.applyNodeStatePatch(state, nodeName, { 'llm2.nodeInput': {} });
  }, /may not write/, nodeName + ' must not write LLM2 input projection');
}

async function main() {
  var fixturePath = path.join(__dirname, 'fixtures', 'intent-mobile-platformer.dsl');
  var intentDslText = fs.readFileSync(fixturePath, 'utf8');
  var compiled = intentCompiler.compileIntentDsl(intentDslText, {
    placementContext: {
      objectBounds: {
        Player: { x: 100, y: 400, width: 32, height: 48 },
      },
    },
  });
  var project = await executeBridgeIntoProject(compiled);
  var intentArtifacts = {
    patchKind: 'intent',
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
    dslLines: compiled.bridgePlan.dslLines,
    commandResults: compiled.bridgePlan.dslLines.map(function(line, index) {
      return {
        index: index,
        commandId: 'pipeline_state_' + String(index + 1).padStart(3, '0'),
        ok: true,
        label: line,
        message: 'ok',
      };
    }),
    runIndex: 1,
    batchLabel: 'pipeline_state_check',
    intent: intentArtifacts,
  });

  var state = pipelineState.createPipelineState({
    mode: 'fixture-new',
    batchLabel: 'pipeline_state_check',
    patchKind: 'intent',
    userRequest: [
      'make a mobile platformer',
      'move Player up 10 pixels',
      'set placement object=Player x=100 y=400 scene=Game',
    ].join('\n'),
    designBrief: {
      theme: 'mobile platformer',
      objects: [
        { name: 'Player', kind: 'player', width: 32, height: 48, note: 'hero' },
        { name: 'gdjs.BadObject', kind: 'ui', note: 'componentId=input.jump_button' },
      ],
      rules: [
        'Player collects coins',
        'on key ArrowLeft held -> move Player x=-4 scene=Game',
      ],
      layout: {
        placements: [
          { object: 'Player', x: 100, y: 400 },
          { object: 'JumpButton', anchor: 'screen', direction: 'bottom-right' },
        ],
      },
      variables: [{ name: 'Score', value: 0 }],
    },
    diff: {
      isNew: false,
      added: {
        objects: [{ name: 'Coin', kind: 'coin', width: 16, height: 16 }],
        placements: [{ object: 'Coin', x: 500, y: 360 }],
        variables: [{ name: 'Score', value: 0 }],
        rules: ['set placement object=Coin x=500 y=360 scene=Game'],
      },
      removed: { objects: [], placements: [], variables: [], rules: [] },
      modified: {
        objects: [],
        placements: [{ object: 'Player', old: { object: 'Player', x: 100, y: 400 }, new: { object: 'Player', x: 120, y: 380 } }],
        variables: [],
        rules: [],
      },
    },
    intentDslText: intentDslText,
    intentGraph: compiled.graph,
    placementPlan: compiled.placementPlan,
    bridgePlan: compiled.bridgePlan,
    intentContracts: compiled.contracts,
    compileResultCard: compiled.resultCard,
    internalDslText: compiled.bridgePlan.dslText,
    executionReport: report,
    projectWorld: world,
  });
  pipelineState.validatePipelineState(state);
  assert.doesNotThrow(function() {
    pipelineState.assertNoProhibitedAiVisibleSurface({
      placement: { anchor: 'screen', direction: 'bottom-right' },
      edit: { amount: 'slightly' },
    }, 'semantic-ai-visible');
  }, 'AI-visible structural guard should allow semantic placement keys');
  [
    { x: 100 },
    { y: 400 },
    { dx: 8 },
    { bridgePlan: {} },
    { runtimeAdapterRequirements: [] },
    { componentId: 'input.jump_button' },
    { dslLines: ['create scene name=Game first=true'] },
    { commandResults: [] },
  ].forEach(function(value) {
    assert.throws(function() {
      pipelineState.assertNoProhibitedAiVisibleSurface(value, 'structural-leak-check');
    }, /structured-key|machine form/, 'AI-visible structural guard must reject machine key ' + Object.keys(value)[0]);
  });

  assert.strictEqual(state.stateKind, 'gamecastle-ai-first-intent-pipeline', 'state kind should identify the graph-ready contract');
  assert.strictEqual(state.patchKind, 'intent', 'state should preserve patch kind');
  assert(state.nodeContracts && state.nodeContracts['llm2-intent'], 'PipelineState should carry node contracts for future graph execution');
  assert.deepStrictEqual(
    state.nodeContracts['llm2-intent'].reads,
    pipelineState.getNodeContract('llm2-intent').reads,
    'PipelineState llm2 contract should match code contract'
  );
  assert(state.intentGraph.summary.components >= 4, 'state should summarize Intent Graph');
  assert(state.resolver.summary.placements >= 4, 'state should summarize placement plan');
  assert(state.bridge.summary.internalDslLines === compiled.bridgePlan.dslLines.length, 'state should summarize bridge target code');
  assert(state.compiler.contracts.intentCompile === 'passed', 'state should carry aggregate compile contract');
  assert(state.runtime.summary.nextAction === 'done', 'state should carry execution summary');
  assert(state.runtime.summary.intentFulfillment.status === 'fulfilled', 'state should carry safe Intent fulfillment summary');
  assert(state.bridge.bridgePlan.runtimeAdapterRequirements.length >= 5, 'internal state may retain runtime adapter requirements');
  assert(JSON.stringify(state.requirement.designBrief).indexOf('"x"') >= 0, 'internal state may retain raw requirement details for audit');
  ['intent-compiler', 'resolver', 'bridge', 'runtime'].forEach(function(nodeName) {
    assertNodeContractRoundTrip(state, nodeName);
  });

  var safeJson = JSON.stringify(state.llm2.nodeInput);
  [
    'componentId',
    'input.jump_button',
    'virtual-joystick',
    'bridgePlan',
    'runtimeAdapterRequirements',
    'gdjs.BadObject',
    '10 pixels',
    '"x"',
    '"y"',
    'set placement object=',
  ].forEach(function(token) {
    assert(safeJson.indexOf(token) < 0, 'LLM2 node input must not expose ' + token);
  });
  assert(safeJson.indexOf('make a mobile platformer') >= 0, 'LLM2 node input should preserve safe user wording');
  assert(safeJson.indexOf('Player') >= 0, 'LLM2 node input should preserve world object names');
  assert(safeJson.indexOf('bottom-left') >= 0, 'LLM2 node input should preserve natural placement');
  assert(safeJson.indexOf('bottom-right') >= 0, 'LLM2 node input should preserve safe design placement');

  var missingWorld = {
    schemaVersion: 1,
    worldVersion: 1,
    project: { name: 'MissingPipelineStateCheck', firstScene: 'Game' },
    scenes: [{ name: 'Game', objects: [], instances: [] }],
    globalObjects: [],
    globalVariables: [],
  };
  var missingReport = projectWorld.makeExecutionReport({
    previousWorld: null,
    world: missingWorld,
    dslLines: [],
    commandResults: [],
    runIndex: 2,
    batchLabel: 'pipeline_state_missing_fulfillment_check',
    intent: intentArtifacts,
  });
  var missingState = pipelineState.createPipelineState({
    mode: 'fixture-new',
    batchLabel: 'pipeline_state_missing_fulfillment_check',
    patchKind: 'intent',
    userRequest: 'make a mobile platformer',
    designBrief: { theme: 'mobile platformer', objects: [], rules: [], layout: { placements: [] } },
    diff: { isNew: true },
    intentDslText: intentDslText,
    intentGraph: compiled.graph,
    placementPlan: compiled.placementPlan,
    bridgePlan: compiled.bridgePlan,
    intentContracts: compiled.contracts,
    compileResultCard: compiled.resultCard,
    internalDslText: compiled.bridgePlan.dslText,
    executionReport: missingReport,
    projectWorld: missingWorld,
  });
  pipelineState.validatePipelineState(missingState);
  assert.strictEqual(missingState.runtime.summary.nextAction, 'route-to-owner', 'missing fulfillment should not be treated as done');
  assert.strictEqual(missingState.ownerRoute.owner, 'runtime-validator', 'missing fulfillment should route to runtime validator owner');

  assert(pipelineState.assertAllowedNodeAccess('llm2-intent', {
    reads: ['llm2.nodeInput'],
    writes: ['llm2.intentDslText', 'llm2.intentDslLineCount'],
  }), 'LLM2 node should be allowed to read only its sanitized node input');
  [
    'userRequest.text',
    'requirement.designBrief',
    'requirement.diff',
    'projectWorld.world',
    'bridge.bridgePlan',
    'bridge.internalDslText',
    'runtime.executionReport',
  ].forEach(function(pathName) {
    assert.throws(function() {
      pipelineState.assertAllowedNodeAccess('llm2-intent', { reads: [pathName] });
    }, /may not read/, 'LLM2 node must not read raw PipelineState path ' + pathName);
  });
  assert.throws(function() {
    pipelineState.assertAllowedNodeAccess('llm2-intent', { writes: ['bridge.bridgePlan'] });
  }, /may not write/, 'LLM2 node must not write bridge state');
  var mutatedContractsState = JSON.parse(JSON.stringify(state));
  mutatedContractsState.nodeContracts['llm2-intent'].reads.push('projectWorld.world');
  assert.throws(function() {
    pipelineState.validatePipelineState(mutatedContractsState);
  }, /llm2-intent\.reads/, 'PipelineState validation should reject drifted node contracts');
  var llm2View = pipelineState.makeNodeStateView(state, 'llm2-intent');
  assert.deepStrictEqual(llm2View.reads, ['llm2.nodeInput'], 'LLM2 node view should only declare sanitized input reads');
  assert(llm2View.state.llm2 && llm2View.state.llm2.nodeInput, 'LLM2 node view should include nodeInput');
  assert(!llm2View.state.requirement, 'LLM2 node view must not include raw requirement');
  assert(!llm2View.state.projectWorld, 'LLM2 node view must not include raw ProjectWorld');
  assert(!llm2View.state.bridge, 'LLM2 node view must not include bridge state');
  assert(!llm2View.state.runtime, 'LLM2 node view must not include runtime state');
  var llm2ViewJson = JSON.stringify(llm2View);
  [
    'componentId',
    'input.jump_button',
    'bridgePlan',
    'runtimeAdapterRequirements',
    'set placement object=',
    '"x"',
    '"y"',
  ].forEach(function(token) {
    assert(llm2ViewJson.indexOf(token) < 0, 'LLM2 node view must not expose ' + token);
  });
  var patchedByLlm2 = pipelineState.applyNodeStatePatch(state, 'llm2-intent', {
    'llm2.intentDslText': 'adjust Fox placement above slightly',
    'llm2.intentDslLineCount': 1,
  });
  assert.strictEqual(patchedByLlm2.llm2.intentDslText, 'adjust Fox placement above slightly', 'LLM2 node patch should update allowed Intent DSL field');
  assert.strictEqual(patchedByLlm2.llm2.intentDslLineCount, 1, 'LLM2 node patch should update allowed line count');
  assert.notStrictEqual(patchedByLlm2.llm2.intentDslText, state.llm2.intentDslText, 'node patch should return a new updated state');
  assert.throws(function() {
    pipelineState.applyNodeStatePatch(state, 'llm2-intent', {
      'bridge.bridgePlan': { target: 'gdjs-internal-dsl' },
    });
  }, /may not write/, 'LLM2 node patch must not write bridge state');
  assert.throws(function() {
    pipelineState.applyNodeStatePatch(state, 'llm2-intent', {
      'requirement.designBrief': { theme: 'rewired' },
    });
  }, /may not write/, 'LLM2 node patch must not write raw requirement state');
  assert.throws(function() {
    pipelineState.applyNodeStatePatch(state, 'llm2-intent', null);
  }, /node patch must be an object/, 'node patch must be path-object shaped');

  var batchProject = pipeline.emptyProject('PipelineStateRuntimeCheck');
  var batch = await pipeline.executeDslBatch(batchProject, compiled.bridgePlan.dslText, 'pipeline_state_runtime_check', {
    projectMode: 'fixture-new',
    userRequest: 'make a mobile platformer',
    designBrief: { theme: 'mobile platformer', objects: [], rules: [], layout: { placements: [] } },
    diff: { isNew: true },
    modules: compiled.bridgePlan.installedModules,
    runtimeAdapterRequirements: compiled.bridgePlan.runtimeAdapterRequirements,
    intent: intentArtifacts,
    allowEmpty: true,
  });
  assert(batch.pipelineState, 'runtime execution should return PipelineState');
  assert.deepStrictEqual(
    batch.pipelineState.graphTrace.map(function(item) { return item.node; }),
    intentPipelineGraph.INTENT_PIPELINE_NODE_SEQUENCE,
    'runtime PipelineState should be assembled through canonical Intent graph order'
  );
  assert.strictEqual(batch.pipelineState.runtime.summary.nextAction, 'done', 'runtime PipelineState should include execution summary');
  assert.strictEqual(batch.pipelineState.runtime.summary.intentFulfillment.status, 'fulfilled', 'runtime PipelineState should include fulfillment summary');
  assert.strictEqual(batch.pipelineState.projectWorld.world.semanticHash, batch.world.semanticHash, 'runtime PipelineState should include final ProjectWorld');
  assert.strictEqual(batch.pipelineState.bridge.internalDslLineCount, compiled.bridgePlan.dslLines.length, 'runtime PipelineState should include bridge target line count');
  var runtimeSafeJson = JSON.stringify(batch.pipelineState.llm2.sanitizedWorldContext);
  assert(runtimeSafeJson.indexOf('bridgePlan') < 0, 'runtime PipelineState LLM2 projection must not leak bridgePlan');
  assert(runtimeSafeJson.indexOf('componentId') < 0, 'runtime PipelineState LLM2 projection must not leak component ids');
  var statePath = path.join(__dirname, '..', 'output', 'pipeline-state.json');
  assert(fs.existsSync(statePath), 'runtime execution should persist output/pipeline-state.json');
  var persisted = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  pipelineState.validatePipelineState(persisted);
  assert.strictEqual(persisted.batchLabel, 'pipeline_state_runtime_check', 'persisted PipelineState should be latest execution state');
  assert.deepStrictEqual(
    persisted.graphTrace.map(function(item) { return item.node; }),
    intentPipelineGraph.INTENT_PIPELINE_NODE_SEQUENCE,
    'persisted PipelineState should retain canonical graph trace'
  );
  assert(persisted.nodeContracts && persisted.nodeContracts['llm2-intent'], 'persisted PipelineState should carry node contracts');
  assert.deepStrictEqual(
    persisted.nodeContracts['llm2-intent'].prohibitedReads,
    pipelineState.getNodeContract('llm2-intent').prohibitedReads,
    'persisted PipelineState node contracts should match code contract'
  );
  var persistedLlm2View = pipelineState.makeNodeStateView(persisted, 'llm2-intent');
  assert(persistedLlm2View.state.llm2.nodeInput, 'persisted PipelineState should produce an LLM2 node view');
  assert(!persistedLlm2View.state.projectWorld, 'persisted LLM2 node view must not include raw ProjectWorld');
  var persistedPatched = pipelineState.applyNodeStatePatch(persisted, 'llm2-intent', {
    'llm2.intentDslText': persisted.llm2.intentDslText,
    'llm2.intentDslLineCount': persisted.llm2.intentDslLineCount,
  });
  assert.strictEqual(persistedPatched.llm2.intentDslLineCount, persisted.llm2.intentDslLineCount, 'persisted PipelineState should accept legal LLM2 patch paths');

  console.log('[PipelineState] graph-ready Intent pipeline state contract passed');
}

main().catch(function(error) {
  console.error(error);
  process.exit(1);
});
