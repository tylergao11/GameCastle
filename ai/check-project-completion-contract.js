var assert = require('assert');
var fs = require('fs');
var path = require('path');
var contract = require('../shared/project-completion-contract.json');
var projectGraph = require('./project-pipeline-graph');

var root = path.resolve(__dirname, '..');
assert.equal(contract.contractId, 'gamecastle.project-completion');
assert.equal(contract.owner, 'ProjectCompletionArchitecture');
Object.keys(contract.truthSources).forEach(function(key) { assert(fs.existsSync(path.join(root, contract.truthSources[key])), 'missing truth source: ' + key); });

var foundationIds = contract.completedFoundations.map(function(item) { return item.id; });
assert.deepEqual(foundationIds, ['semantic-engine', 'asset-engine', 'cloud-asset-engine']);
assert.equal(new Set(foundationIds).size, foundationIds.length);

var workIds = contract.workPackages.map(function(item) { return item.id; });
assert.deepEqual(workIds, ['WP0', 'WP1', 'WP2', 'WP3', 'WP4', 'WP5', 'WP6', 'WP7', 'WP8']);
assert.equal(new Set(workIds).size, workIds.length);
contract.workPackages.forEach(function(workPackage) {
  assert(workPackage.name && workPackage.owner && workPackage.priority && workPackage.status === 'designed', 'invalid work package header: ' + workPackage.id);
  ['dependsOn', 'scope', 'inputs', 'outputs', 'forbidden', 'completionEvidence'].forEach(function(field) { assert(Array.isArray(workPackage[field]) && workPackage[field].length > 0, workPackage.id + ' missing ' + field); });
  workPackage.dependsOn.forEach(function(dependency) { assert(foundationIds.indexOf(dependency) >= 0 || workIds.indexOf(dependency) >= 0, workPackage.id + ' unknown dependency: ' + dependency); });
});

var milestoneIds = contract.milestones.map(function(item) { return item.id; });
assert.equal(new Set(milestoneIds).size, milestoneIds.length);
contract.milestones.forEach(function(milestone) { milestone.requires.forEach(function(requirement) { assert(workIds.indexOf(requirement) >= 0 || milestoneIds.indexOf(requirement) >= 0, milestone.id + ' unknown requirement: ' + requirement); }); });

var artifactOwners = {};
Object.keys(contract.artifacts).forEach(function(name) { var artifact = contract.artifacts[name]; assert(artifact.owner, 'artifact missing owner: ' + name); artifactOwners[name] = artifact.owner; if (!artifact.source) assert(Array.isArray(artifact.required) && artifact.required.length > 0, 'artifact missing required fields: ' + name); });
assert.equal(artifactOwners.AssetWorld, 'AssetEngine');
assert.equal(artifactOwners.ProjectWorld, 'ProjectWorld');
assert.equal(artifactOwners.PublishReceipt, 'Publisher');

var portIds = contract.ports.map(function(port) { return port.id; });
assert.equal(new Set(portIds).size, portIds.length);
contract.ports.forEach(function(port) { assert(port.owner && Array.isArray(port.methods) && port.methods.length > 0, 'invalid port: ' + port.id); });
['no-ui-owned-domain-truth', 'no-smoke-node-counted-as-live-completion', 'no-required-sketch-upload-or-template-wizard', 'no-publish-with-blocking-debt-or-failed-validation', 'no-personal-project-data-in-public-asset-cloud', 'no-legacy-runtime-schema-alias-or-dual-write'].forEach(function(gate) { assert(contract.hardGates.indexOf(gate) >= 0, 'missing hard gate: ' + gate); });

var projectSpec = projectGraph.getProjectGraphSpec();
assert(projectSpec.nodeSequence.some(function(node) { return projectSpec.nodes[node].status === 'wired-langgraph-smoke'; }), 'WP0 must remain designed while project nodes are smoke-only');
assert.equal(contract.workPackages[0].id, 'WP0');
assert.equal(contract.workPackages[0].owner, 'ProjectWeaveRuntime');

var docs = [
  'docs/project-completion-architecture.md',
  'docs/project-completion-boundaries.md',
  'docs/project-completion-terra-roadmap.md',
  'docs/project-completion-test-matrix.md'
].map(function(file) { assert(fs.existsSync(path.join(root, file)), 'missing project completion doc: ' + file); return fs.readFileSync(path.join(root, file), 'utf8'); });
workIds.forEach(function(id) { assert(docs.some(function(text) { return text.indexOf(id) >= 0; }), 'docs missing work package: ' + id); });
assert(docs[0].indexOf('wired-langgraph-smoke') >= 0);
assert(docs[1].indexOf('公共资产云不等于个人项目云') >= 0);
assert(docs[2].indexOf('completionEvidence') >= 0);
assert(docs[3].indexOf('Local Creator Complete') >= 0);

console.log('[ProjectCompletionContract] milestones, WP0-WP8, owners, artifacts, ports, gates, docs, and honest smoke status passed');
