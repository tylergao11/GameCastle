var assert = require('assert');
var observer = require('../../ai/semantic-run-observer');
function entry(sequence, prefix, hit, miss) { return observer.observe({ sequence: sequence, phase: 'executor', state: 'TASK_ACTIVE', activeTaskId: 'movement', remainingMs: 1000, bundle: { protocolVersion: 'v2', hashes: { stablePrefixHash: prefix }, bytes: { system: 12, user: 8 } }, result: { receipt: { receiptId: 'r' + sequence, usage: { prompt_cache_hit_tokens: hit, prompt_cache_miss_tokens: miss } }, output: { finishReason: 'stop', diagnostics: { elapsedMs: sequence * 10, firstContentMs: sequence * 4 } } }, text: 'complete()' }); }
var trace = [entry(1, 'planner', 0, 100), entry(2, 'executor', 0, 100), entry(3, 'executor', 95, 5), entry(4, 'executor', 90, 10)];
var summary = observer.summarize(trace, 0.9);
assert.strictEqual(summary.eligibleCalls, 2);
assert.strictEqual(summary.cacheHitRate, 0.925);
assert.strictEqual(summary.passed, true);
assert.deepStrictEqual(summary.zeroHitAnomalies, []);
assert.strictEqual(trace[2].activeTaskId, 'movement');
assert.strictEqual(trace[2].hashes.stablePrefixHash, 'executor');
console.log('[SemanticRunObserver] cache, latency, and stable-prefix observations passed');
