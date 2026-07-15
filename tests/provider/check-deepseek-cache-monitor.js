var assert = require('assert');

var monitor = require('../../ai/deepseek-cache-monitor');

function fakeResponse(usage, text) {
  return {
    ok: true,
    status: 200,
    body: {
      getReader: function() {
        var done = false;
        var payload = [
          'data: ' + JSON.stringify({ choices: [{ delta: { content: text || 'ok' } }] }),
          'data: ' + JSON.stringify({ usage: usage, choices: [] }),
          'data: [DONE]',
          '',
          '',
        ].join('\n');
        return {
          read: function() {
            if (done) return Promise.resolve({ done: true });
            done = true;
            return Promise.resolve({
              done: false,
              value: new TextEncoder().encode(payload),
            });
          },
        };
      },
    },
  };
}

async function main() {
  process.env.LLM_PROVIDER = 'deepseek';
  process.env.DEEPSEEK_API_KEY = 'test-key';
  process.env.LLM_ALLOW_EXTERNAL = 'true';
  process.env.LLM_ENDPOINT = 'http://fake.local/v1';
  var warmUsage = {
    input_tokens: 1000,
    input_tokens_details: { cached_tokens: 0 },
    prompt_cache_hit_tokens: 0,
    prompt_cache_miss_tokens: 1000,
  };
  var hotUsage = {
    input_tokens: 1000,
    input_tokens_details: { cached_tokens: 940 },
    prompt_cache_hit_tokens: 940,
    prompt_cache_miss_tokens: 60,
  };
  var lowUsage = {
    input_tokens: 1000,
    input_tokens_details: { cached_tokens: 650 },
    prompt_cache_hit_tokens: 650,
    prompt_cache_miss_tokens: 350,
  };

  assert.strictEqual(monitor.cacheHitRate(hotUsage), 0.94, 'hit rate should use cache hit/miss tokens');
  assert.strictEqual(monitor.evaluateCacheGate(hotUsage, 0.9).passed, true, '94% should pass 90% gate');
  assert.strictEqual(monitor.evaluateCacheGate(lowUsage, 0.9).passed, false, '65% should fail 90% gate');
  assert.strictEqual(monitor.evaluateCacheGate({}, 0.9).passed, false, 'missing usage should fail closed');

  var calls = [];
  var report = await monitor.runDeepSeekCacheDebug({
    threshold: 0.9,
    endpoint: 'http://fake.local/v1',
    apiKey: 'test-key',
    model: 'deepseek-test',
    stablePrefix: 'GameCastle stable LLM2 prefix\n'.repeat(80),
    dynamicTurns: [
      { id: 'warm_prefix', userRequest: '金币多一点', expected: 'warm cache with stable prefix' },
      { id: 'hot_prefix', userRequest: '怪别太密', expected: 'reuse stable prefix at >=90%' },
    ],
    fetchImpl: async function(url, init) {
      calls.push({ url: url, body: JSON.parse(init.body) });
      return calls.length === 1 ? fakeResponse(warmUsage, 'warm') : fakeResponse(hotUsage, 'hot');
    },
    writeArtifacts: false,
  });

  assert.strictEqual(report.owner, 'DeepSeekCacheMonitor', 'report owner');
  assert.strictEqual(report.summary.passed, true, 'warm + hot probe should pass');
  assert.strictEqual(report.summary.hotStepCount, 1, 'only post-warm steps count toward gate');
  assert.strictEqual(report.summary.cacheHitRate, 0.94, 'summary should use hot steps');
  assert.strictEqual(report.steps.length, 2, 'report should observe each step');
  assert.strictEqual(report.steps[0].observation.role, 'warmup', 'first step should be warmup');
  assert.strictEqual(report.steps[1].observation.cacheGate.passed, true, 'second step should pass cache gate');
  assert(calls[0].body.messages[0].content.indexOf('GameCastle stable LLM2 prefix') >= 0, 'stable prefix should be first input content');
  assert.notStrictEqual(calls[0].body.messages[1].content, calls[1].body.messages[1].content, 'dynamic turn should vary after stable prefix');

  var failed = await monitor.runDeepSeekCacheDebug({
    threshold: 0.9,
    endpoint: 'http://fake.local/v1',
    apiKey: 'test-key',
    model: 'deepseek-test',
    stablePrefix: 'GameCastle stable LLM2 prefix\n'.repeat(80),
    dynamicTurns: [
      { id: 'warm_prefix', userRequest: '金币多一点', expected: 'warm cache with stable prefix' },
      { id: 'cold_prefix', userRequest: '怪别太密', expected: 'reuse stable prefix at >=90%' },
    ],
    invoke: (function() {
      var results = [
        { text: 'warm', reasoningText: '', usage: warmUsage, events: [], streamed: true },
        { text: 'low', reasoningText: '', usage: lowUsage, events: [], streamed: true }
      ];
      return function() { return Promise.resolve(results.shift()); };
    })(),
    writeArtifacts: false,
  });
  assert.strictEqual(failed.summary.passed, false, 'low hot usage should fail the whole monitor');
  assert.strictEqual(failed.steps[1].observation.cacheGate.passed, false, 'low hot step should fail gate');

  console.log('[DeepSeekCacheMonitor] usage parsing, observation transcript, and 90% gate passed');
}

main().catch(function(error) {
  console.error(error && error.stack || error);
  process.exit(1);
});
