var assert = require('assert');
var governance = require('./ai-provider-governance');

var original = { AI_PROVIDER: process.env.AI_PROVIDER, LLM_PROVIDER: process.env.LLM_PROVIDER, ASSET_MODEL_PROVIDER: process.env.ASSET_MODEL_PROVIDER, OPENAI_API_KEY: process.env.OPENAI_API_KEY, OPENAI_IMAGE_MODEL: process.env.OPENAI_IMAGE_MODEL, ASSET_ALLOW_EXTERNAL: process.env.ASSET_ALLOW_EXTERNAL, ASSET_MODEL_MAX_COST: process.env.ASSET_MODEL_MAX_COST };
try {
  delete process.env.AI_PROVIDER; delete process.env.LLM_PROVIDER; delete process.env.ASSET_MODEL_PROVIDER;
  assert.equal(governance.asset().provider, 'comfyui-local');
  process.env.ASSET_MODEL_PROVIDER = 'openai'; process.env.OPENAI_API_KEY = 'test-key'; process.env.OPENAI_IMAGE_MODEL = 'image-test'; process.env.ASSET_ALLOW_EXTERNAL = 'true'; process.env.ASSET_MODEL_MAX_COST = '2.5';
  var asset = governance.asset(), policy = governance.assetPolicy();
  assert.equal(asset.provider, 'openai'); assert.equal(asset.apiKey, 'test-key'); assert.equal(asset.imageModel, 'image-test'); assert.equal(policy.allowExternal, true); assert.equal(policy.maxCost, 2.5);
  process.env.LLM_PROVIDER = 'deepseek';
  assert.equal(governance.semantic().provider, 'deepseek');
  console.log('[AiProviderGovernance] semantic and asset provider policy share one environment-backed source');
} finally { Object.keys(original).forEach(function(key) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; }); }
