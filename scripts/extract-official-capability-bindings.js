var fs = require('fs');
var path = require('path');
var capabilityIr = require('../ai/gdjs-capability-ir');
var extensionLoader = require('../ai/gdevelop-extension-loader');
var runtimeCodegen = require('../ai/runtime-codegen');

var ROOT = path.resolve(__dirname, '..');
var SOURCE_DIR = process.env.GAMECASTLE_GDEVELOP_SOURCE_DIR || path.resolve(ROOT, '..', 'GDevelop-master');
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

function sha1(text) {
  return require('crypto').createHash('sha1').update(text).digest('hex');
}

function functionBody(source, marker) {
  var start = source.indexOf(marker);
  if (start < 0) throw new Error('Pinned GDJS parameter truth is missing: ' + marker);
  var open = source.indexOf('{', start), depth = 0;
  for (var index = open; index < source.length; index++) {
    if (source[index] === '{') depth++;
    else if (source[index] === '}' && --depth === 0) return source.slice(open + 1, index);
  }
  throw new Error('Pinned GDJS parameter truth is unbalanced: ' + marker);
}

function comparedStrings(source, variable) {
  var values = [], pattern = new RegExp(variable + '\\s*==\\s*"([^"]+)"', 'g'), match;
  while ((match = pattern.exec(source))) if (values.indexOf(match[1]) < 0) values.push(match[1]);
  return values;
}

function conditionalBody(source, value) {
  var marker = 'type == "' + value + '"', start = source.indexOf(marker);
  if (start < 0) throw new Error('Pinned GDJS value type truth is missing branch: ' + value);
  var open = source.indexOf('{', start), depth = 0;
  for (var index = open; index < source.length; index++) {
    if (source[index] === '{') depth++;
    else if (source[index] === '}' && --depth === 0) return source.slice(open + 1, index);
  }
  throw new Error('Pinned GDJS value type branch is unbalanced: ' + value);
}

function objectLiteralBody(source, marker) {
  var start = source.indexOf(marker);
  if (start < 0) throw new Error('Pinned GDJS operator truth is missing: ' + marker);
  var open = source.indexOf('{', start), close = source.indexOf('};', open);
  if (open < 0 || close < 0) throw new Error('Pinned GDJS operator truth is malformed: ' + marker);
  return source.slice(open + 1, close);
}

function quotedValues(source) {
  var values = [], match, pattern = /'([^']+)'/g;
  while ((match = pattern.exec(source))) values.push(match[1]);
  return values;
}

function propertyValues(source, property) {
  var values = [], pattern = new RegExp(property + "\\s*:\\s*'([^']+)'", 'g'), match;
  while ((match = pattern.exec(source))) if (values.indexOf(match[1]) < 0) values.push(match[1]);
  return values;
}

