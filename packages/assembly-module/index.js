'use strict';

var crypto = require('crypto');
var semanticModule = require('@gamecastle/semantic-module');
var assetEngine = require('@gamecastle/asset-engine');
var projectAssembler = require('../gdjs/src/gdjs-project-assembler');
var assetBinder = require('../gdjs/src/gdjs-project-asset-binder');
var spatialEngine = require('../spatial/src/runtime');
var spatialAssemblyStage = require('../spatial/src/spatial-assembly-stage');
var geometryFactProducer = require('../spatial/src/spatial-geometry-fact-producer');

var SEMANTIC_ASSEMBLY_FIELDS = [
  'schemaVersion',
  'documentKind',
  'compilerKind',
  'sourceHash',
  'realizedSourceHash',
  'dictionarySource',
  'source',
  'realizedSource',
  'componentExpansion',
  'eventGraph',
  'assetRequirements',
  'layoutPlan',
  'contentHash'
];

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce(function(result, key) {
      result[key] = stable(value[key]);
      return result;
    }, {});
  }
  return value;
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0, 24);
}

function same(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function fail(code, message) {
  var error = new Error(message);
  error.code = code;
  error.owner = 'AssemblyModule';
  throw error;
}

function object(value, label, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code || 'ASSEMBLY_MODULE_INPUT_INVALID', label + ' must be an object.');
  return value;
}

function text(value, label, code) {
  if (typeof value !== 'string' || !value.trim()) fail(code || 'ASSEMBLY_MODULE_INPUT_INVALID', label + ' must be non-empty text.');
  return value;
}

function allowed(value, fields, label) {
  Object.keys(value).forEach(function(field) {
    if (fields.indexOf(field) < 0) fail('ASSEMBLY_MODULE_INPUT_INVALID', label + ' contains unknown field: ' + field + '.');
  });
}

function exactlyOne(value, fields, label) {
  var present = fields.filter(function(field) { return value[field] !== undefined; });
  if (present.length !== 1) fail('ASSEMBLY_MODULE_INPUT_INVALID', label + ' requires exactly one of: ' + fields.join(', ') + '.');
  return present[0];
}

