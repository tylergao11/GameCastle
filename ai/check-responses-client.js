var assert = require('assert');
var responsesClient = require('./responses-client');

function makeStream(chunks) {
  var index = 0;
  return new ReadableStream({
    pull: function(controller) {
      if (index >= chunks.length) return controller.close();
      controller.enqueue(new TextEncoder().encode(chunks[index++]));
    },
  });
}

async function main() {
  var captured = null;
  var result = await responsesClient.requestResponses({
    endpoint: 'http://provider.test/v1/',
    apiKey: 'test-key',
    body: {
      model: 'model-a',
      input: [{ role: 'system', content: 'owner-built context' }],
      stream: true,
    },
    fetchImpl: async function(url, request) {
      captured = { url: url, request: request };
      return new Response(makeStream([
        'data: {"type":"response.reasoning_text.delta","delta":"think"}\n',
        'data: {"type":"response.output_text.delta","data":{"delta":"hello"}}\n',
        'data: {"type":"response.output_text.delta","data":{"delta":" world"}}\n',
        'data: {"type":"response.completed","usage":{"input_tokens":7,"output_tokens":3}}\n',
      ]), { status: 200 });
    },
  });

  assert.strictEqual(captured.url, 'http://provider.test/v1/responses');
  assert.strictEqual(captured.request.headers.Authorization, 'Bearer test-key');
  assert.deepStrictEqual(JSON.parse(captured.request.body).input, [{ role: 'system', content: 'owner-built context' }], 'transport must not alter owner-built input');
  assert.strictEqual(result.text, 'hello world');
  assert.strictEqual(result.reasoningText, 'think');
  assert.deepStrictEqual(result.usage, { input_tokens: 7, output_tokens: 3 });
  assert.deepStrictEqual(result.events, [
    'response.reasoning_text.delta',
    'response.output_text.delta',
    'response.output_text.delta',
    'response.completed',
  ]);

  await assert.rejects(function() {
    return responsesClient.requestResponses({
      endpoint: 'http://provider.test/v1',
      fetchImpl: async function() { return new Response('invalid key', { status: 401 }); },
      body: {},
    });
  }, function(error) {
    return error.name === 'ResponsesHttpError' && error.status === 401 && error.body === 'invalid key';
  });

  console.log('[ResponsesClient] owner-built input, SSE deltas, usage, and HTTP errors passed');
}

main().catch(function(error) {
  console.error(error && error.stack || error);
  process.exit(1);
});
