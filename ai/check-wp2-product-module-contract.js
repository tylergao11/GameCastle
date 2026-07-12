var assert = require('assert').strict;
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var contractPath = path.join(root, 'shared', 'wp2-product-module-contract.json');
var designPath = path.join(root, 'docs', 'wp2-product-module-generator-design.md');
var contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
var design = fs.readFileSync(designPath, 'utf8');

function requireKeys(value, keys, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), label + ' must be an object');
  keys.forEach(function(key) {
    assert(Object.prototype.hasOwnProperty.call(value, key), label + ' missing ' + key);
  });
}

function unique(values, label) {
  assert.equal(new Set(values).size, values.length, label + ' contains duplicates');
}

assert.equal(contract.schemaVersion, 1);
assert.equal(contract.contractId, 'gamecastle.wp2.product-module-system');
assert.equal(contract.status, 'designed');
assert.equal(contract.workPackage, 'WP2');
assert.equal(contract.umbrellaOwner, 'ProductModuleSystem');

Object.keys(contract.sourceTruth).forEach(function(key) {
  var value = contract.sourceTruth[key];
  if (typeof value !== 'string' || value.indexOf('/') < 0) return;
  assert(fs.existsSync(path.join(root, value)), 'WP2 source truth does not exist: ' + key + '=' + value);
});

[
  'ProductModuleSystem',
  'SemanticEngine',
  'ProductModulePlanner',
  'SpatialCompositionPlanner',
  'PlacementResolver',
  'ProductModuleCompiler',
  'ProductModuleFoundry',
  'RuntimeValidator',
  'SemanticPlaytestAgent',
  'ModuleRepository'
].forEach(function(owner) {
  requireKeys(contract.owners[owner], ['owns', 'forbidden'], 'owners.' + owner);
  assert(contract.owners[owner].owns.length > 0, owner + ' must own something');
  assert(contract.owners[owner].forbidden.length > 0, owner + ' must declare forbidden actions');
});

assert.deepEqual(contract.onlineFlow.map(function(item) { return item.order; }), [1, 2, 3, 4, 5, 6, 7, 8]);
assert.equal(contract.offlineFoundryFlow.length, 8);
assert(contract.owners.ProductModuleFoundry.forbidden.indexOf('run in online create or continue') >= 0);

var artifactNames = [
  'GameplayRequirementGraph',
  'ModuleCompositionPlan',
  'ModuleDeclarationPlan',
  'SpatialCompositionPlan',
  'CompiledModulePlan',
  'ModuleDebt',
  'ModuleCandidate',
  'ModulePromotionReceipt'
];
artifactNames.forEach(function(name) {
  requireKeys(contract.artifactContracts[name], ['owner', 'required'], 'artifactContracts.' + name);
  assert(contract.artifactContracts[name].required.length > 0, name + ' must have required fields');
  unique(contract.artifactContracts[name].required, name + '.required');
});

['moduleId', 'targetPlan', 'componentId', 'x', 'y', 'gdjsType'].forEach(function(field) {
  assert(contract.artifactContracts.GameplayRequirementGraph.forbiddenFields.indexOf(field) >= 0, 'GameplayRequirementGraph must forbid ' + field);
});
['x', 'y', 'zOrder', 'targetPlan', 'gdjsType'].forEach(function(field) {
  assert(contract.artifactContracts.SpatialCompositionPlan.forbiddenFields.indexOf(field) >= 0, 'SpatialCompositionPlan must forbid ' + field);
});