function assertSemanticAssembly(value) {
  value = object(value, 'SemanticAssembly', 'ASSEMBLY_MODULE_SEMANTIC_ASSEMBLY_INVALID');
  Object.keys(value).forEach(function(field) {
    if (SEMANTIC_ASSEMBLY_FIELDS.indexOf(field) < 0) fail('ASSEMBLY_MODULE_SEMANTIC_ASSEMBLY_INVALID', 'SemanticAssembly contains unknown field: ' + field + '.');
  });
  SEMANTIC_ASSEMBLY_FIELDS.forEach(function(field) {
    if (value[field] === undefined) fail('ASSEMBLY_MODULE_SEMANTIC_ASSEMBLY_INVALID', 'SemanticAssembly is missing ' + field + '.');
  });
  if (value.schemaVersion !== 1 || value.documentKind !== 'semantic-assembly' || value.compilerKind !== 'game-semantic-source-to-semantic-assembly') {
    fail('ASSEMBLY_MODULE_SEMANTIC_ASSEMBLY_INVALID', 'SemanticAssembly has an unsupported kind or version.');
  }
  var sourceHash = text(value.sourceHash, 'SemanticAssembly.sourceHash', 'ASSEMBLY_MODULE_SEMANTIC_ASSEMBLY_INVALID');
  var realizedSourceHash = text(value.realizedSourceHash, 'SemanticAssembly.realizedSourceHash', 'ASSEMBLY_MODULE_SEMANTIC_ASSEMBLY_INVALID');
  object(value.dictionarySource, 'SemanticAssembly.dictionarySource', 'ASSEMBLY_MODULE_SEMANTIC_ASSEMBLY_INVALID');
  object(value.source, 'SemanticAssembly.source', 'ASSEMBLY_MODULE_SEMANTIC_ASSEMBLY_INVALID');
  object(value.realizedSource, 'SemanticAssembly.realizedSource', 'ASSEMBLY_MODULE_SEMANTIC_ASSEMBLY_INVALID');
  object(value.componentExpansion, 'SemanticAssembly.componentExpansion', 'ASSEMBLY_MODULE_SEMANTIC_ASSEMBLY_INVALID');
  object(value.eventGraph, 'SemanticAssembly.eventGraph', 'ASSEMBLY_MODULE_SEMANTIC_ASSEMBLY_INVALID');
  object(value.assetRequirements, 'SemanticAssembly.assetRequirements', 'ASSEMBLY_MODULE_SEMANTIC_ASSEMBLY_INVALID');
  object(value.layoutPlan, 'SemanticAssembly.layoutPlan', 'ASSEMBLY_MODULE_SEMANTIC_ASSEMBLY_INVALID');
  if (value.componentExpansion.sourceHash !== sourceHash || value.componentExpansion.realizedSourceHash !== realizedSourceHash) {
    fail('ASSEMBLY_MODULE_SEMANTIC_ASSEMBLY_MISMATCH', 'SemanticAssembly component expansion does not bind its source pair.');
  }
  if (value.eventGraph.sourceHash !== sourceHash || value.assetRequirements.sourceHash !== sourceHash || value.layoutPlan.sourceHash !== sourceHash) {
    fail('ASSEMBLY_MODULE_SEMANTIC_ASSEMBLY_MISMATCH', 'SemanticAssembly compiler evidence does not bind its sourceHash.');
  }
  if (value.eventGraph.realizedSourceHash !== realizedSourceHash || value.assetRequirements.realizedSourceHash !== realizedSourceHash || value.layoutPlan.realizedSourceHash !== realizedSourceHash) {
    fail('ASSEMBLY_MODULE_SEMANTIC_ASSEMBLY_MISMATCH', 'SemanticAssembly compiler evidence does not bind its realizedSourceHash.');
  }
  if (!same(value.dictionarySource, value.componentExpansion.dictionarySource) || !same(value.dictionarySource, value.eventGraph.dictionarySource) || !same(value.dictionarySource, value.assetRequirements.dictionarySource) || !same(value.dictionarySource, value.layoutPlan.dictionarySource)) {
    fail('ASSEMBLY_MODULE_SEMANTIC_ASSEMBLY_MISMATCH', 'SemanticAssembly evidence does not bind one semantic dictionary source.');
  }
  var core = clone(value);
  delete core.contentHash;
  if (value.contentHash !== 'assembly.' + hash(core)) {
    fail('ASSEMBLY_MODULE_SEMANTIC_ASSEMBLY_HASH_INVALID', 'SemanticAssembly contentHash does not bind its content.');
  }
  var canonical = semanticModule.compileSemanticAssembly(value.source);
  if (!same(value, canonical)) {
    fail('ASSEMBLY_MODULE_SEMANTIC_ASSEMBLY_NONCANONICAL', 'SemanticAssembly compiler evidence must exactly match recompilation from its source.');
  }
  return canonical;
}

function resolveSemanticAssembly(input, label) {
  var selected = exactlyOne(input, ['semanticAssembly', 'source'], label);
  if (selected === 'semanticAssembly') return assertSemanticAssembly(input.semanticAssembly);
  return assertSemanticAssembly(semanticModule.compileSemanticAssembly(input.source));
}

function projectAssemblyFromSemanticAssembly(semanticAssembly) {
  var spatialAssemblyRequest = spatialEngine.createAssemblyRequest(semanticAssembly.layoutPlan);
  if (spatialAssemblyRequest.sourceHash !== semanticAssembly.sourceHash || spatialAssemblyRequest.realizedSourceHash !== semanticAssembly.realizedSourceHash || !same(spatialAssemblyRequest.dictionarySource, semanticAssembly.dictionarySource)) {
    fail('ASSEMBLY_MODULE_SPATIAL_REQUEST_MISMATCH', 'Spatial assembly request does not bind the supplied SemanticAssembly.');
  }
  return {
    schemaVersion: 3,
    documentKind: 'semantic-runtime-assembly',
    linkerKind: 'assembly-module-project-seed-adapter',
    sourceHash: semanticAssembly.sourceHash,
    realizedSourceHash: semanticAssembly.realizedSourceHash,
    dictionarySource: clone(semanticAssembly.dictionarySource),
    source: clone(semanticAssembly.source),
    realizedSource: clone(semanticAssembly.realizedSource),
    componentExpansion: clone(semanticAssembly.componentExpansion),
    eventGraph: clone(semanticAssembly.eventGraph),
    assetRequirements: clone(semanticAssembly.assetRequirements),
    layoutPlan: clone(semanticAssembly.layoutPlan),
    spatialAssemblyRequest: spatialAssemblyRequest,
    // GDJS seeds carry this hash as their assembly identity. Keeping the public
    // SemanticAssembly hash here prevents a second assembly truth from forming.
    contentHash: semanticAssembly.contentHash
  };
}

