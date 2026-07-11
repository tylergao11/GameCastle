function normalize(policy) {
  policy = policy || {};
  return {
    provider: policy.provider || 'simulated-local',
    simulated: policy.simulated !== false,
    allowExternal: policy.allowExternal === true,
    maxCost: policy.maxCost === undefined ? Infinity : Number(policy.maxCost),
    allowedScopes: policy.allowedScopes || ['ephemeral']
  };
}

function authorizeModelPorts(ports, policy) {
  var normalized = normalize(policy), denied = null;
  if (normalized.simulated !== true && normalized.allowExternal !== true) denied = 'MODEL_UNAVAILABLE';
  if (!Number.isFinite(normalized.maxCost) && normalized.maxCost !== Infinity) denied = 'MODEL_BUDGET_EXHAUSTED';
  var wrapped = {};
  ['generate', 'edit', 'review', 'variant'].forEach(function(name) {
    if (denied || !ports || typeof ports[name] !== 'function') return;
    wrapped[name] = async function(state) {
      var result = await ports[name](state);
      if (result && typeof result === 'object') result.modelPolicy = { provider: normalized.provider, simulated: normalized.simulated, scope: normalized.allowedScopes[0] };
      return result;
    };
  });
  if (ports && ports.localDerive && typeof ports.localDerive.derive === 'function') wrapped.localDerive = ports.localDerive;
  return { ports: wrapped, receipt: { allowed: !denied, code: denied, provider: normalized.provider, simulated: normalized.simulated, maxCost: normalized.maxCost, scope: normalized.allowedScopes[0] } };
}

module.exports = { authorizeModelPorts: authorizeModelPorts, normalize: normalize };
