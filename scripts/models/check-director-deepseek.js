var assert = require('assert');
var directorModelPort = require('../../packages/product/src/director-model-port');

assert.strictEqual(directorModelPort.POLICY.provider, 'deepseek', 'Director provider must be deepseek.');
assert.strictEqual(directorModelPort.POLICY.model, 'deepseek-v4-flash', 'Director model must be deepseek-v4-flash.');
assert.strictEqual(!!process.env.DEEPSEEK_API_KEY, true, 'DEEPSEEK_API_KEY is unavailable.');
console.log('[DirectorConfig] owner=director-model-port provider=deepseek model=deepseek-v4-flash key=available');
