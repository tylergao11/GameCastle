var governance = require('./ai-provider-governance');
function normalize(policy) {
  policy = policy || {};
  var resolved;
  try { resolved = governance.assetPolicy(policy); } catch (_error) { resolved = governance.assetPolicy({}); resolved.provider = policy.provider || resolved.provider; resolved.simulated = false; resolved.allowExternal = false; }
  return { provider: resolved.provider, simulated: policy.simulated === undefined ? resolved.simulated : policy.simulated === true, allowExternal: policy.allowExternal === undefined ? resolved.allowExternal : policy.allowExternal === true, localAllowed: policy.localAllowed === undefined ? resolved.localAllowed : policy.localAllowed === true, maxCost: policy.maxCost === undefined ? resolved.maxCost : Number(policy.maxCost), allowedScopes: policy.allowedScopes || resolved.allowedScopes, imageModel: resolved.imageModel, visionModel: resolved.visionModel, endpoint: resolved.endpoint, localOnly: resolved.localOnly === true };
}

function authorizeModelPorts(ports, policy) {
  var normalized = normalize(policy), denied = null;
  if (normalized.simulated !== true && normalized.localOnly !== true && normalized.allowExternal !== true) denied = 'MODEL_UNAVAILABLE';
  if (normalized.simulated !== true && normalized.localOnly === true && normalized.localAllowed !== true) denied = 'MODEL_UNAVAILABLE';
  if (!Number.isFinite(normalized.maxCost) && normalized.maxCost !== Infinity) denied = 'MODEL_BUDGET_EXHAUSTED';
  var wrapped = {};
  ['generateMaster'].forEach(function(name) {
    if (denied || !ports || typeof ports[name] !== 'function') return;
    wrapped[name] = async function(state) {
      var result = await ports[name](state);
      if (result && typeof result === 'object') result.modelPolicy = { provider: normalized.provider, simulated: normalized.simulated, scope: normalized.allowedScopes[0] };
      return result;
    };
  });
  if (ports && typeof ports.materializeCandidate === 'function') wrapped.materializeCandidate = ports.materializeCandidate;
  if (ports && typeof ports.discardCandidate === 'function') wrapped.discardCandidate = ports.discardCandidate;
  if (ports && typeof ports.reviewCandidate === 'function') wrapped.reviewCandidate = ports.reviewCandidate;
  if (ports && typeof ports.productionFingerprint === 'function') wrapped.productionFingerprint = ports.productionFingerprint;
  // Background removal is a separately pinned deterministic local operation, not
  // a model-generation capability. Keep its supplied port so the derivation
  // pipeline can use the verified local implementation (or an explicit test
  // double) after model authorization.
  if (ports && ports.backgroundRemoval && typeof ports.backgroundRemoval.remove === 'function') wrapped.backgroundRemoval = ports.backgroundRemoval;
  return { ports: wrapped, receipt: { allowed: !denied, code: denied, provider: normalized.provider, simulated: normalized.simulated, maxCost: normalized.maxCost, scope: normalized.allowedScopes[0] } };
}

module.exports = { authorizeModelPorts: authorizeModelPorts, normalize: normalize };
