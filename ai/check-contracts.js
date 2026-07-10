var agentWorkflow = require('./agent-workflow');
var contracts = require('./contracts');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function getJsonPointer(root, pointer) {
  assert(pointer.indexOf('#/') === 0, 'Only local JSON schema refs are allowed: ' + pointer);
  var parts = pointer.slice(2).split('/').map(function(part) {
    return part.replace(/~1/g, '/').replace(/~0/g, '~');
  });
  var current = root;
  for (var i = 0; i < parts.length; i++) {
    assert(current && Object.prototype.hasOwnProperty.call(current, parts[i]), 'Broken $ref: ' + pointer);
    current = current[parts[i]];
  }
  return current;
}

function walkSchema(node, visitor) {
  if (!node || typeof node !== 'object') return;
  visitor(node);
  Object.keys(node).forEach(function(key) {
    var value = node[key];
    if (Array.isArray(value)) {
      value.forEach(function(item) { walkSchema(item, visitor); });
    } else if (value && typeof value === 'object') {
      walkSchema(value, visitor);
    }
  });
}

function requireObjectDef(schema, defName) {
  var def = contracts.getContractDefinition(schema, defName);
  assert(def.type === 'object', defName + ' must be an object schema');
  assert(def.required && def.required.length, defName + ' must declare required fields');
  assert(def.additionalProperties === false, defName + ' must reject unknown fields');
  return def;
}

function requireRequiredFields(def, defName, fields) {
  fields.forEach(function(field) {
    assert(def.required.indexOf(field) >= 0, defName + ' missing required field: ' + field);
    assert(def.properties && def.properties[field], defName + ' missing property schema: ' + field);
  });
}

function enumValues(schema, pathParts) {
  var node = schema;
  pathParts.forEach(function(part) { node = node[part]; });
  return asArray(node.enum);
}

