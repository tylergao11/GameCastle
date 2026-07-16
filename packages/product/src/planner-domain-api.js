var SCHEMA_VERSION = 1;

var OPERATIONS = Object.freeze({
  semantic: Object.freeze({ operation: 'semantic.design', input: 'semantic-design-request', output: 'semantic-design-result', owner: 'SemanticDomain' }),
  asset: Object.freeze({ operation: 'asset.realize', input: 'asset-realization-request', output: 'asset-realization-result', owner: 'AssetDomain' }),
  assembly: Object.freeze({ operation: 'assembly.verify', input: 'assembly-verification-request', output: 'assembly-verification-result', owner: 'AssemblyDomain' })
});

function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'PlannerDomainApi'; throw error; }
function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function object(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('PLANNER_DOMAIN_API_INVALID', label + ' must be a structure.'); return value; }
function exact(value, fields, label) { Object.keys(value).forEach(function(key) { if (fields.indexOf(key) < 0) fail('PLANNER_DOMAIN_API_INVALID', label + ' contains unknown field: ' + key); }); fields.forEach(function(key) { if (!Object.prototype.hasOwnProperty.call(value, key)) fail('PLANNER_DOMAIN_API_INVALID', label + ' requires field: ' + key); }); }

function describe() {
  return Object.keys(OPERATIONS).map(function(domain) { return Object.assign({ schemaVersion: SCHEMA_VERSION, domain: domain }, clone(OPERATIONS[domain])); });
}
function create(ports) {
  ports = object(ports, 'domain ports'); exact(ports, Object.keys(OPERATIONS), 'domain ports');
  Object.keys(OPERATIONS).forEach(function(domain) { if (!ports[domain] || typeof ports[domain].invoke !== 'function') fail('PLANNER_DOMAIN_PORT_INVALID', domain + ' port requires invoke(input).'); });
  return {
    schemaVersion: SCHEMA_VERSION,
    describe: describe,
    invoke: async function(call) {
      call = object(call, 'domain call'); exact(call, ['domain', 'operation', 'input'], 'domain call');
      var contract = OPERATIONS[call.domain];
      if (!contract || call.operation !== contract.operation) fail('PLANNER_DOMAIN_OPERATION_INVALID', 'Domain call operation is outside the domain contract: ' + call.domain + '/' + call.operation);
      object(call.input, 'domain call.input');
      var output = await ports[call.domain].invoke(call.input);
      if (!output || typeof output !== 'object' || Array.isArray(output)) fail('PLANNER_DOMAIN_RESULT_INVALID', call.domain + ' returned no structured result.');
      return { schemaVersion: SCHEMA_VERSION, domain: call.domain, operation: call.operation, outputKind: contract.output, output: output };
    }
  };
}

function semanticPort(runtime) { if (!runtime || typeof runtime.invoke !== 'function') fail('PLANNER_DOMAIN_PORT_INVALID', 'Semantic adapter requires invoke(input).'); return { invoke: function(input) { return runtime.invoke(input); } }; }
function assetPort(pipeline) { if (!pipeline || typeof pipeline.run !== 'function') fail('PLANNER_DOMAIN_PORT_INVALID', 'Asset adapter requires run(input).'); return { invoke: function(input) { return pipeline.run(input); } }; }
function assemblyPort(pipeline) { if (!pipeline || typeof pipeline.run !== 'function') fail('PLANNER_DOMAIN_PORT_INVALID', 'Assembly adapter requires run(input).'); return { invoke: function(input) { return pipeline.run(input); } }; }

module.exports = { SCHEMA_VERSION: SCHEMA_VERSION, OPERATIONS: OPERATIONS, describe: describe, create: create, semanticPort: semanticPort, assetPort: assetPort, assemblyPort: assemblyPort };
