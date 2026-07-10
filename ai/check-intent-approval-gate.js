var assert = require('assert');
var fs = require('fs');
var path = require('path');

var intentCompiler = require('./intent-compiler');
var intentPipelineGraph = require('./intent-pipeline-graph');
var diagnosticRouter = require('./intent-diagnostic-router');
var pipeline = require('./pipeline');

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

  var packet = await pipeline.makePendingApprovalPacket({
    prompt: 'make a mobile platformer',
    projectMode: 'fixture-new',
    batchLabel: 'intent_approval_check',
    isNewProject: true,
    requiresIntentIterationState: false,
    artifactKind: 'intent',
    project: pipeline.emptyProject('IntentApprovalCheck'),
    baseWorld: null,
    intentDslText: intentDslText,
    intentGraph: compiled.graph,
    placementPlan: compiled.placementPlan,
    bridgePlan: compiled.bridgePlan,
    intentContracts: compiled.contracts,
    compileResultCard: compiled.resultCard,
    dslText: compiled.bridgePlan.dslText,
    modules: compiled.bridgePlan.installedModules,
    tickRuntimeManifest: compiled.bridgePlan.tickRuntimeManifest,
    runtimeAdapterRequirements: compiled.bridgePlan.runtimeAdapterRequirements,
    designBrief: {
      theme: 'mobile platformer',
      objects: [],
      rules: [],
      layout: { placements: [] },
      difficulty: 'easy',
      controls: 'joystick and buttons'
    },
    diff: { isNew: true }
  });

  assert.strictEqual(packet.artifactKind, 'intent', 'approval packet should record Intent artifact kind');
  assert.strictEqual(packet.requiresIntentIterationState, false, 'approval packet should record Intent iteration-state requirement');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(packet, 'requiresExistingProject'), false, 'approval packet must not emit removed project-only requirement field');
  assert(packet.intentDslText.indexOf('make a mobile platformer') >= 0, 'approval packet should include Intent DSL');
  assert(packet.intentGraph && packet.intentGraph.components.length >= 4, 'approval packet should include typed Intent Graph');
  assert(packet.placementPlan && packet.placementPlan.placements.length >= 4, 'approval packet should include Placement Plan');
  assert(packet.bridgePlan && packet.bridgePlan.dslLines.length > 0, 'approval packet should include Bridge Plan');
  assert(packet.intentContracts && packet.intentContracts.intentCompile === 'passed', 'approval packet should include aggregate Intent contract summary');
  assert(packet.compileResultCard && packet.compileResultCard.ownerTrace.length >= 4, 'approval packet should include Compile ResultCard');
  assert(packet.dslLines.length === packet.bridgePlan.dslLines.length, 'approval packet should include compiled internal DSL lines');
  assert(packet.runtimeAdapterRequirements.length >= 5, 'approval packet should include runtime adapter requirements');
  assert(packet.preview && packet.preview.nextAction === 'done', 'approval packet should include dry-run preview');
  assert(packet.preview.commandResults.length === packet.dslLines.length, 'dry-run preview should include command result for every internal DSL line');
  assert(packet.preview.commandResults.every(function(result, index) {
    return result.commandId === 'intent_approval_check_preview_line_' + String(index + 1).padStart(3, '0');
  }), 'dry-run preview command results should have stable command ids');
  assert(packet.preview.commandResults.some(function(result) {
    return result.command === 'create scene name=Game first=true';
  }), 'dry-run preview should retain original internal target DSL command lines');
  assert(packet.pipelineState && packet.pipelineState.stateKind === 'gamecastle-ai-first-intent-pipeline', 'approval packet should include graph-ready PipelineState');
  assert.deepStrictEqual(
    packet.pipelineState.graphTrace.map(function(item) { return item.node; }),
    intentPipelineGraph.INTENT_PIPELINE_NODE_SEQUENCE,
    'approval PipelineState should be assembled through canonical Intent graph order'
  );
  assert(packet.pipelineState.llm2.nodeInput, 'PipelineState should include LLM2 node input projection');
  assert(packet.pipelineState.llm2.sanitizedWorldContext.projectWorld, 'PipelineState should include LLM2-safe world context');
  assert(packet.pipelineState.bridge.summary.internalDslLines === packet.dslLines.length, 'PipelineState should summarize bridge target lines');
  assert(packet.aiVisibleForLlm2, 'approval packet should include explicit LLM2-safe projection');
  assert.strictEqual(packet.aiVisibleForLlm2.surface, 'llm2-intent', 'approval AI projection should name the Intent surface');
  assert(packet.aiVisibleForLlm2.nodeInput, 'approval AI projection should reuse PipelineState LLM2 node input');
  assert.strictEqual(
    packet.aiVisibleForLlm2.review.executionPreview.nextAction,
    'done',
    'approval AI projection should include safe runtime preview status'
  );
  var safeStateJson = JSON.stringify(packet.pipelineState.llm2.nodeInput);
  assert(safeStateJson.indexOf('bridgePlan') < 0, 'PipelineState LLM2 context must not leak bridgePlan');
  assert(safeStateJson.indexOf('runtimeAdapterRequirements') < 0, 'PipelineState LLM2 context must not leak runtime adapter requirements');
  assert(safeStateJson.indexOf('componentId') < 0, 'PipelineState LLM2 context must not leak component ids');
  var approvalAiJson = JSON.stringify(packet.aiVisibleForLlm2);
  [
    'bridgePlan',
    'runtimeAdapterRequirements',
    'componentId',
    'input.jump_button',
    'gdjs',
    'PrimitiveDrawing',
    'create scene',
    'create object',
    'set placement object=',
    '"x"',
    '"y"',
    'dslLines',
    'internalDsl',
    'failedCommands',
    'failedDiagnostics',
    'commandId',
    'runtimePreview',
  ].forEach(function(token) {
    assert(approvalAiJson.indexOf(token) < 0, 'approval AI projection must not expose ' + token);
  });
  assert(approvalAiJson.indexOf('make a mobile platformer') >= 0, 'approval AI projection should preserve safe request');
  assert(approvalAiJson.indexOf('bottom-left') >= 0, 'approval AI projection should preserve natural placement');

  assert(packet.summary.intentDslLineCount >= 5, 'summary should count Intent DSL lines');
  assert(packet.summary.intentGraph.components >= 4, 'summary should count Intent Graph components');
  assert(packet.summary.placementPlan.placements >= 4, 'summary should count placement decisions');
  assert(packet.summary.bridgePlan.internalDslLines === packet.dslLines.length, 'summary should count bridge DSL lines');
  assert(packet.summary.intentContracts && packet.summary.intentContracts.intentCompile === 'passed', 'summary should expose aggregate Intent contract status');
  assert(packet.summary.compileResultCard.ownerTrace.some(function(item) {
    return item.stage === 'Emit Internal DSL' && item.owner === 'gdjs-bridge';
  }), 'summary should expose ResultCard owner trace');

  var failedPreview = await pipeline.previewApprovalArtifact(
    pipeline.emptyProject('IntentApprovalFailedPreviewCheck'),
    [
      'create scene name=Game first=true',
      'on start -> unsupported_action Player scene=Game',
    ].join('\n'),
    { batchLabel: 'intent_failed_preview_check' }
  );
  assert.strictEqual(failedPreview.nextAction, 'route-to-owner', 'failed approval preview should route to owner');
  assert.strictEqual(failedPreview.failedCommands.length, 1, 'failed preview should retain failed command evidence');
  assert.strictEqual(failedPreview.failedCommands[0].commandId, 'intent_failed_preview_check_preview_line_002', 'failed preview should keep stable command id');
  assert.strictEqual(failedPreview.failedCommands[0].command, 'on start -> unsupported_action Player scene=Game', 'failed preview should keep original target DSL line');
  assert.strictEqual(failedPreview.failedDiagnostics.length, 1, 'failed preview should include routed runtime diagnostic');
  diagnosticRouter.assertRoutedDiagnostic(failedPreview.failedDiagnostics[0]);
  assert.strictEqual(failedPreview.failedDiagnostics[0].routeId, 'internal-target-execution', 'failed preview diagnostic should use runtime execution route');
  assert.strictEqual(failedPreview.failedDiagnostics[0].owner, 'runtime-executor', 'failed preview diagnostic should route to runtime executor');
  assert.strictEqual(failedPreview.failedDiagnostics[0].commandId, 'intent_failed_preview_check_preview_line_002', 'failed preview diagnostic should retain command id');

  await assert.rejects(
    function() {
      return pipeline.makePendingApprovalPacket({
        prompt: 'legacy patch kind approval',
        projectMode: 'fixture-new',
        batchLabel: 'legacy_patch_kind_approval',
        isNewProject: true,
        requiresIntentIterationState: false,
        patchKind: 'intent',
        project: pipeline.emptyProject('LegacyPatchKindApprovalCheck'),
        dslText: compiled.bridgePlan.dslText,
      });
    },
    /no longer accepts patchKind/,
    'approval packet factory must reject stale patchKind input'
  );

  await assert.rejects(
    function() {
      return pipeline.makePendingApprovalPacket({
        prompt: 'legacy project-only approval requirement',
        projectMode: 'fixture-new',
        batchLabel: 'legacy_project_requirement_approval',
        isNewProject: true,
        requiresExistingProject: false,
        artifactKind: 'intent',
        project: pipeline.emptyProject('LegacyProjectRequirementApprovalCheck'),
        intentDslText: intentDslText,
        intentGraph: compiled.graph,
        placementPlan: compiled.placementPlan,
        bridgePlan: compiled.bridgePlan,
        dslText: compiled.bridgePlan.dslText,
      });
    },
    /no longer accepts requiresExistingProject/,
    'approval packet factory must reject removed project-only requirement field'
  );

  await assert.rejects(
    function() {
      return pipeline.makePendingApprovalPacket({
        prompt: 'legacy internal approval',
        projectMode: 'internal-reject',
        batchLabel: 'legacy_internal_approval',
        isNewProject: true,
        requiresIntentIterationState: false,
        artifactKind: 'internal',
        project: pipeline.emptyProject('InternalApprovalCheck'),
        dslText: 'create scene name=Game first=true',
      });
    },
    /only accepts compiled Intent artifacts/,
    'approval packet factory must reject internal low-level DSL approval'
  );

  console.log('[IntentApprovalGate] pending approval packet includes Intent proof objects');
}

main().catch(function(error) {
  console.error(error);
  process.exit(1);
});
