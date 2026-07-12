var crypto = require('crypto');
var moduleCompiler = require('./module-compiler');
var semanticRefs = require('./semantic-reference-resolver');

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16); }
function catalogFingerprint(catalog) { return hash((catalog.modules || []).map(function(module) { return { id: module.id, revision: module.revision || 'local-v1', manifest: module.sourceFile }; })); }
function debt(code, refs, message, action) { return { schemaVersion: 1, debtId: 'debt.' + hash([code, refs]), code: code, blocking: true, owner: 'ProductModulePlanner', requirementRefs: refs || [], missingSemanticRefs: refs || [], message: message, nextAction: action || 'route-to-module-owner' }; }
function capabilities(module) { return (module.capabilities || []).reduce(function(all, item) { return all.concat(item.provides || []); }, []); }
function moduleSupports(module, ref) {
  var semantic = module.semanticContract || {};
  return (semantic.provides || []).indexOf(ref) >= 0;
}
function plan(requirementGraph, options) {
  options = options || {};
  semanticRefs.assertAll((requirementGraph.requirements || []).map(function(item) { return item.semanticRef; }));
  var catalog = options.catalog || moduleCompiler.loadProductModuleCatalog(options.modulesDir || require('path').join(__dirname, 'product-modules'));
  var base = (options.previousWorld && options.previousWorld.modules) || [];
  var requirements = (requirementGraph.requirements || []).filter(function(item) { return item.required; });
  var selected = [];
  var missing = [];
  requirements.forEach(function(requirement) {
    var candidate = catalog.modules.filter(function(module) { return moduleSupports(module, requirement.semanticRef); }).sort(function(left, right) {
      var leftScore = requirements.filter(function(item) { return moduleSupports(left, item.semanticRef); }).length;
      var rightScore = requirements.filter(function(item) { return moduleSupports(right, item.semanticRef); }).length;
      return rightScore - leftScore || left.id.localeCompare(right.id);
    })[0];
    if (!candidate) { missing.push(requirement.semanticRef); return; }
    if (!selected.some(function(item) { return item.id === candidate.id; })) selected.push(candidate);
  });
  if (missing.length) return { plan: null, debt: debt('MODULE_CAPABILITY_MISSING', missing, 'No approved module covers required semantics.', 'route-to-foundry') };
  var ids = selected.map(function(module) { return module.id; });
  var conflict = selected.find(function(module) { return (module.incompatibleWith || []).some(function(id) { return ids.indexOf(id) >= 0; }); });
  if (conflict) return { plan: null, debt: debt('MODULE_CONFLICT', [], 'Selected modules conflict: ' + conflict.id, 'select-approved-alternative') };
  var baseIds = base.map(function(module) { return module.id || module.moduleId; });
  var operations = selected.map(function(module, index) {
    var existing = base.find(function(item) { return (item.id || item.moduleId) === module.id; });
    return { operationId: 'op.' + index, op: existing ? 'retain' : 'install', atomicGroupId: 'group.main', reasonRequirementRefs: requirements.filter(function(item) { return moduleSupports(module, item.semanticRef); }).map(function(item) { return item.semanticRef; }), parameters: {}, toModule: { moduleId: module.id, revision: module.revision || 'local-v1', manifestHash: hash(module) }, fromModule: existing ? { moduleId: module.id, revision: existing.revision || 'local-v1', manifestHash: existing.manifestHash || hash(module) } : undefined, expectedOwnershipHash: existing ? existing.ownershipHash || '' : undefined };
  });
  var plan = { schemaVersion: 1, planId: requirementGraph.requirementGraphId + ':composition', mode: requirementGraph.mode, requirementGraphId: requirementGraph.requirementGraphId, catalogFingerprint: catalogFingerprint(catalog), baseGuard: { expectedProjectWorldHash: options.previousWorld && options.previousWorld.semanticHash || null, expectedCatalogFingerprint: catalogFingerprint(catalog), expectedModuleRevisionSetHash: hash(baseIds.sort()) }, operations: operations, coverage: { requiredSemanticRefs: requirements.map(function(item) { return item.semanticRef; }), satisfiedSemanticRefs: requirements.map(function(item) { return item.semanticRef; }), missingSemanticRefs: [], conflictingSemanticRefs: [] }, slotBindings: [], spatialRequirements: [], debt: null, determinism: { inputHash: hash(requirementGraph), outputHash: '', plannerVersion: 1 } };
  plan.determinism.outputHash = hash(plan);
  return { plan: plan, debt: null };
}
function guardedRemove(module, previousWorld, catalog) {
  var existing = (previousWorld && previousWorld.modules || []).find(function(item) { return (item.id || item.moduleId) === module.id; });
  if (!existing || !existing.ownershipHash) return { plan: null, debt: debt('MODULE_REMOVE_UNSAFE', [], 'Module removal requires ProjectWorld ownership proof.', 'refresh-project-world') };
  return { plan: { operationId: 'remove.' + module.id, op: 'remove', atomicGroupId: 'group.remove.' + module.id, reasonRequirementRefs: [], parameters: {}, fromModule: { moduleId: module.id, revision: existing.revision || module.revision, manifestHash: existing.manifestHash || hash(module) }, expectedOwnershipHash: existing.ownershipHash, cleanupPlan: { orderedArtifactIds: existing.ownedArtifactIds || [], dependentChecks: [], rollbackPolicy: 'restore-previous-project' }, sharedArtifactPolicy: { artifactIds: [], remainingOwnerIds: [], referenceRule: 'exclusive-only' } }, debt: null };
}
module.exports = { plan: plan, catalogFingerprint: catalogFingerprint, guardedRemove: guardedRemove };
