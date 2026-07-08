var crypto = require('crypto');
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var DEFAULT_SOURCE_DIR = 'D:\\GDevelop-master';
var SOURCE_DIR = process.env.GAMECASTLE_GDEVELOP_SOURCE_DIR || DEFAULT_SOURCE_DIR;
var OUT_DIR = path.join(ROOT, 'ai', 'gdevelop-truth');
var OUT_PATH = path.join(OUT_DIR, 'runtime-truth.json');
var CHECK_MODE = process.argv.indexOf('--check') >= 0;

var EXTENSIONS = {
  PrimitiveDrawing: {
    extensionCpp: 'Extensions/PrimitiveDrawing/JsExtension.cpp',
    runtimeTs: [
      'Extensions/PrimitiveDrawing/shapepainterruntimeobject.ts',
      'Extensions/PrimitiveDrawing/shapepainterruntimeobject-pixi-renderer.ts',
    ],
    contracts: {
      objects: {
        'PrimitiveDrawing::Drawer': {
          contractSource: 'Extensions/PrimitiveDrawing/shapepainterruntimeobject.ts',
          requiredDataType: 'ShapePainterObjectDataType',
        },
      },
    },
  },
  PlatformBehavior: {
    extensionCpp: 'Extensions/PlatformBehavior/JsExtension.cpp',
    runtimeTs: [
      'Extensions/PlatformBehavior/platformruntimebehavior.ts',
      'Extensions/PlatformBehavior/platformerobjectruntimebehavior.ts',
    ],
    contracts: {
      behaviors: {
        'PlatformBehavior::PlatformBehavior': {
          contractSource: 'Extensions/PlatformBehavior/platformruntimebehavior.ts',
          constructorDataName: 'behaviorData',
        },
        'PlatformBehavior::PlatformerObjectBehavior': {
          contractSource: 'Extensions/PlatformBehavior/platformerobjectruntimebehavior.ts',
          constructorDataName: 'behaviorData',
        },
      },
    },
  },
  TextObject: {
    extensionCpp: 'Extensions/TextObject/JsExtension.cpp',
    runtimeTs: [
      'Extensions/TextObject/textruntimeobject.ts',
      'Extensions/TextObject/textruntimeobject-pixi-renderer.ts',
    ],
    contracts: {
      objects: {
        'TextObject::Text': {
          contractSource: 'Extensions/TextObject/textruntimeobject.ts',
          requiredDataType: 'TextObjectDataType',
        },
      },
    },
  },
  ThreeD: {
    extensionJs: 'Extensions/3D/JsExtension.js',
    runtimeTs: [
      'Extensions/3D/Cube3DRuntimeObject.ts',
      'Extensions/3D/Cube3DRuntimeObjectPixiRenderer.ts',
      'Extensions/3D/Model3DRuntimeObject.ts',
      'Extensions/3D/Model3DRuntimeObject3DRenderer.ts',
      'Extensions/3D/Base3DBehavior.ts',
      'Extensions/3D/Scene3DTools.ts',
    ],
    contracts: {
      objects: {
        'Scene3D::Cube3DObject': {
          contractSource: 'Extensions/3D/Cube3DRuntimeObject.ts',
          requiredDataInterface: 'Cube3DObjectData',
        },
        'Scene3D::Model3DObject': {
          contractSource: 'Extensions/3D/Model3DRuntimeObject.ts',
          requiredDataInterface: 'Model3DObjectData',
        },
      },
    },
  },
};

function readRelative(relativePath) {
  var fullPath = path.join(SOURCE_DIR, relativePath);
  return fs.readFileSync(fullPath, 'utf8');
}

function fileHash(relativePath) {
  return crypto.createHash('sha1').update(readRelative(relativePath)).digest('hex');
}

function uniqueSorted(values) {
  var seen = {};
  values.forEach(function(value) {
    if (value) seen[value] = true;
  });
  return Object.keys(seen).sort();
}

function uniquePreserve(values) {
  var seen = {};
  var result = [];
  values.forEach(function(value) {
    if (!value || seen[value]) return;
    seen[value] = true;
    result.push(value);
  });
  return result;
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(value).sort().map(function(key) {
    return JSON.stringify(key) + ':' + stableStringify(value[key]);
  }).join(',') + '}';
}

function prettyStable(value) {
  return JSON.stringify(JSON.parse(stableStringify(value)), null, 2) + '\n';
}

function stripCppComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function stripJsComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function extractStringLiteralArgument(argumentText) {
  var parts = [];
  var pattern = /["']([^"']*)["']/g;
  var match;
  while ((match = pattern.exec(argumentText))) parts.push(match[1]);
  return parts.join('');
}

