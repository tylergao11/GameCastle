var assert = require('assert').strict;
var pipeline = require('./pipeline');
var compiler = require('./module-compiler');
var path = require('path');
var project = pipeline.emptyProject('pause-lifecycle');
async function main() {
  var ops = pipeline.parseTargetPlan('create scene name=Game first=true\nset variable name=GameCastlePaused value=0 type=Number scope=global\non key P -> pause\non key R -> resume');
  for (var i = 0; i < ops.length; i++) assert((await pipeline.execute(project, ops[i])).ok);
  var events = project.layouts[0].events;
  assert.equal(events.length, 2);
  assert.equal(events[0].actions[0].parameters[2], '1');
  assert.equal(events[1].actions[0].parameters[2], '0');
  var catalog = compiler.loadProductModuleCatalog(path.join(__dirname, 'product-modules'));
  var compiled = compiler.compileCompositionPlan({ planId: 'pause.core', determinism: { outputHash: 'pause-core' }, operations: [{ operationId: 'install.collector', op: 'install', atomicGroupId: 'core', parameters: {}, toModule: { moduleId: 'core.top_down_collector', revision: 'local-v1', manifestHash: 'fixture' } }] }, catalog);
  var coreProject = pipeline.emptyProject('pause-core');
  var coreOps = pipeline.parseTargetPlan(compiled.targetPlanText);
  for (var j = 0; j < coreOps.length; j++) assert((await pipeline.execute(coreProject, coreOps[j])).ok);
  var gated = coreProject.layouts[0].events.filter(function(event) { return (event.conditions || []).some(function(condition) { return condition.type.value === 'Variable' && condition.parameters[0] === 'GameCastlePaused'; }); });
  assert(gated.length >= 4, 'core input and gameplay events must have a real GameCastlePaused condition');
  console.log('[PauseLifecycle] pause/resume target actions emit deterministic state events');
}
main().catch(function(error) { console.error(error); process.exit(1); });
