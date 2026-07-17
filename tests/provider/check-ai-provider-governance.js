var assert = require('assert');
var governance = require('../../packages/providers/src/ai-provider-governance');

var original = {
  ASSET_MODEL_PROVIDER: process.env.ASSET_MODEL_PROVIDER,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_IMAGE_MODEL: process.env.OPENAI_IMAGE_MODEL,
  ASSET_ALLOW_EXTERNAL: process.env.ASSET_ALLOW_EXTERNAL,
  ASSET_MODEL_MAX_COST: process.env.ASSET_MODEL_MAX_COST,
  OLLAMA_ALLOW_LOCAL: process.env.OLLAMA_ALLOW_LOCAL
};
try {
  Object.keys(original).forEach(function(key) { delete process.env[key]; });
  assert.equal(governance.asset().provider, 'comfyui-local');
  process.env.OLLAMA_ALLOW_LOCAL = 'true';
  var localText = governance.resolve('ollama', { textModel: 'domain-owned-model' }, governance.governance.assetDefaults);
  assert.equal(localText.textModel, 'domain-owned-model'); assert.equal(localText.localAllowed, true);
  process.env.ASSET_MODEL_PROVIDER = 'openai'; process.env.OPENAI_API_KEY = 'test-key'; process.env.OPENAI_IMAGE_MODEL = 'image-test'; process.env.ASSET_ALLOW_EXTERNAL = 'true'; process.env.ASSET_MODEL_MAX_COST = '2.5';
  var asset = governance.asset(), policy = governance.assetPolicy();
  assert.equal(asset.provider, 'openai'); assert.equal(asset.apiKey, 'test-key'); assert.equal(asset.imageModel, 'image-test'); assert.equal(policy.allowExternal, true); assert.equal(policy.maxCost, 2.5);
  console.log('[AiProviderGovernance] generic provider resolution and asset policy passed without owning Director or Semantic model selection');
} finally { Object.keys(original).forEach(function(key) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; }); }
