var fs = require('fs');
var path = require('path');
var chat = require('./chat-completions-client');

function number(value) { value = Number(value); return Number.isFinite(value) && value >= 0 ? value : 0; }
function usageCounts(usage) {
  usage = usage || {};
  var hit = number(usage.prompt_cache_hit_tokens);
  var miss = number(usage.prompt_cache_miss_tokens);
  if (!hit && !miss) {
    hit = number(usage.input_tokens_details && usage.input_tokens_details.cached_tokens || usage.prompt_tokens_details && usage.prompt_tokens_details.cached_tokens);
    var total = number(usage.input_tokens || usage.prompt_tokens);
    miss = Math.max(0, total - hit);
  }
  return { hit: hit, miss: miss, total: hit + miss };
}
function cacheHitRate(usage) { var counts = usageCounts(usage); return counts.total ? counts.hit / counts.total : 0; }
function evaluateCacheGate(usage, threshold) {
  var counts = usageCounts(usage), required = Number(threshold);
  if (!Number.isFinite(required) || required < 0 || required > 1) required = 0.9;
  var rate = counts.total ? counts.hit / counts.total : 0;
  return { passed: counts.total > 0 && rate >= required, threshold: required, cacheHitRate: rate, hitTokens: counts.hit, missTokens: counts.miss };
}
function writeReport(report, directory) {
  directory = directory || path.join(process.cwd(), '.gamecastle', 'output', 'deepseek-cache');
  fs.mkdirSync(directory, { recursive: true });
  var file = path.join(directory, 'cache-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
  fs.writeFileSync(file, JSON.stringify(report, null, 2), 'utf8');
  return file;
}
async function runDeepSeekCacheDebug(options) {
  options = options || {};
  var threshold = Number(options.threshold); if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) threshold = 0.9;
  var turns = Array.isArray(options.dynamicTurns) ? options.dynamicTurns : [];
  if (!String(options.stablePrefix || '')) throw new Error('DeepSeek cache monitor requires a stablePrefix.');
  if (turns.length < 2) throw new Error('DeepSeek cache monitor requires one warmup and at least one hot turn.');
  var invoke = options.invoke || function(body) {
    return chat.requestChatCompletions({ endpoint: options.endpoint || process.env.LLM_ENDPOINT || 'https://api.deepseek.com/v1', apiKey: options.apiKey || process.env.DEEPSEEK_API_KEY, fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs || 120000, body: body });
  };
  var steps = [];
  for (var i = 0; i < turns.length; i++) {
    var turn = turns[i] || {};
    var body = {
      model: options.model || 'deepseek-v4-flash',
      messages: [{ role: 'system', content: String(options.stablePrefix) }, { role: 'user', content: String(turn.userRequest || '') }],
      max_tokens: options.maxTokens || 32,
      stream: true,
      stream_options: { include_usage: true },
      thinking: options.thinking || { type: 'enabled' },
      reasoning_effort: options.reasoningEffort || 'medium',
      temperature: options.temperature === undefined ? 0 : options.temperature
    };
    var result = await invoke(body, turn, i);
    var gate = evaluateCacheGate(result.usage, threshold);
    steps.push({ id: turn.id || 'step-' + (i + 1), expected: turn.expected || null, output: result.text || '', usage: result.usage || {}, observation: { role: i === 0 ? 'warmup' : 'hot', cacheGate: gate } });
  }
  var hot = steps.slice(1), totals = hot.reduce(function(out, step) { var counts = usageCounts(step.usage); out.hit += counts.hit; out.miss += counts.miss; return out; }, { hit: 0, miss: 0 });
  var total = totals.hit + totals.miss;
  var report = { schemaVersion: 1, owner: 'DeepSeekCacheMonitor', threshold: threshold, steps: steps, summary: { passed: hot.length > 0 && hot.every(function(step) { return step.observation.cacheGate.passed; }), hotStepCount: hot.length, cacheHitRate: total ? totals.hit / total : 0, hitTokens: totals.hit, missTokens: totals.miss } };
  if (options.writeArtifacts !== false) report.outputFile = writeReport(report, options.outputDirectory);
  return report;
}

module.exports = { cacheHitRate: cacheHitRate, evaluateCacheGate: evaluateCacheGate, runDeepSeekCacheDebug: runDeepSeekCacheDebug };