function assertProjectSeed(value, semanticAssembly) {
  value = object(value, 'GDJS project seed', 'ASSEMBLY_MODULE_PROJECT_SEED_INVALID');
  if (value.schemaVersion !== 2 || value.documentKind !== 'gdjs-project-seed') {
    fail('ASSEMBLY_MODULE_PROJECT_SEED_INVALID', 'GDJS project seed has an unsupported kind or version.');
  }
  text(value.sourceHash, 'GDJS project seed.sourceHash', 'ASSEMBLY_MODULE_PROJECT_SEED_INVALID');
  text(value.assemblyHash, 'GDJS project seed.assemblyHash', 'ASSEMBLY_MODULE_PROJECT_SEED_INVALID');
  object(value.dictionarySource, 'GDJS project seed.dictionarySource', 'ASSEMBLY_MODULE_PROJECT_SEED_INVALID');
  object(value.project, 'GDJS project seed.project', 'ASSEMBLY_MODULE_PROJECT_SEED_INVALID');
  if (!Array.isArray(value.assetBindingRequirements) || !value.layoutPlan || !value.spatialAssemblyRequest) {
    fail('ASSEMBLY_MODULE_PROJECT_SEED_INVALID', 'GDJS project seed lacks required assembly evidence.');
  }
  var core = clone(value);
  delete core.contentHash;
  if (value.contentHash !== 'project-seed.' + hash(core)) {
    fail('ASSEMBLY_MODULE_PROJECT_SEED_HASH_INVALID', 'GDJS project seed contentHash does not bind its content.');
  }
  if (semanticAssembly) {
    if (value.sourceHash !== semanticAssembly.sourceHash || value.assemblyHash !== semanticAssembly.contentHash || !same(value.dictionarySource, semanticAssembly.dictionarySource)) {
      fail('ASSEMBLY_MODULE_PROJECT_SEED_MISMATCH', 'GDJS project seed does not bind the supplied SemanticAssembly.');
    }
    if (!same(value.assetBindingRequirements, semanticAssembly.assetRequirements.requirements) || !same(value.layoutPlan, semanticAssembly.layoutPlan)) {
      fail('ASSEMBLY_MODULE_PROJECT_SEED_MISMATCH', 'GDJS project seed compiler evidence differs from the supplied SemanticAssembly.');
    }
    var canonical = projectAssembler.assemble(projectAssemblyFromSemanticAssembly(semanticAssembly));
    if (!same(value, canonical)) {
      fail('ASSEMBLY_MODULE_PROJECT_SEED_NONCANONICAL', 'GDJS project seed must exactly match canonical assembly from its SemanticAssembly.');
    }
    return canonical;
  }
  return clone(value);
}

function assertAssetBoundProjectSeed(value, semanticAssembly, acceptedAssetWorld, projectSeed) {
  value = object(value, 'asset-bound GDJS project seed', 'ASSEMBLY_MODULE_ASSET_BOUND_SEED_INVALID');
  if (value.schemaVersion !== 1 || value.documentKind !== 'gdjs-asset-bound-project-seed') {
    fail('ASSEMBLY_MODULE_ASSET_BOUND_SEED_INVALID', 'Asset-bound GDJS project seed has an unsupported kind or version.');
  }
  var core = clone(value);
  delete core.contentHash;
  if (value.contentHash !== 'asset-bound-project-seed.' + hash(core)) {
    fail('ASSEMBLY_MODULE_ASSET_BOUND_SEED_HASH_INVALID', 'Asset-bound GDJS project seed contentHash does not bind its content.');
  }
  if (value.sourceHash !== semanticAssembly.sourceHash || typeof value.projectSeedHash !== 'string' || !value.projectSeedHash || value.assetWorldHash !== acceptedAssetWorld.contentHash || !same(value.dictionarySource, semanticAssembly.dictionarySource)) {
    fail('ASSEMBLY_MODULE_ASSET_BOUND_SEED_MISMATCH', 'Asset-bound GDJS project seed does not bind its SemanticAssembly and AcceptedAssetWorld.');
  }
  if (projectSeed && value.projectSeedHash !== projectSeed.contentHash) {
    fail('ASSEMBLY_MODULE_ASSET_BOUND_SEED_MISMATCH', 'Asset-bound GDJS project seed does not bind the exact supplied project seed.');
  }
  var canonical = assetBinder.bindResources(projectSeed, acceptedAssetWorld);
  if (!same(value, canonical)) {
    fail('ASSEMBLY_MODULE_ASSET_BOUND_SEED_NONCANONICAL', 'Asset-bound GDJS project seed must exactly match canonical binding from its project seed and AcceptedAssetWorld.');
  }
  return canonical;
}

