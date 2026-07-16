var assert = require('assert');
var governance = require('../../packages/providers/src/ai-provider-governance');

var original = {
  AI_PROVIDER: process.env.AI_PROVIDER,
  LLM_PROVIDER: process.env.LLM_PROVIDER,
  ASSET_MODEL_PROVIDER: process.env.ASSET_MODEL_PROVIDER,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_IMAGE_MODEL: process.env.OPENAI_IMAGE_MODEL,
  ASSET_ALLOW_EXTERNAL: process.env.ASSET_ALLOW_EXTERNAL,
  ASSET_MODEL_MAX_COST: process.env.ASSET_MODEL_MAX_COST,
  SEMANTIC_DSL_PROVIDER: process.env.SEMANTIC_DSL_PROVIDER,
  SEMANTIC_DSL_MODEL: process.env.SEMANTIC_DSL_MODEL,
  DIRECTOR_PLANNER_PROVIDER: process.env.DIRECTOR_PLANNER_PROVIDER,
  DIRECTOR_PLANNER_MODEL: process.env.DIRECTOR_PLANNER_MODEL,
  OLLAMA_ALLOW_LOCAL: process.env.OLLAMA_ALLOW_LOCAL,
  LLAMA_CPP_SEMANTIC_ALLOW_LOCAL: process.env.LLAMA_CPP_SEMANTIC_ALLOW_LOCAL,
  LLAMA_CPP_DIRECTOR_ALLOW_LOCAL: process.env.LLAMA_CPP_DIRECTOR_ALLOW_LOCAL
};
try {
  Object.keys(original).forEach(function(key) { delete process.env[key]; });
  assert.equal(governance.asset().provider, 'comfyui-local');
  var semantic = governance.semantic(), director = governance.director();
  assert.equal(semantic.provider, 'llama-cpp-semantic'); assert.equal(semantic.textModel, 'Qwen/Qwen3.5-9B'); assert.equal(semantic.openSource, true); assert.equal(semantic.localAllowed, false);
  assert.equal(director.provider, 'llama-cpp-director'); assert.equal(director.textModel, 'Qwen/Qwen3-4B-Instruct-2507'); assert.equal(director.openSource, true);
  process.env.LLAMA_CPP_SEMANTIC_ALLOW_LOCAL = 'true'; process.env.LLAMA_CPP_DIRECTOR_ALLOW_LOCAL = 'true'; process.env.SEMANTIC_DSL_MODEL = 'semantic-local'; process.env.DIRECTOR_PLANNER_MODEL = 'director-local';
  assert.equal(governance.semantic().textModel, 'semantic-local'); assert.equal(governance.semantic().localAllowed, true); assert.equal(governance.director().textModel, 'director-local');
  process.env.ASSET_MODEL_PROVIDER = 'openai'; process.env.OPENAI_API_KEY = 'test-key'; process.env.OPENAI_IMAGE_MODEL = 'image-test'; process.env.ASSET_ALLOW_EXTERNAL = 'true'; process.env.ASSET_MODEL_MAX_COST = '2.5';
  var asset = governance.asset(), policy = governance.assetPolicy();
  assert.equal(asset.provider, 'openai'); assert.equal(asset.apiKey, 'test-key'); assert.equal(asset.imageModel, 'image-test'); assert.equal(policy.allowExternal, true); assert.equal(policy.maxCost, 2.5);
  process.env.LLM_PROVIDER = 'deepseek';
  assert.equal(governance.semantic().provider, 'llama-cpp-semantic', 'Legacy global LLM_PROVIDER cannot redirect deterministic semantic DSL.');
  assert.equal(governance.director().provider, 'llama-cpp-director', 'Legacy global LLM_PROVIDER cannot redirect the Director Planner.');
  assert.throws(function() { governance.semantic({ provider: 'deepseek' }); }, function(error) { return error.code === 'OPEN_SOURCE_TEXT_PROVIDER_REQUIRED'; });
  assert.throws(function() { governance.director({ provider: 'deepseek' }); }, function(error) { return error.code === 'OPEN_SOURCE_TEXT_PROVIDER_REQUIRED'; });
  console.log('[AiProviderGovernance] Director Planner and semantic DSL default to explicit open-source llama.cpp models while asset policy stays independently configured');
} finally { Object.keys(original).forEach(function(key) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; }); }
