var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');

var intentCompiler = require('./intent-compiler');
var intentSlots = require('./intent-slots');
var pipeline = require('./pipeline');
var pipelineState = require('./pipeline-state');
var intentPipelineGraph = require('./intent-pipeline-graph');
var projectWorld = require('./project-world');

async function executeBridgeIntoProject(compiled) {
  var project = pipeline.emptyProject('PipelineStateCheck');
  var ops = pipeline.parseTargetPlan(compiled.bridgePlan.targetPlanText);
  for (var i = 0; i < ops.length; i++) {
    var result = await pipeline.execute(project, ops[i]);
    assert(result.ok, 'bridge target line should execute: ' + compiled.bridgePlan.targetPlanLines[i] + ' -> ' + result.msg);
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

function sampleUpdateValue(pathName, state) {
  if (pathName === 'intentGraph.graph') return state.intentGraph.graph;
  if (pathName === 'intentGraph.summary') return state.intentGraph.summary;
  if (pathName === 'compiler.contracts') return state.compiler.contracts;
  if (pathName === 'compiler.intentDslText') return state.compiler.intentDslText;
  if (pathName === 'compiler.intentDslLineCount') return state.compiler.intentDslLineCount;
  if (pathName === 'compiler.resultCard') return state.compiler.resultCard;
  if (pathName === 'compiler.resultCardSummary') return state.compiler.resultCardSummary;
  if (pathName === 'resolver.placementPlan') return state.resolver.placementPlan;
  if (pathName === 'resolver.summary') return state.resolver.summary;
  if (pathName === 'bridge.bridgePlan') return state.bridge.bridgePlan;
  if (pathName === 'bridge.summary') return state.bridge.summary;
  if (pathName === 'bridge.targetPlanText') return state.bridge.targetPlanText;
  if (pathName === 'bridge.targetPlanLineCount') return state.bridge.targetPlanLineCount;
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

  var legalUpdate = {};
  (contract.writes || []).forEach(function(pathName) {
    legalUpdate[pathName] = sampleUpdateValue(pathName, state);
  });
  if (Object.keys(legalUpdate).length) {
    var updated = pipelineState.applyNodeStateUpdate(state, nodeName, legalUpdate);
    pipelineState.validatePipelineState(updated);
  }
  assert.throws(function() {
    pipelineState.applyNodeStateUpdate(state, nodeName, { 'llm2.nodeInput': {} });
  }, /may not write/, nodeName + ' must not write LLM2 input projection');
}

function testGeneratedFileUnlinkIsIdempotent() {
  var tempPath = path.join(__dirname, '..', 'output', 'safe-unlink-idempotent.tmp');
  fs.mkdirSync(path.dirname(tempPath), { recursive: true });
  fs.writeFileSync(tempPath, 'temporary generated output');
  assert.strictEqual(pipeline.safeUnlinkGeneratedFile(tempPath, 'test generated unlink'), true, 'first generated unlink should remove existing file');
  assert.strictEqual(pipeline.safeUnlinkGeneratedFile(tempPath, 'test generated unlink'), false, 'second generated unlink should ignore already-missing file');
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function testContinueRequiresIntentIterationState() {
  var tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-intent-state-'));
  try {
    var missing = pipeline.loadExistingIntentIterationState(tempDir);
    assert.strictEqual(missing.ok, false, 'missing iteration state should not be accepted');
    assert(missing.errors.some(function(error) {
      return error.indexOf('engine project file') >= 0;
    }), 'missing state should report project file');

    writeJson(path.join(tempDir, 'project.json'), pipeline.emptyProject('StandaloneProject'));
    var projectOnly = pipeline.loadExistingIntentIterationState(tempDir);
    assert.strictEqual(projectOnly.ok, false, 'standalone project.json must not be enough to continue');
    assert(projectOnly.errors.some(function(error) {
      return error.indexOf('ProjectWorld') >= 0;
    }), 'project-only state should report missing ProjectWorld');
    assert(projectOnly.errors.some(function(error) {
      return error.indexOf('ExecutionLedger') >= 0;
    }), 'project-only state should report missing ExecutionLedger');

    writeJson(projectWorld.getWorldPath(tempDir), {
      schemaVersion: 1,
      worldVersion: 1,
      semanticHash: 'test-world',
      scenes: [],
      modules: [],
    });
    writeJson(projectWorld.getLedgerPath(tempDir), {
      schemaVersion: 1,
      runs: [],
    });
    var emptyLedger = pipeline.loadExistingIntentIterationState(tempDir);
    assert.strictEqual(emptyLedger.ok, false, 'empty ExecutionLedger must not be accepted as an iteration base');

    writeJson(projectWorld.getLedgerPath(tempDir), {
      schemaVersion: 1,
      runs: [
        {
          runIndex: 1,
          batchLabel: 'seed',
          summary: { nextAction: 'done' },
        },
      ],
    });
    fs.writeFileSync(path.join(tempDir, 'creative-vision.txt'), 'A complete creative vision for the current game.', 'utf8');
    var complete = pipeline.loadExistingIntentIterationState(tempDir);
    assert.strictEqual(complete.ok, true, 'complete Intent iteration state should be accepted');
    assert(complete.project, 'complete state should include the engine project output');
    assert(complete.world, 'complete state should include ProjectWorld');
    assert.strictEqual(complete.ledger.runs.length, 1, 'complete state should include a non-empty ExecutionLedger');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function main() {
  testGeneratedFileUnlinkIsIdempotent();
  testContinueRequiresIntentIterationState();

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
  var intentSlotPacket = intentSlots.parseSlotPacket(JSON.stringify({ schemaVersion: 1, commands: [
    { kind: 'make_game', slots: { description: 'mobile platformer' } },
    { kind: 'add_control', slots: { control: 'joystick', target: 'Player', anchor: 'screen', direction: 'bottom-left' } },
    { kind: 'add_control', slots: { control: 'jump button', target: 'Player', anchor: 'screen', direction: 'bottom-right' } },
    { kind: 'add_control', slots: { control: 'attack button', target: 'Player', anchor: 'jump button', direction: 'left' } },
    { kind: 'add_inventory', slots: { owner: 'Player', slots: 24, anchor: 'screen', direction: 'right' } },
    { kind: 'place_group', slots: { subject: 'coins', anchor: 'Player', direction: 'front', pattern: 'trail', count: 3 } },
  ] }));
  var intentArtifacts = {
    artifactKind: 'intent',
    intentSlotPacket: intentSlotPacket,
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
    mode: 'intentFixtureNew',
    batchLabel: 'pipeline_state_check',
    artifactKind: 'intent',
    userRequest: [
      'make a mobile platformer',
      'move Player up 10 pixels',
      'set placement object=Player x=100 y=400 scene=Game',
    ].join('\n'),
    creativeVision: 'A mobile platformer where each jump changes the weather and coins ring like bells.',
    creativeChange: { isNew: true, changed: true, previousVision: null, currentVision: 'A mobile platformer where each jump changes the weather and coins ring like bells.' },
    intentSlotPacket: intentSlotPacket,
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
    { targetPlanLines: ['create scene name=Game first=true'] },
    { commandResults: [] },
  ].forEach(function(value) {
    assert.throws(function() {
      pipelineState.assertNoProhibitedAiVisibleSurface(value, 'structural-leak-check');
    }, /structured-key|machine form/, 'AI-visible structural guard must reject machine key ' + Object.keys(value)[0]);
  });

  assert.strictEqual(state.stateKind, 'gamecastle-ai-first-intent-pipeline', 'state kind should identify the graph-ready contract');
  assert.strictEqual(state.artifactKind, 'intent', 'state should preserve artifact kind');
  assert.throws(function() {
    pipelineState.createPipelineState({
      mode: 'intentFixtureNew',
      batchLabel: 'pipeline_state_internal_reject',
      artifactKind: 'internal',
      userRequest: 'create scene name=Game first=true',
      targetPlanText: 'create scene name=Game first=true',
    });
  }, /only accepts AI-first Intent state/, 'PipelineState must reject internal target artifact state');
  assert.throws(function() {
    pipelineState.createPipelineState({
      mode: 'intentFixtureNew',
      batchLabel: 'pipeline_state_missing_patch_kind',
      userRequest: 'make a game',
    });
  }, /only accepts AI-first Intent state/, 'PipelineState must reject untyped artifact state');
  assert(state.statePartitions, 'PipelineState should expose auditable state partitions');
  assert.strictEqual(state.statePartitions.creative.artifact, 'CreativeVision', 'state partitions should separate unrestricted LLM1 vision');
  assert.strictEqual(state.statePartitions.llm2Intent.artifact, 'Intent Slot Packet', 'state partitions should separate LLM2 slot output');
  assert.strictEqual(state.statePartitions.intentGraph.artifact, 'Intent Graph', 'state partitions should separate typed Intent Graph');
  assert.strictEqual(state.statePartitions.resolver.artifact, 'Placement Plan', 'state partitions should separate Resolver placement plan');
  assert.strictEqual(state.statePartitions.compilerModuleFacts.artifact, 'compiler-owned module facts', 'state partitions should separate compiler-owned module facts');
  assert.strictEqual(state.statePartitions.runtimeExecutionPlan.artifact, 'runtime execution plan', 'state partitions should separate runtime execution plan');
  assert.strictEqual(state.statePartitions.projectWorld.artifact, 'semantic world snapshot', 'state partitions should separate ProjectWorld from engine output');
  assert.strictEqual(state.statePartitions.engineProjectFile.artifact, 'engine project file', 'state partitions should name the engine project file as output-only');
  assert.strictEqual(state.statePartitions.engineProjectFile.evidence.storedInPipelineState, false, 'PipelineState must not store raw engine project file');
  assert.strictEqual(state.statePartitions.llm2Intent.aiVisibleToLlm2, true, 'only LLM2 Intent partition should be AI-visible');
  Object.keys(state.statePartitions).forEach(function(partitionName) {
    if (partitionName !== 'llm2Intent') {
      assert.strictEqual(state.statePartitions[partitionName].aiVisibleToLlm2, false, partitionName + ' partition should not be AI-visible to LLM2');
    }
  });
  assert(state.statePartitions.compilerModuleFacts.evidence.installedModules >= 1, 'module facts partition should count installed compiler-owned modules');
  assert.strictEqual(state.statePartitions.llm2Intent.evidence.intentSlotCommandCount, state.llm2.intentSlotPacket.commands.length, 'slot partition evidence should match the packet');
  assert(state.statePartitions.runtimeExecutionPlan.evidence.targetPlanLineCount === compiled.bridgePlan.targetPlanLines.length, 'runtime plan partition should count internal target lines');
  assert(state.statePartitions.projectWorld.evidence.semanticHash === world.semanticHash, 'ProjectWorld partition should carry semantic world hash evidence');
  assert(state.nodeContracts && state.nodeContracts['llm2-intent'], 'PipelineState should carry node contracts for future graph execution');
  assert.deepStrictEqual(
    state.nodeContracts['llm2-intent'].reads,
    pipelineState.getNodeContract('llm2-intent').reads,
    'PipelineState llm2 contract should match code contract'
  );
  assert(state.intentGraph.summary.components >= 4, 'state should summarize Intent Graph');
  assert(state.resolver.summary.placements >= 4, 'state should summarize placement plan');
  assert(state.bridge.summary.targetPlanLines === compiled.bridgePlan.targetPlanLines.length, 'state should summarize bridge target code');
  assert(state.compiler.contracts.intentCompile === 'passed', 'state should carry aggregate compile contract');
  assert(state.runtime.summary.nextAction === 'done', 'state should carry execution summary');
  assert(state.runtime.summary.intentFulfillment.status === 'fulfilled', 'state should carry safe Intent fulfillment summary');
  assert(state.bridge.bridgePlan.runtimeAdapterRequirements.length >= 5, 'internal state may retain runtime adapter requirements');
  assert(state.creative.vision.indexOf('changes the weather') >= 0, 'internal state should retain the unrestricted creative vision for audit');
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
    targetPlanLines: compiled.bridgePlan.targetPlanLines,
    commandResults: compiled.bridgePlan.targetPlanLines.map(function(line, index) {
      return { index: index, commandId: 'missing_world_' + index, ok: true, label: line, message: 'executed in fixture' };
    }),
    runIndex: 2,
    batchLabel: 'pipeline_state_missing_fulfillment_check',
    intent: intentArtifacts,
  });
  var missingState = pipelineState.createPipelineState({
    mode: 'intentFixtureNew',
    batchLabel: 'pipeline_state_missing_fulfillment_check',
    artifactKind: 'intent',
    userRequest: 'make a mobile platformer',
    creativeVision: 'A mobile platformer with a readable route.',
    creativeChange: { isNew: true, changed: true, previousVision: null, currentVision: 'A mobile platformer with a readable route.' },
    intentSlotPacket: intentSlotPacket,
    intentDslText: intentDslText,
    intentGraph: compiled.graph,
    placementPlan: compiled.placementPlan,
    bridgePlan: compiled.bridgePlan,
    intentContracts: compiled.contracts,
    compileResultCard: compiled.resultCard,
    targetPlanText: compiled.bridgePlan.targetPlanText,
    executionReport: missingReport,
    projectWorld: missingWorld,
  });
  pipelineState.validatePipelineState(missingState);
  assert.strictEqual(missingState.runtime.summary.nextAction, 'route-to-owner', 'missing fulfillment should not be treated as done');
  assert.strictEqual(missingState.ownerRoute.owner, 'runtime-validator', 'missing fulfillment should route to runtime validator owner');

  assert(pipelineState.assertAllowedNodeAccess('llm2-intent', {
    reads: ['llm2.nodeInput'],
    writes: ['llm2.intentSlotPacket', 'llm2.intentSlotCommandCount'],
  }), 'LLM2 node should be allowed to write only its slot contract');
  [
    'userRequest.text',
    'creative.vision',
    'creative.change',
    'projectWorld.world',
    'bridge.bridgePlan',
    'bridge.targetPlanText',
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
  assert(!llm2View.state.creative, 'LLM2 node view must expose creative content only through its sanitized node input');
  assert(!llm2View.state.statePartitions, 'LLM2 node view must not include internal state partition audit map');
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
  var updatedByLlm2 = pipelineState.applyNodeStateUpdate(state, 'llm2-intent', {
    'llm2.intentSlotPacket': state.llm2.intentSlotPacket,
    'llm2.intentSlotCommandCount': state.llm2.intentSlotCommandCount,
  });
  assert.deepStrictEqual(updatedByLlm2.llm2.intentSlotPacket, state.llm2.intentSlotPacket, 'LLM2 node update should preserve the slot packet contract');
  assert.throws(function() {
    pipelineState.applyNodeStateUpdate(state, 'llm2-intent', {
      'bridge.bridgePlan': { target: 'gdjs-target-plan' },
    });
  }, /may not write/, 'LLM2 node update must not write bridge state');
  assert.throws(function() {
    pipelineState.applyNodeStateUpdate(state, 'llm2-intent', {
      'creative.vision': 'rewired',
    });
  }, /may not write/, 'LLM2 node update must not write raw requirement state');
  assert.throws(function() {
    pipelineState.applyNodeStateUpdate(state, 'llm2-intent', null);
  }, /node update must be an object/, 'node update must be path-object shaped');

  var batchProject = pipeline.emptyProject('PipelineStateRuntimeCheck');
  var batch = await pipeline.executeTargetPlanBatch(batchProject, compiled.bridgePlan.targetPlanText, 'pipeline_state_runtime_check', {
    projectMode: 'intentFixtureNew',
    userRequest: 'make a mobile platformer',
    creativeVision: 'A mobile platformer with expressive weather.',
    creativeChange: { isNew: true, changed: true, previousVision: null, currentVision: 'A mobile platformer with expressive weather.' },
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
  assert(batch.report.completed.some(function(result) {
    return result.command === 'create scene name=Game first=true';
  }), 'runtime ExecutionReport should retain the original internal target command line');
  assert(batch.report.completed.every(function(result) {
    return result.command && result.command.indexOf(' ') >= 0;
  }), 'runtime ExecutionReport should not collapse command evidence to verb labels');
  assert.strictEqual(batch.pipelineState.projectWorld.world.semanticHash, batch.world.semanticHash, 'runtime PipelineState should include final ProjectWorld');
  assert.strictEqual(batch.pipelineState.bridge.targetPlanLineCount, compiled.bridgePlan.targetPlanLines.length, 'runtime PipelineState should include bridge target line count');
  var runtimeSafeJson = JSON.stringify(batch.pipelineState.llm2.sanitizedWorldContext);
  assert.strictEqual(
    batch.pipelineState.llm2.sanitizedWorldContext.semanticMapping.view,
    'llm-safe-semantic-mapping',
    'runtime PipelineState LLM2 projection should include shared semantic mapping view'
  );
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
  var persistedUpdated = pipelineState.applyNodeStateUpdate(persisted, 'llm2-intent', {
    'llm2.intentSlotPacket': persisted.llm2.intentSlotPacket,
    'llm2.intentSlotCommandCount': persisted.llm2.intentSlotCommandCount,
  });
  assert.strictEqual(persistedUpdated.llm2.intentSlotCommandCount, persisted.llm2.intentSlotCommandCount, 'persisted PipelineState should accept legal LLM2 slot update paths');

  console.log('[PipelineState] graph-ready Intent pipeline state contract passed');
}

main().catch(function(error) {
  console.error(error);
  process.exit(1);
});