assert.deepEqual(contract.artifactContracts.ModuleCompositionPlan.operationKinds, ['install', 'configure', 'retain', 'remove', 'replace']);
['install', 'configure', 'retain', 'remove', 'replace'].forEach(function(op) {
  assert(contract.artifactContracts.ModuleCompositionPlan.operationContracts[op], 'operation contract missing: ' + op);
});
['expectedProjectWorldHash', 'expectedCatalogFingerprint', 'expectedModuleRevisionSetHash'].forEach(function(field) {
  assert(contract.artifactContracts.ModuleCompositionPlan.baseGuardRequired.indexOf(field) >= 0, 'base guard missing ' + field);
});
['fromModule', 'toModule', 'stateMigration', 'sharedArtifactPolicy', 'cleanupPlan'].forEach(function(field) {
  assert(contract.artifactContracts.ModuleCompositionPlan.operationContracts.replace.indexOf(field) >= 0, 'replace contract missing ' + field);
});
['fromModule', 'expectedOwnershipHash', 'cleanupPlan', 'sharedArtifactPolicy'].forEach(function(field) {
  assert(contract.artifactContracts.ModuleCompositionPlan.operationContracts.remove.indexOf(field) >= 0, 'remove contract missing ' + field);
});
assert(contract.artifactContracts.ModuleCompositionPlan.invariants.some(function(item) { return item.indexOf('same catalog fingerprint') >= 0; }), 'planner determinism invariant missing');
assert(contract.artifactContracts.CompiledModulePlan.invariants.some(function(item) { return item.indexOf('no model output') >= 0; }), 'compiler model boundary missing');
assert.deepEqual(contract.artifactContracts.ModuleCandidate.statuses, ['draft', 'verified', 'rejected']);
['targetPlan', 'targetPlanText', 'x', 'y'].forEach(function(field) {
  assert(contract.artifactContracts.ModuleDeclarationPlan.forbiddenFields.indexOf(field) >= 0, 'ModuleDeclarationPlan must forbid ' + field);
});
['subjectId', 'moduleId', 'moduleRevision', 'prototypeId', 'semanticRoleRefs', 'bounds', 'layerRole', 'cardinality', 'placementPolicy'].forEach(function(field) {
  assert(contract.artifactContracts.ModuleDeclarationPlan.subjectRequired.indexOf(field) >= 0, 'ModuleDeclarationPlan subject missing ' + field);
});
['width', 'height', 'anchor'].forEach(function(field) {
  assert(contract.artifactContracts.ModuleDeclarationPlan.boundsRequired.indexOf(field) >= 0, 'ModuleDeclarationPlan bounds missing ' + field);
});
['spatialSubjects', 'sharedArtifacts'].forEach(function(field) {
  assert(contract.productModuleManifestExtensions.declarationContract.required.indexOf(field) >= 0, 'manifest declarationContract missing ' + field);
});

var extensionNames = ['semanticContract', 'spatialContract', 'declarationContract', 'lifecycleContract', 'ownershipContract', 'compilerExtensions', 'acceptanceContract'];
assert.deepEqual(Object.keys(contract.productModuleManifestExtensions), extensionNames);
extensionNames.forEach(function(name) {
  requireKeys(contract.productModuleManifestExtensions[name], ['required', 'rule'], 'productModuleManifestExtensions.' + name);
});

var archetypes = contract.acceptanceMatrix.archetypes;
assert.deepEqual(archetypes.map(function(item) { return item.id; }), [
  'runner-platformer',
  'top-down-collector',
  'lightweight-shooter',
  'interaction-puzzle',
  'idle-clicker'
]);
assert.equal(archetypes.reduce(function(total, item) { return total + item.createFixtures; }, 0), 10);
assert.equal(archetypes.reduce(function(total, item) { return total + item.continueFixtures; }, 0), 5);
archetypes.forEach(function(item) {
  assert(item.minimumTopologies.length >= 2, item.id + ' must prove layout diversity');
  assert(item.requiredSemanticRefs.length >= 6, item.id + ' semantic coverage is too weak');
});

