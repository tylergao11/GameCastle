var fs = require('fs');
var path = require('path');
var capabilityIr = require('../ai/gdjs-capability-ir');
var extensionLoader = require('../ai/gdevelop-extension-loader');
var runtimeCodegen = require('../ai/runtime-codegen');

var ROOT = path.resolve(__dirname, '..');
var OUT = path.join(ROOT, 'ai', 'gdevelop-truth', 'official-capability-bindings.json');
var CODEGEN_INOPERABLE = {
  'TextInput::object::TextInput::TextInputObject::number-expression::Font size': 'Official expression id contains whitespace and libGD parses it as an object variable instead of a callable expression.'
};

function vectorValues(vector) {
  var values = [];
  for (var index = 0; index < vector.size(); index++) values.push(vector.at(index));
  return values;
}

function mapKeys(map) {
  return vectorValues(map.keys());
}

function collectMap(records, extensionName, ownerKind, ownerId, kind, map) {
  mapKeys(map).forEach(function(key) {
    var metadata = map.get(key);
    var parameters = [];
    for (var parameterIndex = 0; parameterIndex < metadata.getParametersCount(); parameterIndex++) {
      var parameter = metadata.getParameter(parameterIndex);
      parameters.push({ type: parameter.getType(), codeOnly: parameter.isCodeOnly(), extra: parameter.getExtraInfo(), optional: parameter.isOptional(), defaultValue: parameter.getDefaultValue() });
    }
    records.push({
      extension: extensionName,
      ownerKind: ownerKind,
      ownerId: ownerId,
      kind: kind,
      runtimeId: key,
      functionName: metadata.getFunctionName ? metadata.getFunctionName() : '',
      parameterCount: metadata.getParametersCount ? metadata.getParametersCount() : 0,
      parameters: parameters
    });
  });
}

function collectOfficialMetadata(gd) {
  var records = [];
  var extensions = gd.JsPlatform.get().getAllPlatformExtensions();
  for (var extensionIndex = 0; extensionIndex < extensions.size(); extensionIndex++) {
    var extension = extensions.at(extensionIndex);
    var extensionName = extension.getName();
    collectMap(records, extensionName, 'global', 'extension', 'action', extension.getAllActions());
    collectMap(records, extensionName, 'global', 'extension', 'condition', extension.getAllConditions());
    collectMap(records, extensionName, 'global', 'extension', 'number-expression', extension.getAllExpressions());
    collectMap(records, extensionName, 'global', 'extension', 'string-expression', extension.getAllStrExpressions());
    vectorValues(extension.getExtensionObjectsTypes()).forEach(function(ownerId) {
      collectMap(records, extensionName, 'object', ownerId, 'action', extension.getAllActionsForObject(ownerId));
      collectMap(records, extensionName, 'object', ownerId, 'condition', extension.getAllConditionsForObject(ownerId));
      collectMap(records, extensionName, 'object', ownerId, 'number-expression', extension.getAllExpressionsForObject(ownerId));
      collectMap(records, extensionName, 'object', ownerId, 'string-expression', extension.getAllStrExpressionsForObject(ownerId));
    });
    vectorValues(extension.getBehaviorsTypes()).forEach(function(ownerId) {
      collectMap(records, extensionName, 'behavior', ownerId, 'action', extension.getAllActionsForBehavior(ownerId));
      collectMap(records, extensionName, 'behavior', ownerId, 'condition', extension.getAllConditionsForBehavior(ownerId));
      collectMap(records, extensionName, 'behavior', ownerId, 'number-expression', extension.getAllExpressionsForBehavior(ownerId));
      collectMap(records, extensionName, 'behavior', ownerId, 'string-expression', extension.getAllStrExpressionsForBehavior(ownerId));
    });
  }
  extensions.delete();
  return records;
}
function collectOfficialTypes(gd) {
  var objectTypes = [], behaviorTypes = [];
  var extensions = gd.JsPlatform.get().getAllPlatformExtensions();
  for (var extensionIndex = 0; extensionIndex < extensions.size(); extensionIndex++) {
    var extension = extensions.at(extensionIndex), extensionName = extension.getName();
    vectorValues(extension.getExtensionObjectsTypes()).forEach(function(runtimeType) { objectTypes.push({ extension: extensionName, runtimeType: runtimeType }); });
    vectorValues(extension.getBehaviorsTypes()).forEach(function(runtimeType) { behaviorTypes.push({ extension: extensionName, runtimeType: runtimeType }); });
  }
  extensions.delete();
  function stable(values) { var seen = {}; values.forEach(function(item) { seen[item.extension + '|' + item.runtimeType] = item; }); return Object.keys(seen).sort().map(function(key) { return seen[key]; }); }
  return { objectTypes: stable(objectTypes), behaviorTypes: stable(behaviorTypes) };
}

function lastSegment(value) {
  var parts = String(value || '').split('::');
  return parts[parts.length - 1];
}

