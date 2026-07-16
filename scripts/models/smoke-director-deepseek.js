var assert = require('assert');
var providerRuntime = require('../../packages/providers/src/provider-runtime');
var modelPort = require('../../packages/product/src/director-model-port');
var prompt = require('../../packages/product/src/director-planner-prompt');
var dsl = require('../../packages/product/src/director-planner-dsl');

(async function() {
  var config = modelPort.POLICY;
  assert.strictEqual(config.provider, 'deepseek');
  var runtime = providerRuntime.createProviderRuntime({ maxCost: 1 });
  var port = modelPort.fromProviderRuntime(runtime, { estimatedCost: 0, timeoutMs: 60000, maxTokens: 256 });
  var request = prompt.build({ requestId: 'director-deepseek-smoke', projectId: 'director-config', userRequest: 'Coordinate one complete game delivery.', sourceMode: 'new', feedbackPending: false });
  var startedAt = Date.now();
  var result = await port.invoke({ requestId: 'director-deepseek-smoke-' + Date.now(), projectId: 'director-config', systemPrompt: request.systemPrompt, prompt: request.prompt });
  if (!result || result.ok !== true) throw Object.assign(new Error(result && result.debt && result.debt.message || 'DeepSeek Director smoke failed.'), { code: result && result.debt && result.debt.code || 'DIRECTOR_SMOKE_FAILED' });
  var plan;
  try { plan = dsl.parseProgram(result.output.text); }
  catch (error) { console.error('[DirectorSmokeRaw]\n' + String(result.output.text || '')); throw error; }
  console.log('[DirectorSmoke] provider=' + config.provider + ' model=' + config.model + ' elapsedMs=' + (Date.now() - startedAt) + ' calls=' + plan.calls.map(function(call) { return call.operation; }).join('->'));
})().catch(function(error) { console.error('[DirectorSmoke] ' + (error.code || error.name) + ': ' + error.message); process.exit(1); });
