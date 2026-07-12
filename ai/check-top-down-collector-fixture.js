var assert = require('assert').strict;
var path = require('path');
var pipeline = require('./pipeline');
var planner = require('./product-module-planner');
var compiler = require('./module-compiler');
async function main() {
  var catalog = compiler.loadProductModuleCatalog(path.join(__dirname, 'product-modules'));
  var requirements = { requirementGraphId: 'collector.arena', mode: 'create', requirements: [
    { semanticRef: 'semantic-dictionary#/semantic_concepts/top_down_movement', required: true },
    { semanticRef: 'semantic-dictionary#/playGoals/collect', required: true }
  ] };
  var composition = planner.plan(requirements, { catalog }).plan;
  assert(composition && composition.operations.some(function(item) { return item.toModule.moduleId === 'core.top_down_collector'; }));
  var compiled = compiler.compileCompositionPlan(composition, catalog);
  var project = pipeline.emptyProject('collector');
  for (var i = 0; i < pipeline.parseTargetPlan(compiled.targetPlanText).length; i++) assert((await pipeline.execute(project, pipeline.parseTargetPlan(compiled.targetPlanText)[i])).ok);
  assert(project.layouts[0].objects.some(function(object) { return object.name === 'Collector'; }));
  assert(project.layouts[0].events.some(function(event) { return JSON.stringify(event).indexOf('Delete') >= 0; }));
  console.log('[TopDownCollectorFixture] planner, compiler, runtime and collection event passed');
}
main().catch(function(error) { console.error(error); process.exit(1); });
