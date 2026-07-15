var crypto = require('crypto');
var defaults = require('./gdevelop-truth/project-defaults.json');
var dictionary = require('./capability-semantic-dictionary');
var sourceContract = require('./game-semantic-source');
var runtimeCodegen = require('./runtime-codegen');
var runtimeNames = require('./semantic-runtime-names');
var variableSerializer = require('./gdjs-variable-serializer');

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, {}); return value; }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0, 24); }
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'GDJSProjectAssembler'; throw error; }
var generatedName = runtimeNames.generatedName;
function referencedSubjects(source) {
  var subjects = {};
  source.assetIntents.forEach(function(intent) { subjects[intent.subject] = true; });
  source.layoutIntents.forEach(function(intent) { subjects[intent.subject] = true; intent.relations.forEach(function(relation) { relation.subjects.forEach(function(subject) { subjects[subject] = true; }); }); });
  return subjects;
}
function entityDeclaration(index, entity) {
  if (!entity.objectTypeRef) return null;
  var objectType = dictionary.resolveObjectType(index, entity.objectTypeRef);
  if (objectType.runtime.status !== 'executable' || !objectType.runtime.gdevelopType) fail('SEMANTIC_PROJECT_OBJECT_TYPE_UNAVAILABLE', entity.objectTypeRef + ' cannot be materialized by the pinned GDevelop runtime.');
  var objectName = runtimeNames.entityObjectName(entity.semanticId);
  var variables = entity.members.map(function(member) { return variableSerializer.serialize(runtimeNames.memberVariableName(entity.semanticId, member.semanticId), member.value); });
  var behaviors = entity.behaviorTypeRefs.map(function(reference) {
    var behaviorType = dictionary.resolveBehaviorType(index, reference);
    if (behaviorType.runtime.status !== 'executable' || !behaviorType.runtime.gdevelopType) fail('SEMANTIC_PROJECT_BEHAVIOR_TYPE_UNAVAILABLE', reference + ' cannot be materialized by the pinned GDevelop runtime.');
    return { name: runtimeNames.behaviorName(entity.semanticId, reference), type: behaviorType.runtime.gdevelopType, semanticRef: behaviorType.semantic_id };
  });
  return { semanticId: entity.semanticId, objectName: objectName, typeRef: objectType.semantic_id, type: objectType.runtime.gdevelopType, configuration: clone(objectType.configuration || null), variables: variables, behaviors: behaviors };
}
function materializeDeclaredLayers(layout, layoutPlan) {
  if (!layout || !Array.isArray(layout.layers) || !layout.layers.length) fail('GDJS_PROJECT_DEFAULTS_INVALID', 'Pinned GDevelop project defaults must provide one base layer.');
  var names = {};
  layout.layers.forEach(function(layer) { if (!layer || typeof layer.name !== 'string' || names[layer.name]) fail('GDJS_PROJECT_DEFAULTS_INVALID', 'Pinned GDevelop project defaults contain invalid layers.'); names[layer.name] = true; });
  (layoutPlan.intents || []).forEach(function(intent) {
    var placement = intent && intent.relation && intent.relation.placement, layerName = placement && placement.layer;
    if (typeof layerName !== 'string') fail('SEMANTIC_PROJECT_LAYOUT_LAYER_INVALID', 'Semantic layout intent has no dictionary-declared GDJS layer.');
    if (names[layerName]) return;
    var layer = clone(layout.layers[0]);
    layer.name = layerName;
    layout.layers.push(layer);
    names[layerName] = true;
  });
}
function projectFromAssembly(assembly, options) {
  options = options || {};
  var index = options.index || dictionary.loadIndex();
  var sourceTruth = sourceContract.validateSource(assembly.source, { index: index });
  var source = sourceContract.validateSource(assembly.realizedSource, { index: index });
  if (!assembly || assembly.documentKind !== 'semantic-runtime-assembly' || assembly.sourceHash !== sourceContract.sourceHash(sourceTruth) || assembly.realizedSourceHash !== sourceContract.sourceHash(source) || !assembly.spatialAssemblyRequest || assembly.spatialAssemblyRequest.sourceHash !== assembly.sourceHash || assembly.spatialAssemblyRequest.realizedSourceHash !== assembly.realizedSourceHash || JSON.stringify(stable(assembly.spatialAssemblyRequest.dictionarySource)) !== JSON.stringify(stable(assembly.dictionarySource))) fail('SEMANTIC_PROJECT_ASSEMBLY_INVALID', 'GDJS project assembly requires matching semantic source, component realization, and spatial assembly request.');
  var project = clone(defaults.project);
  if (!project.layouts || project.layouts.length !== 1) fail('GDJS_PROJECT_DEFAULTS_INVALID', 'Pinned GDevelop project defaults must provide exactly one initial layout.');
  var layout = project.layouts[0];
  var sceneName = generatedName('scene', source.game.semanticId);
  project.properties.name = source.game.name;
  project.firstLayout = sceneName;
  layout.name = sceneName;
  layout.mangledName = sceneName;
  layout.title = source.game.name;
  layout.events = clone(assembly.eventGraph.events);
  materializeDeclaredLayers(layout, assembly.layoutPlan);
  var declarations = source.entities.map(function(entity) { return entityDeclaration(index, entity); }).filter(Boolean);
  var sceneVariables = [];
  source.entities.filter(function(entity) { return !entity.objectTypeRef; }).forEach(function(entity) {
    entity.members.forEach(function(member) { sceneVariables.push(variableSerializer.serialize(runtimeNames.memberVariableName(entity.semanticId, member.semanticId), member.value)); });
  });
  var names = {};
  declarations.forEach(function(declaration) { if (names[declaration.objectName]) fail('SEMANTIC_PROJECT_OBJECT_NAME_DUPLICATE', 'Generated object name is duplicated: ' + declaration.objectName); names[declaration.objectName] = true; });
  var requiredSubjects = referencedSubjects(source);
  Object.keys(requiredSubjects).forEach(function(subject) {
    if (subject === source.game.semanticId) return;
    if (!declarations.some(function(declaration) { return declaration.semanticId === subject; })) fail('SEMANTIC_PROJECT_SUBJECT_UNMATERIALIZED', 'Asset or layout subject has no executable objectTypeRef: ' + subject);
  });
  project.objects = declarations.map(function(declaration) { return { name: declaration.objectName, type: declaration.type, variables: declaration.variables, behaviors: declaration.behaviors.map(function(behavior) { return { name: behavior.name, type: behavior.type }; }), effects: [] }; });
  layout.variables = sceneVariables;
  layout.instances = [];
  return { project: project, declarations: declarations, sceneVariables: sceneVariables, sceneName: sceneName };
}
function assemble(assembly, options) {
  var built = projectFromAssembly(assembly, options);
  var codeFiles = runtimeCodegen.generateProjectCodeFiles(built.project);
  var result = { schemaVersion: 2, documentKind: 'gdjs-project-seed', sourceHash: assembly.sourceHash, dictionarySource: clone(assembly.dictionarySource), assemblyHash: assembly.contentHash, sceneName: built.sceneName, objectDeclarations: built.declarations, sceneVariables: built.sceneVariables, assetBindingRequirements: clone(assembly.assetRequirements.requirements), layoutPlan: clone(assembly.layoutPlan), spatialAssemblyRequest: clone(assembly.spatialAssemblyRequest), project: built.project, generatedCode: codeFiles.map(function(file) { return { fileName: file.fileName, sceneName: file.sceneName, includes: file.includes, codeHash: hash(file.code) }; }) };
  result.contentHash = 'project-seed.' + hash(result);
  return result;
}
module.exports = { assemble: assemble, projectFromAssembly: projectFromAssembly, materializeDeclaredLayers: materializeDeclaredLayers, generatedName: generatedName };