function createProjectSeed(input) {
  input = object(input, 'createProjectSeed input');
  allowed(input, ['semanticAssembly', 'source'], 'createProjectSeed input');
  var semanticAssembly = resolveSemanticAssembly(input, 'createProjectSeed input');
  var seed = projectAssembler.assemble(projectAssemblyFromSemanticAssembly(semanticAssembly));
  return assertProjectSeed(seed, semanticAssembly);
}

function bindAcceptedAssets(input) {
  input = object(input, 'bindAcceptedAssets input');
  allowed(input, ['semanticAssembly', 'source', 'projectSeed', 'acceptedAssetWorld'], 'bindAcceptedAssets input');
  var semanticAssembly = resolveSemanticAssembly(input, 'bindAcceptedAssets input');
  var projectSeed = assertProjectSeed(input.projectSeed, semanticAssembly);
  var acceptedAssetWorld = assetEngine.validateAcceptedAssetWorld(input.acceptedAssetWorld, { sourceHash: projectSeed.sourceHash });
  return assertAssetBoundProjectSeed(
    assetBinder.bindResources(projectSeed, acceptedAssetWorld),
    semanticAssembly,
    acceptedAssetWorld,
    projectSeed
  );
}

function prepareSpatialAssembly(input) {
  input = object(input, 'prepareSpatialAssembly input');
  allowed(input, ['semanticAssembly', 'source', 'projectSeed', 'assetBoundProjectSeed', 'acceptedAssetWorld'], 'prepareSpatialAssembly input');
  var semanticAssembly = resolveSemanticAssembly(input, 'prepareSpatialAssembly input');
  var projectSeed = assertProjectSeed(input.projectSeed, semanticAssembly);
  var acceptedAssetWorld = assetEngine.validateAcceptedAssetWorld(input.acceptedAssetWorld, { sourceHash: semanticAssembly.sourceHash });
  var assetBoundProjectSeed = assertAssetBoundProjectSeed(input.assetBoundProjectSeed, semanticAssembly, acceptedAssetWorld, projectSeed);
  var geometryFacts = geometryFactProducer.produce({ assetBoundSeed: assetBoundProjectSeed, assetWorld: acceptedAssetWorld });
  return spatialAssemblyStage.prepare(assetBoundProjectSeed, acceptedAssetWorld, {
    componentExpansion: semanticAssembly.componentExpansion,
    geometryFacts: geometryFacts
  });
}

function runDelivery(input) {
  input = object(input, 'runDelivery input');
  allowed(input, ['semanticAssembly', 'source', 'acceptedAssetWorld'], 'runDelivery input');
  var semanticAssembly = resolveSemanticAssembly(input, 'runDelivery input');
  var projectSeed = createProjectSeed({ semanticAssembly: semanticAssembly });
  var acceptedAssetWorld = assetEngine.validateAcceptedAssetWorld(input.acceptedAssetWorld, { sourceHash: semanticAssembly.sourceHash });
  var assetBoundProjectSeed = bindAcceptedAssets({ semanticAssembly: semanticAssembly, projectSeed: projectSeed, acceptedAssetWorld: acceptedAssetWorld });
  var spatialAssemblyInput = prepareSpatialAssembly({
    semanticAssembly: semanticAssembly,
    projectSeed: projectSeed,
    assetBoundProjectSeed: assetBoundProjectSeed,
    acceptedAssetWorld: acceptedAssetWorld
  });
  var result = {
    schemaVersion: 1,
    documentKind: 'assembly-module-delivery',
    sourceHash: semanticAssembly.sourceHash,
    semanticAssemblyHash: semanticAssembly.contentHash,
    acceptedAssetWorldHash: acceptedAssetWorld.contentHash,
    semanticAssembly: semanticAssembly,
    projectSeed: projectSeed,
    assetBoundProjectSeed: assetBoundProjectSeed,
    geometryFacts: clone(spatialAssemblyInput.geometryFacts),
    spatialAssemblyInput: spatialAssemblyInput
  };
  result.contentHash = 'assembly-delivery.' + hash(result);
  return clone(result);
}

module.exports = Object.freeze({
  createProjectSeed: createProjectSeed,
  bindAcceptedAssets: bindAcceptedAssets,
  prepareSpatialAssembly: prepareSpatialAssembly,
  runDelivery: runDelivery
});
