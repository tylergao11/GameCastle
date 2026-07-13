var assert = require('assert').strict;
var fs = require('fs');
var os = require('os');
var path = require('path');
var runtime = require('./project-weave-runtime');
var testAssetPorts = require('./test-asset-engine-ports');

async function main() {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-wp2-'));
  try {
    var services = { assetPorts: testAssetPorts.createTestAssetEnginePorts({ outputDir: path.join(root, 'test-assets') }), runtimeEvidence: { collect: async function() { return { viewportMatrixReport: { pass: true, simulated: false }, tickPerformanceReport: { pass: true, simulated: false, profile: 'local-interactive', observedSimulationHz: 60 }, tickReplayReceipt: { pass: true, simulated: false, finalStateHash: 'wp2-system-fixture-state' }, browserPlaytestReport: { pass: true, simulated: false, origin: 'http://127.0.0.1:4193' } }; } } };
    var request = { projectId: 'wp2-system', naturalIntent: 'make a mobile platformer', intentDslText: 'make a mobile platformer', funBlueprintRef: { blueprintId: 'route-mastery', revision: 1 }, requiredSemanticRefs: ['semantic-dictionary#/semantic_concepts/movement', 'semantic-dictionary#/playGoals/collect', 'semantic-dictionary#/playGoals/avoid-threats'], assetOptions: { modelPolicy: { provider: 'deepseek', allowExternal: true } } };
    var result = await runtime.create(Object.assign({}, request, { requestId: 'wp2-system-1' }), { workspaceRoot: root, services: services });
    assert(result.artifacts.moduleCompositionPlan, 'Planner artifact required');
    assert(result.artifacts.buildContractReceipt && result.artifacts.buildContractReceipt.immutable, 'Immutable BuildContract receipt required');
    assert(Object.isFrozen(result.artifacts.buildContract), 'BuildContract must be frozen after SemanticEngine output');
    assert(result.artifacts.moduleDeclarationPlan, 'Declaration artifact required');
    assert(result.artifacts.spatialCompositionPlan, 'Spatial artifact required');
    assert(result.artifacts.compiledModulePlan, 'CompiledModulePlan required');
    assert.equal(result.artifacts.compiledModulePlan.provenance.owner, 'ProductModuleCompiler');
    assert(result.artifacts.execution.results.every(function(item) { return item.command === undefined || item.command.indexOf('undefined') < 0; }));
    var persisted = JSON.parse(fs.readFileSync(path.join(result.runDir, 'project-run.json'), 'utf8'));
    assert(persisted.artifacts.compiledModulePlan, 'Persisted run requires CompiledModulePlan');
    assert.equal(JSON.stringify(persisted.artifacts.execution).indexOf('bridgePlan.targetPlanText'), -1, 'Runtime execution must not record legacy bridge target source');
    var continued = await runtime.continue(Object.assign({}, request, { requestId: 'wp2-system-2' }), { workspaceRoot: root, services: services });
    assert(continued.artifacts.moduleCompositionPlan.operations.some(function(operation) { return operation.op === 'retain'; }), 'Continue must retain installed module instead of replaying install');
    assert.equal(continued.artifacts.compiledModulePlan.targetPlanLines.length, 0, 'Retained module must not replay creation target plan');
    console.log('[WP2ProductModuleSystem] ProjectWeave executes hash-provenanced CompiledModulePlan');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
main().catch(function(error) { console.error(error); process.exit(1); });
