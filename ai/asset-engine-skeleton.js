var contract = require('../shared/asset-engine-contract.json');
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function indexById(items) { return (items || []).reduce(function(index, item) { index[item.id] = item; return index; }, {}); }
function createCapabilityRegistry(implementations) {
  implementations = implementations || {}; var stages = indexById(contract.stages);
  return { contractId: contract.contractId, describe: function(id) { return stages[id] ? clone(stages[id]) : null; }, list: function() { return contract.stages.map(clone); }, has: function(id) { return typeof implementations[id] === 'function'; }, invoke: async function(id, context) {
    if (!stages[id]) throw new Error('Unknown asset engine stage: ' + id);
    if (typeof implementations[id] !== 'function') { var error = new Error('Asset engine capability is not implemented: ' + id); error.code = 'CAPABILITY_UNIMPLEMENTED'; error.stageId = id; error.owner = stages[id].owner; throw error; }
    return implementations[id](context);
  }};
}
function assertTransition(from, to) { if (!contract.transitions.some(function(pair) { return pair[0] === from && pair[1] === to; })) throw new Error('Invalid asset state transition: ' + from + ' -> ' + to); return true; }
function assertArtifact(name, value) { var fields = contract.artifacts[name]; if (!fields) throw new Error('Unknown asset artifact: ' + name); var missing = fields.filter(function(field) { return value == null || value[field] === undefined; }); if (missing.length) throw new Error(name + ' missing required fields: ' + missing.join(', ')); return true; }
function createAssetEngineSkeleton(implementations) { var registry = createCapabilityRegistry(implementations); return { contract: clone(contract), registry: registry, assertTransition: assertTransition, assertArtifact: assertArtifact, runStage: registry.invoke }; }
module.exports = { contract: contract, createAssetEngineSkeleton: createAssetEngineSkeleton, createCapabilityRegistry: createCapabilityRegistry, assertTransition: assertTransition, assertArtifact: assertArtifact };
