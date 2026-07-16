var assert = require('assert');
var client = require('../../packages/providers/src/chat-completions-client');
function stream(chunks) { var index = 0; return new ReadableStream({ pull: function(controller) { if (index >= chunks.length) return controller.close(); controller.enqueue(new TextEncoder().encode(chunks[index++])); } }); }
(async function() {
  var captured = null;
  var result = await client.requestChatCompletions({ endpoint: 'https://provider.test/v1/', apiKey: 'test-key', body: { model: 'flash', messages: [{ role: 'user', content: 'OK' }], stream: true }, fetchImpl: async function(url, request) { captured = { url: url, request: request }; return new Response(stream(['data:{"choices":[{"delta":{"reasoning_content":"think"}}]}\n', 'data: {"choices":[{"delta":{"content":"OK"}}]}\n', 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n', 'data: {"usage":{"prompt_tokens":2,"completion_tokens":1,"completion_tokens_details":{"reasoning_tokens":1}},"choices":[]}\n', 'data: [DONE]\n']), { status: 200 }); } });
  assert.equal(captured.url, 'https://provider.test/v1/chat/completions'); assert.equal(captured.request.headers.Authorization, 'Bearer test-key'); assert.equal(result.text, 'OK'); assert.equal(result.reasoningText, 'think'); assert.equal(result.finishReason, 'stop'); assert.equal(result.usage.prompt_tokens, 2); assert.equal(result.diagnostics.reasoningChars, 5); assert.equal(result.diagnostics.contentChars, 2); assert.equal(result.diagnostics.chunkCount, 4);
  console.log('[ChatCompletionsClient] stream deltas, finish reason, diagnostics, usage, endpoint, and authorization shape passed');
})().catch(function(error) { console.error(error.stack || error); process.exit(1); });
