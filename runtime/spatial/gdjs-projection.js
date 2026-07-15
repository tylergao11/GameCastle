var crypto = require('crypto');
var assembly = require('./assembly');
var candidate = require('./candidate');
var runtimeCodegen = require('../../ai/runtime-codegen');

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function stable(value) { return assembly.stable(value); }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0, 24); }
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'GDJSSpatialAdapter'; throw error; }
function object(value, label, code) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, label + ' must be an object'); return value; }
function array(value, label, code) { if (!Array.isArray(value)) fail(code, label + ' must be an array'); return value; }
function text(value, label, code) { if (typeof value !== 'string' || !value.trim()) fail(code, label + ' must be non-empty text'); return value.trim(); }
function finite(value, label, code) { if (typeof value !== 'number' || !Number.isFinite(value)) fail(code, label + ' must be finite'); return value; }
function allowed(value, fields, label, code) { Object.keys(value).forEach(function(field) { if (fields.indexOf(field) < 0) fail(code, label + ' contains unknown field: ' + field); }); }
function same(left, right) { return JSON.stringify(stable(left)) === JSON.stringify(stable(right)); }
function verifyContentHash(value, prefix, label, code) {
  var contentHash = text(value.contentHash, label + '.contentHash', code), core = clone(value);
  delete core.contentHash;
  if (contentHash !== prefix + hash(core)) fail(code, label + '.contentHash does not bind its document content');
  return contentHash;
}
function generatedCodeSummary(project, code) {
  var files;
  try { files = runtimeCodegen.generateProjectCodeFiles(project); }
  catch (error) { fail('GDJS_SPATIAL_CODEGEN_INVALID', String(error.message || error)); }
  return files.map(function(file) { return { fileName: file.fileName, sceneName: file.sceneName, includes: file.includes, codeHash: hash(file.code) }; });
}

