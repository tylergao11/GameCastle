/* WP1: the only owner of real provider invocation, secrets stay in environment. */
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var governance = require('./ai-provider-governance');
var responsesClient = require('./responses-client');
var chatCompletionsClient = require('./chat-completions-client');
var semanticModelPolicy = require('./semantic-model-policy');
var providerContract = require('../shared/provider-runtime-contract.json');

var ROLE_MODALITY = {
  'creative-text': 'text', 'semantic-design': 'text',
  'image-generate': 'image-generation', 'vision-review': 'vision-review'
};

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function now() { return new Date().toISOString(); }
function safeId(value) { return String(value || '').replace(/[^A-Za-z0-9_.-]/g, '_'); }
function finite(value, fallback) { var number = Number(value); return Number.isFinite(number) && number >= 0 ? number : fallback; }
function redact(value, secrets) {
  if (typeof value === 'string') return secrets.reduce(function(text, secret) { return secret ? text.split(secret).join('[REDACTED]') : text; }, value);
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(function(item) { return redact(item, secrets); });
  var output = {};
  Object.keys(value).forEach(function(key) { output[key] = /api.?key|authorization|secret|bearer/i.test(key) ? '[REDACTED]' : redact(value[key], secrets); });
  return output;
}
function makeError(code, message, owner) { var error = new Error(message); error.code = code; error.owner = owner || 'ProviderRuntime'; return error; }

function makeReceipt(base) {
  return Object.assign({ schemaVersion: 1, receiptId: 'provider.' + safeId(base.requestId), owner: 'ProviderRuntime', startedAt: now(), status: 'requested', attempts: [], cost: { reserved: 0, settled: 0, currency: 'USD', kind: 'estimated' } }, base);
}

