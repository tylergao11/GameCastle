var assert = require('assert');
var fs = require('fs');
var path = require('path');

var intentCompiler = require('./intent-compiler');
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
    requiresExistingProject: false,
    patchKind: 'intent',
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
    networkManifest: compiled.bridgePlan.networkManifest,
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

  assert.strictEqual(packet.patchKind, 'intent', 'approval packet should record intent patch kind');
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

  assert(packet.summary.intentDslLineCount >= 5, 'summary should count Intent DSL lines');
  assert(packet.summary.intentGraph.components >= 4, 'summary should count Intent Graph components');
  assert(packet.summary.placementPlan.placements >= 4, 'summary should count placement decisions');
  assert(packet.summary.bridgePlan.internalDslLines === packet.dslLines.length, 'summary should count bridge DSL lines');
  assert(packet.summary.intentContracts && packet.summary.intentContracts.intentCompile === 'passed', 'summary should expose aggregate Intent contract status');
  assert(packet.summary.compileResultCard.ownerTrace.some(function(item) {
    return item.stage === 'Emit Internal DSL' && item.owner === 'gdjs-bridge';
  }), 'summary should expose ResultCard owner trace');

  console.log('[IntentApprovalGate] pending approval packet includes Intent proof objects');
}

main().catch(function(error) {
  console.error(error);
  process.exit(1);
});
