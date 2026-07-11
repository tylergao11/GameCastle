var assert = require('assert');
var fs = require('fs');
var path = require('path');
var componentCatalog = require('./component-catalog');
var moduleCompiler = require('./module-compiler');
var semanticFeedback = require('./semantic-feedback');

var UNIVERSE_PATH = path.join(__dirname, 'gdevelop-truth', 'capability-universe.json');
var MODULES_DIR = path.join(__dirname, 'product-modules');
var ALLOWED_KINDS = { action: true, condition: true, 'number-expression': true, 'string-expression': true };

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function object(value, label) { assert(value && typeof value === 'object' && !Array.isArray(value), label + ' must be an object'); }
function array(value, label) { assert(Array.isArray(value), label + ' must be an array'); }

function indexUniverse(universe) {
  assert.strictEqual(universe.schemaVersion, 1, 'unsupported capability universe schemaVersion');
  object(universe.source, 'source');
  array(universe.source.files, 'source.files');
  array(universe.families, 'families');
  array(universe.capabilities, 'capabilities');
  array(universe.runtimeOverrides, 'runtimeOverrides');
  array(universe.unresolvedDeclarations, 'unresolvedDeclarations');
  assert(universe.source.files.length > 0, 'capability universe has no source files');
  assert(universe.capabilities.length > 0, 'capability universe is empty');
  assert.strictEqual(universe.unresolvedDeclarations.length, 0, 'capability universe contains unresolved declarations');

  var sourcePaths = {};
  var sourceLines = {};
  function validateSourceRef(source, label) {
    object(source, label);
    assert(sourcePaths[source.path], label + ' refers to unknown source ' + source.path);
    assert(Number.isInteger(source.line) && source.line > 0, label + ' has invalid line');
    if (!/JsExtension\.js$/i.test(source.path)) return;
    if (!sourceLines[source.path]) sourceLines[source.path] = fs.readFileSync(path.join(universe.source.dir, source.path), 'utf8').split(/\r?\n/);
    var lines = sourceLines[source.path];
    var nearby = lines.slice(Math.max(0, source.line - 4), Math.min(lines.length, source.line + 3)).join('\n');
    assert(/\.(?:add|Add)(?:Scoped)?(?:Action|Condition|Expression|StrExpression|ExpressionAndCondition|ExpressionAndConditionAndAction|DuplicatedAction|DuplicatedCondition|DuplicatedExpression)\s*\(/.test(nearby), label + ' does not point to a JS declaration API');
  }
  universe.source.files.forEach(function(source) {
    assert(source.path && !sourcePaths[source.path], 'duplicate or missing source path: ' + source.path);
    assert(/^[a-f0-9]{40}$/.test(source.sha1), 'invalid source hash: ' + source.path);
    assert(Number.isInteger(source.declarations) && source.declarations >= 0, 'invalid declaration count: ' + source.path);
    assert(Number.isInteger(source.staticDeclarations) && source.staticDeclarations >= 0, 'invalid static declaration count: ' + source.path);
    assert(source.enumeration === 'static-source' || source.enumeration === 'executed-js-factory', 'invalid enumeration mode: ' + source.path);
    if (source.enumeration === 'executed-js-factory' && source.staticDeclarations > 0) assert(source.declarations > 0, 'JS factory silently enumerated zero declarations: ' + source.path);
    assert(Number.isInteger(source.capabilities) && source.capabilities >= 0, 'invalid capability count: ' + source.path);
    assert.strictEqual(source.unresolved, 0, 'source contains unresolved declarations: ' + source.path);
    assert(Number.isInteger(source.runtimeMarkers) && source.runtimeMarkers >= 0, 'invalid runtime marker count: ' + source.path);
    assert(Number.isInteger(source.runtimeBindings) && source.runtimeBindings >= 0, 'invalid runtime binding count: ' + source.path);
    assert.strictEqual(source.runtimeUnresolved, 0, 'source contains unresolved runtime bindings: ' + source.path);
    sourcePaths[source.path] = true;
  });

  var families = {};
  universe.families.forEach(function(family) {
    assert(family.id && !families[family.id], 'duplicate or missing family id: ' + family.id);
    array(family.members, family.id + '.members');
    assert(family.members.length >= 2, family.id + ' must expand to at least two capabilities');
    array(family.parameters, family.id + '.parameters');
    array(family.parameterMacros, family.id + '.parameterMacros');
    object(family.flags, family.id + '.flags');
    assert(typeof family.valueType === 'string' && family.valueType.length > 0, family.id + ' has invalid valueType');
    validateSourceRef(family.source, family.id + '.source');
    families[family.id] = family;
  });

  var capabilities = {};
  universe.capabilities.forEach(function(capability) {
    assert(capability.id && !capabilities[capability.id], 'duplicate or missing capability id: ' + capability.id);
    assert(ALLOWED_KINDS[capability.kind], capability.id + ' has invalid kind ' + capability.kind);
    assert(capability.extension && capability.localId, capability.id + ' lacks identity fields');
    object(capability.owner, capability.id + '.owner');
    if (capability.inherits) {
      assert.strictEqual(capability.parameters, undefined, capability.id + ' duplicates inherited parameters');
      assert.strictEqual(capability.parameterMacros, undefined, capability.id + ' duplicates inherited parameter macros');
      assert.strictEqual(capability.flags, undefined, capability.id + ' duplicates inherited flags');
    } else {
      array(capability.parameters, capability.id + '.parameters');
      array(capability.parameterMacros, capability.id + '.parameterMacros');
      object(capability.flags, capability.id + '.flags');
    }
    object(capability.runtime, capability.id + '.runtime');
    validateSourceRef(capability.source, capability.id + '.source');
    if (capability.inherits) assert(families[capability.inherits], capability.id + ' inherits unknown family ' + capability.inherits);
    if (capability.aliasOf !== null) assert(typeof capability.aliasOf === 'string' && capability.aliasOf.length > 0, capability.id + ' has invalid alias target');
    if (capability.variants !== undefined) {
      array(capability.variants, capability.id + '.variants');
      assert(capability.variants.length > 0, capability.id + '.variants must not be empty');
      capability.variants.forEach(function(variant, index) { validateSourceRef(variant.source, capability.id + '.variants[' + index + '].source'); });
    }
    (capability.inherits ? families[capability.inherits].parameters : capability.parameters).forEach(function(parameter, index) {
      assert(parameter.kind === 'visible' || parameter.kind === 'code-only', capability.id + ' invalid parameter kind at ' + index);
      assert(typeof parameter.type === 'string' && parameter.type.length > 0, capability.id + ' missing parameter type at ' + index);
    });
    capabilities[capability.id] = capability;
  });
  universe.families.forEach(function(family) {
    family.members.forEach(function(member) {
      assert(capabilities[member], family.id + ' contains unknown member ' + member);
      assert.strictEqual(capabilities[member].inherits, family.id, member + ' family backlink mismatch');
    });
    var expressionKind = family.valueType === 'string' ? 'string-expression' : 'number-expression';
    assert(family.members.some(function(member) { return capabilities[member].kind === expressionKind; }), family.id + ' lacks expression matching valueType');
  });

  universe.runtimeOverrides.forEach(function(binding) {
    validateSourceRef(binding.source, binding.instructionId + '.source');
    array(binding.capabilityIds, binding.instructionId + '.capabilityIds');
    assert.strictEqual(binding.capabilityIds.length, 1, 'runtime override must link exactly one capability: ' + binding.instructionId);
    assert(binding.linkReason === 'instruction-id' || binding.linkReason === 'runtime-function-fallback', 'runtime override lacks link reason: ' + binding.instructionId);
    binding.capabilityIds.forEach(function(id) { assert(capabilities[id], binding.instructionId + ' links unknown capability ' + id); });
  });

  assert.strictEqual(universe.summary.sourceFiles, universe.source.files.length, 'source summary mismatch');
  assert.strictEqual(universe.summary.families, universe.families.length, 'family summary mismatch');
  assert.strictEqual(universe.summary.capabilities, universe.capabilities.length, 'capability summary mismatch');
  assert.strictEqual(universe.summary.declarationVariants, universe.capabilities.reduce(function(total, item) { return total + (item.variants ? item.variants.length : 0); }, 0), 'declaration variant summary mismatch');
  assert.strictEqual(universe.summary.unresolvedDeclarations, 0, 'unresolved summary must be zero');
  assert.strictEqual(universe.summary.unresolvedRuntimeBindings, 0, 'unresolved runtime binding summary must be zero');
  assert.strictEqual(universe.summary.unlinkedRuntimeOverrides, 0, 'unlinked runtime override summary must be zero');
  return capabilities;
}

function validateSemanticProjection(dictionary, capabilityIndex, options) {
  options = options || {};
  object(dictionary.implementation_bindings, 'implementation_bindings');
  object(dictionary.command_shapes, 'command_shapes');
  var components = componentCatalog.loadComponentCatalog();
  var componentIds = components.byId;
  var modules = moduleCompiler.loadProductModuleCatalog(MODULES_DIR).modules;
  var moduleIds = {};
  var direct = 0;
  var pending = [];
  modules.forEach(function(module) { moduleIds[module.id] = true; });

  Object.keys(dictionary.implementation_bindings).forEach(function(value) {
    var binding = dictionary.implementation_bindings[value];
    object(binding, 'implementation_bindings.' + value);
    assert(binding.compiler_action && dictionary.command_shapes[binding.compiler_action], value + ' refers to unknown compiler action');
    var owners = Number(!!binding.component_id) + Number(!!binding.module_id) + Number(!!binding.owner);
    assert.strictEqual(owners, 1, value + ' must have exactly one implementation owner');
    if (binding.component_id) assert(componentIds[binding.component_id], value + ' refers to unknown component ' + binding.component_id);
    if (binding.module_id) assert(moduleIds[binding.module_id], value + ' refers to unknown module ' + binding.module_id);
    if (binding.gdjs_capability_ids !== undefined) {
      array(binding.gdjs_capability_ids, value + '.gdjs_capability_ids');
      assert(binding.gdjs_capability_ids.length > 0, value + '.gdjs_capability_ids must not be empty');
      binding.gdjs_capability_ids.forEach(function(id) { assert(capabilityIndex[id], value + ' refers to unknown GDJS capability ' + id); });
      direct++;
    } else {
      pending.push(value);
    }
  });
  if (options.requireGdjsProjection && pending.length) throw new Error('GDJS projection missing for: ' + pending.join(', '));
  return { direct: direct, pending: pending };
}

function main() {
  var universe = readJson(UNIVERSE_PATH);
  var capabilityIndex = indexUniverse(universe);
  var dictionary = semanticFeedback.loadSemanticMapping();
  var requireGdjsProjection = process.argv.indexOf('--require-gdjs-projection') >= 0;
  var projection = validateSemanticProjection(dictionary, capabilityIndex, { requireGdjsProjection: requireGdjsProjection });

  var bad = JSON.parse(JSON.stringify(dictionary));
  var first = Object.keys(bad.implementation_bindings)[0];
  bad.implementation_bindings[first].gdjs_capability_ids = ['missing::capability'];
  assert.throws(function() { validateSemanticProjection(bad, capabilityIndex); }, /unknown GDJS capability/, 'negative constraint probe did not reject an unknown capability');

  console.log('[CapabilityContract] OK');
  console.log('  sources=' + universe.summary.sourceFiles + ' declarations=' + universe.summary.declarations + ' families=' + universe.summary.families + ' capabilities=' + universe.summary.capabilities);
  console.log('  semanticBindings=' + Object.keys(dictionary.implementation_bindings).length + ' components=' + componentCatalog.loadComponentCatalog().components.length);
  console.log('  directGdjsBindings=' + projection.direct + ' pendingGdjsBindings=' + projection.pending.length);
}

main();
