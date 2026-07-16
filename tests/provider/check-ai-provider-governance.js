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
  OLLAMA_ALLOW_LOCAL: process.env.OLLAMA_ALLOW_LOCAL
};
try {
  Object.keys(original).forEach(function(key) { delete process.env[key]; });
  assert.equal(governance.asset().provider, 'comfyui-local');
  var semantic = governance.semantic(), director = governance.director();
  assert.equal(semantic.provider, 'ollama'); assert.equal(semantic.textModel, 'qwen3:8b'); assert.equal(semantic.openSource, true); assert.equal(semantic.localAllowed, false);
  assert.equal(director.provider, 'ollama'); assert.equal(director.textModel, 'qwen3:8b'); assert.equal(director.openSource, true);
  process.env.OLLAMA_ALLOW_LOCAL = 'true'; process.env.SEMANTIC_DSL_MODEL = 'qwen3:14b'; process.env.DIRECTOR_PLANNER_MODEL = 'qwen3:8b';
  assert.equal(governance.semantic().textModel, 'qwen3:14b'); assert.equal(governance.semantic().localAllowed, true); assert.equal(governance.director().textModel, 'qwen3:8b');
  process.env.ASSET_MODEL_PROVIDER = 'openai'; process.env.OPENAI_API_KEY = 'test-key'; process.env.OPENAI_IMAGE_MODEL = 'image-test'; process.env.ASSET_ALLOW_EXTERNAL = 'true'; process.env.ASSET_MODEL_MAX_COST = '2.5';
  var asset = governance.asset(), policy = governance.assetPolicy();
  assert.equal(asset.provider, 'openai'); assert.equal(asset.apiKey, 'test-key'); assert.equal(asset.imageModel, 'image-test'); assert.equal(policy.allowExternal, true); assert.equal(policy.maxCost, 2.5);
  process.env.LLM_PROVIDER = 'deepseek';
  assert.equal(governance.semantic().provider, 'ollama', 'Legacy global LLM_PROVIDER cannot redirect deterministic semantic DSL.');
  assert.equal(governance.director().provider, 'ollama', 'Legacy global LLM_PROVIDER cannot redirect the Director Planner.');
  assert.throws(function() { governance.semantic({ provider: 'deepseek' }); }, function(error) { return error.code === 'OPEN_SOURCE_TEXT_PROVIDER_REQUIRED'; });
  assert.throws(function() { governance.director({ provider: 'deepseek' }); }, function(error) { return error.code === 'OPEN_SOURCE_TEXT_PROVIDER_REQUIRED'; });
  console.log('[AiProviderGovernance] Director Planner and semantic DSL default to explicit open-source Ollama models while asset policy stays independently configured');
} finally { Object.keys(original).forEach(function(key) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; }); }
