function requirePort(ports, name) { if (!ports || typeof ports[name] !== 'function') throw new Error('Asset model port is not configured: ' + name); return ports[name]; }
function createAssetModelPorts(ports) {
  return {
    generate: async function(state) { return requirePort(ports, 'generate')(state); },
    edit: async function(state) { if (!state.source || !state.source.parentRevisionId) throw new Error('ImageEdit requires parentRevisionId'); return requirePort(ports, 'edit')(state); },
    review: async function(state) { return requirePort(ports, 'review')(state); },
  };
}
module.exports = { createAssetModelPorts: createAssetModelPorts };
