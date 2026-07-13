var assert = require('assert').strict;
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
function readJson(relativePath) { return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8')); }
function resolvePointer(document, ref, prefix) {
  assert(ref.indexOf(prefix + '#/') === 0, 'invalid ' + prefix + ' ref: ' + ref);
  return ref.slice((prefix + '#/').length).split('/').reduce(function(value, key) {
    return value && Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined;
  }, document);
}

var contract = readJson('shared/wp2-product-module-contract.json');
var truth = readJson('shared/wp2-truth-source-registry.json');
var mechanics = readJson('shared/wp2-mechanic-registry.json');
var blueprints = readJson('shared/wp2-fun-blueprint-dictionary.json');
var sources = readJson('shared/wp2-template-source-catalog.json');
var templateIr = readJson('shared/wp2-template-ir-contract.json');
var legacy = readJson('shared/wp2-legacy-regression-suite.json');
var semantics = readJson('ai/semantic-mapping/semantic-feedback.json');
var runtimeTruth = readJson('ai/gdevelop-truth/runtime-truth.json');
var universe = readJson('ai/gdevelop-truth/capability-universe.json');
var packageJson = readJson('package.json');

assert.equal(mechanics.closedEnumeration, false);
assert(contract.artifactContracts.ModuleLineageProjection, 'ModuleLineageProjection artifact contract missing');
assert.equal(contract.artifactContracts.ModuleLineageProjection.owner, contract.owners.ModuleLineageProjection.outputs[0]);
assert.equal(contract.artifactContracts.ModuleLineageProjection.appendOnly, true);
assert.equal(mechanics.revisionPolicy.approvedRevisionRecordsAreAppendOnly, true);
assert.equal(mechanics.revisionPolicy.currentAliasForbiddenInBuildArtifacts, true);
Object.keys(mechanics.mechanics).forEach(function(id) {
  var item = mechanics.mechanics[id];
  assert.equal(item.id, id);
  item.semanticRefs.forEach(function(ref) { assert.notEqual(resolvePointer(semantics, ref, 'semantic-dictionary'), undefined, 'unresolved mechanic semantic ref: ' + ref); });
});
assert.equal(blueprints.closedFamilyEnumeration, false);
assert.equal(blueprints.familyPolicy.familyIdForbiddenAsGeneratorDispatch, true);
blueprints.curationBacklog.forEach(function(item) { item.familyRefs.forEach(function(ref) { assert(blueprints.families[ref], 'unknown family ref: ' + ref); }); });
assert.equal(templateIr.lossAccounting.silentLossAllowed, false);
assert(templateIr.lineage.futureLineageForbidden.indexOf('candidateToModule') >= 0);
assert.equal(templateIr.lineage.appendOnlyProjectionOwner, 'ModuleLineageProjection');
assert.equal(sources.licensePolicy.codeLicenseDoesNotLicenseBundledAssets, true);
assert(sources.sources.find(function(item) { return item.sourceId === 'gdevelop.gdjs-tests' && item.licenseDecision === 'structure-only'; }));
assert(legacy.forbiddenUses.indexOf('template coverage claim') >= 0);
assert(!Object.prototype.hasOwnProperty.call(contract.acceptanceMatrix, 'archetypes'), 'legacy archetypes must not live in core acceptance matrix');
assert.equal(contract.acceptanceMatrix.legacyRegressionSuite, 'shared/wp2-legacy-regression-suite.json');
assert.equal(contract.acceptanceMatrix.blindIngestionCoverage.requiresPreAuditUnseenTemplate, true);
['TemplateIntake', 'TemplateNormalizer', 'ProductModuleFoundry', 'ModuleRepository', 'ProductModulePlanner', 'ProductModuleCompiler'].forEach(function(owner) { assert(contract.acceptanceMatrix.blindIngestionCoverage.protectedOwnerContracts.indexOf(owner) >= 0, 'blind ingestion missing protected owner: ' + owner); });
['template-id dispatch', 'archetype-id dispatch', 'template-specific Foundry splitter'].forEach(function(rule) { assert(contract.acceptanceMatrix.blindIngestionCoverage.forbiddenExtensionPoints.indexOf(rule) >= 0, 'blind ingestion missing forbidden extension: ' + rule); });
['truth:extract', 'truth:check', 'capabilities:extract', 'capabilities:check', 'semantics:extract', 'semantics:check'].forEach(function(name) { assert(packageJson.scripts[name], 'missing reproducibility command: ' + name); });
truth.sources.filter(function(item) { return item.path && item.truthKind !== 'project-state'; }).forEach(function(item) { assert(fs.existsSync(path.join(root, item.path)), 'truth source missing: ' + item.id); });
var expectedSource = path.resolve(root, '..', 'GDevelop-master');
assert.equal(path.resolve(runtimeTruth.source.dir), expectedSource, 'runtime truth points at stale source checkout');
assert.equal(path.resolve(universe.source.dir), expectedSource, 'capability universe points at stale source checkout');
var oldPathHits = [];
['README.md', 'ai/README.md', 'docs/architecture.md', 'scripts/extract-gdevelop-truth.js', 'scripts/extract-gdevelop-capability-universe.js', 'scripts/prepare-gdjs-runtime.js'].forEach(function(file) { if (fs.readFileSync(path.join(root, file), 'utf8').indexOf('C:\\Ai\\GDevelop-master') >= 0) oldPathHits.push(file); });
assert.deepEqual(oldPathHits, [], 'stale GDevelop source path remains');
var moduleFiles = fs.readdirSync(path.join(root, 'ai', 'product-modules')).filter(function(name) { return /\.json$/.test(name); });
moduleFiles.forEach(function(file) { var text = fs.readFileSync(path.join(root, 'ai', 'product-modules', file), 'utf8'); assert(text.indexOf('GDJS/tests') < 0, 'GDJS test binary/path promoted into module: ' + file); });

console.log('[WP2Foundation] open blueprint taxonomy, mechanic registry, truth DAG, TemplateIR lineage/loss, source rights, legacy isolation, and drift gates passed');
