var governance = require('./ai-provider-governance');
function normalize(policy) {
  policy = policy || {};
  var resolved;
  try { resolved = governance.assetPolicy(policy); } catch (_error) { resolved = governance.assetPolicy({}); resolved.provider = policy.provider || resolved.provider; resolved.simulated = false; resolved.allowExternal = false; }
  return { provider: resolved.provider, simulated: policy.simulated === undefined ? resolved.simulated : policy.simulated === true, allowExternal: policy.allowExternal === undefined ? resolved.allowExternal : policy.allowExternal === true, maxCost: policy.maxCost === undefined ? resolved.maxCost : Number(policy.maxCost), allowedScopes: policy.allowedScopes || resolved.allowedScopes, imageModel: resolved.imageModel, visionModel: resolved.visionModel, endpoint: resolved.endpoint };
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
  if (ports && ports.localPlan && typeof ports.localPlan.run === 'function') wrapped.localPlan = ports.localPlan;
  return { ports: wrapped, receipt: { allowed: !denied, code: denied, provider: normalized.provider, simulated: normalized.simulated, maxCost: normalized.maxCost, scope: normalized.allowedScopes[0] } };
}

module.exports = { authorizeModelPorts: authorizeModelPorts, normalize: normalize };