function createProviderRuntime(options) {
  options = options || {};
  var invokeTransport = options.invokeTransport || invokeHttpTransport;
  var fetchImpl = options.fetchImpl || null;
  var receipts = [];
  var active = new Map();
  var spent = 0;
  var maxCost = options.maxCost === undefined ? Infinity : finite(options.maxCost, 0);
  var receiptDir = options.receiptDir || null;

  function persist(receipt) {
    var safe = redact(receipt, [receipt.apiKey]);
    delete safe.apiKey;
    receipts.push(safe);
    if (receiptDir) {
      fs.mkdirSync(receiptDir, { recursive: true });
      fs.writeFileSync(path.join(receiptDir, safe.receiptId + '.json'), JSON.stringify(safe, null, 2));
    }
    return safe;
  }
  function configFor(request) {
    var assetRole = ROLE_MODALITY[request.role] !== 'text';
    var overrides = { provider: typeof request.provider === 'string' ? request.provider : ((request.provider || {}).provider) };
    return assetRole ? governance.asset(overrides) : governance.semantic(overrides);
  }
  function authorize(request, config) {
    var modality = ROLE_MODALITY[request.role];
    if (!modality) throw makeError('ROLE_UNSUPPORTED', 'Unsupported ProviderRuntime role: ' + request.role);
    if ((config.modalities || []).indexOf(modality) < 0) throw makeError('MODALITY_UNSUPPORTED', config.provider + ' does not support ' + modality);
    var estimated = request.estimatedCost === undefined ? Number(providerContract.roles[request.role].defaultEstimatedCost) : finite(request.estimatedCost, -1);
    if (!Number.isFinite(estimated) || estimated < 0) throw makeError('PROVIDER_COST_INVALID', 'Provider request requires a non-negative estimated cost');
    if (!config.simulated && config.localOnly !== true && config.allowExternal !== true) throw makeError('PROVIDER_NOT_AUTHORIZED', 'External provider requires explicit authorization');
    if (!config.simulated && config.localOnly === true && config.localAllowed !== true) throw makeError('PROVIDER_NOT_AUTHORIZED', 'Local provider requires explicit local authorization');
    if (!config.simulated && config.requiresApiKey !== false && !config.apiKey) throw makeError('PROVIDER_KEY_UNAVAILABLE', 'Provider key is unavailable from environment');
    if (spent + estimated > Math.min(maxCost, config.maxCost)) throw makeError('PROVIDER_BUDGET_EXHAUSTED', 'Provider budget is exhausted');
    return estimated;
  }
  async function invokeRole(request) {
    request = clone(request || {});
    if (!request.requestId || !request.projectId || !request.role) throw makeError('PROVIDER_REQUEST_INVALID', 'Provider request requires requestId, projectId, and role');
    var config = configFor(request);
    var receipt = makeReceipt({ requestId: safeId(request.requestId), projectId: safeId(request.projectId), role: request.role, modality: ROLE_MODALITY[request.role], provider: config.provider, model: selectModel(config, request.role, request.model), simulated: !!config.simulated, requestHash: hash({ role: request.role, input: redact(request.input || {}, [config.apiKey] || []) }) });
    var reservation;
    try { reservation = authorize(request, config); } catch (error) { receipt.status = 'denied'; receipt.failure = failure(error); return { ok: false, receipt: persist(receipt), debt: debt(error) }; }
    receipt.cost.reserved = reservation; spent += reservation;
    var attempts = Math.max(1, Math.min(3, Number(request.maxAttempts || 1)));
    var controller = new AbortController(); active.set(receipt.receiptId, controller);
    try {
      for (var index = 0; index < attempts; index++) {
        var attempt = { index: index + 1, startedAt: now() };
        try {
          var result = await invokeTransport({ request: request, config: config, model: receipt.model, signal: controller.signal, timeoutMs: Number(request.timeoutMs || 30000), fetchImpl: fetchImpl });
          attempt.status = 'succeeded'; attempt.finishedAt = now(); receipt.attempts.push(attempt);
          receipt.status = 'succeeded'; receipt.finishedAt = now(); receipt.usage = redact(result.usage || {}, [config.apiKey]); receipt.cost.settled = finite(result.cost, reservation);
          spent += receipt.cost.settled - reservation;
          receipt.provenance = Object.assign({ provider: config.provider, model: receipt.model, simulated: !!config.simulated, modality: receipt.modality }, redact(result.provenance || {}, [config.apiKey]));
          return { ok: true, output: redact(result.output, [config.apiKey]), receipt: persist(receipt) };
        } catch (error) {
          attempt.status = controller.signal.aborted ? 'cancelled' : 'failed'; attempt.code = error.code || error.name || 'PROVIDER_INVOKE_FAILED'; attempt.finishedAt = now(); receipt.attempts.push(attempt);
          if (controller.signal.aborted) throw makeError('PROVIDER_CANCELLED', 'Provider request was cancelled');
          if (index + 1 === attempts || !retryable(error)) throw error;
        }
      }
    } catch (error) {
      receipt.status = error.code === 'PROVIDER_CANCELLED' ? 'cancelled' : 'failed'; receipt.finishedAt = now(); receipt.failure = failure(error); receipt.cost.settled = 0; spent -= reservation;
      return { ok: false, receipt: persist(receipt), debt: debt(error) };
    } finally { active.delete(receipt.receiptId); }
  }
  function cancel(receiptId) { var controller = active.get(receiptId); if (!controller) return { cancelled: false, code: 'PROVIDER_REQUEST_NOT_ACTIVE' }; controller.abort(); return { cancelled: true, receiptId: receiptId }; }
  function health() { return { owner: 'ProviderRuntime', maxCost: maxCost, spent: spent, active: active.size, providers: Object.keys(governance.governance.providers).map(function(id) { var config = governance.resolve(id); return { provider: id, simulated: config.simulated, endpoint: config.endpoint, keyAvailable: !!config.apiKey }; }) }; }
  return { invokeRole: invokeRole, cancel: cancel, health: health, listReceipts: function() { return clone(receipts); } };
}

function selectModel(config, role, override) { if (override) return override; if (role === 'image-generate') return config.imageModel; if (role === 'vision-review') return config.visionModel || config.textModel; return config.textModel; }
function retryable(error) { return !error || !error.code || ['AbortError', 'PROVIDER_CANCELLED', 'PROVIDER_KEY_UNAVAILABLE', 'PROVIDER_NOT_AUTHORIZED'].indexOf(error.code || error.name) < 0; }
function failure(error) { var value = { code: error.code || error.name || 'PROVIDER_INVOKE_FAILED', owner: error.owner || 'ProviderRuntime', message: String(error.message || error).replace(/Bearer\s+[^\s]+/g, 'Bearer [REDACTED]') }; if (error.streamDiagnostics) value.streamDiagnostics = clone(error.streamDiagnostics); if (error.partialContent) value.partialContent = String(error.partialContent); return value; }
function debt(error) { return { code: error.code || 'PROVIDER_INVOKE_FAILED', owner: error.owner || 'ProviderRuntime', recoveryStage: 'provider-runtime', blocksPublish: false }; }

