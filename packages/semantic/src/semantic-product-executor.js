var dictionary = require('./capability-semantic-dictionary');
var sourceContract = require('./game-semantic-source');
var linker = require('./semantic-runtime-linker');

function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'SemanticProductExecutor'; throw error; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function object(value, name) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('SEMANTIC_EXECUTION_REQUEST_INVALID', name + ' must be an object.'); return value; }
function allowed(value, fields, name) { Object.keys(value).forEach(function(key) { if (fields.indexOf(key) < 0) fail('SEMANTIC_EXECUTION_REQUEST_UNKNOWN_FIELD', name + ' contains unknown field: ' + key); }); }

function execute(request, options) {
  options = options || {};
  request = object(request, 'semantic execution request');
  allowed(request, ['requestId', 'source', 'revision'], 'semantic execution request');
  if (!request.source) fail('SEMANTIC_EXECUTION_SOURCE_REQUIRED', 'A complete GameSemanticSource is required.');
  var index = options.index || dictionary.loadIndex();
  var source = sourceContract.validateSource(request.source, { index: index });
  if (request.revision !== undefined) source = sourceContract.applyRevision(source, request.revision, { index: index });
  var assembly = linker.assemble(source, { index: index });
  var artifact = assembly.projectSeed;
  return {
    schemaVersion: 1,
    documentKind: 'semantic-product-execution',
    requestId: typeof request.requestId === 'string' && request.requestId ? request.requestId : null,
    sourceHash: assembly.sourceHash,
    dictionarySource: clone(assembly.dictionarySource),
    artifactKind: artifact.documentKind,
    artifact: artifact
  };
}

module.exports = { execute: execute };
