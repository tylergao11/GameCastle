var OUTPUT_TOKEN_LIMIT = 8196;
var REASONING_TOKEN_LIMIT = 0;
var DSL_TOKEN_RESERVE = OUTPUT_TOKEN_LIMIT - REASONING_TOKEN_LIMIT;

// Runtime mode selects the LLM2 transport only.
// Director LLM1 stays domain-pinned to DeepSeek in director-model-port.js.
// development: both product text roles can run on DeepSeek without a local GPU service.
// production: Semantic DSL uses the open-source Qwen llama.cpp service.
var MODE_MODELS = Object.freeze({
  development: Object.freeze({
    mode: 'development',
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    allowExternal: true,
    cachePolicy: Object.freeze({ commonPrefixWarmupRequests: 2 })
  }),
  production: Object.freeze({
    mode: 'production',
    provider: 'llama-cpp-semantic',
    model: 'Qwen/Qwen3.5-9B',
    allowExternal: false,
    cachePolicy: Object.freeze({ commonPrefixWarmupRequests: 1 })
  })
});

var PROFILES = Object.freeze({
  planner: Object.freeze({ thinking: Object.freeze({ type: 'disabled' }), reasoningEffort: null, temperature: 0 }),
  executor: Object.freeze({ thinking: Object.freeze({ type: 'disabled' }), reasoningEffort: null, temperature: 0 })
});

function normalizeMode(value) {
  var raw = String(value == null ? '' : value).trim().toLowerCase();
  if (!raw) return 'production';
  if (raw === 'dev') return 'development';
  if (raw === 'prod') return 'production';
  return raw;
}

function resolveMode(explicit) {
  var mode = normalizeMode(explicit !== undefined ? explicit : process.env.GAMECASTLE_RUNTIME_MODE);
  if (!MODE_MODELS[mode]) {
    var error = new Error('GAMECASTLE_RUNTIME_MODE must be development or production (got ' + String(explicit !== undefined ? explicit : process.env.GAMECASTLE_RUNTIME_MODE) + ').');
    error.code = 'SEMANTIC_RUNTIME_MODE_INVALID';
    throw error;
  }
  return mode;
}

function resolveModel(explicitMode) {
  return MODE_MODELS[resolveMode(explicitMode)];
}

function profile(role) {
  if (!PROFILES[role]) {
    var error = new Error('Unknown semantic model role: ' + role);
    error.code = 'SEMANTIC_MODEL_ROLE_INVALID';
    throw error;
  }
  return PROFILES[role];
}

// Lazy MODEL keeps selection bound to the process environment at use time
// (run-with-local-env loads .env.local before the child process starts).
var policy = {
  OUTPUT_TOKEN_LIMIT: OUTPUT_TOKEN_LIMIT,
  REASONING_TOKEN_LIMIT: REASONING_TOKEN_LIMIT,
  DSL_TOKEN_RESERVE: DSL_TOKEN_RESERVE,
  PROFILES: PROFILES,
  MODE_MODELS: MODE_MODELS,
  resolveMode: resolveMode,
  resolveModel: resolveModel,
  profile: profile
};

Object.defineProperty(policy, 'MODEL', {
  enumerable: true,
  configurable: false,
  get: function() { return resolveModel(); }
});

module.exports = policy;
