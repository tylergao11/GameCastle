var crypto = require('crypto');
var defaults = require('./gdevelop-truth/project-defaults.json');
var dictionary = require('./capability-semantic-dictionary');
var sourceContract = require('./game-semantic-source');
var runtimeCodegen = require('./runtime-codegen');

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, {}); return value; }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0, 24); }
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'GDJSProjectAssembler'; throw error; }
function generatedName(prefix, semanticId) { return prefix + '_' + String(semanticId).replace(/[^A-Za-z0-9_]/g, '_'); }
function scalarVariable(name, value) {
  if (typeof value === 'number' && isFinite(value)) return { name: name, type: 'number', value: value };
  if (typeof value === 'string') return { name: name, type: 'string', value: value };
  if (typeof value === 'boolean') return { name: name, type: 'boolean', value: value };
  fail('SEMANTIC_PROJECT_MEMBER_UNMATERIALIZABLE', 'Semantic member ' + name + ' has no GDevelop scalar variable representation.');
}
function referencedSubjects(source) {
  var subjects = {};
  source.assetIntents.forEach(function(intent) { subjects[intent.subject] = true; });
  source.layoutIntents.forEach(function(intent) { subjects[intent.subject] = true; intent.relations.forEach(function(relation) { relation.subjects.forEach(function(subject) { subjects[subject] = true; }); }); });
  return subjects;
}
function layoutInstances(layoutPlan, declarations, project) {
  var bySemanticId = {}; declarations.forEach(function(declaration) { bySemanticId[declaration.semanticId] = declaration; });
  var width = project.properties.windowWidth, height = project.properties.windowHeight;
  return layoutPlan.intents.map(function(intent) { var declaration = bySemanticId[intent.subject], placement = intent.relation && intent.relation.placement; if (!declaration || !placement) fail('SEMANTIC_LAYOUT_UNMATERIALIZABLE', 'Layout intent cannot materialize: ' + intent.semanticId); return { name: declaration.objectName, x: width * placement.xFraction, y: height * placement.yFraction, zOrder: placement.zOrder, layer: placement.layer, angle: 0, customSize: false, width: 0, height: 0, numberProperties: [], stringProperties: [], initialVariables: [] }; });
}
function entityDeclaration(index, entity) {
  if (!entity.objectTypeRef) return null;
  var objectType = dictionary.resolveObjectType(index, entity.objectTypeRef);
  if (objectType.runtime.status !== 'executable' || !objectType.runtime.gdevelopType) fail('SEMANTIC_PROJECT_OBJECT_TYPE_UNAVAILABLE', entity.objectTypeRef + ' cannot be materialized by the pinned GDevelop runtime.');
  var objectName = generatedName('entity', entity.semanticId);
  var variables = entity.members.map(function(member) { return scalarVariable(generatedName('member_' + entity.semanticId, member.semanticId), member.value); });
  var behaviors = entity.behaviorTypeRefs.map(function(reference) {
    var behaviorType = dictionary.resolveBehaviorType(index, reference);
    if (behaviorType.runtime.status !== 'executable' || !behaviorType.runtime.gdevelopType) fail('SEMANTIC_PROJECT_BEHAVIOR_TYPE_UNAVAILABLE', reference + ' cannot be materialized by the pinned GDevelop runtime.');
    return { name: generatedName('behavior_' + entity.semanticId, hash(reference)), type: behaviorType.runtime.gdevelopType, semanticRef: behaviorType.semantic_id };
  });
  return { semanticId: entity.semanticId, objectName: objectName, typeRef: objectType.semantic_id, type: objectType.runtime.gdevelopType, configuration: clone(objectType.configuration || null), variables: variables, behaviors: behaviors };
}
function projectFromAssembly(assembly, options) {
  options = options || {};
  var index = options.index || dictionary.buildIndex();
  var source = sourceContract.validateSource(assembly.source, { index: index });
  if (!assembly || assembly.documentKind !== 'semantic-runtime-assembly' || assembly.sourceHash !== sourceContract.sourceHash(source)) fail('SEMANTIC_PROJECT_ASSEMBLY_INVALID', 'GDJS project assembly requires one matching semantic-runtime-assembly and GameSemanticSource.');
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
  var declarations = source.entities.map(function(entity) { return entityDeclaration(index, entity); }).filter(Boolean);
  var names = {};
  declarations.forEach(function(declaration) { if (names[declaration.objectName]) fail('SEMANTIC_PROJECT_OBJECT_NAME_DUPLICATE', 'Generated object name is duplicated: ' + declaration.objectName); names[declaration.objectName] = true; });
  var requiredSubjects = referencedSubjects(source);
  Object.keys(requiredSubjects).forEach(function(subject) {
    if (subject === source.game.semanticId) return;
    if (!declarations.some(function(declaration) { return declaration.semanticId === subject; })) fail('SEMANTIC_PROJECT_SUBJECT_UNMATERIALIZED', 'Asset or layout subject has no executable objectTypeRef: ' + subject);
  });
  project.objects = declarations.map(function(declaration) { return { name: declaration.objectName, type: declaration.type, variables: declaration.variables, behaviors: declaration.behaviors.map(function(behavior) { return { name: behavior.name, type: behavior.type }; }), effects: [] }; });
  layout.instances = layoutInstances(assembly.layoutPlan, declarations, project);
  return { project: project, declarations: declarations, sceneName: sceneName };
}
function assemble(assembly, options) {
  var built = projectFromAssembly(assembly, options);
  var codeFiles = runtimeCodegen.generateProjectCodeFiles(built.project);
  var result = { schemaVersion: 1, documentKind: 'gdjs-project-seed', sourceHash: assembly.sourceHash, dictionarySource: clone(assembly.dictionarySource), assemblyHash: assembly.contentHash, sceneName: built.sceneName, objectDeclarations: built.declarations, assetBindingRequirements: clone(assembly.assetRequirements.requirements), layoutPlan: clone(assembly.layoutPlan), project: built.project, generatedCode: codeFiles.map(function(file) { return { fileName: file.fileName, sceneName: file.sceneName, includes: file.includes, codeHash: hash(file.code) }; }) };
  result.contentHash = 'project-seed.' + hash(result);
  return result;
}
module.exports = { assemble: assemble, projectFromAssembly: projectFromAssembly, generatedName: generatedName };
