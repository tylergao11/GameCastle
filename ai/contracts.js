var fs = require('fs');
var path = require('path');

var CONTRACT_SCHEMA_PATH = path.join(__dirname, 'contracts', 'schema.json');

var CONTRACT_TYPES = [
  'BuildContract',
  'ModuleDslPatch',
  'AssetManifest',
  'AssetReview',
  'AssemblyReport',
  'ValidationReport',
];

var CONTRACT_OWNERS = [
  'RequirementModel',
  'DSLAgent',
  'ImageAgent',
  'VisionAgent',
  'RuntimeLinker',
  'RuntimeValidator',
];

var WORKFLOW_ROLE_CONTRACT_OWNERS = {
  requirement: 'RequirementModel',
  dsl: 'DSLAgent',
  dslModuleRepair: 'DSLAgent',
  dslInternalRepair: 'DSLAgent',
  imageGeneration: 'ImageAgent',
  vision: 'VisionAgent',
};

var CONTRACT_TYPE_OWNERS = {
  BuildContract: 'RequirementModel',
  ModuleDslPatch: 'DSLAgent',
  AssetManifest: 'ImageAgent',
  AssetReview: 'VisionAgent',
  AssemblyReport: 'RuntimeLinker',
  ValidationReport: 'RuntimeValidator',
};

function loadContractSchema() {
  return JSON.parse(fs.readFileSync(CONTRACT_SCHEMA_PATH, 'utf8'));
}

function getContractDefinition(schema, typeName) {
  schema = schema || loadContractSchema();
  if (!schema.$defs || !schema.$defs[typeName]) {
    throw new Error('Unknown contract type: ' + typeName);
  }
  return schema.$defs[typeName];
}

module.exports = {
  CONTRACT_SCHEMA_PATH: CONTRACT_SCHEMA_PATH,
  CONTRACT_TYPES: CONTRACT_TYPES,
  CONTRACT_OWNERS: CONTRACT_OWNERS,
  CONTRACT_TYPE_OWNERS: CONTRACT_TYPE_OWNERS,
  WORKFLOW_ROLE_CONTRACT_OWNERS: WORKFLOW_ROLE_CONTRACT_OWNERS,
  loadContractSchema: loadContractSchema,
  getContractDefinition: getContractDefinition,
};
