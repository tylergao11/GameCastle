var assert = require('assert').strict;
var path = require('path');
var pipeline = require('./pipeline');
var compiler = require('./module-compiler');
var projectWorld = require('./project-world');

async function execute(project, lines) {
  var ops = pipeline.parseTargetPlan(lines.join('\n'));
  for (var i = 0; i < ops.length; i++) assert((await pipeline.execute(project, ops[i])).ok);
}
async function main() {
  var catalog = compiler.loadProductModuleCatalog(path.join(__dirname, 'product-modules'));
  var install = { planId: 'configure.base', determinism: { outputHash: 'base' }, operations: [{ operationId: 'install.start', op: 'install', atomicGroupId: 'base', parameters: {}, toModule: { moduleId: 'shell.start_screen', revision: 'local-v1', manifestHash: 'fixture' } }] };
  var project = pipeline.emptyProject('configure');
  var baseCompiled = compiler.compileCompositionPlan(install, catalog);
  await execute(project, baseCompiled.targetPlanLines);
  var baseModule = baseCompiled.installedModules[0];
  var world = projectWorld.buildProjectWorld(project, null, { modules: [baseModule] });
  var configure = { planId: 'configure.delta', determinism: { outputHash: 'delta' }, operations: [{ operationId: 'configure.start.title', op: 'configure', atomicGroupId: 'delta', fromModule: { moduleId: 'shell.start_screen', revision: 'local-v1', manifestHash: 'fixture' }, expectedOwnershipHash: baseModule.ownershipHash, parameters: { title: 'Updated Title' } }] };
  var compiled = compiler.compileCompositionPlan(configure, catalog, { previousWorld: world, projectWorld: world });
  assert(compiled.runtimeOperations[0].targetPlanLines.length > 0, 'configure must emit an executable minimal delta');
  assert(compiled.runtimeOperations[0].targetPlanLines.every(function(line) { return line.indexOf('create object') < 0 && line.indexOf('create scene') < 0; }), 'configure must not recreate module artifacts');
  var beforeObjects = project.layouts[0].objects.length;
  await execute(project, compiled.runtimeOperations[0].targetPlanLines);
  assert.equal(project.layouts[0].objects.length, beforeObjects, 'configure preserves existing objects');
  assert(JSON.stringify(project.layouts[0].events).indexOf('Updated Title') >= 0, 'configure updates the declared event content');
  console.log('[ModuleConfigureDelta] compiled and executed in-place configure delta passed');
}
main().catch(function(error) { console.error(error); process.exit(1); });
