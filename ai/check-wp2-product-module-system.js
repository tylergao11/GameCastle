var assert = require('assert').strict;
var fs = require('fs');
var os = require('os');
var path = require('path');
var runtime = require('./project-weave-runtime');

async function main() {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-wp2-'));
  try {
    var result = await runtime.create({ projectId: 'wp2-system', requestId: 'wp2-system-1', naturalIntent: 'make a mobile platformer', intentDslText: 'make a mobile platformer' }, { workspaceRoot: root });
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
    var continued = await runtime.continue({ projectId: 'wp2-system', requestId: 'wp2-system-2', naturalIntent: 'make a mobile platformer', intentDslText: 'make a mobile platformer' }, { workspaceRoot: root });
    assert(continued.artifacts.moduleCompositionPlan.operations.some(function(operation) { return operation.op === 'retain'; }), 'Continue must retain installed module instead of replaying install');
    assert.equal(continued.artifacts.compiledModulePlan.targetPlanLines.length, 0, 'Retained module must not replay creation target plan');
    console.log('[WP2ProductModuleSystem] ProjectWeave executes hash-provenanced CompiledModulePlan');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
main().catch(function(error) { console.error(error); process.exit(1); });
