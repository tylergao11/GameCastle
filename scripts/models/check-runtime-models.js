/* Prints the single effective LLM1/LLM2 binding. No second key surface. */
var assert = require('assert');
var directorModelPort = require('../../packages/product/src/director-model-port');
var modelPolicy = require('../../packages/semantic/src/semantic-model-policy');

var director = directorModelPort.POLICY;
var semantic = modelPolicy.resolveModel();
var deepseekKey = !!process.env.DEEPSEEK_API_KEY;
var localAllowed = process.env.LLAMA_CPP_SEMANTIC_ALLOW_LOCAL === 'true' || process.env.LLAMA_CPP_SEMANTIC_ALLOW_LOCAL === '1';

assert.strictEqual(director.provider, 'deepseek', 'Director LLM1 must stay on deepseek.');
assert.strictEqual(director.model, 'deepseek-v4-flash', 'Director LLM1 model must be deepseek-v4-flash.');

console.log('[ModelConfig] mode=' + semantic.mode);
console.log('[ModelConfig] LLM1 director  provider=' + director.provider + ' model=' + director.model + ' key=' + (deepseekKey ? 'available' : 'MISSING'));
console.log('[ModelConfig] LLM2 semantic  provider=' + semantic.provider + ' model=' + semantic.model + ' allowExternal=' + semantic.allowExternal);

if (semantic.provider === 'deepseek') {
  assert.strictEqual(deepseekKey, true, 'development mode reuses DEEPSEEK_API_KEY (same key as LLM1).');
  console.log('[ModelConfig] development reuses the same DeepSeek key as LLM1; no extra LLM2 secret.');
}

if (semantic.provider === 'llama-cpp-semantic') {
  assert.strictEqual(localAllowed, true, 'production mode needs LLAMA_CPP_SEMANTIC_ALLOW_LOCAL=true (endpoint defaults to 127.0.0.1:8002).');
  console.log('[ModelConfig] production LLM2 endpoint=' + (process.env.LLAMA_CPP_SEMANTIC_ENDPOINT || 'http://127.0.0.1:8002/v1') + ' localAllowed=true');
  console.log('[ModelConfig] start local Qwen with: npm run model:semantic:start');
}

console.log('[ModelConfig] only knobs for text models: GAMECASTLE_RUNTIME_MODE + DEEPSEEK_API_KEY');