var semanticDictionary = JSON.parse(fs.readFileSync(path.join(root, contract.sourceTruth.semanticDictionary), 'utf8'));
var capabilityIndex = JSON.parse(fs.readFileSync(path.join(root, contract.sourceTruth.capabilitySemanticIndex), 'utf8'));
var changeRequestsByTarget = {};
contract.semanticReferenceResolution.ownerChangeRequests.forEach(function(request) {
  assert.equal(request.owner, 'SemanticEngine');
  assert(['open', 'closed'].indexOf(request.status) >= 0, 'invalid semantic owner change status: ' + request.requestId);
  assert(/^semantic-dictionary#\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(request.targetRef), 'non-canonical semantic owner change target: ' + request.targetRef);
  assert(Array.isArray(request.closureEvidence), request.requestId + ' closureEvidence must be an array');
  assert(!contract.semanticReferenceResolution.ownerChangeRequests.some(function(other) { return other !== request && other.requestId === request.requestId; }), 'duplicate semantic owner change requestId: ' + request.requestId);
  assert(!changeRequestsByTarget[request.targetRef], 'duplicate semantic owner change target: ' + request.targetRef);
  changeRequestsByTarget[request.targetRef] = request;
});

function decodePointerPart(value) {
  return value.replace(/~1/g, '/').replace(/~0/g, '~');
}

function resolvePointer(document, pointer) {
  return pointer.split('/').slice(1).map(decodePointerPart).reduce(function(value, key) {
    if (value === undefined || value === null || !Object.prototype.hasOwnProperty.call(value, key)) return undefined;
    return value[key];
  }, document);
}

var unresolvedDesignRefs = [];
archetypes.forEach(function(item) {
  item.requiredSemanticRefs.forEach(function(ref) {
    var document;
    var pointer;
    if (ref.indexOf('semantic-dictionary#/') === 0) {
      document = semanticDictionary;
      pointer = ref.slice('semantic-dictionary#'.length);
    } else if (ref.indexOf('capability-index#/') === 0) {
      document = capabilityIndex;
      pointer = ref.slice('capability-index#'.length);
    } else {
      assert.fail('non-canonical semantic ref: ' + ref);
    }
    var resolved = resolvePointer(document, pointer);
    if (resolved === undefined) {
      assert(changeRequestsByTarget[ref], 'unresolved semantic ref lacks exactly one SemanticEngine owner change: ' + ref);
      assert.equal(changeRequestsByTarget[ref].status, 'open', 'unresolved semantic owner change must remain open: ' + ref);
      unresolvedDesignRefs.push(ref);
    } else if (changeRequestsByTarget[ref]) {
      assert.equal(changeRequestsByTarget[ref].status, 'closed', 'resolved semantic owner change must be closed: ' + ref);
      assert(changeRequestsByTarget[ref].closureEvidence.length > 0, 'closed semantic owner change requires closure evidence: ' + ref);
    }
  });
});
unique(unresolvedDesignRefs, 'unresolved design semantic refs');
assert.equal(unresolvedDesignRefs.length, contract.semanticReferenceResolution.ownerChangeRequests.filter(function(request) { return request.status === 'open'; }).length, 'every open semantic owner change must correspond to an unresolved acceptance ref');

['hud', 'start', 'pause', 'game-over', 'score', 'controls'].forEach(function(role) {
  assert(contract.acceptanceMatrix.sharedSurfaceRoles.indexOf(role) >= 0, 'shared surface role missing: ' + role);
});

[
  'no-new-parallel-semantic-dictionary',
  'no-archetype-switch-in-generator-core',
  'no-llm-authored-target-plan',
  'no-online-foundry',
  'no-layout-owned-by-final-coordinate-template',
  'no-silent-capability-fallback',
  'no-continue-full-replay-for-retained-modules',
  'no-remove-without-ownership-proof',
  'no-schema-only-playable-claim'
].forEach(function(gate) {
  assert(contract.hardGates.indexOf(gate) >= 0, 'missing hard gate: ' + gate);
});
['no-unresolved-semantic-reference-in-online-plan', 'no-placement-before-module-declaration', 'no-online-target-plan-outside-compiled-module-plan', 'no-legacy-bridge-plan-target-plan-execution'].forEach(function(gate) {
  assert(contract.hardGates.indexOf(gate) >= 0, 'missing integration gate: ' + gate);
});

assert.equal(contract.terraImplementationOrder.length, 13);
assert(contract.solHandoff.terraMustRead.indexOf('shared/wp2-product-module-contract.json') >= 0);
assert(contract.solHandoff.stopCondition.indexOf('second semantic dictionary') >= 0);

assert.equal(capabilityIndex.summary.capability_count, capabilityIndex.summary.covered_count, 'WP2 must start from complete existing semantic capability coverage');
assert.equal(capabilityIndex.summary.uncovered_count, 0, 'WP2 must not hide existing capability coverage gaps');

var gapIds = contract.implementationGaps.map(function(item) { return item.gapId; });
['WP2-GAP-SEMANTIC-HIGH-LEVEL', 'WP2-GAP-BUILD-CONTRACT-LIFECYCLE', 'WP2-GAP-PLACEMENT-DECLARATION', 'WP2-GAP-REMOVE-DECLARED-NOT-IMPLEMENTED', 'WP2-GAP-LEGACY-TARGET-PLAN'].forEach(function(gapId) {
  assert(gapIds.indexOf(gapId) >= 0, 'implementation gap missing: ' + gapId);
});
var gapsById = {};
contract.implementationGaps.forEach(function(gap) {
  assert(['open', 'closed'].indexOf(gap.status) >= 0, 'invalid implementation gap status: ' + gap.gapId);
  assert(Array.isArray(gap.closureEvidence), gap.gapId + ' closureEvidence must be an array');
  if (gap.status === 'closed') assert(gap.closureEvidence.length > 0, 'closed implementation gap requires closure evidence: ' + gap.gapId);
  gapsById[gap.gapId] = gap;
});

var moduleCompilerSource = fs.readFileSync(path.join(root, 'ai', 'module-compiler.js'), 'utf8');
var projectWeaveSource = fs.readFileSync(path.join(root, 'ai', 'project-weave-runtime.js'), 'utf8');
if (gapsById['WP2-GAP-REMOVE-DECLARED-NOT-IMPLEMENTED'].status === 'open') {
  assert(moduleCompilerSource.indexOf("command.verb === 'configure'") >= 0 && moduleCompilerSource.indexOf("command.verb === 'remove'") < 0, 'designed-gap probe changed: update remove implementation gap');
}
if (gapsById['WP2-GAP-LEGACY-TARGET-PLAN'].status === 'open') {
  assert(projectWeaveSource.indexOf('state.artifacts.intent.bridgePlan.targetPlanText') >= 0, 'designed-gap probe changed: update legacy target-plan gap');
}

var globalContract = JSON.parse(fs.readFileSync(path.join(root, 'shared', 'project-completion-contract.json'), 'utf8'));
var globalWp2 = globalContract.workPackages.find(function(item) { return item.id === 'WP2'; });
assert.equal(globalContract.artifacts.BuildContract.owner, 'IntentAgent', 'BuildContract owner must match ai/contracts/schema.json');
assert.equal(gapsById['WP2-GAP-BUILD-CONTRACT-LIFECYCLE'].owner, globalContract.artifacts.BuildContract.owner, 'BuildContract lifecycle gap owner must match global artifact owner');
assert.equal(globalWp2.owner, 'ProductModuleSystem');
assert.equal(globalWp2.status, contract.status, 'global and WP2 machine contract status must match');
assert(globalWp2.completionEvidence.some(function(item) { return item.indexOf('ten create fixtures') >= 0; }), 'global WP2 completion gate must require ten create fixtures');
assert(globalWp2.forbidden.indexOf('legacy bridgePlan target execution') >= 0, 'global WP2 must forbid legacy online target execution');
assert.equal(globalContract.truthSources.wp2ProductModuleSystem, 'shared/wp2-product-module-contract.json');

[
  'WP2 不建设第二套语义引擎',
  '统一语义引用',
  '在线 Composer 与离线 Foundry',
  'ModuleDeclarationPlan',
  'SpatialCompositionPlan',
  'archetype id 只允许存在于 fixture 标签',
  '十个 create fixtures',
  'Sol',
  'Terra',
  'Tester',
  'Auditor'
].forEach(function(text) {
  assert(design.indexOf(text) >= 0, 'WP2 design missing required statement: ' + text);
});

console.log('[WP2ProductModuleContract] canonical semantic refs, owner changes, two-phase compilation, guarded deltas, legacy bypass gap, global sync, Terra handoff, and completion gates passed');
