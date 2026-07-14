var path = require('path');
var fs = require('fs');
var crypto = require('crypto');
var runtimeCodegen = require('./runtime-codegen');
var adapters = require('./gdjs-asset-binding-dictionary');

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24); }
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'GDJSProjectAssetBinder'; throw error; }
function resourceName(slot) { return 'assets/' + slot.sha256 + '.' + String(slot.format || 'png').replace(/[^A-Za-z0-9]/g, ''); }
function slotResourceKind(slot) { return slot.resourceKind || (String(slot.format || '').toLowerCase() === 'png' ? 'image' : null); }

function bind(projectSeed, assetWorld) {
  if (!projectSeed || projectSeed.documentKind !== 'gdjs-project-seed' || !projectSeed.sourceHash || !projectSeed.project) fail('SEMANTIC_PROJECT_SEED_INVALID', 'A GDJS project seed is required.');
  if (!assetWorld || assetWorld.documentKind !== 'semantic-asset-world' || assetWorld.sourceHash !== projectSeed.sourceHash) fail('SEMANTIC_ASSET_WORLD_MISMATCH', 'Accepted semantic asset world must match the project seed sourceHash.');
  var worldById = {};
  (assetWorld.slots || []).forEach(function(slot) { if (!slot || !slot.semanticId || worldById[slot.semanticId]) fail('SEMANTIC_ASSET_WORLD_INVALID', 'Semantic asset world slots must have unique semanticId.'); if (!slot.path || !fs.existsSync(slot.path)) fail('SEMANTIC_ASSET_FILE_MISSING', 'Accepted asset file is unavailable: ' + slot.semanticId); if (!slotResourceKind(slot)) fail('SEMANTIC_ASSET_RESOURCE_KIND_MISSING', 'Accepted asset world slot must declare resourceKind: ' + slot.semanticId); worldById[slot.semanticId] = slot; });
  var project = clone(projectSeed.project), declarations = projectSeed.objectDeclarations || [], resources = [];
  (projectSeed.assetBindingRequirements || []).forEach(function(requirement) {
    var slot = worldById[requirement.semanticId];
    if (!slot) fail('SEMANTIC_ASSET_REQUIRED_MISSING', 'Accepted asset world is missing required semantic asset: ' + requirement.semanticId);
    var declaration = declarations.filter(function(item) { return item.semanticId === requirement.subject; })[0];
    if (!declaration) fail('SEMANTIC_ASSET_SUBJECT_MISSING', 'Asset subject has no materialized object: ' + requirement.subject);
    var adapter = declaration.configuration && adapters.resolve(declaration.configuration.configurationType);
    if (!adapter) fail('SEMANTIC_ASSET_BINDING_UNSUPPORTED', 'Asset binding dictionary has no adapter for official configuration: ' + declaration.typeRef);
    if (adapter.mode !== 'single-resource') fail('SEMANTIC_ASSET_BINDING_NOT_APPLICABLE', 'Official configuration does not accept one external resource: ' + declaration.typeRef);
    if (slotResourceKind(slot) !== adapter.resourceKind) fail('SEMANTIC_ASSET_RESOURCE_KIND_MISMATCH', 'Accepted asset resource kind ' + slotResourceKind(slot) + ' does not satisfy ' + declaration.typeRef + ': ' + adapter.resourceKind);
    if (Array.isArray(adapter.acceptedFormats) && adapter.acceptedFormats.indexOf(String(slot.format || '').toLowerCase()) < 0) fail('SEMANTIC_ASSET_FORMAT_MISMATCH', 'Accepted asset format does not satisfy ' + declaration.typeRef + ': ' + slot.format);
    var object = project.objects.filter(function(item) { return item.name === declaration.objectName; })[0];
    if (!object) fail('SEMANTIC_PROJECT_OBJECT_MISSING', 'Project seed lost object declaration: ' + declaration.objectName);
    var name = resourceName(slot);
    object.assetBinding = { adapterId: adapter.adapterId, configurationType: declaration.configuration.configurationType, resourceName: name, resourceKind: adapter.resourceKind, operations: adapter.operations };
    resources.push({ name: name, kind: adapter.resourceKind, file: slot.path });
  });
  project.__assetResources = resources;
  var codeFiles = runtimeCodegen.generateProjectCodeFiles(project);
  var result = { schemaVersion: 1, documentKind: 'gdjs-bound-project', sourceHash: projectSeed.sourceHash, projectSeedHash: projectSeed.contentHash, assetWorldHash: assetWorld.contentHash, project: project, resources: resources, generatedCode: codeFiles.map(function(file) { return { fileName: file.fileName, sceneName: file.sceneName, includes: file.includes }; }) };
  result.contentHash = 'bound-project.' + hash(result);
  return result;
}
module.exports = { bind: bind };
