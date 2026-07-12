var assert = require('assert').strict;
var fs = require('fs');
var os = require('os');
var path = require('path');
var runtime = require('./project-weave-runtime');

var CASES = [
  ['runner-platformer', 'core.platformer'],
  ['top-down-collector', 'core.top_down_collector'],
  ['lightweight-shooter', 'core.shooter'],
  ['interaction-puzzle', 'core.interaction_puzzle'],
  ['idle-clicker', 'core.idle_clicker']
];
function plannerFor(moduleId) {
  return { plan: function(graph) {
    var retain = graph.mode === 'continue';
    var ref = { moduleId: moduleId, revision: 'local-v1', manifestHash: 'fixture' };
    return { debt: null, plan: { schemaVersion: 1, planId: graph.requirementGraphId + ':matrix', mode: graph.mode, requirementGraphId: graph.requirementGraphId, catalogFingerprint: 'fixture', baseGuard: {}, coverage: { requiredSemanticRefs: [], satisfiedSemanticRefs: [], missingSemanticRefs: [], conflictingSemanticRefs: [] }, slotBindings: [], spatialRequirements: [], debt: null, determinism: { outputHash: graph.requirementGraphId + ':' + moduleId }, operations: [{ operationId: (retain ? 'retain.' : 'install.') + moduleId, op: retain ? 'retain' : 'install', atomicGroupId: graph.mode + '.' + moduleId, reasonRequirementRefs: [], parameters: {}, toModule: retain ? undefined : ref, fromModule: retain ? ref : undefined, expectedOwnershipHash: retain ? 'fixture-owned' : undefined }] } };
  } };
}
async function main() {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-continue-matrix-'));
  try {
    for (var i = 0; i < CASES.length; i++) {
      var archetype = CASES[i][0], moduleId = CASES[i][1], planner = plannerFor(moduleId);
      var created = await runtime.create({ projectId: archetype, requestId: archetype + '-create', naturalIntent: 'make a game', intentDslText: 'make a mobile platformer' }, { workspaceRoot: root, services: { productModulePlanner: planner } });
      assert(created.project.layouts.length > 0, archetype + ' create must produce a runtime scene');
      assert(created.artifacts.projectWorld.modules.some(function(module) { return module.id === moduleId; }), archetype + ' create must persist module ownership');
      assert.equal(created.artifacts.playtestReport.owner, 'SemanticPlaytestAgent', archetype + ' create must execute semantic playtest');
      assert(created.artifacts.playtestReport.tickReport.eventLog.length >= 3, archetype + ' playtest must produce a meaningful tick trace');
      assert.equal(created.artifacts.playtestReport.tickReport.snapshots.length, 3, archetype + ' playtest must retain start/mid/end snapshots');
      var continued = await runtime.continue({ projectId: archetype, requestId: archetype + '-continue', naturalIntent: 'continue game', intentDslText: 'make a mobile platformer' }, { workspaceRoot: root, services: { productModulePlanner: planner } });
      assert(continued.artifacts.moduleCompositionPlan.operations.some(function(operation) { return operation.op === 'retain' && operation.fromModule.moduleId === moduleId; }), archetype + ' continue must retain the created module');
      assert.equal(continued.artifacts.compiledModulePlan.targetPlanLines.length, 0, archetype + ' continue must not replay creation');
      assert.equal(continued.artifacts.execution.completed, 0, archetype + ' continue executes no creation instruction');
      assert(continued.project.layouts.length > 0, archetype + ' continue keeps the existing playable scene');
      assert(continued.artifacts.projectWorld.modules.some(function(module) { return module.id === moduleId; }), archetype + ' continue retains persisted module ownership');
    }
    console.log('[WP2ContinueMatrix] five real ProjectWeave create-to-continue minimal-delta flows passed');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
main().catch(function(error) { console.error(error); process.exit(1); });
