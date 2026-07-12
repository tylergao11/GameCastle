var crypto = require('crypto');
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16); }
function topologyFor(modules, requirementGraph) {
  var supported = (modules || []).reduce(function(all, module) { return all.concat((module.spatialContract || {}).supportedTopologies || []); }, []);
  var requested = requirementGraph && requirementGraph.constraints && requirementGraph.constraints.topology;
  if (requested && supported.indexOf(requested) >= 0) return requested;
  var preferred = /collect/i.test(JSON.stringify(requirementGraph || {})) ? ['linear', 'arena', 'rooms'] : ['arena', 'linear', 'single-screen'];
  return preferred.find(function(topology) { return supported.indexOf(topology) >= 0; }) || supported[0] || null;
}
function plan(requirementGraph, compositionPlan, declaration, catalog) {
  var selected = (compositionPlan.operations || []).filter(function(operation) { return operation.op !== 'remove'; }).map(function(operation) { return operation.toModule || operation.fromModule; });
  var modules = selected.map(function(ref) { return (catalog.modules || []).find(function(module) { return module.id === ref.moduleId; }); }).filter(Boolean);
  var topology = topologyFor(modules, requirementGraph);
  if (!topology) return { plan: null, debt: { schemaVersion: 1, debtId: 'debt.topology', code: 'MODULE_TOPOLOGY_UNSUPPORTED', blocking: true, owner: 'SpatialCompositionPlanner', requirementRefs: [], missingSemanticRefs: [], message: 'No selected module supports a spatial topology.', nextAction: 'select-approved-alternative' } };
  var roles = [].concat.apply([], modules.map(function(module) { return (module.spatialContract || {}).requiredRoles || []; }));
  var subjects = declaration.subjects || [];
  var assignments = roles.map(function(role) { var subject = subjects.find(function(item) { return item.placementPolicy === role; }); return subject ? { spatialRole: role, moduleId: subject.moduleId, regionId: role + '.region', cardinality: subject.cardinality } : null; }).filter(Boolean);
  var result = { schemaVersion: 1, spatialPlanId: compositionPlan.planId + ':spatial', compositionPlanId: compositionPlan.planId, topology: topology, regions: assignments.map(function(item) { return { regionId: item.regionId, semanticRole: item.spatialRole, capacity: item.cardinality === 'exclusive' ? 1 : 99, connectivity: topology }; }), roleAssignments: assignments, relations: assignments.map(function(item) { return { kind: item.spatialRole === 'actor_spawn' ? 'inside' : 'along-route', subject: item.spatialRole, regionId: item.regionId }; }), pacingBands: ['onboarding', 'pressure', 'reward'], variationSeed: hash([requirementGraph.requirementGraphId, compositionPlan.planId]), constraints: { coordinatesOwnedBy: 'PlacementResolver' }, evidence: [{ owner: 'SpatialCompositionPlanner', declarationHash: declaration.declarationHash }] };
  return { plan: result, debt: null };
}
module.exports = { plan: plan };