function extractIncludeFileCalls(chain) {
  var includes = [];
  var includePattern = /\.(?:SetIncludeFile|AddIncludeFile|setIncludeFile|addIncludeFile)\(([\s\S]*?)\)/g;
  var includeMatch;
  while ((includeMatch = includePattern.exec(chain))) {
    includes.push(extractStringLiteralArgument(includeMatch[1]));
  }
  return uniquePreserve(includes);
}

function extractMetadataIncludes(cpp, metadataCall) {
  var records = {};
  var normalized = stripCppComments(cpp).replace(/\s+/g, ' ');
  var pattern = new RegExp(metadataCall + '\\("([^"]+)"\\)([\\s\\S]*?);', 'g');
  var match;
  while ((match = pattern.exec(normalized))) {
    var type = match[1];
    var chain = match[2];
    records[type] = extractIncludeFileCalls(chain);
  }
  return records;
}

function extractJsExtensionName(js) {
  var match = stripJsComments(js).match(/\.setExtensionInformation\(\s*["']([^"']+)["']/);
  if (!match) throw new Error('Unable to read JS extension name from JsExtension.js');
  return match[1];
}

function extractJsMetadataIncludes(js, extensionName, metadataCall) {
  var records = {};
  var normalized = stripJsComments(js).replace(/\s+/g, ' ');
  var pattern = new RegExp('\\.' + metadataCall + '\\(\\s*["\\\']([^"\\\']+)["\\\'][\\s\\S]*?;', 'g');
  var match;
  while ((match = pattern.exec(normalized))) {
    var shortType = match[1];
    var chain = match[0];
    var fullType = extensionName + '::' + shortType;
    records[fullType] = extractIncludeFileCalls(chain);
  }
  return records;
}

function extractInstructionFunctions(cpp, callName) {
  var records = {};
  var normalized = stripCppComments(cpp).replace(/\s+/g, ' ');
  var pattern = new RegExp(callName + '\\s*\\(\\s*"([^"]+)"\\s*\\)\\s*\\[\\s*"([^"]+)"\\s*\\]\\s*\\.SetFunctionName\\s*\\(\\s*"([^"]*)"', 'g');
  var match;
  while ((match = pattern.exec(normalized))) {
    var owner = match[1];
    var instruction = match[2];
    if (!records[owner]) records[owner] = {};
    records[owner][instruction] = match[3];
  }
  return records;
}

function extractGlobalInstructionFunctions(cpp) {
  var records = {};
  var normalized = stripCppComments(cpp).replace(/\s+/g, ' ');
  var pattern = /GetAll(Actions|Conditions)\s*\(\s*\)\s*\[\s*"([^"]+)"\s*\]\s*\.SetFunctionName\s*\(\s*"([^"]*)"/g;
  var match;
  while ((match = pattern.exec(normalized))) {
    records[match[2]] = match[3];
  }
  return records;
}

function mergeInstructionRecord(target, owner, instruction, functionName) {
  if (!target[owner]) target[owner] = {};
  target[owner][instruction] = functionName;
}

function extractAliasedInstructionFunctions(cpp) {
  var normalized = stripCppComments(cpp).replace(/\s+/g, ' ');
  var aliases = [];
  var aliasPattern = /(?:std::map<[^>]+>\s*&\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*GetAll(Actions|Conditions|ActionsForObject|ConditionsForObject|ActionsForBehavior|ConditionsForBehavior)\s*\((?:\s*"([^"]+)"\s*)?\)\s*;/g;
  var match;
  while ((match = aliasPattern.exec(normalized))) {
    aliases.push({
      start: match.index,
      bodyStart: aliasPattern.lastIndex,
      alias: match[1],
      call: match[2],
      owner: match[3] || '__global__',
    });
  }

  var result = {
    global: {},
    objectActions: {},
    objectConditions: {},
    behaviorActions: {},
    behaviorConditions: {},
  };
  aliases.forEach(function(meta, index) {
    var end = normalized.length;
    for (var i = index + 1; i < aliases.length; i++) {
      if (aliases[i].alias === meta.alias) {
        end = aliases[i].start;
        break;
      }
    }
    var segment = normalized.slice(meta.bodyStart, end);
    var escapedAlias = meta.alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var pattern = new RegExp(escapedAlias + '\\s*\\[\\s*"([^"]+)"\\s*\\]\\s*\\.SetFunctionName\\s*\\(\\s*"([^"]*)"', 'g');
    var instructionMatch;
    while ((instructionMatch = pattern.exec(segment))) {
      var instruction = instructionMatch[1];
      var functionName = instructionMatch[2];
      if (meta.call === 'Actions' || meta.call === 'Conditions') {
        result.global[instruction] = functionName;
      } else if (meta.call === 'ActionsForObject') {
        mergeInstructionRecord(result.objectActions, meta.owner, instruction, functionName);
      } else if (meta.call === 'ConditionsForObject') {
        mergeInstructionRecord(result.objectConditions, meta.owner, instruction, functionName);
      } else if (meta.call === 'ActionsForBehavior') {
        mergeInstructionRecord(result.behaviorActions, meta.owner, instruction, functionName);
      } else if (meta.call === 'ConditionsForBehavior') {
        mergeInstructionRecord(result.behaviorConditions, meta.owner, instruction, functionName);
      }
    }
  });
  return result;
}

function extractTypeFields(ts, typeName) {
  var pattern = new RegExp('(?:export\\s+)?type\\s+' + typeName + '\\s*=\\s*\\{([\\s\\S]*?)\\};');
  var match = pattern.exec(ts);
  if (!match) return [];
  var fields = [];
  match[1].split(/\r?\n/).forEach(function(line) {
    var fieldMatch = line.trim().match(/^([A-Za-z0-9_]+):\s*([^;]+);/);
    if (fieldMatch) fields.push({ name: fieldMatch[1], type: fieldMatch[2].trim() });
  });
  return fields;
}

function extractInterfaceFields(ts, interfaceName) {
  var startPattern = new RegExp('export\\s+interface\\s+' + interfaceName + '\\b[^\\{]*\\{');
  var startMatch = startPattern.exec(ts);
  if (!startMatch) return [];
  var openIndex = startMatch.index + startMatch[0].length - 1;
  var depth = 0;
  for (var i = openIndex; i < ts.length; i++) {
    if (ts[i] === '{') depth++;
    if (ts[i] === '}') {
      depth--;
      if (depth === 0) {
        return extractFieldsFromBlock(ts.slice(openIndex + 1, i));
      }
    }
  }
  return [];
}

function extractFieldsFromBlock(block) {
  var fields = [];
  block.split(/\r?\n/).forEach(function(line) {
    var trimmed = line.trim();
    var fieldMatch = trimmed.match(/^([A-Za-z0-9_]+)(\??):\s*([^;{]+)[;{]?/);
    if (fieldMatch) {
      fields.push({
        name: fieldMatch[1],
        optional: fieldMatch[2] === '?',
        type: fieldMatch[3].trim(),
      });
    }
  });
  return fields;
}

function extractObjectDataContract(ts, contract) {
  var fields = [];
  if (contract.requiredDataType) fields = extractTypeFields(ts, contract.requiredDataType);
  if (contract.requiredDataInterface) fields = extractInterfaceFields(ts, contract.requiredDataInterface);
  return fields;
}

function extractConstructorBehaviorDataFields(ts, dataName) {
  var fields = {};
  var pattern = new RegExp(dataName + '\\.([A-Za-z0-9_]+)', 'g');
  var match;
  while ((match = pattern.exec(ts))) fields[match[1]] = true;
  return Object.keys(fields).sort();
}

function extractRegistrations(relativePaths) {
  var objects = {};
  var behaviors = {};
  relativePaths.forEach(function(relativePath) {
    var text = readRelative(relativePath);
    var objectPattern = /registerObject\(\s*["']([^"']+)["']/g;
    var behaviorPattern = /registerBehavior\(\s*["']([^"']+)["']/g;
    var match;
    while ((match = objectPattern.exec(text))) objects[match[1]] = relativePath;
    while ((match = behaviorPattern.exec(text))) behaviors[match[1]] = relativePath;
  });
  return { objects: objects, behaviors: behaviors };
}

function mergeMap(target, source) {
  Object.keys(source).forEach(function(key) {
    if (!target[key]) target[key] = {};
    Object.keys(source[key]).forEach(function(innerKey) {
      target[key][innerKey] = source[key][innerKey];
    });
  });
}

function buildTruth() {
  if (!fs.existsSync(SOURCE_DIR)) {
    throw new Error('GDevelop source directory not found: ' + SOURCE_DIR);
  }

  var sourceFiles = [];
  Object.keys(EXTENSIONS).forEach(function(name) {
    var ext = EXTENSIONS[name];
    if (ext.extensionCpp) sourceFiles.push(ext.extensionCpp);
    if (ext.extensionJs) sourceFiles.push(ext.extensionJs);
    (ext.runtimeTs || []).forEach(function(file) { sourceFiles.push(file); });
    Object.keys((ext.contracts && ext.contracts.objects) || {}).forEach(function(type) {
      sourceFiles.push(ext.contracts.objects[type].contractSource);
    });
    Object.keys((ext.contracts && ext.contracts.behaviors) || {}).forEach(function(type) {
      sourceFiles.push(ext.contracts.behaviors[type].contractSource);
    });
  });
  sourceFiles = uniqueSorted(sourceFiles);

  var objects = {};
  var behaviors = {};
  var objectActions = {};
  var objectConditions = {};
  var behaviorActions = {};
  var behaviorConditions = {};
  var globalInstructions = {};

  Object.keys(EXTENSIONS).forEach(function(name) {
    var ext = EXTENSIONS[name];
    var registration = extractRegistrations(ext.runtimeTs || []);
    var objectIncludes = {};
    var behaviorIncludes = {};

    if (ext.extensionCpp) {
      var cpp = readRelative(ext.extensionCpp);
      objectIncludes = extractMetadataIncludes(cpp, 'GetObjectMetadata');
      behaviorIncludes = extractMetadataIncludes(cpp, 'GetBehaviorMetadata');

      mergeMap(objectActions, extractInstructionFunctions(cpp, 'GetAllActionsForObject'));
      mergeMap(objectConditions, extractInstructionFunctions(cpp, 'GetAllConditionsForObject'));
      mergeMap(behaviorActions, extractInstructionFunctions(cpp, 'GetAllActionsForBehavior'));
      mergeMap(behaviorConditions, extractInstructionFunctions(cpp, 'GetAllConditionsForBehavior'));
      Object.assign(globalInstructions, extractGlobalInstructionFunctions(cpp));
      var aliasedInstructions = extractAliasedInstructionFunctions(cpp);
      mergeMap(objectActions, aliasedInstructions.objectActions);
      mergeMap(objectConditions, aliasedInstructions.objectConditions);
      mergeMap(behaviorActions, aliasedInstructions.behaviorActions);
      mergeMap(behaviorConditions, aliasedInstructions.behaviorConditions);
      Object.assign(globalInstructions, aliasedInstructions.global);
    }

    if (ext.extensionJs) {
      var js = readRelative(ext.extensionJs);
      var extensionName = extractJsExtensionName(js);
      objectIncludes = Object.assign(objectIncludes, extractJsMetadataIncludes(js, extensionName, 'addObject'));
      behaviorIncludes = Object.assign(behaviorIncludes, extractJsMetadataIncludes(js, extensionName, 'addBehavior'));
    }

    Object.keys(objectIncludes).forEach(function(type) {
      objects[type] = {
        extension: name,
        includes: objectIncludes[type],
        runtimeRegistrationSource: registration.objects[type] || null,
      };
    });

    Object.keys(behaviorIncludes).forEach(function(type) {
      behaviors[type] = {
        extension: name,
        includes: behaviorIncludes[type],
        runtimeRegistrationSource: registration.behaviors[type] || null,
      };
    });

    Object.keys((ext.contracts && ext.contracts.objects) || {}).forEach(function(type) {
      var contract = ext.contracts.objects[type];
      var ts = readRelative(contract.contractSource);
      if (!objects[type]) objects[type] = { extension: name, includes: [], runtimeRegistrationSource: registration.objects[type] || null };
      objects[type].dataFields = extractObjectDataContract(ts, contract);
      objects[type].contractSource = contract.contractSource;
    });

    Object.keys((ext.contracts && ext.contracts.behaviors) || {}).forEach(function(type) {
      var contract = ext.contracts.behaviors[type];
      var ts = readRelative(contract.contractSource);
      if (!behaviors[type]) behaviors[type] = { extension: name, includes: [], runtimeRegistrationSource: registration.behaviors[type] || null };
      behaviors[type].constructorDataFields = extractConstructorBehaviorDataFields(ts, contract.constructorDataName);
      behaviors[type].contractSource = contract.contractSource;
    });
  });

  return {
    schemaVersion: 1,
    source: {
      dir: SOURCE_DIR,
      files: sourceFiles.map(function(file) {
        return { path: file, sha1: fileHash(file) };
      }),
    },
    objects: objects,
    behaviors: behaviors,
    instructions: {
      global: globalInstructions,
      objectActions: objectActions,
      objectConditions: objectConditions,
      behaviorActions: behaviorActions,
      behaviorConditions: behaviorConditions,
    },
  };
}

function main() {
  var truth = buildTruth();
  var rendered = prettyStable(truth);
  if (CHECK_MODE) {
    var current = fs.existsSync(OUT_PATH) ? fs.readFileSync(OUT_PATH, 'utf8') : '';
    if (current !== rendered) {
      throw new Error('GDevelop truth snapshot is out of date. Run `npm run truth:extract`.');
    }
    console.log('[GDevelopTruth] snapshot OK: ' + OUT_PATH);
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_PATH, rendered);
  console.log('[GDevelopTruth] wrote ' + OUT_PATH);
  console.log('  objects=' + Object.keys(truth.objects).length + ' behaviors=' + Object.keys(truth.behaviors).length);
}

main();
