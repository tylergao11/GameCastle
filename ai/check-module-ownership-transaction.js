var assert = require('assert').strict;
var crypto = require('crypto');
var pipeline = require('./pipeline');
var compiler = require('./module-compiler');

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16); }

async function main() {
  var project = pipeline.emptyProject('ownership');
  var lines = [
    'create object name=Owned type=ShapePainter shape=rectangle color=#112233 width=20 height=20 scene=Game',
    'place object=Owned at=100,100 scene=Game',
    'set variable name=OwnedState value=7 type=Number scope=global',
    'on key Space -> restart scene=Game'
  ];
  assert((await pipeline.execute(project, pipeline.parseTargetPlan('create scene name=Game first=true')[0])).ok);
  var before = clone(project);
  for (var i = 0; i < pipeline.parseTargetPlan(lines.join('\n')).length; i++) assert((await pipeline.execute(project, pipeline.parseTargetPlan(lines.join('\n'))[i])).ok);
  var owned = compiler.captureOwnedArtifacts(before, project);
  assert(owned.length >= 4, 'installation must record concrete project artifacts');
  var projectWithModule = clone(project);
  var module = { id: 'fixture.owned', revision: 'v1', ownedArtifacts: owned, ownedArtifactIds: owned.map(function(item) { return item.artifactId; }) };
  module.ownershipHash = hash({ id: module.id, revision: module.revision, params: {}, ownedArtifactIds: module.ownedArtifactIds });
  var operation = { expectedOwnershipHash: module.ownershipHash, cleanupPlan: { orderedArtifactIds: module.ownedArtifactIds, dependentChecks: [], rollbackPolicy: 'restore-previous-project' }, sharedArtifactPolicy: { artifactIds: [], remainingOwnerIds: [], referenceRule: 'exclusive-only' } };
  var removed = compiler.removeOwnedArtifacts(project, module, operation);
  assert.equal(removed.length, owned.length);
  assert.equal(project.layouts.length, 1, 'shared project scene survives module cleanup');
  assert.equal(project.variables.some(function(item) { return item.name === 'OwnedState'; }), false);
  var rollback = clone(before);
  assert.throws(function() { compiler.removeOwnedArtifacts(rollback, module, Object.assign({}, operation, { expectedOwnershipHash: 'wrong' })); }, /MODULE_REMOVE_UNSAFE/);
  assert.deepEqual(rollback, before, 'guard failure leaves the transaction snapshot intact');
  var sharedProject = clone(projectWithModule);
  var sharedArtifactId = module.ownedArtifactIds.find(function(id) { return id.indexOf('variable:global:') === 0; });
  var sharedOperation = Object.assign({}, operation, { sharedArtifactPolicy: { artifactIds: [sharedArtifactId], remainingOwnerIds: ['fixture.consumer'], referenceRule: 'retain-until-last-owner' } });
  var consumer = { id: 'fixture.consumer' };
  compiler.removeOwnedArtifacts(sharedProject, module, sharedOperation, [module, consumer]);
  assert(sharedProject.variables.some(function(item) { return item.name === 'OwnedState'; }), 'shared artifact remains while another owner is declared');
  assert.throws(function() { compiler.removeOwnedArtifacts(clone(projectWithModule), module, sharedOperation, [module]); }, /remaining owner is not installed/);
  assert.throws(function() { compiler.removeOwnedArtifacts(clone(projectWithModule), module, Object.assign({}, operation, { cleanupPlan: Object.assign({}, operation.cleanupPlan, { dependentChecks: [{ blocking: true }] }) })); }, /blocking dependent check/);
  var replacementProject = clone(before);
  for (var j = 0; j < pipeline.parseTargetPlan(lines.join('\n')).length; j++) assert((await pipeline.execute(replacementProject, pipeline.parseTargetPlan(lines.join('\n'))[j])).ok);
  var replacePlan = compiler.compileCompositionPlan({ planId: 'replace', determinism: { outputHash: 'replace' }, operations: [{ operationId: 'replace.owned', op: 'replace', atomicGroupId: 'replace.owned', fromModule: { moduleId: module.id, revision: module.revision }, toModule: { moduleId: 'system.controls', revision: 'local-v1', manifestHash: 'fixture' }, expectedOwnershipHash: module.ownershipHash, cleanupPlan: operation.cleanupPlan, sharedArtifactPolicy: operation.sharedArtifactPolicy, stateMigration: { strategy: 'copy-global-state', sourceStateIds: ['OwnedState'], targetStateIds: ['MigratedState'], failurePolicy: 'rollback' } }] });
  compiler.removeOwnedArtifacts(replacementProject, module, replacePlan.runtimeOperations[0]);
  var replaceOps = pipeline.parseTargetPlan(replacePlan.runtimeOperations[0].targetPlanLines.join('\n'));
  for (var k = 0; k < replaceOps.length; k++) assert((await pipeline.execute(replacementProject, replaceOps[k])).ok);
  assert.deepEqual(compiler.migrateState(replacementProject, replacePlan.runtimeOperations[0].stateMigration, projectWithModule), [{ from: 'OwnedState', to: 'MigratedState' }]);
  assert(replacementProject.layouts.some(function(scene) { return (scene.objects || []).some(function(object) { return object.name === 'ControlsHint'; }); }), 'replace installs the pinned replacement module');
  assert(replacementProject.variables.some(function(variable) { return variable.name === 'MigratedState' && variable.value === '7'; }), 'replace migrates declared state');
  console.log('[ModuleOwnershipTransaction] concrete cleanup, ownership guard, and rollback snapshot passed');
}
main().catch(function(error) { console.error(error); process.exit(1); });
