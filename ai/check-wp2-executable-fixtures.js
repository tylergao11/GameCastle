var assert = require('assert').strict;
var path = require('path');
var pipeline = require('./pipeline');
var compiler = require('./module-compiler');
var spatial = require('./spatial-composition-planner');
var placement = require('./placement-resolver');

var CASES = [
  { archetype: 'runner-platformer', moduleId: 'core.platformer', topologies: ['linear', 'branching-route'], objects: ['Player', 'Coin', 'Enemy'] },
  { archetype: 'top-down-collector', moduleId: 'core.top_down_collector', topologies: ['arena', 'rooms'], objects: ['Collector', 'Gem'] },
  { archetype: 'lightweight-shooter', moduleId: 'core.shooter', topologies: ['arena', 'lanes'], objects: ['Player1', 'Bullet1', 'Enemy'] },
  { archetype: 'interaction-puzzle', moduleId: 'core.interaction_puzzle', topologies: ['rooms', 'grid'], objects: ['Switch'] },
  { archetype: 'idle-clicker', moduleId: 'core.idle_clicker', topologies: ['single-screen', 'staged-zones'], objects: ['Clicker'] }
];

function installPlan(id, topology) {
  return { schemaVersion: 1, planId: id + '.' + topology, mode: 'create', catalogFingerprint: 'fixture', operations: [{ operationId: 'install.' + id, op: 'install', atomicGroupId: 'create.' + id, reasonRequirementRefs: [], parameters: {}, toModule: { moduleId: id, revision: 'local-v1', manifestHash: 'fixture' } }], determinism: { outputHash: id + '.' + topology } };
}
async function execute(project, lines) {
  var ops = pipeline.parseTargetPlan(lines.join('\n'));
  for (var i = 0; i < ops.length; i++) assert((await pipeline.execute(project, ops[i])).ok);
}
async function main() {
  var catalog = compiler.loadProductModuleCatalog(path.join(__dirname, 'product-modules'));
  var fixtureCount = 0;
  for (var i = 0; i < CASES.length; i++) {
    var testCase = CASES[i];
    var latestProject;
    var layoutHashes = [];
    for (var j = 0; j < testCase.topologies.length; j++) {
      var topology = testCase.topologies[j];
      var composition = installPlan(testCase.moduleId, topology);
      var declaration = compiler.declareModuleSubjects(composition, catalog);
      var spatialPlan = spatial.plan({ requirementGraphId: testCase.archetype + '.' + topology, constraints: { topology: topology } }, composition, declaration, catalog);
      assert(spatialPlan.plan && !spatialPlan.debt, testCase.archetype + ' must have a spatial plan');
      assert.equal(spatialPlan.plan.topology, topology, testCase.archetype + ' must emit requested supported topology');
      var placementPlan = placement.resolveSpatialComposition(spatialPlan.plan, declaration, { scene: 'Game' });
      assert(placementPlan.placements.length > 0, testCase.archetype + ' requires resolved placement subjects');
      var compiled = compiler.compileCompositionPlan(composition, catalog, { placementPlan: placementPlan });
      var project = pipeline.emptyProject(testCase.archetype + '.' + topology);
      await execute(project, compiled.targetPlanLines);
      testCase.objects.forEach(function(name) { assert(project.layouts.some(function(scene) { return (scene.objects || []).some(function(object) { return object.name === name; }); }), testCase.archetype + ' missing playable object ' + name); });
      var resolvedLayout = placementPlan.placements.map(function(item) { return { subject: item.subject, point: item.resolved }; });
      layoutHashes.push(JSON.stringify(resolvedLayout));
      latestProject = project;
      fixtureCount++;
    }
    assert.notEqual(layoutHashes[0], layoutHashes[1], testCase.archetype + ' topologies must emit different final placement layouts');
    var retained = compiler.compileCompositionPlan({ schemaVersion: 1, planId: testCase.archetype + '.continue', mode: 'continue', catalogFingerprint: 'fixture', operations: [{ operationId: 'retain.' + testCase.moduleId, op: 'retain', atomicGroupId: 'continue.' + testCase.moduleId, reasonRequirementRefs: [], parameters: {}, fromModule: { moduleId: testCase.moduleId, revision: 'local-v1', manifestHash: 'fixture' }, expectedOwnershipHash: 'fixture-owned' }], determinism: { outputHash: testCase.archetype + '.continue' } }, catalog);
    assert.equal(retained.targetPlanLines.length, 0, testCase.archetype + ' continue must be a minimal delta');
    assert(latestProject.layouts.length > 0, testCase.archetype + ' continue retains playable project state');
  }
  assert.equal(fixtureCount, 10);
  console.log('[WP2ExecutableFixtures] ten real compiled create fixtures across distinct topologies and five minimal-delta continues passed');
}
main().catch(function(error) { console.error(error); process.exit(1); });
