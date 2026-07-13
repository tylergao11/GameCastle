var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var vm = require('vm');
var runtime = require('./project-weave-runtime');
var selector = require('./fun-blueprint-selector');
var testAssetPorts = require('./test-asset-engine-ports');
var graph = { requirementGraphId: 'blueprint-check', mode: 'create', funBlueprintRef: { blueprintId: 'route-mastery', revision: 1 }, requirements: [{ semanticRef: 'semantic-dictionary#/semantic_concepts/movement', required: true }, { semanticRef: 'semantic-dictionary#/playGoals/collect', required: true }] };
var selected = selector.select(graph, { blueprintRef: graph.funBlueprintRef });
assert.strictEqual(selected.blueprintRef.blueprintId, 'route-mastery');
assert.ok(runtime.PROJECT_WEAVE_NODE_SEQUENCE.indexOf('fun-blueprint-selector') > runtime.PROJECT_WEAVE_NODE_SEQUENCE.indexOf('intent-compiler'));
assert.ok(runtime.PROJECT_WEAVE_NODE_SEQUENCE.indexOf('fun-blueprint-selector') < runtime.PROJECT_WEAVE_NODE_SEQUENCE.indexOf('product-module-planner'));
assert.strictEqual(runtime.defaultSemanticPort({ requestId: 'r', naturalIntent: 'platform game', requiredSemanticRefs: ['semantic-dictionary#/playGoals/collect'], intentDslText: 'make a test game' }).buildContract.moduleContract.gameplayRequirementGraph.requirements[0].semanticRef, 'semantic-dictionary#/playGoals/collect');
async function playable(blueprintRef, refs, modulePreference, services) {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-blueprint-'));
  try {
    var completeServices = Object.assign({}, services || {}, {
      assetPorts: testAssetPorts.createTestAssetEnginePorts({ outputDir: path.join(root, 'test-assets') }),
      runtimeEvidence: { collect: async function() { return { viewportMatrixReport: { pass: true, simulated: false }, tickPerformanceReport: { pass: true, simulated: false, profile: 'local-interactive', observedSimulationHz: 60 }, tickReplayReceipt: { pass: true, simulated: false, finalStateHash: 'blueprint-fixture-state' }, browserPlaytestReport: { pass: true, simulated: false, origin: 'http://127.0.0.1:4193' } }; } }
    });
    var result = await runtime.create({ projectId: blueprintRef.blueprintId, requestId: blueprintRef.blueprintId + '-1', naturalIntent: 'explicit blueprint pilot', intentDslText: 'make a test game', funBlueprintRef: blueprintRef, requiredSemanticRefs: refs, modulePreference: modulePreference, assetOptions: { modelPolicy: { provider: 'deepseek', allowExternal: true } } }, { workspaceRoot: root, services: completeServices });
    assert.equal(result.lifecycle, 'playable');
    assert.equal(result.artifacts.funBlueprintSelection.blueprintRef.blueprintId, blueprintRef.blueprintId);
    assert.ok(fs.existsSync(path.join(result.runtimeDir, 'index.html')));
    var manifest = JSON.parse(fs.readFileSync(path.join(result.runtimeDir, 'html-export-manifest.json'), 'utf8'));
    manifest.scriptFiles.forEach(function(file) {
      var source = path.join(result.runtimeDir, file);
      assert.ok(fs.existsSync(source), 'HTML export missing script: ' + file);
      new vm.Script(fs.readFileSync(source, 'utf8'), { filename: file });
    });
    assert.ok(fs.readFileSync(path.join(result.runtimeDir, 'index.html'), 'utf8').indexOf('new gdjs.RuntimeGame') >= 0, 'HTML export must create RuntimeGame');
    return result.artifacts.moduleCompositionPlan;
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
Promise.resolve()
  .then(function() { var persisted = []; return playable({ blueprintId: 'route-mastery', revision: 1 }, ['semantic-dictionary#/semantic_concepts/movement', 'semantic-dictionary#/playGoals/collect', 'semantic-dictionary#/playGoals/avoid-threats'], null, { compositionPersistenceBridge: { persistPlannedComposition: async function(plan) { persisted.push(plan); return { planId: plan.planId, planSha256: 'a'.repeat(64), auditReceiptId: 'audit.composition' }; } } }).then(function(plan) { assert.equal(persisted.length, 1, 'explicit composition persistence must run from the official planner node'); return plan; }); })
  .then(function(plan) { assert(plan.operations.some(function(op) { return op.toModule.moduleId === 'core.platformer'; })); return playable({ blueprintId: 'route-mastery', revision: 1 }, ['semantic-dictionary#/semantic_concepts/movement', 'semantic-dictionary#/playGoals/collect', 'semantic-dictionary#/playGoals/avoid-threats'], { moduleIds: ['core.route_dash'] }); })
  .then(function(plan) { assert(plan.operations.some(function(op) { return op.toModule.moduleId === 'core.route_dash'; })); return playable({ blueprintId: 'state-puzzle', revision: 1 }, ['semantic-dictionary#/playGoals/solve', 'semantic-dictionary#/eventMeanings/PuzzleReset']); })
  .then(function(plan) { assert(plan.operations.some(function(op) { return op.toModule.moduleId === 'core.interaction_puzzle'; })); return playable({ blueprintId: 'state-puzzle', revision: 1 }, ['semantic-dictionary#/playGoals/solve', 'semantic-dictionary#/eventMeanings/PuzzleReset'], { moduleIds: ['core.state_puzzle_grid'] }); })
  .then(function(plan) { assert(plan.operations.some(function(op) { return op.toModule.moduleId === 'core.state_puzzle_grid'; })); return playable({ blueprintId: 'survivor-growth', revision: 1 }, ['semantic-dictionary#/playGoals/survive', 'semantic-dictionary#/semantic_concepts/aim_and_fire', 'semantic-dictionary#/eventMeanings/ActorFailed', 'semantic-dictionary#/eventMeanings/UpgradeApplied']); })
  .then(function(plan) { assert(plan.operations.some(function(op) { return op.toModule.moduleId === 'core.survivor_arena'; })); return playable({ blueprintId: 'survivor-growth', revision: 1 }, ['semantic-dictionary#/playGoals/survive', 'semantic-dictionary#/semantic_concepts/aim_and_fire', 'semantic-dictionary#/eventMeanings/ActorFailed', 'semantic-dictionary#/eventMeanings/UpgradeApplied'], { moduleIds: ['core.survivor_escape'] }); })
  .then(function(plan) { assert(plan.operations.some(function(op) { return op.toModule.moduleId === 'core.survivor_escape'; })); console.log('[ProjectWeaveBlueprintSelection] every approved blueprint has two materially distinct playable module compositions without a genre branch'); })
  .catch(function(error) { console.error(error); process.exit(1); });
