'use strict';

var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var zlib = require('zlib');
var semanticModule = require('@gamecastle/semantic-module');
var assetWorld = require('../assets/src/asset-world');
var productionPlanner = require('../assets/src/asset-production-planner');
var reviewContract = require('../assets/contracts/asset-semantic-review-contract.json');
var styleDNA = require('../assets/src/style-dna');

var REQUIREMENT_SET_SCHEMA_VERSION = 1;
var REQUIREMENT_SET_DOCUMENT_KIND = 'asset-requirement-set';
var ACCEPTED_ASSET_WORLD_SCHEMA_VERSION = 4;
var ACCEPTED_ASSET_WORLD_DOCUMENT_KIND = 'semantic-asset-world';
var MAX_OFFLINE_DIMENSION = 256;

var contracts = Object.freeze({
  AssetRequirementSet: Object.freeze({
    schemaVersion: REQUIREMENT_SET_SCHEMA_VERSION,
    documentKind: REQUIREMENT_SET_DOCUMENT_KIND,
    required: Object.freeze(['schemaVersion', 'documentKind', 'sourceHash', 'projectId', 'requirements']),
    resource: Object.freeze({ resourceKind: 'image', acceptedFormats: Object.freeze(['png']), artifactKind: 'single-resource' })
  }),
  AcceptedAssetWorld: Object.freeze({
    schemaVersion: ACCEPTED_ASSET_WORLD_SCHEMA_VERSION,
    documentKind: ACCEPTED_ASSET_WORLD_DOCUMENT_KIND
  })
});

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(result, key) {
    result[key] = stable(value[key]);
    return result;
  }, {});
  return value;
}
function same(left, right) { return JSON.stringify(stable(left)) === JSON.stringify(stable(right)); }
function sha256(value) {
  return crypto.createHash('sha256').update(Buffer.isBuffer(value) || typeof value === 'string' ? value : JSON.stringify(stable(value))).digest('hex');
}
function fail(code, message) {
  var error = new Error(message);
  error.code = code;
  error.owner = 'AssetEnginePublicModule';
  throw error;
}
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('ASSET_REQUIREMENT_SET_INVALID', label + ' must be an object.');
  return value;
}
function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail('ASSET_REQUIREMENT_SET_INVALID', label + ' must be non-empty text.');
  return value;
}
function allowed(value, fields, label) {
  Object.keys(value).forEach(function(field) {
    if (fields.indexOf(field) < 0) fail('ASSET_REQUIREMENT_SET_INVALID', label + ' contains unknown field: ' + field + '.');
  });
}
function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1 || value > MAX_OFFLINE_DIMENSION) fail('ASSET_REQUIREMENT_SET_INVALID', label + ' must be an integer between 1 and ' + MAX_OFFLINE_DIMENSION + '.');
  return value;
}
function pngFormats(value) {
  if (value === undefined) return ['png'];
  if (!Array.isArray(value) || value.length !== 1 || String(value[0]).toLowerCase() !== 'png') fail('ASSET_ENGINE_OFFLINE_FORMAT_UNSUPPORTED', 'The deterministic offline runtime supports exactly one accepted format: png.');
  return ['png'];
}
function normalizedRequirement(value, index) {
  object(value, 'requirements[' + index + ']');
  allowed(value, ['semanticId', 'subject', 'description', 'productionFamily', 'recipeId', 'styleId', 'semanticTags', 'constraints', 'acceptedFormats', 'resourceKind'], 'requirements[' + index + ']');
  var constraints = value.constraints === undefined ? {} : object(value.constraints, 'requirements[' + index + '].constraints');
  allowed(constraints, ['width', 'height', 'transparent'], 'requirements[' + index + '].constraints');
  var normalizedConstraints = {
    width: constraints.width === undefined ? 32 : positiveInteger(constraints.width, 'requirements[' + index + '].constraints.width'),
    height: constraints.height === undefined ? 32 : positiveInteger(constraints.height, 'requirements[' + index + '].constraints.height'),
    transparent: constraints.transparent === undefined ? true : constraints.transparent
  };
  if (typeof normalizedConstraints.transparent !== 'boolean') fail('ASSET_REQUIREMENT_SET_INVALID', 'requirements[' + index + '].constraints.transparent must be boolean.');
  if (value.resourceKind !== undefined && value.resourceKind !== 'image') fail('ASSET_ENGINE_OFFLINE_RESOURCE_UNSUPPORTED', 'The deterministic offline runtime supports image resources only.');
  if (!Array.isArray(value.semanticTags) || !value.semanticTags.length) fail('ASSET_REQUIREMENT_SET_INVALID', 'requirements[' + index + '].semanticTags must be a non-empty array.');
  value.semanticTags.forEach(function(tag, tagIndex) { text(tag, 'requirements[' + index + '].semanticTags[' + tagIndex + ']'); });
  var result = {
    semanticId: text(value.semanticId, 'requirements[' + index + '].semanticId'),
    subject: text(value.subject, 'requirements[' + index + '].subject'),
    description: text(value.description, 'requirements[' + index + '].description'),
    productionFamily: text(value.productionFamily, 'requirements[' + index + '].productionFamily'),
    recipeId: text(value.recipeId, 'requirements[' + index + '].recipeId'),
    styleId: text(value.styleId, 'requirements[' + index + '].styleId'),
    semanticTags: value.semanticTags.slice(),
    constraints: normalizedConstraints,
    acceptedFormats: pngFormats(value.acceptedFormats),
    resourceKind: 'image'
  };
  try { styleDNA.style(result.styleId); } catch (error) { fail('ASSET_REQUIREMENT_SET_STYLE_UNKNOWN', error.message); }
  return result;
}
function normalizeAssetRequirementSet(value) {
  object(value, 'AssetRequirementSet');
  allowed(value, ['schemaVersion', 'documentKind', 'sourceHash', 'projectId', 'requirements'], 'AssetRequirementSet');
  if (value.schemaVersion !== REQUIREMENT_SET_SCHEMA_VERSION || value.documentKind !== REQUIREMENT_SET_DOCUMENT_KIND) fail('ASSET_REQUIREMENT_SET_INVALID', 'AssetRequirementSet has an invalid kind or version.');
  text(value.sourceHash, 'AssetRequirementSet.sourceHash');
  text(value.projectId, 'AssetRequirementSet.projectId');
  if (!Array.isArray(value.requirements) || !value.requirements.length) fail('ASSET_REQUIREMENT_SET_INVALID', 'AssetRequirementSet requires one or more requirements.');
  var requirements = value.requirements.map(normalizedRequirement);
  var semanticIds = requirements.map(function(requirement) { return requirement.semanticId; });
  if (new Set(semanticIds).size !== semanticIds.length) fail('ASSET_REQUIREMENT_SET_INVALID', 'AssetRequirementSet semanticId values must be unique.');
  return {
    schemaVersion: REQUIREMENT_SET_SCHEMA_VERSION,
    documentKind: REQUIREMENT_SET_DOCUMENT_KIND,
    sourceHash: value.sourceHash,
    projectId: value.projectId,
    requirements: requirements
  };
}
function canonicalSemanticAssembly(value) {
  object(value, 'SemanticAssembly');
  if (value.documentKind !== 'semantic-assembly' || value.schemaVersion !== 1 || !value.source || !value.sourceHash || !value.contentHash) {
    fail('ASSET_ENGINE_SEMANTIC_ASSEMBLY_INVALID', 'The offline semantic route requires a complete SemanticAssembly.');
  }
  var canonical = semanticModule.compileSemanticAssembly(value.source);
  if (!same(value, canonical)) {
    fail('ASSET_ENGINE_SEMANTIC_ASSEMBLY_NONCANONICAL', 'SemanticAssembly evidence must be recompiled from its source before offline asset conversion.');
  }
  return canonical;
}
function createOfflineRequirementSet(input) {
  input = object(input, 'createOfflineRequirementSet input');
  allowed(input, ['semanticAssembly', 'source', 'projectId'], 'createOfflineRequirementSet input');
  var selected = input.semanticAssembly === undefined ? (input.source === undefined ? 0 : 1) : (input.source === undefined ? 1 : 2);
  if (selected !== 1) fail('ASSET_ENGINE_OFFLINE_REQUIREMENT_INPUT_INVALID', 'createOfflineRequirementSet requires exactly one of semanticAssembly or source.');
  var projectId = text(input.projectId, 'createOfflineRequirementSet.projectId');
  var semanticAssembly = input.semanticAssembly === undefined
    ? semanticModule.compileSemanticAssembly(input.source)
    : canonicalSemanticAssembly(input.semanticAssembly);
  var requirements = semanticAssembly.assetRequirements.requirements.map(function(requirement) {
    var constraints = requirement.constraints || {}, acceptedFormats = (requirement.acceptedFormats || []).map(function(format) { return String(format).toLowerCase(); });
    if (requirement.artifactKind !== 'single-resource') fail('ASSET_ENGINE_OFFLINE_ARTIFACT_UNSUPPORTED', 'The deterministic offline semantic route supports only single-resource asset intents: ' + requirement.semanticId + '.');
    if (requirement.resourceKind !== 'image') fail('ASSET_ENGINE_OFFLINE_RESOURCE_UNSUPPORTED', 'The deterministic offline semantic route supports only image asset intents: ' + requirement.semanticId + '.');
    if (acceptedFormats.indexOf('png') < 0) fail('ASSET_ENGINE_OFFLINE_FORMAT_UNSUPPORTED', 'The deterministic offline semantic route requires PNG to be an accepted semantic format: ' + requirement.semanticId + '.');
    if (!Array.isArray(requirement.roles) || !requirement.roles.length) fail('ASSET_ENGINE_SEMANTIC_ASSEMBLY_INVALID', 'SemanticAssembly asset requirement has no semantic roles: ' + requirement.semanticId + '.');
    return {
      semanticId: requirement.semanticId,
      subject: requirement.subject,
      description: requirement.description,
      productionFamily: requirement.productionFamily,
      recipeId: requirement.recipeId,
      styleId: requirement.styleId,
      semanticTags: requirement.roles.slice(),
      constraints: {
        width: constraints.width === undefined ? 32 : constraints.width,
        height: constraints.height === undefined ? 32 : constraints.height,
        transparent: constraints.transparent === undefined ? true : constraints.transparent
      },
      // The semantic requirement may permit additional runtime formats. This
      // constrained offline conformance path materializes only the canonical
      // PNG subset and therefore proves PNG is explicitly permitted first.
      acceptedFormats: ['png'],
      resourceKind: requirement.resourceKind
    };
  });
  return normalizeAssetRequirementSet({
    schemaVersion: REQUIREMENT_SET_SCHEMA_VERSION,
    documentKind: REQUIREMENT_SET_DOCUMENT_KIND,
    sourceHash: semanticAssembly.sourceHash,
    projectId: projectId,
    requirements: requirements
  });
}
function normalizeOfflineOptions(value) {
  if (value === undefined) return { assetDir: null };
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('ASSET_ENGINE_OFFLINE_OPTIONS_INVALID', 'runOffline options must be an object.');
  Object.keys(value).forEach(function(key) {
    if (key !== 'assetDir') fail('ASSET_ENGINE_OFFLINE_OPTIONS_INVALID', 'runOffline options contains unknown field: ' + key + '.');
  });
  if (value.assetDir === undefined) return { assetDir: null };
  if (typeof value.assetDir !== 'string' || !value.assetDir.trim()) fail('ASSET_ENGINE_OFFLINE_OPTIONS_INVALID', 'runOffline options.assetDir must be non-empty text.');
  if (!path.isAbsolute(value.assetDir)) fail('ASSET_ENGINE_OFFLINE_ASSET_DIR_INVALID', 'runOffline options.assetDir must be an absolute directory path.');
  var assetDir = path.resolve(value.assetDir);
  if (assetDir === path.parse(assetDir).root) fail('ASSET_ENGINE_OFFLINE_ASSET_DIR_INVALID', 'runOffline options.assetDir cannot be a filesystem root.');
  return { assetDir: assetDir };
}
function directoryForAssets(assetDir) {
  if (!assetDir) return null;
  try { fs.mkdirSync(assetDir, { recursive: true }); } catch (error) { fail('ASSET_ENGINE_OFFLINE_ASSET_DIR_INVALID', 'runOffline could not create assetDir: ' + error.message); }
  var realDir;
  try { realDir = fs.realpathSync(assetDir); } catch (error) { fail('ASSET_ENGINE_OFFLINE_ASSET_DIR_INVALID', 'runOffline could not resolve assetDir: ' + error.message); }
  var stats;
  try { stats = fs.statSync(realDir); } catch (error) { fail('ASSET_ENGINE_OFFLINE_ASSET_DIR_INVALID', 'runOffline could not inspect assetDir: ' + error.message); }
  if (!stats.isDirectory() || realDir === path.parse(realDir).root) fail('ASSET_ENGINE_OFFLINE_ASSET_DIR_INVALID', 'runOffline options.assetDir must resolve to a non-root directory.');
  return realDir;
}
function insideDirectory(directory, candidate) {
  var relative = path.relative(directory, candidate);
  return !!relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

var crcTable = (function() {
  var table = new Uint32Array(256);
  for (var index = 0; index < 256; index++) {
    var value = index;
    for (var bit = 0; bit < 8; bit++) value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();
function crc32(value) {
  var crc = 0xffffffff;
  for (var index = 0; index < value.length; index++) crc = (crc >>> 8) ^ crcTable[(crc ^ value[index]) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  var typeBytes = Buffer.from(type, 'ascii');
  var length = Buffer.alloc(4);
  var checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, checksum]);
}
function deterministicPng(width, height, seed, transparent) {
  var seedBytes = Buffer.from(seed, 'hex');
  var raw = Buffer.alloc((width * 4 + 1) * height);
  for (var y = 0; y < height; y++) {
    var row = y * (width * 4 + 1);
    raw[row] = 0;
    for (var x = 0; x < width; x++) {
      var offset = row + 1 + x * 4;
      var at = (x * 13 + y * 29) % seedBytes.length;
      var edge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      raw[offset] = 48 + (seedBytes[at] % 160);
      raw[offset + 1] = 48 + (seedBytes[(at + 11) % seedBytes.length] % 160);
      raw[offset + 2] = 48 + (seedBytes[(at + 23) % seedBytes.length] % 160);
      raw[offset + 3] = transparent && edge ? 0 : 255;
    }
  }
  var header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  var signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([signature, pngChunk('IHDR', header), pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })), pngChunk('IEND', Buffer.alloc(0))]);
}
function materializePng(assetDir, imageHash, bytes) {
  if (!assetDir) return 'data:image/png;base64,' + bytes.toString('base64');
  var file = path.resolve(assetDir, imageHash + '.png');
  if (!insideDirectory(assetDir, file)) fail('ASSET_ENGINE_OFFLINE_ASSET_PATH_INVALID', 'The deterministic asset path escaped the requested assetDir.');
  function verifyExisting() {
    var entry;
    try { entry = fs.lstatSync(file); } catch (error) { fail('ASSET_ENGINE_OFFLINE_MATERIALIZATION_FAILED', 'Could not inspect deterministic asset file: ' + error.message); }
    if (!entry.isFile() || entry.isSymbolicLink()) fail('ASSET_ENGINE_OFFLINE_ASSET_COLLISION', 'Deterministic asset path is occupied by a non-file or symbolic link.');
    if (sha256(fs.readFileSync(file)) !== imageHash) fail('ASSET_ENGINE_OFFLINE_ASSET_COLLISION', 'Deterministic asset path is occupied by different bytes.');
  }
  if (fs.existsSync(file)) verifyExisting();
  else {
    try { fs.writeFileSync(file, bytes, { flag: 'wx' }); }
    catch (error) {
      if (error && error.code === 'EEXIST') verifyExisting();
      else fail('ASSET_ENGINE_OFFLINE_MATERIALIZATION_FAILED', 'Could not write deterministic asset file: ' + error.message);
    }
  }
  if (sha256(fs.readFileSync(file)) !== imageHash) fail('ASSET_ENGINE_OFFLINE_MATERIALIZATION_FAILED', 'Deterministic asset file hash does not match its accepted asset hash.');
  return file;
}
function workItemReceiptId(receipt) {
  return 'work-acceptance.' + crypto.createHash('sha256').update(JSON.stringify(receipt)).digest('hex').slice(0, 24);
}
function deterministicAsset(workItem, requirementSet, productionSetId, assetDir) {
  var constraints = workItem.assetSpec.constraints || {};
  var width = constraints.width || 32;
  var height = constraints.height || 32;
  var transparent = constraints.transparent === true;
  var seed = sha256({
    sourceHash: requirementSet.sourceHash,
    projectId: requirementSet.projectId,
    productionSetId: productionSetId,
    workItemPlanId: workItem.workItemPlanId,
    targetVisualSlotId: workItem.targetVisualSlotId
  });
  var bytes = deterministicPng(width, height, seed, transparent);
  var imageHash = sha256(bytes);
  var revisionId = 'offline-revision.' + sha256({ workItemPlanId: workItem.workItemPlanId, imageHash: imageHash }).slice(0, 24);
  return {
    slotId: workItem.slotId,
    targetVisualSlotId: workItem.targetVisualSlotId,
    assetId: 'offline-asset.' + sha256({ targetVisualSlotId: workItem.targetVisualSlotId, imageHash: imageHash }).slice(0, 24),
    revisionId: revisionId,
    path: materializePng(assetDir, imageHash, bytes),
    sha256: imageHash,
    format: 'png',
    width: width,
    height: height,
    transparent: transparent,
    resourceKind: 'image',
    source: 'deterministic-offline'
  };
}
function reviewReceipt(workItem, asset) {
  var phase = 'final-derived-asset';
  var modelFingerprint = 'deterministic-offline-review.' + sha256({ workItemPlanId: workItem.workItemPlanId, imageHash: asset.sha256 }).slice(0, 24);
  var reviewTexts = styleDNA.reviewTexts(workItem.assetSpec.styleId, workItem.assetSpec, phase);
  return {
    receiptId: 'offline-review.' + sha256({ workItemPlanId: workItem.workItemPlanId, imageHash: asset.sha256 }).slice(0, 24),
    phase: phase,
    workItemPlanId: workItem.workItemPlanId,
    targetVisualSlotId: workItem.targetVisualSlotId,
    reviewPolicyFingerprint: styleDNA.reviewPolicyFingerprint(workItem.assetSpec.styleId, workItem.assetSpec, phase),
    modelRevision: reviewContract.model.revision,
    modelFingerprint: modelFingerprint,
    imageSha256s: [asset.sha256],
    semanticMargin: 1,
    styleMargin: 1,
    decisions: [{
      decision: 'accepted',
      phase: phase,
      imageSha256: asset.sha256,
      modelRevision: reviewContract.model.revision,
      modelFingerprint: modelFingerprint,
      semanticSimilarity: 1,
      semanticMargin: 1,
      styleMargin: 1,
      compositionChecks: reviewTexts.compositionChecks.map(function(check) { return { id: check.id, margin: 1 }; })
    }],
    decision: 'accepted'
  };
}
function runOffline(requirementSet, options) {
  var normalized = normalizeAssetRequirementSet(requirementSet);
  var offlineOptions = normalizeOfflineOptions(options);
  var requestId = 'offline-run.' + sha256(normalized).slice(0, 24);
  var plan = productionPlanner.compile({
    requestId: requestId,
    projectId: normalized.projectId,
    sourceHash: normalized.sourceHash,
    requirements: normalized.requirements
  });
  plan.workItems.forEach(function(workItem) {
    if (workItem.artifactKind !== 'single-resource') fail('ASSET_ENGINE_OFFLINE_ARTIFACT_UNSUPPORTED', 'The deterministic offline runtime supports single-resource recipes only.');
  });
  var assetDir = directoryForAssets(offlineOptions.assetDir);
  var assets = plan.workItems.map(function(workItem) { return deterministicAsset(workItem, normalized, plan.productionSetId, assetDir); });
  var reviewReceipts = plan.workItems.map(function(workItem, index) { return reviewReceipt(workItem, assets[index]); });
  var workItemAcceptanceReceipts = plan.workItems.map(function(workItem, index) {
    return {
      workItemPlanId: workItem.workItemPlanId,
      finalRevisionId: assets[index].revisionId,
      targetVisualSlotId: workItem.targetVisualSlotId,
      deterministicEvidenceIds: [assets[index].sha256],
      reviewReceiptId: reviewReceipts[index].receiptId,
      styleId: workItem.assetSpec.styleId,
      decision: 'accepted'
    };
  });
  var targetVisualSlotIds = plan.workItems.map(function(workItem) { return workItem.targetVisualSlotId; });
  var acceptedRevisionByTargetVisualSlotId = {};
  plan.workItems.forEach(function(workItem, index) { acceptedRevisionByTargetVisualSlotId[workItem.targetVisualSlotId] = assets[index].revisionId; });
  var productionSetAcceptanceReceipt = {
    productionSetId: plan.productionSetId,
    workItemAcceptanceReceiptIds: workItemAcceptanceReceipts.map(workItemReceiptId),
    requiredSlotCoverage: {
      complete: true,
      missingTargetVisualSlotIds: [],
      expectedTargetVisualSlotIds: targetVisualSlotIds,
      acceptedTargetVisualSlotIds: targetVisualSlotIds
    },
    acceptedRevisionByTargetVisualSlotId: acceptedRevisionByTargetVisualSlotId,
    decision: 'accepted'
  };
  var assetManifest = {
    meta: {
      schemaVersion: 2,
      contractId: requestId + ':asset-manifest',
      createdAt: '1970-01-01T00:00:00.000Z',
      owner: 'AssetEngineDeterministicOffline',
      status: 'ready'
    },
    sourceHash: normalized.sourceHash,
    productionSetId: plan.productionSetId,
    assets: assets,
    summary: {
      resolved: assets.length,
      generated: assets.length,
      reused: 0,
      placeholders: 0,
      failed: 0,
      cacheHit: false,
      publishable: true
    }
  };
  return assetWorld.buildAcceptedAssetWorld({
    assetManifest: assetManifest,
    productionSetAcceptanceReceipt: productionSetAcceptanceReceipt,
    workItemAcceptanceReceipts: workItemAcceptanceReceipts,
    reviewReceipts: reviewReceipts
  });
}
function runProduction(input) {
  return require('../assets/src/asset-engine-langgraph').runAssetEngine(input);
}
function validateAcceptedAssetWorld(value, options) {
  return assetWorld.validateAcceptedAssetWorld(value, options);
}

module.exports = Object.freeze({
  contracts: contracts,
  createOfflineRequirementSet: createOfflineRequirementSet,
  runProduction: runProduction,
  runOffline: function(assetRequirementSet, options) {
    return Promise.resolve().then(function() { return runOffline(assetRequirementSet, options); });
  },
  validateAcceptedAssetWorld: validateAcceptedAssetWorld
});
