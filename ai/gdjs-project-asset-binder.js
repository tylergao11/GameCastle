var path = require('path');
var fs = require('fs');
var crypto = require('crypto');
var runtimeCodegen = require('./runtime-codegen');
var adapters = require('./gdjs-asset-binding-dictionary');
var frameSet = require('./frame-set');
var assetWorldContract = require('./asset-world');

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, Object.create(null)); return value; }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0, 24); }
function fileHash(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'GDJSProjectAssetBinder'; throw error; }
function resourceName(slot) { return 'assets/' + slot.sha256 + '.' + String(slot.format || 'png').replace(/[^A-Za-z0-9]/g, ''); }
function slotResourceKind(slot) { return slot.resourceKind || (String(slot.format || '').toLowerCase() === 'png' ? 'image' : null); }
function isFrameSetSlot(slot) { return !!slot && !!slot.frameSet && frameSet.isFrameSet(slot.frameSet); }
function projectFrameSet(revision) {
  var accepted = frameSet.validate(revision), byId = {};
  accepted.frames.forEach(function(frame) { byId[frame.frameId] = frame; });
  var orderedStates = accepted.states.slice().sort(function(left, right) { return left.stateId === accepted.initialStateId ? -1 : right.stateId === accepted.initialStateId ? 1 : 0; });
  return { revisionId: accepted.revisionId, contentHash: accepted.contentHash, initialStateId: accepted.initialStateId, anchor: clone(accepted.anchor), states: orderedStates.map(function(state) {
    var frames = state.frameIds.map(function(frameId) { return byId[frameId]; }), durationMs = frames[0].durationMs;
    if (frames.some(function(frame) { return frame.durationMs !== durationMs; })) fail('FRAME_SET_GDJS_VARIABLE_TIMING_UNSUPPORTED', 'GDJS Sprite projection requires a uniform frame duration within each state.');
    return { stateId: state.stateId, loop: state.loop, durationMs: durationMs, frames: frames.map(function(frame) { return { resourceName: resourceName({ sha256: frame.sha256, format: accepted.format }), path: frame.path, sha256: frame.sha256 }; }) };
  }) };
}

function bindResources(projectSeed, assetWorld) {
  if (!projectSeed || projectSeed.schemaVersion !== 2 || projectSeed.documentKind !== 'gdjs-project-seed' || !projectSeed.sourceHash || !projectSeed.project || !projectSeed.layoutPlan || !projectSeed.spatialAssemblyRequest) fail('SEMANTIC_PROJECT_SEED_INVALID', 'A current GDJS project seed with a spatial assembly request is required.');
  assetWorld = assetWorldContract.validateAcceptedAssetWorld(assetWorld, { sourceHash: projectSeed.sourceHash });
  var worldById = {};
  (assetWorld.slots || []).forEach(function(slot) { if (!slot || !slot.semanticId || worldById[slot.semanticId]) fail('SEMANTIC_ASSET_WORLD_INVALID', 'Semantic asset world slots must have unique semanticId.'); if (isFrameSetSlot(slot)) { var accepted = frameSet.validate(slot.frameSet); accepted.frames.forEach(function(frame) { if (!fs.existsSync(frame.path)) fail('SEMANTIC_ASSET_FILE_MISSING', 'Accepted FrameSetRevision has an unavailable frame: ' + slot.semanticId); if (fileHash(frame.path) !== frame.sha256) fail('SEMANTIC_ASSET_FILE_HASH_MISMATCH', 'Accepted FrameSetRevision frame bytes changed: ' + slot.semanticId + '/' + frame.frameId); }); } else { if (!slot.path || !fs.existsSync(slot.path)) fail('SEMANTIC_ASSET_FILE_MISSING', 'Accepted asset file is unavailable: ' + slot.semanticId); if (fileHash(slot.path) !== slot.sha256) fail('SEMANTIC_ASSET_FILE_HASH_MISMATCH', 'Accepted asset file bytes changed: ' + slot.semanticId); if (!slotResourceKind(slot)) fail('SEMANTIC_ASSET_RESOURCE_KIND_MISSING', 'Accepted asset world slot must declare resourceKind: ' + slot.semanticId); } worldById[slot.semanticId] = slot; });
  var project = clone(projectSeed.project), declarations = projectSeed.objectDeclarations || [], resources = [], resourceByName = {};
  function addResource(resource) { if (!resourceByName[resource.name]) { resourceByName[resource.name] = true; resources.push(resource); } }
  (projectSeed.assetBindingRequirements || []).forEach(function(requirement) {
    var slot = worldById[requirement.semanticId];
    if (!slot) fail('SEMANTIC_ASSET_REQUIRED_MISSING', 'Accepted asset world is missing required semantic asset: ' + requirement.semanticId);
    var declaration = declarations.filter(function(item) { return item.semanticId === requirement.subject; })[0];
    if (!declaration) fail('SEMANTIC_ASSET_SUBJECT_MISSING', 'Asset subject has no materialized object: ' + requirement.subject);
    var adapter = declaration.configuration && (isFrameSetSlot(slot) ? adapters.resolveFrameSet(declaration.configuration.configurationType) : adapters.resolve(declaration.configuration.configurationType));
    if (!adapter) fail('SEMANTIC_ASSET_BINDING_UNSUPPORTED', 'Asset binding dictionary has no adapter for official configuration: ' + declaration.typeRef);
    if (isFrameSetSlot(slot)) {
      if (adapter.mode !== 'frame-set') fail('SEMANTIC_ASSET_BINDING_NOT_APPLICABLE', 'Official configuration does not accept a FrameSetRevision: ' + declaration.typeRef);
      var projection = projectFrameSet(slot.frameSet);
      if (adapter.resourceKind !== slot.frameSet.resourceKind || adapter.acceptedFormats.indexOf(String(slot.frameSet.format).toLowerCase()) < 0) fail('SEMANTIC_ASSET_FORMAT_MISMATCH', 'FrameSetRevision format does not satisfy ' + declaration.typeRef);
      var frameSetObject = project.objects.filter(function(item) { return item.name === declaration.objectName; })[0];
      if (!frameSetObject) fail('SEMANTIC_PROJECT_OBJECT_MISSING', 'Project seed lost object declaration: ' + declaration.objectName);
      frameSetObject.assetBinding = { adapterId: adapter.adapterId, configurationType: declaration.configuration.configurationType, resourceKind: adapter.resourceKind, operations: adapter.operations, frameSet: projection };
      projection.states.forEach(function(state) { state.frames.forEach(function(frame) { addResource({ name: frame.resourceName, kind: adapter.resourceKind, file: frame.path }); }); });
      return;
    }
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
  var result = { schemaVersion: 1, documentKind: 'gdjs-asset-bound-project-seed', sourceHash: projectSeed.sourceHash, dictionarySource: clone(projectSeed.dictionarySource), projectSeedHash: projectSeed.contentHash, assetWorldHash: assetWorld.contentHash, sceneName: projectSeed.sceneName, objectDeclarations: clone(projectSeed.objectDeclarations), assetBindingRequirements: clone(projectSeed.assetBindingRequirements), layoutPlan: clone(projectSeed.layoutPlan), spatialAssemblyRequest: clone(projectSeed.spatialAssemblyRequest), project: project, resources: resources, generatedCode: codeFiles.map(function(file) { return { fileName: file.fileName, sceneName: file.sceneName, includes: file.includes }; }) };
  result.contentHash = 'asset-bound-project-seed.' + hash(result);
  return result;
}
module.exports = { bindResources: bindResources, projectFrameSet: projectFrameSet };
