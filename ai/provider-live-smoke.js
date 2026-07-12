/* Explicitly opt-in WP1 live smoke. Never substitutes simulated output. */
var fs = require('fs');
var os = require('os');
var path = require('path');
var providerRuntime = require('./provider-runtime');

var ONE_PIXEL_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Zp9Y7QAAAABJRU5ErkJggg==';

function requireLiveEnvironment() {
  if (process.env.ASSET_MODEL_PROVIDER !== 'openai' || process.env.ASSET_ALLOW_EXTERNAL !== 'true' || !process.env.OPENAI_API_KEY) {
    throw new Error('Live smoke requires ASSET_MODEL_PROVIDER=openai, ASSET_ALLOW_EXTERNAL=true, and OPENAI_API_KEY.');
  }
  if (!process.env.LLM_ALLOW_EXTERNAL && !process.env.AI_ALLOW_EXTERNAL && !process.env.ASSET_ALLOW_EXTERNAL) {
    throw new Error('Live smoke requires explicit external authorization.');
  }
}
async function main() {
  requireLiveEnvironment();
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-provider-live-'));
  try {
    var source = path.join(root, 'source.png'); fs.writeFileSync(source, Buffer.from(ONE_PIXEL_PNG, 'base64'));
    var runtime = providerRuntime.createProviderRuntime({ maxCost: Number(process.env.PROVIDER_LIVE_SMOKE_MAX_COST || 1), receiptDir: path.join(root, 'receipts') });
    async function invoke(role, input) {
      var result = await runtime.invokeRole({ requestId: 'live-' + role, projectId: 'provider-live-smoke', role: role, provider: 'openai', timeoutMs: 120000, maxAttempts: 1, input: input });
      if (!result.ok || result.receipt.simulated) throw new Error(role + ' did not return a real successful receipt: ' + JSON.stringify(result.debt || result.receipt.failure));
      return result;
    }
    await invoke('creative-text', { systemPrompt: 'Reply with exactly OK.', prompt: 'OK', maxTokens: 16 });
    await invoke('intent-text', { systemPrompt: 'Reply with exactly OK.', prompt: 'OK', maxTokens: 16 });
    var generated = await invoke('image-generate', { prompt: 'A tiny flat game icon, no text, transparent background.', size: '1024x1024', transparent: true });
    if (!(generated.output || {}).b64Json) throw new Error('image-generate returned no image bytes');
    var generatedPath = path.join(root, 'generated.png'); fs.writeFileSync(generatedPath, Buffer.from(generated.output.b64Json, 'base64'));
    var edited = await invoke('image-edit', { imagePath: generatedPath, prompt: 'Keep the same icon and make it blue.' });
    if (!(edited.output || {}).b64Json) throw new Error('image-edit returned no image bytes');
    await invoke('vision-review', { imagePath: generatedPath, prompt: 'Reply only JSON: {"pass":true,"repairable":false,"issues":[]}.' });
    console.log('[ProviderLiveSmoke] all five real roles succeeded; safe receipts: ' + runtime.listReceipts().length);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
main().catch(function(error) { console.error('[ProviderLiveSmoke] ' + error.message); process.exit(1); });
