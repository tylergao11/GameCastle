'use strict';

// Asset-domain model port authorization. Does not require the providers package.
// ProviderRuntime is still injected separately when generation ports are needed.

function finiteCost(value) {
  if (value === undefined || value === null || value === '') return Infinity;
  if (value === Infinity) return Infinity;
  var number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : NaN;
}

function normalize(policy) {
  policy = policy || {};
  var provider = typeof policy.provider === 'string' && policy.provider.trim()
    ? policy.provider.trim()
    : 'comfyui-local';
  var simulated = policy.simulated === true || provider === 'simulated-local';
  var allowExternal = policy.allowExternal === true;
  // Official comfyui-local is the only local-only image stack in this engine.
  var localOnly = policy.localOnly === true || provider === 'comfyui-local';
  var localAllowed = policy.localAllowed === true;
  var maxCost = finiteCost(policy.maxCost === undefined ? Infinity : policy.maxCost);
  var allowedScopes = Array.isArray(policy.allowedScopes) && policy.allowedScopes.length
    ? policy.allowedScopes.slice()
    : (simulated ? ['project-local'] : ['ephemeral']);
  return {
    provider: provider,
    simulated: simulated,
    allowExternal: allowExternal,
    localAllowed: localAllowed,
    maxCost: maxCost,
    allowedScopes: allowedScopes,
    imageModel: policy.imageModel || null,
    visionModel: policy.visionModel || null,
    endpoint: policy.endpoint || null,
    localOnly: localOnly
  };
}

function authorizeModelPorts(ports, policy) {
  var normalized = normalize(policy);
  var denied = null;
  if (normalized.simulated !== true && normalized.localOnly !== true && normalized.allowExternal !== true) denied = 'MODEL_UNAVAILABLE';
  if (normalized.simulated !== true && normalized.localOnly === true && normalized.localAllowed !== true) denied = 'MODEL_UNAVAILABLE';
  if (!Number.isFinite(normalized.maxCost) && normalized.maxCost !== Infinity) denied = 'MODEL_BUDGET_EXHAUSTED';
  var wrapped = {};
  ['generateMaster'].forEach(function(name) {
    if (denied || !ports || typeof ports[name] !== 'function') return;
    wrapped[name] = async function(state) {
      var result = await ports[name](state);
      if (result && typeof result === 'object') {
        result.modelPolicy = {
          provider: normalized.provider,
          simulated: normalized.simulated,
          scope: normalized.allowedScopes[0]
        };
      }
      return result;
    };
  });
  if (ports && typeof ports.materializeCandidate === 'function') wrapped.materializeCandidate = ports.materializeCandidate;
  if (ports && typeof ports.discardCandidate === 'function') wrapped.discardCandidate = ports.discardCandidate;
  if (ports && typeof ports.reviewCandidate === 'function') wrapped.reviewCandidate = ports.reviewCandidate;
  if (ports && typeof ports.productionFingerprint === 'function') wrapped.productionFingerprint = ports.productionFingerprint;
  // Background removal is deterministic local work, not a generation model capability.
  if (ports && ports.backgroundRemoval && typeof ports.backgroundRemoval.remove === 'function') {
    wrapped.backgroundRemoval = ports.backgroundRemoval;
  }
  return {
    ports: wrapped,
    receipt: {
      allowed: !denied,
      code: denied,
      provider: normalized.provider,
      simulated: normalized.simulated,
      maxCost: normalized.maxCost,
      scope: normalized.allowedScopes[0]
    }
  };
}

module.exports = { authorizeModelPorts: authorizeModelPorts, normalize: normalize };