function main() {
  var schema = contracts.loadContractSchema();
  assert(schema.schemaVersion === 1, 'contract schemaVersion must be 1');
  assert(schema.$defs && typeof schema.$defs === 'object', 'schema must define $defs');

  contracts.CONTRACT_TYPES.forEach(function(typeName) {
    assert(schema.contractTypes.indexOf(typeName) >= 0, 'contractTypes missing ' + typeName);
    var def = requireObjectDef(schema, typeName);
    assert(def['x-contractOwner'] === contracts.CONTRACT_TYPE_OWNERS[typeName],
      typeName + ' x-contractOwner must be ' + contracts.CONTRACT_TYPE_OWNERS[typeName]);
  });
  assert(schema.contractTypes.length === contracts.CONTRACT_TYPES.length, 'contractTypes must not contain stale entries');

  walkSchema(schema, function(node) {
    if (node.$ref) getJsonPointer(schema, node.$ref);
  });

  var meta = requireObjectDef(schema, 'ContractMeta');
  requireRequiredFields(meta, 'ContractMeta', ['schemaVersion', 'contractId', 'createdAt', 'owner', 'status']);
  var ownerEnum = enumValues(schema, ['$defs', 'ContractMeta', 'properties', 'owner']);
  contracts.CONTRACT_OWNERS.forEach(function(owner) {
    assert(ownerEnum.indexOf(owner) >= 0, 'ContractMeta.owner missing owner: ' + owner);
  });

  var build = requireObjectDef(schema, 'BuildContract');
  requireRequiredFields(build, 'BuildContract', [
    'meta',
    'request',
    'world',
    'styleGuide',
    'moduleContract',
    'assetContract',
    'parallelPlan',
    'acceptance',
    'cachePolicy',
    'repairPolicy',
  ]);
  requireRequiredFields(build.properties.request, 'BuildContract.request', ['rawUserPrompt', 'projectMode', 'iterationIntent']);
  requireRequiredFields(build.properties.world, 'BuildContract.world', ['projectWorldHash', 'knownScenes', 'knownModules']);
  requireRequiredFields(build.properties.moduleContract, 'BuildContract.moduleContract', [
    'moduleIntents',
    'gameplaySlots',
    'stateVariables',
    'networkPolicy',
  ]);
  requireRequiredFields(build.properties.assetContract, 'BuildContract.assetContract', [
    'slots',
    'globalConstraints',
    'resolutionDefaults',
  ]);
  requireRequiredFields(build.properties.assetContract.properties.globalConstraints, 'BuildContract.assetContract.globalConstraints', [
    'allowTextInImages',
    'allowedFormats',
    'outputRoot',
    'cloudRepoRequired',
  ]);
  requireRequiredFields(build.properties.assetContract.properties.resolutionDefaults, 'BuildContract.assetContract.resolutionDefaults', [
    'preferRepo',
    'generateOnlyOnMiss',
    'placeholderIsDebt',
    'cacheKeyFields',
  ]);

  var assetSlot = requireObjectDef(schema, 'AssetSlot');
  requireRequiredFields(assetSlot, 'AssetSlot', [
    'slotId',
    'kind',
    'purpose',
    'required',
    'owner',
    'target',
    'semanticTags',
    'styleTags',
    'constraints',
    'repoPolicy',
    'resolutionPolicy',
    'fallback',
    'publishPolicy',
  ]);
  assert(assetSlot.properties.owner.const === 'RuntimeAssetResolver', 'AssetSlot.owner must be RuntimeAssetResolver');
  requireRequiredFields(assetSlot.properties.repoPolicy, 'AssetSlot.repoPolicy', [
    'preferReuse',
    'lookupOrder',
    'maxCandidates',
    'allowCrossGameReuse',
    'allowLicensedAssets',
    'requiredLicense',
    'minConfidence',
  ]);
  requireRequiredFields(assetSlot.properties.resolutionPolicy, 'AssetSlot.resolutionPolicy', [
    'allowExactCache',
    'allowRepoMatch',
    'allowVariant',
    'allowGeneration',
    'allowPlaceholder',
    'visionReview',
  ]);
  requireRequiredFields(assetSlot.properties.fallback, 'AssetSlot.fallback', [
    'strategy',
    'source',
    'publishable',
    'repoEligible',
    'trainingEligible',
    'blocksFinalExport',
    'debt',
  ]);
  assert(assetSlot.properties.fallback.properties.source.const === 'runtimeFallback',
    'AssetSlot.fallback.source must be runtimeFallback');
  requireRequiredFields(build.properties.parallelPlan, 'BuildContract.parallelPlan', ['canRunInParallel', 'tasks', 'joinStrategy']);
  requireRequiredFields(build.properties.cachePolicy, 'BuildContract.cachePolicy', [
    'semanticHashInputs',
    'assetHashInputs',
    'invalidateOn',
  ]);
  requireRequiredFields(build.properties.repairPolicy, 'BuildContract.repairPolicy', ['maxRounds', 'routeByOwner', 'retryOwners']);
  var buildProjectModes = enumValues(schema, ['$defs', 'BuildContract', 'properties', 'request', 'properties', 'projectMode']);
  assert(buildProjectModes.indexOf('intent-repair') >= 0, 'BuildContract projectMode must name Intent repair explicitly');

  var assetManifest = requireObjectDef(schema, 'AssetManifest');
  requireRequiredFields(assetManifest, 'AssetManifest', ['meta', 'buildContractId', 'assets', 'summary']);
  assert(assetManifest['x-contractOwner'] === 'RuntimeAssetResolver', 'AssetManifest must be owned by RuntimeAssetResolver');
  requireRequiredFields(assetManifest.properties.summary, 'AssetManifest.summary', [
    'resolved',
    'generated',
    'reused',
    'placeholders',
    'failed',
    'cacheHit',
    'publishable',
  ]);
  var assetItem = assetManifest.properties.assets.items;
  requireRequiredFields(assetItem, 'AssetManifest.assets[]', [
    'slotId',
    'status',
    'source',
    'path',
    'format',
    'sha1',
    'width',
    'height',
    'transparent',
    'semanticTags',
    'styleTags',
    'confidence',
    'publishability',
    'resolution',
  ]);
  assert(assetItem.properties.cost, 'AssetManifest.assets[] must allow cost evidence for expensive generated assets');
  requireRequiredFields(assetItem.properties.publishability, 'AssetManifest.assets[].publishability', [
    'playable',
    'publishable',
    'repoEligible',
    'trainingEligible',
    'blocksFinalExport',
    'debt',
  ]);
  requireRequiredFields(assetItem.properties.resolution, 'AssetManifest.assets[].resolution', [
    'strategy',
    'rank',
    'candidatesConsidered',
    'cacheHit',
    'ownerOnFailure',
  ]);
  var assetReview = requireObjectDef(schema, 'AssetReview');
  requireRequiredFields(assetReview, 'AssetReview', ['meta', 'buildContractId', 'reviews', 'summary']);

  var assembly = requireObjectDef(schema, 'AssemblyReport');
  requireRequiredFields(assembly, 'AssemblyReport', [
    'meta',
    'buildContractId',
    'inputs',
    'bindings',
    'outputs',
    'conflicts',
    'nextAction',
  ]);
  requireRequiredFields(assembly.properties.inputs, 'AssemblyReport.inputs', [
    'intentBuildPlan',
    'assetManifest',
    'assetReview',
  ]);
  requireRequiredFields(assembly.properties.outputs, 'AssemblyReport.outputs', [
    'finalArtifactPath',
    'projectPath',
    'resourceManifestPath',
  ]);
  var assemblyNextActions = enumValues(schema, ['$defs', 'AssemblyReport', 'properties', 'nextAction']);
  assert(assemblyNextActions.indexOf('route-to-owner') >= 0,
    'AssemblyReport.nextAction must support owner routing');

  var validation = requireObjectDef(schema, 'ValidationReport');
  requireRequiredFields(validation, 'ValidationReport', ['meta', 'buildContractId', 'checks', 'summary', 'nextAction']);
  var validationNextActions = enumValues(schema, ['$defs', 'ValidationReport', 'properties', 'nextAction']);
  assert(validationNextActions.indexOf('route-to-owner') >= 0,
    'ValidationReport.nextAction must support owner routing');
  requireRequiredFields(validation.properties.summary, 'ValidationReport.summary', ['passed', 'failed', 'blocked', 'cacheHit']);

  Object.keys(agentWorkflow.ROLE_DEFINITIONS).forEach(function(roleId) {
    var expectedOwner = contracts.WORKFLOW_ROLE_CONTRACT_OWNERS[roleId];
    assert(expectedOwner, 'workflow role has no contract owner mapping: ' + roleId);
    assert(ownerEnum.indexOf(expectedOwner) >= 0, 'workflow role maps to unknown contract owner: ' + roleId);
    assert(agentWorkflow.ROLE_DEFINITIONS[roleId].contractOwner === expectedOwner,
      'workflow role contractOwner mismatch for ' + roleId);
  });

  console.log('[Contracts] ' + schema.contractTypes.length + ' contract types OK');
}

main();