function expectedFunction(capability) {
  return capability.kind === 'condition' || /expression$/.test(capability.kind)
    ? (capability.runtime.getter || capability.runtime.functionName || '')
    : (capability.runtime.functionName || '');
}

function chooseBinding(registry, capability, records) {
  var owner = capability.owner || {};
  var expectedOwnerId = owner.id === 'BuiltinObject::__object_metadata__' ? '' : owner.id;
  var expectedRuntimeId = registry.instructionIds[capability.id] || null;
  var aliasParts = capability.aliasOf ? String(capability.aliasOf).split('::') : null;
  var expectedLocalId = aliasParts ? aliasParts[aliasParts.length - 1] : capability.localId;
  var expectedFn = expectedFunction(capability);
  var expectedParameters = /expression$/.test(capability.kind)
    ? capabilityIr.expressionParameterContract(registry, capability).length
    : capabilityIr.placeholderParameters(registry, capability).length;
  var candidates = records.filter(function(record) {
    return record.kind === capability.kind &&
      record.ownerKind === owner.kind &&
      (owner.kind === 'global' || record.ownerId === expectedOwnerId || record.extension + '::' + record.ownerId === expectedOwnerId || record.ownerId === lastSegment(expectedOwnerId)) &&
      (record.runtimeId === expectedRuntimeId || lastSegment(record.runtimeId) === expectedLocalId);
  }).map(function(record) {
    var score = 0;
    if (expectedRuntimeId && record.runtimeId === expectedRuntimeId) score += 1000;
    if (record.extension === capability.extension) score += 100;
    if (record.runtimeId === capability.localId) score += 25;
    if (record.runtimeId === capability.extension + '::' + capability.localId) score += 40;
    if (expectedFn && record.functionName === expectedFn) score += 80;
    if (record.parameterCount === expectedParameters) score += 10;
    return { record: record, score: score };
  }).sort(function(left, right) {
    if (right.score !== left.score) return right.score - left.score;
    return left.record.runtimeId.length - right.record.runtimeId.length;
  });
  return candidates.length ? candidates[0] : null;
}

async function main() {
  var libGdPath = runtimeCodegen.resolveLibGdPath();
  var gd = await require(libGdPath)({
    print: function() {},
    printErr: function() {},
    locateFile: function(fileName) { return path.join(path.dirname(libGdPath), fileName); }
  });
  var extensionEvidence = extensionLoader.loadOfficialExtensions(gd, path.join(path.dirname(libGdPath), 'extensions'));
  var officialRecords = collectOfficialMetadata(gd);
  var officialTypes = collectOfficialTypes(gd);
  var registry = capabilityIr.loadRegistry({ includeSourceDeclarations: true });
  var bindings = {};
  var missing = [];
  var codegenInoperable = [];
  Object.keys(registry.byId).sort().forEach(function(capabilityId) {
    if (CODEGEN_INOPERABLE[capabilityId]) {
      codegenInoperable.push({ id: capabilityId, reason: CODEGEN_INOPERABLE[capabilityId] });
      return;
    }
    var capability = registry.byId[capabilityId];
    var chosen = chooseBinding(registry, capability, officialRecords);
    if (!chosen) { missing.push(capabilityId); return; }
    bindings[capabilityId] = {
      runtimeId: chosen.record.runtimeId,
      metadataExtension: chosen.record.extension,
      metadataOwnerId: chosen.record.ownerId,
      functionName: chosen.record.functionName,
      parameterCount: chosen.record.parameterCount,
      parameters: chosen.record.parameters
    };
  });
  var output = {
    schemaVersion: 1,
    sourceCommit: extensionEvidence.commit,
    capabilityCount: Object.keys(bindings).length,
    unavailableSourceDeclarationCount: missing.length,
    unavailableSourceDeclarations: missing,
    codegenInoperableDeclarationCount: codegenInoperable.length,
    codegenInoperableDeclarations: codegenInoperable,
    objectTypes: officialTypes.objectTypes,
    behaviorTypes: officialTypes.behaviorTypes,
    bindings: bindings
  };
  var serialized = JSON.stringify(output, null, 2) + '\n';
  if (process.argv.indexOf('--check') >= 0) {
    if (!fs.existsSync(OUT) || fs.readFileSync(OUT, 'utf8') !== serialized) throw new Error('Official capability bindings drifted; run node scripts/extract-official-capability-bindings.js');
    console.log('[OfficialCapabilityBindings] checked ' + output.capabilityCount + ' executable bindings; exclusions=' + (missing.length + codegenInoperable.length));
    return;
  }
  fs.writeFileSync(OUT, serialized, 'utf8');
  console.log('[OfficialCapabilityBindings] ' + output.capabilityCount + ' official GDJS capabilities; excluded source-only declarations=' + missing.length + '; codegen-inoperable declarations=' + codegenInoperable.length + ' -> ' + OUT);
}

main().catch(function(error) { console.error(error); process.exit(1); });
