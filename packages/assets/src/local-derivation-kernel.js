var contract = require('../contracts/local-derivation-contract.json');
var styleDictionary = require('../contracts/asset-style-dictionary.json');

function error(code, message) { var value = new Error(message); value.code = code; return value; }
function assertSpec(spec) {
  if (!spec || spec.schemaVersion !== contract.schemaVersion || spec.dictionaryId !== contract.styleDictionaryId || !styleDictionary.styles[spec.styleId] || typeof spec.operationId !== 'string' || !spec.operationId || contract.operations.indexOf(spec.op) < 0) throw error('LOCAL_OPERATION_INVALID', 'OperationSpec is invalid, has no known dictionary style, or is unsupported.');
  if (!spec.input || typeof spec.input.contentHash !== 'string' || !spec.input.contentHash || !spec.output || spec.output.format !== 'png' || spec.output.transparent !== true) throw error('LOCAL_OPERATION_INVALID', 'OperationSpec must identify a PNG input and transparent PNG output.');
  if (contract.scopes.indexOf(spec.scope) < 0) throw error('LOCAL_OPERATION_SCOPE_INVALID', 'Local derivation may only write private or project-local scope.');
}
function createLocalDerivationKernel(handlers) {
  handlers = handlers || require('./local-derivation-handlers').createDefaultHandlers();
  return {
    contract: contract,
    execute: async function(spec, context) {
      assertSpec(spec);
      var handler = handlers[spec.op];
      if (typeof handler !== 'function') throw error('LOCAL_OPERATION_UNAVAILABLE', 'No local handler is registered for ' + spec.op + '.');
      var result = await handler(spec, context || {});
      if (!result || typeof result.inputHash !== 'string' || typeof result.outputHash !== 'string' || !result.parentRevisionId) throw error('LOCAL_OPERATION_RECEIPT_INVALID', 'Local handler did not return a complete immutable receipt.');
      return Object.assign({ schemaVersion: contract.schemaVersion, owner: 'LocalDerivationKernel', op: spec.op, operationId: spec.operationId, dictionaryId: spec.dictionaryId, styleId: spec.styleId, scriptVersion: result.scriptVersion || 'unversioned', scope: spec.scope }, result);
    },
  };
}
module.exports = { createLocalDerivationKernel: createLocalDerivationKernel, assertSpec: assertSpec };