async function invokeHttpTransport(context) {
  var role = context.request.role;
  if (context.config.simulated) throw makeError('SIMULATED_TRANSPORT_NOT_CONFIGURED', 'Simulated calls must use an injected local transport');
  if (context.config.provider === 'comfyui-local') return require('./comfyui-local-provider').invokeComfyUI(context);
  if ((role === 'creative-text' || role === 'semantic-design') && context.config.provider === 'deepseek') return invokeDeepSeekChat(context);
  if (role === 'creative-text' || role === 'semantic-design' || role === 'vision-review') return invokeResponses(context);
  if (role === 'image-generate') return invokeImageGeneration(context);
  throw makeError('ROLE_UNSUPPORTED', 'Unsupported HTTP role');
}
async function invokeResponses(context) {
  var input = context.request.input || {};
  var messages = input.messages || [{ role: 'system', content: input.systemPrompt || '' }, { role: 'user', content: input.prompt || '' }];
  if (context.request.role === 'vision-review') {
    if (!input.imagePath || !fs.existsSync(input.imagePath)) throw makeError('VISION_INPUT_MISSING', 'Vision review requires an existing local imagePath');
    messages = [{ role: 'user', content: [{ type: 'input_text', text: input.prompt || '' }, { type: 'input_image', image_url: 'data:image/png;base64,' + fs.readFileSync(input.imagePath).toString('base64') }] }];
  }
  var body = { model: context.model, input: messages, max_output_tokens: input.maxTokens || 4096, stream: true };
  if (input.jsonSchema) body.text = { format: { type: 'json_schema', name: input.jsonSchema.name, strict: true, schema: input.jsonSchema.schema } };
  var result = await responsesClient.requestResponses({ endpoint: context.config.endpoint, apiKey: context.config.apiKey, body: body, signal: context.signal, timeoutMs: context.timeoutMs, fetchImpl: context.fetchImpl || undefined });
  return { output: context.request.role === 'vision-review' ? { text: result.text, events: result.events } : { text: result.text, reasoningText: result.reasoningText, events: result.events }, usage: result.usage, cost: context.request.estimatedCost };
}
async function invokeDeepSeekChat(context) {
  var input = context.request.input || {};
  var messages = input.messages || [{ role: 'system', content: input.systemPrompt || '' }, { role: 'user', content: input.prompt || '' }];
  var creative = context.request.role === 'creative-text';
  var profile = creative ? semanticModelPolicy.LLM1 : semanticModelPolicy.LLM2;
  var thinking = input.thinking || profile.thinking;
  var body = { model: context.model, messages: messages, max_tokens: input.maxTokens || 4096, stream: true, stream_options: { include_usage: true }, thinking: thinking };
  if (thinking.type === 'enabled') body.reasoning_effort = input.reasoningEffort || profile.reasoningEffort;
  body.temperature = input.temperature === undefined ? profile.temperature : input.temperature;
  if (input.jsonSchema) body.response_format = { type: 'json_object' };
  var result = await chatCompletionsClient.requestChatCompletions({ endpoint: context.config.endpoint, apiKey: context.config.apiKey, body: body, signal: context.signal, timeoutMs: context.timeoutMs, fetchImpl: context.fetchImpl || undefined });
  return { output: { text: result.text, reasoningText: result.reasoningText, finishReason: result.finishReason, diagnostics: result.diagnostics, events: result.events }, usage: result.usage, cost: context.request.estimatedCost, provenance: { transport: 'deepseek-chat-completions' } };
}
async function invokeImageGeneration(context) {
  var input = context.request.input || {}; var requestFetch = context.fetchImpl || fetch; var response = await requestFetch(String(context.config.endpoint).replace(/\/$/, '') + '/images/generations', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + context.config.apiKey }, body: JSON.stringify({ model: context.model, prompt: input.prompt, size: input.size || '1024x1024', background: input.transparent ? 'transparent' : undefined, response_format: 'b64_json' }), signal: context.signal });
  if (!response.ok) throw makeError('PROVIDER_HTTP_' + response.status, 'Image generation HTTP ' + response.status); var json = await response.json(); var image = (json.data || [])[0] || {}; return { output: { b64Json: image.b64_json, revisedPrompt: image.revised_prompt || null }, usage: json.usage || {}, cost: context.request.estimatedCost };
}
module.exports = { ROLE_MODALITY: clone(ROLE_MODALITY), createProviderRuntime: createProviderRuntime, invokeHttpTransport: invokeHttpTransport };
