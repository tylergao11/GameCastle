var semanticModule = require('@gamecastle/semantic-module');
var assemblyModule = require('@gamecastle/assembly-module');

function fail(code, message) {
  var error = new Error(message);
  error.code = code;
  error.owner = 'SemanticProductExecutor';
  throw error;
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function object(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('SEMANTIC_EXECUTION_REQUEST_INVALID', name + ' must be an object.');
  return value;
}
function allowed(value, fields, name) {
  Object.keys(value).forEach(function(key) {
    if (fields.indexOf(key) < 0) fail('SEMANTIC_EXECUTION_REQUEST_UNKNOWN_FIELD', name + ' contains unknown field: ' + key);
  });
}

// Product-layer composition: public SemanticAssembly + assembly-module seed. Not owned by packages/semantic.
function execute(request) {
  request = object(request, 'semantic execution request');
  allowed(request, ['requestId', 'source', 'revision'], 'semantic execution request');
  if (!request.source) fail('SEMANTIC_EXECUTION_SOURCE_REQUIRED', 'A complete GameSemanticSource is required.');
  var source = semanticModule.validate(request.source);
  if (request.revision !== undefined) source = semanticModule.applyRevision(source, request.revision);
  var semanticAssembly = semanticModule.compileSemanticAssembly(source);
  var artifact = assemblyModule.createProjectSeed({ semanticAssembly: semanticAssembly });
  return {
    schemaVersion: 1,
    documentKind: 'semantic-product-execution',
    requestId: typeof request.requestId === 'string' && request.requestId ? request.requestId : null,
    sourceHash: semanticAssembly.sourceHash,
    dictionarySource: clone(semanticAssembly.dictionarySource),
    semanticAssemblyHash: semanticAssembly.contentHash,
    artifactKind: artifact.documentKind,
    artifact: artifact
  };
}

module.exports = { execute: execute };