function validateAssetBoundSeed(input, value, code) {
  object(value, 'GDJS asset-bound project seed', code);
  if (value.schemaVersion !== 1 || value.documentKind !== 'gdjs-asset-bound-project-seed') fail(code, 'GDJS Spatial Adapter requires a current asset-bound project seed');
  if (text(value.sourceHash, 'GDJS asset-bound project seed.sourceHash', code) !== input.sourceHash || text(value.assetWorldHash, 'GDJS asset-bound project seed.assetWorldHash', code) !== input.assetWorldHash || text(value.contentHash, 'GDJS asset-bound project seed.contentHash', code) !== input.assetBoundProjectSeedHash) fail(code, 'GDJS asset-bound project seed does not match the active Spatial Assembly Input');
  if (text(value.sceneName, 'GDJS asset-bound project seed.sceneName', code) !== input.sceneCanvas.sceneName) fail(code, 'GDJS asset-bound project seed has a different selected scene');
  object(value.project, 'GDJS asset-bound project seed.project', code); array(value.project.layouts, 'GDJS asset-bound project seed.project.layouts', code);
  var layout = value.project.layouts.filter(function(item) { return item && item.name === input.sceneCanvas.sceneName; })[0];
  if (!layout) fail(code, 'GDJS asset-bound project seed has no selected scene layout');
  var core = clone(value);
  delete core.contentHash;
  if (value.contentHash !== 'asset-bound-project-seed.' + hash(core)) fail(code, 'GDJS asset-bound project seed.contentHash does not bind its document content');
  try { assembly.validateAssemblyInputAgainstSeed(input, value); }
  catch (error) { fail(code, 'GDJS Spatial Adapter requires scene facts derived from the exact asset-bound seed: ' + String(error && error.message || error)); }
  return { seed: value, layout: layout };
}
function projectedInstance(item) {
  var placement = item.placement;
  return {
    name: item.objectName,
    x: placement.x,
    y: placement.y,
    zOrder: placement.zOrder,
    angle: placement.angle,
    customSize: true,
    width: placement.width,
    height: placement.height,
    layer: placement.layer,
    numberProperties: [],
    stringProperties: [],
    initialVariables: []
  };
}
function sourceInstance(item) {
  var instance = projectedInstance(item);
  return { subject: item.placement.subject, objectName: item.objectName, x: instance.x, y: instance.y, width: instance.width, height: instance.height, angle: instance.angle, layer: instance.layer, zOrder: instance.zOrder };
}
function buildProjection(input, assetBoundSeed, checked, basis) {
  var code = 'GDJS_SPATIAL_PROJECTION_INVALID', seed = validateAssetBoundSeed(input, assetBoundSeed, code), project = clone(seed.seed.project), layout = project.layouts.filter(function(item) { return item && item.name === input.sceneCanvas.sceneName; })[0];
  layout.instances = checked.placements.map(projectedInstance);
  var result = {
    schemaVersion: 1,
    documentKind: 'gdjs-spatial-projection',
    sourceHash: input.sourceHash,
    assetWorldHash: input.assetWorldHash,
    spatialAssemblyInputHash: input.contentHash,
    assetBoundProjectSeedHash: input.assetBoundProjectSeedHash,
    sceneName: input.sceneCanvas.sceneName,
    basis: basis,
    instances: checked.placements.map(sourceInstance),
    project: project,
    generatedCode: generatedCodeSummary(project, code)
  };
  result.contentHash = 'gdjs-spatial-projection.' + hash(result);
  return validateProjection(input, assetBoundSeed, result);
}
function validateProjection(inputValue, assetBoundSeed, value) {
  var input = assembly.validateAssemblyInput(inputValue), code = 'GDJS_SPATIAL_PROJECTION_INVALID';
  var seed = validateAssetBoundSeed(input, assetBoundSeed, code);
  object(value, 'GDJSSpatialProjection', code);
  allowed(value, ['schemaVersion', 'documentKind', 'sourceHash', 'assetWorldHash', 'spatialAssemblyInputHash', 'assetBoundProjectSeedHash', 'sceneName', 'basis', 'instances', 'project', 'generatedCode', 'contentHash'], 'GDJSSpatialProjection', code);
  if (value.schemaVersion !== 1 || value.documentKind !== 'gdjs-spatial-projection') fail(code, 'GDJSSpatialProjection has an invalid kind or version');
  if (text(value.sourceHash, 'GDJSSpatialProjection.sourceHash', code) !== input.sourceHash || text(value.assetWorldHash, 'GDJSSpatialProjection.assetWorldHash', code) !== input.assetWorldHash || text(value.spatialAssemblyInputHash, 'GDJSSpatialProjection.spatialAssemblyInputHash', code) !== input.contentHash || text(value.assetBoundProjectSeedHash, 'GDJSSpatialProjection.assetBoundProjectSeedHash', code) !== input.assetBoundProjectSeedHash || text(value.sceneName, 'GDJSSpatialProjection.sceneName', code) !== input.sceneCanvas.sceneName) fail(code, 'GDJSSpatialProjection does not bind the active Spatial Assembly Input');
  object(value.basis, 'GDJSSpatialProjection.basis', code); allowed(value.basis, ['documentKind', 'contentHash'], 'GDJSSpatialProjection.basis', code);
  var basisKind = text(value.basis.documentKind, 'GDJSSpatialProjection.basis.documentKind', code);
  if (['spatial-layout-candidate', 'spatial-layout-resolution'].indexOf(basisKind) < 0) fail(code, 'GDJSSpatialProjection basis has an unsupported kind');
  text(value.basis.contentHash, 'GDJSSpatialProjection.basis.contentHash', code);
  array(value.instances, 'GDJSSpatialProjection.instances', code); object(value.project, 'GDJSSpatialProjection.project', code); array(value.generatedCode, 'GDJSSpatialProjection.generatedCode', code);
  var expectedSubjects = Object.create(null);
  input.sceneSubjects.forEach(function(subject) { expectedSubjects[subject.subject] = subject; });
  var seen = Object.create(null), normalized = value.instances.map(function(instance, index) {
    var label = 'GDJSSpatialProjection.instances[' + index + ']'; object(instance, label, code); allowed(instance, ['subject', 'objectName', 'x', 'y', 'width', 'height', 'angle', 'layer', 'zOrder'], label, code);
    var subject = text(instance.subject, label + '.subject', code), objectName = text(instance.objectName, label + '.objectName', code);
    if (!expectedSubjects[subject] || expectedSubjects[subject].objectName !== objectName || seen[subject]) fail(code, 'GDJSSpatialProjection has an invalid scene instance identity: ' + subject); seen[subject] = true;
    return { subject: subject, objectName: objectName, x: finite(instance.x, label + '.x', code), y: finite(instance.y, label + '.y', code), width: finite(instance.width, label + '.width', code), height: finite(instance.height, label + '.height', code), angle: finite(instance.angle, label + '.angle', code), layer: typeof instance.layer === 'string' ? instance.layer : fail(code, label + '.layer must be text'), zOrder: finite(instance.zOrder, label + '.zOrder', code) };
  });
  if (normalized.length !== input.sceneSubjects.length || input.sceneSubjects.some(function(subject) { return !seen[subject.subject]; })) fail(code, 'GDJSSpatialProjection must materialize all and only accepted scene subjects');
  var expectedProject = clone(seed.seed.project), expectedLayout = expectedProject.layouts.filter(function(item) { return item && item.name === input.sceneCanvas.sceneName; })[0];
  expectedLayout.instances = normalized.map(function(instance) { return { name: instance.objectName, x: instance.x, y: instance.y, zOrder: instance.zOrder, angle: instance.angle, customSize: true, width: instance.width, height: instance.height, layer: instance.layer, numberProperties: [], stringProperties: [], initialVariables: [] }; });
  if (!same(value.project, expectedProject)) fail(code, 'GDJSSpatialProjection project must equal the active asset-bound seed plus its exact projection instances');
  if (!same(value.generatedCode, generatedCodeSummary(value.project, code))) fail(code, 'GDJSSpatialProjection generated code must be regenerated from its projected GDJS project');
  verifyContentHash(value, 'gdjs-spatial-projection.', 'GDJSSpatialProjection', code);
  return clone(value);
}
function createCandidateProjection(inputValue, assetBoundSeed, candidateValue) {
  var checked = candidate.validateLayoutCandidate(inputValue, candidateValue);
  return buildProjection(checked.input, assetBoundSeed, checked, { documentKind: 'spatial-layout-candidate', contentHash: checked.candidate.contentHash });
}
function validateAcceptedResolutionEvidence(inputValue, assetBoundSeed, resolutionValue, evidenceValue) {
  var code = 'GDJS_SPATIAL_ACCEPTANCE_EVIDENCE_INVALID', checked, candidateChecked, projection, preview;
  try {
    checked = candidate.validateSpatialResolution(inputValue, resolutionValue);
    object(evidenceValue, 'Accepted spatial evidence', code);
    allowed(evidenceValue, ['candidate', 'candidateProjection', 'preview'], 'Accepted spatial evidence', code);
    candidateChecked = candidate.validateLayoutCandidate(checked.input, evidenceValue.candidate);
    if (checked.resolution.acceptedCandidateHash !== candidateChecked.candidate.contentHash || checked.resolution.acceptedAtRound <= candidateChecked.candidate.round) fail(code, 'Spatial resolution does not bind a candidate accepted in a later round');
    projection = validateProjection(checked.input, assetBoundSeed, evidenceValue.candidateProjection);
    if (projection.basis.documentKind !== 'spatial-layout-candidate' || projection.basis.contentHash !== candidateChecked.candidate.contentHash) fail(code, 'Acceptance evidence projection must derive from the exact accepted candidate');
    if (!same(projection.instances, candidateChecked.placements.map(sourceInstance))) fail(code, 'Acceptance evidence projection instances must exactly match the accepted candidate');
    preview = candidate.validatePreviewEvidence(checked.input, projection, evidenceValue.preview);
    if (checked.resolution.candidateProjectionHash !== projection.contentHash || checked.resolution.previewHash !== preview.contentHash) fail(code, 'Spatial resolution does not bind the supplied projection and preview evidence');
    if (!same(checked.resolution.placements, candidateChecked.placements.map(function(item) { return Object.assign({ objectName: item.objectName }, clone(item.placement)); }))) fail(code, 'Spatial resolution placements must exactly match the accepted candidate');
  } catch (error) {
    if (error && error.code === code) throw error;
    fail(code, 'Final GDJS projection requires exact accepted candidate, projection, and preview evidence: ' + String(error && error.message || error));
  }
  return checked;
}
function createAcceptedProjection(inputValue, assetBoundSeed, resolutionValue, evidenceValue) {
  var checked = validateAcceptedResolutionEvidence(inputValue, assetBoundSeed, resolutionValue, evidenceValue);
  return buildProjection(checked.input, assetBoundSeed, checked, { documentKind: 'spatial-layout-resolution', contentHash: checked.resolution.contentHash });
}

module.exports = { createCandidateProjection: createCandidateProjection, createAcceptedProjection: createAcceptedProjection, validateProjection: validateProjection, validateAcceptedResolutionEvidence: validateAcceptedResolutionEvidence };