function operatorDomains(source, mapMarker, labelsMarker) {
  var labels = objectLiteralBody(source, labelsMarker).split(/\r?\n/).map(function(line) { return (line.match(/^\s*(?:'([^']+)'|([A-Za-z][A-Za-z0-9]*))\s*:/) || []).slice(1).filter(Boolean)[0]; }).filter(Boolean);
  var body = objectLiteralBody(source, mapMarker), domains = {};
  var pattern = /^\s*([A-Za-z][A-Za-z0-9]*)\s*:\s*(?:\[([^\]]*)\]|Object\.keys\([^)]*\))/gm, match;
  while ((match = pattern.exec(body))) domains[match[1]] = match[2] === undefined ? labels.slice() : quotedValues(match[2]);
  return domains;
}

function parameterSemanticsTruth() {
  var valueTypePath = path.join(SOURCE_DIR, 'Core', 'GDCore', 'Extensions', 'Metadata', 'ValueTypeMetadata.h');
  var operatorPath = path.join(SOURCE_DIR, 'newIDE', 'app', 'src', 'EventsSheet', 'ParameterFields', 'OperatorField.js');
  var relationalPath = path.join(SOURCE_DIR, 'newIDE', 'app', 'src', 'EventsSheet', 'ParameterFields', 'RelationalOperatorField.js');
  var yesNoPath = path.join(SOURCE_DIR, 'newIDE', 'app', 'src', 'EventsSheet', 'ParameterFields', 'YesNoField.js');
  var trueFalsePath = path.join(SOURCE_DIR, 'newIDE', 'app', 'src', 'EventsSheet', 'ParameterFields', 'TrueFalseField.js');
  [valueTypePath, operatorPath, relationalPath, yesNoPath, trueFalsePath].forEach(function(file) { if (!fs.existsSync(file)) throw new Error('Pinned GDJS parameter truth source is missing: ' + file); });
  var valueTypeSource = fs.readFileSync(valueTypePath, 'utf8');
  var operatorSource = fs.readFileSync(operatorPath, 'utf8');
  var relationalSource = fs.readFileSync(relationalPath, 'utf8');
  var yesNoSource = fs.readFileSync(yesNoPath, 'utf8');
  var trueFalseSource = fs.readFileSync(trueFalsePath, 'utf8');
  var expressionBody = functionBody(valueTypeSource, 'static bool IsTypeExpression');
  var groups = {};
  ['number', 'string', 'boolean', 'variable', 'resource'].forEach(function(kind) { groups[kind] = comparedStrings(conditionalBody(expressionBody, kind), 'parameterType'); });
  groups.object = comparedStrings(functionBody(valueTypeSource, 'static bool IsTypeObject'), 'parameterType');
  groups.behavior = comparedStrings(functionBody(valueTypeSource, 'static bool IsTypeBehavior'), 'parameterType');
  groups.legacyVariable = comparedStrings(functionBody(valueTypeSource, 'static bool IsTypeLegacyPreScopedVariable'), 'type');
  var operators = operatorDomains(operatorSource, 'mapTypeToOperators', 'operatorLabels');
  var relationalOperators = operatorDomains(relationalSource, 'mapTypeToRelationalOperators', 'operatorLabels');
  var booleanDomains = { yesorno: propertyValues(yesNoSource, 'value'), trueorfalse: propertyValues(trueFalseSource, 'value') };
  if (booleanDomains.yesorno.indexOf('yes') < 0 || booleanDomains.yesorno.indexOf('no') < 0 || booleanDomains.trueorfalse.indexOf('True') < 0 || booleanDomains.trueorfalse.indexOf('False') < 0) throw new Error('Pinned GDJS boolean parameter domains are incomplete');
  function semantic(type, extra) {
    if (groups.object.indexOf(type) >= 0) return { promptType: 'entity', runtimeValueKind: 'object-name', runtimeNormalization: 'entity-object-name' };
    if (groups.behavior.indexOf(type) >= 0) return { promptType: 'behavior', runtimeValueKind: 'behavior-name', runtimeNormalization: 'entity-behavior-name' };
    if (groups.number.indexOf(type) >= 0) return { promptType: 'number-or-expression', runtimeValueKind: 'number-expression', runtimeNormalization: 'number-expression' };
    if (groups.string.indexOf(type) >= 0) return { promptType: 'text-or-expression', runtimeValueKind: 'string-expression', runtimeNormalization: 'string-expression' };
    if (groups.boolean.indexOf(type) >= 0) return { promptType: 'boolean', runtimeValueKind: 'boolean-token', runtimeNormalization: 'boolean-token', runtimeValues: booleanDomains[type] };
    if (groups.variable.indexOf(type) >= 0) {
      var normalization = type === 'objectvar' ? 'object-member-name' : type === 'scenevar' ? 'scene-member-name' : type === 'globalvar' ? 'name' : 'contextual-member-name';
      return { promptType: 'member-name', runtimeValueKind: 'variable-expression', runtimeNormalization: normalization };
    }
    if (groups.resource.indexOf(type) >= 0) return { promptType: 'resource-name', runtimeValueKind: 'resource-name', runtimeNormalization: 'resource-name' };
    if (type === 'operator') return { promptType: 'dictionary-token', runtimeValueKind: 'operator-token', runtimeNormalization: 'dictionary-token', runtimeValues: (operators[extra] || operators.unknown).slice() };
    if (type === 'relationalOperator') return { promptType: 'dictionary-token', runtimeValueKind: 'operator-token', runtimeNormalization: 'dictionary-token', runtimeValues: (relationalOperators[extra] || relationalOperators.unknown).slice() };
    if (type === 'key' || type === 'mouse') return { promptType: 'text', runtimeValueKind: 'literal-token', runtimeNormalization: 'text' };
    return { promptType: 'scalar', runtimeValueKind: 'literal-token', runtimeNormalization: 'scalar' };
  }
  return {
    groups: groups,
    operatorDomains: operators,
    relationalOperatorDomains: relationalOperators,
    booleanDomains: booleanDomains,
    source: [valueTypePath, operatorPath, relationalPath, yesNoPath, trueFalsePath].map(function(file) { return { path: file.replace(SOURCE_DIR + path.sep, '').replace(/\\/g, '/'), sha1: sha1(fs.readFileSync(file, 'utf8')) }; }),
    resolve: semantic
  };
}

function collectMap(records, extensionName, ownerKind, ownerId, kind, map, parameterSemantics) {
  mapKeys(map).forEach(function(key) {
    var metadata = map.get(key);
    var parameters = [];
    for (var parameterIndex = 0; parameterIndex < metadata.getParametersCount(); parameterIndex++) {
      var parameter = metadata.getParameter(parameterIndex);
      var parameterType = parameter.getType(), extra = parameter.getExtraInfo();
      parameters.push(Object.assign({ type: parameterType, codeOnly: parameter.isCodeOnly(), extra: extra, optional: parameter.isOptional(), defaultValue: parameter.getDefaultValue() }, parameterSemantics.resolve(parameterType, extra)));
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

function collectOfficialMetadata(gd, parameterSemantics) {
  var records = [];
  var extensions = gd.JsPlatform.get().getAllPlatformExtensions();
  for (var extensionIndex = 0; extensionIndex < extensions.size(); extensionIndex++) {
    var extension = extensions.at(extensionIndex);
    var extensionName = extension.getName();
    collectMap(records, extensionName, 'global', 'extension', 'action', extension.getAllActions(), parameterSemantics);
    collectMap(records, extensionName, 'global', 'extension', 'condition', extension.getAllConditions(), parameterSemantics);
    collectMap(records, extensionName, 'global', 'extension', 'number-expression', extension.getAllExpressions(), parameterSemantics);
    collectMap(records, extensionName, 'global', 'extension', 'string-expression', extension.getAllStrExpressions(), parameterSemantics);
    vectorValues(extension.getExtensionObjectsTypes()).forEach(function(ownerId) {
      collectMap(records, extensionName, 'object', ownerId, 'action', extension.getAllActionsForObject(ownerId), parameterSemantics);
      collectMap(records, extensionName, 'object', ownerId, 'condition', extension.getAllConditionsForObject(ownerId), parameterSemantics);
      collectMap(records, extensionName, 'object', ownerId, 'number-expression', extension.getAllExpressionsForObject(ownerId), parameterSemantics);
      collectMap(records, extensionName, 'object', ownerId, 'string-expression', extension.getAllStrExpressionsForObject(ownerId), parameterSemantics);
    });
    vectorValues(extension.getBehaviorsTypes()).forEach(function(ownerId) {
      collectMap(records, extensionName, 'behavior', ownerId, 'action', extension.getAllActionsForBehavior(ownerId), parameterSemantics);
      collectMap(records, extensionName, 'behavior', ownerId, 'condition', extension.getAllConditionsForBehavior(ownerId), parameterSemantics);
      collectMap(records, extensionName, 'behavior', ownerId, 'number-expression', extension.getAllExpressionsForBehavior(ownerId), parameterSemantics);
      collectMap(records, extensionName, 'behavior', ownerId, 'string-expression', extension.getAllStrExpressionsForBehavior(ownerId), parameterSemantics);
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

function sourceVisibleParameterTypes(registry, capability, seen) {
  seen = seen || {};
  if (seen[capability.id]) throw new Error('Capability alias cycle while binding official metadata: ' + capability.id);
  seen[capability.id] = true;
  if (capability.aliasOf) {
    var aliasLocalId = lastSegment(capability.aliasOf);
    var targets = Object.keys(registry.byId).map(function(id) { return registry.byId[id]; }).filter(function(candidate) {
      return candidate.extension === capability.extension && candidate.kind === capability.kind && candidate.owner.kind === capability.owner.kind && candidate.owner.id === capability.owner.id && candidate.localId === aliasLocalId;
    });
    if (targets.length !== 1) throw new Error('Capability alias target is not unique while binding official metadata: ' + capability.id);
    return sourceVisibleParameterTypes(registry, targets[0], seen);
  }
  var family = capability.inherits ? registry.families[capability.inherits] : null;
  var parameters = (family ? family.parameters : capability.parameters) || [];
  var types = parameters.filter(function(parameter) { return parameter.kind !== 'code-only'; }).map(function(parameter) { return parameter.type; });
  ((family ? family.parameterMacros : capability.parameterMacros) || []).forEach(function(macro) {
    if (capability.kind !== 'action' && capability.kind !== 'condition') return;
    if (macro.valueType === 'boolean') {
      if (capability.kind === 'action') types.push('yesorno');
      return;
    }
    types.push(capability.kind === 'condition' ? 'relationalOperator' : 'operator', macro.valueType);
  });
  return types.sort();
}

function sameVisibleParameterTypes(expected, record) {
  var actual = record.parameters.filter(function(parameter) { return !parameter.codeOnly; }).map(function(parameter) { return parameter.type; }).sort();
  return expected.length === actual.length && expected.every(function(type, index) { return type === actual[index]; });
}

function chooseBinding(registry, capability, records) {
  var owner = capability.owner || {};
  var expectedOwnerId = owner.id === 'BuiltinObject::__object_metadata__' ? '' : owner.id;
  var expectedRuntimeId = registry.instructionIds[capability.id] || null;
  var aliasParts = capability.aliasOf ? String(capability.aliasOf).split('::') : null;
  var expectedLocalId = aliasParts ? aliasParts[aliasParts.length - 1] : capability.localId;
  var expectedFn = expectedFunction(capability);
  var expectedVisibleTypes = sourceVisibleParameterTypes(registry, capability);
  var candidates = records.filter(function(record) {
    return record.kind === capability.kind &&
      record.ownerKind === owner.kind &&
      (owner.kind === 'global' || record.ownerId === expectedOwnerId || record.extension + '::' + record.ownerId === expectedOwnerId || record.ownerId === lastSegment(expectedOwnerId)) &&
      (record.runtimeId === expectedRuntimeId || lastSegment(record.runtimeId) === expectedLocalId) &&
      sameVisibleParameterTypes(expectedVisibleTypes, record);
  }).map(function(record) {
    var score = 0;
    if (expectedRuntimeId && record.runtimeId === expectedRuntimeId) score += 1000;
    if (record.extension === capability.extension) score += 100;
    if (record.runtimeId === capability.localId) score += 25;
    if (record.runtimeId === capability.extension + '::' + capability.localId) score += 40;
    if (expectedFn && record.functionName === expectedFn) score += 80;
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
  var parameterSemantics = parameterSemanticsTruth();
  var officialRecords = collectOfficialMetadata(gd, parameterSemantics);
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
    parameterSemantics: {
      groups: parameterSemantics.groups,
      operatorDomains: parameterSemantics.operatorDomains,
      relationalOperatorDomains: parameterSemantics.relationalOperatorDomains,
      booleanDomains: parameterSemantics.booleanDomains,
      source: parameterSemantics.source
    },
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
