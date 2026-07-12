var assert = require('assert').strict, path = require('path');
var pipeline = require('./pipeline'), compiler = require('./module-compiler');
async function main() {
  var catalog = compiler.loadProductModuleCatalog(path.join(__dirname, 'product-modules'));
  var plan = { planId: 'puzzle.rooms', catalogFingerprint: 'test', determinism: { outputHash: 'test' }, operations: [{ op: 'install', parameters: {}, toModule: { moduleId: 'core.interaction_puzzle', revision: 'local-v1', manifestHash: 'test' } }] };
  var compiled = compiler.compileCompositionPlan(plan, catalog), project = pipeline.emptyProject('puzzle'), ops = pipeline.parseTargetPlan(compiled.targetPlanText);
  for (var i = 0; i < ops.length; i++) assert((await pipeline.execute(project, ops[i])).ok);
  assert(project.layouts[0].objects.some(function(item) { return item.name === 'Switch'; }));
  assert(project.layouts[0].events.some(function(event) { return JSON.stringify(event).indexOf('PuzzleState') >= 0; }));
  console.log('[InteractionPuzzleFixture] compiler and runtime state/reset events passed');
}
main().catch(function(error) { console.error(error); process.exit(1); });
