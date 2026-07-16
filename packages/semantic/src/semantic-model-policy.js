var OUTPUT_TOKEN_LIMIT = 8196;
var REASONING_TOKEN_LIMIT = 0;
var DSL_TOKEN_RESERVE = OUTPUT_TOKEN_LIMIT - REASONING_TOKEN_LIMIT;
var MODEL = Object.freeze({ provider: 'llama-cpp-semantic', model: 'Qwen/Qwen3.5-9B', cachePolicy: Object.freeze({ commonPrefixWarmupRequests: 1 }) });

var PROFILES = Object.freeze({
  planner: Object.freeze({ thinking: Object.freeze({ type: 'disabled' }), reasoningEffort: null, temperature: 0 }),
  executor: Object.freeze({ thinking: Object.freeze({ type: 'disabled' }), reasoningEffort: null, temperature: 0 })
});

function profile(role) {
  if (!PROFILES[role]) { var error = new Error('Unknown semantic model role: ' + role); error.code = 'SEMANTIC_MODEL_ROLE_INVALID'; throw error; }
  return PROFILES[role];
}

module.exports = { MODEL: MODEL, OUTPUT_TOKEN_LIMIT: OUTPUT_TOKEN_LIMIT, REASONING_TOKEN_LIMIT: REASONING_TOKEN_LIMIT, DSL_TOKEN_RESERVE: DSL_TOKEN_RESERVE, PROFILES: PROFILES, profile: profile };
