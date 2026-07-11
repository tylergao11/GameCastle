var fs = require('fs');
var path = require('path');

var LLM2_CONTEXT_CACHE_ROUTER_SCHEMA_VERSION = require('./llm2-context-cache-router').LLM2_CONTEXT_CACHE_ROUTER_SCHEMA_VERSION;

var DEEPSEEK_CACHE_MONITOR_SCHEMA_VERSION = 1;
var ROOT = path.join(__dirname, '..');
var OUTPUT_DIR = path.join(ROOT, 'output');
var DEFAULT_THRESHOLD = 0.9;

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function ensureOutputDir() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text);
}

function writeJson(filePath, value) {
  writeText(filePath, JSON.stringify(value, null, 2));
}

function number(value) {
  var n = Number(value || 0);
  return isFinite(n) ? n : 0;
}

function cacheUsage(usage) {
  usage = usage || {};
  var inputTokens = number(usage.input_tokens || usage.prompt_tokens);
  var details = usage.input_tokens_details || usage.prompt_tokens_details || {};
  var cachedTokens = number(details.cached_tokens);
  var hitTokens = number(usage.prompt_cache_hit_tokens || cachedTokens);
  var missTokens = number(usage.prompt_cache_miss_tokens);
  if (!cachedTokens && hitTokens) cachedTokens = hitTokens;
  if (!inputTokens && hitTokens + missTokens > 0) inputTokens = hitTokens + missTokens;
  return {
    inputTokens: inputTokens,
    cachedTokens: cachedTokens,
    promptCacheHitTokens: hitTokens,
    promptCacheMissTokens: missTokens,
    measuredTokens: hitTokens + missTokens,
  };
}

function cacheHitRate(usage) {
  var normalized = cacheUsage(usage);
  var denominator = normalized.measuredTokens || normalized.inputTokens;
  if (!denominator) return 0;
  return Number((normalized.cachedTokens / denominator).toFixed(4));
}

function evaluateCacheGate(usage, threshold) {
  threshold = threshold === undefined ? DEFAULT_THRESHOLD : Number(threshold);
  var normalized = cacheUsage(usage);
  var rate = cacheHitRate(usage);
  var hasUsage = normalized.inputTokens > 0 || normalized.measuredTokens > 0;
  return {
    threshold: threshold,
    hitRate: rate,
    passed: hasUsage && rate >= threshold,
    hasUsage: hasUsage,
    usage: normalized,
    reason: !hasUsage
      ? 'provider usage missing; cache hit cannot be proven'
      : (rate >= threshold ? 'cache hit rate meets threshold' : 'cache hit rate below threshold'),
  };
}

function defaultStablePrefix() {
  return [
    'GameCastle LLM2 stable prefix for AI-first Intent Engine.',
    'Reason in gameplay intent and produce the declared decision payload.',
    'Decision type slot domain: apply_intent, request_context, no_op, reject.',
    'Decision payload slots: decisionType, intentSlots, requestedContext, reason, confidence.',
    'Rules:',
    '- Express decisions through the declared gameplay slots.',
    '- Gameplay has priority over UI/icon styling.',
    '- UI/icon requests use templates unless input access blocks gameplay.',
    '- Tick evidence is the runtime truth: Intent enters queue, rules produce EventLog, snapshots verify drift.',
    '- If evidence is insufficient, request focused context instead of guessing.',
    'Stable cache filler:',
    Array(80).fill('GameCastle stable IntentWorld prefix keeps product rules, component summaries, semantic mapping, and cache order unchanged.').join('\n'),
  ].join('\n');
}

function defaultDynamicTurns() {
  return [
    {
      id: 'warm_prefix',
      userRequest: '金币多一点',
      expected: 'warm DeepSeek text KV cache with the stable LLM2 prefix',
    },
    {
      id: 'coin_more_cached',
      userRequest: '金币多一点，但不要改按钮',
      expected: 'reuse stable prefix; hot cache hit rate must be >=90%',
    },
    {
      id: 'enemy_density_cached',
      userRequest: '怪别太密，先看 tick 证据',
      expected: 'reuse stable prefix while dynamic tail changes to another gameplay feedback request',
    },
  ];
}

function buildInput(stablePrefix, turn) {
  return [
    {
      role: 'system',
      content: stablePrefix,
    },
    {
      role: 'user',
      content: [
        'Observe this LLM2 Intent Engine debug turn.',
        'Expected: ' + turn.expected,
        'User request: ' + turn.userRequest,
        'Reply with one short line naming the decision type only.',
      ].join('\n'),
    },
  ];
}

async function readSseResponse(response) {
  var text = '';
  var usage = null;
  var events = [];
  var reader = response.body.getReader();
  var decoder = new TextDecoder();
  var buffer = '';

  while (true) {
    var chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    var lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || line.indexOf('data: ') !== 0) continue;
      var raw = line.substring(6);
      if (raw === '[DONE]') continue;
      var event;
      try {
        event = JSON.parse(raw);
      } catch (e) {
        continue;
      }
      events.push(event.type || 'unknown');
      if (event.type === 'response.output_text.delta' || event.type === 'response.text.delta') {
        text += (event.data && event.data.delta) || event.delta || '';
      }
      if (event.type === 'response.completed') {
        usage = (event.data && event.data.response && event.data.response.usage) ||
          (event.response && event.response.usage) ||
          event.usage ||
          usage;
      }
    }
  }
  return {
    text: text,
    usage: usage || {},
    events: events,
  };
}

async function callResponses(options, turn) {
  var fetchImpl = options.fetchImpl || fetch;
  if (options.responseFixtures && options.responseFixtures.length) {
    var fixture = options.responseFixtures.shift();
    return readSseResponse(fixture);
  }
  var body = {
    model: options.model,
    input: buildInput(options.stablePrefix, turn),
    max_output_tokens: options.maxTokens || 64,
    reasoning_effort: options.reasoningEffort || 'low',
    stream: true,
  };
  var response = await fetchImpl(options.endpoint.replace(/\/$/, '') + '/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + (options.apiKey || ''),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    var errText = '';
    try { errText = await response.text(); } catch (e) {}
    throw new Error('DeepSeek cache debug HTTP ' + response.status + ': ' + errText.slice(0, 300));
  }
  return readSseResponse(response);
}

function summarizeHotSteps(steps, threshold) {
  var hotSteps = steps.filter(function(step) {
    return step.observation.role === 'hot';
  });
  var totalCached = 0;
  var totalMeasured = 0;
  hotSteps.forEach(function(step) {
    var usage = step.observation.cacheGate.usage;
    totalCached += usage.cachedTokens;
    totalMeasured += usage.measuredTokens || usage.inputTokens;
  });
  var rate = totalMeasured ? Number((totalCached / totalMeasured).toFixed(4)) : 0;
  return {
    passed: hotSteps.length > 0 && hotSteps.every(function(step) { return step.observation.cacheGate.passed; }),
    threshold: threshold,
    cacheHitRate: rate,
    hotStepCount: hotSteps.length,
    totalCachedTokens: totalCached,
    totalMeasuredTokens: totalMeasured,
    failedSteps: steps.filter(function(step) {
      return step.observation.role === 'hot' && !step.observation.cacheGate.passed;
    }).map(function(step) { return step.id; }),
  };
}

function writeHumanSummary(report, filePath) {
  var lines = [
    'DeepSeek Cache Monitor',
    'passed: ' + report.summary.passed,
    'threshold: ' + report.summary.threshold,
    'hot cache hit rate: ' + report.summary.cacheHitRate,
    'hot steps: ' + report.summary.hotStepCount,
  ];
  report.steps.forEach(function(step) {
    lines.push(step.id + ': role=' + step.observation.role +
      ' hitRate=' + step.observation.cacheGate.hitRate +
      ' passed=' + step.observation.cacheGate.passed +
      ' expected=' + step.expected);
  });
  writeText(filePath, lines.join('\n') + '\n');
}

async function runDeepSeekCacheDebug(options) {
  options = Object.assign({
    endpoint: process.env.LLM_ENDPOINT || 'http://127.0.0.1:18081/v1',
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    model: process.env.LLM_MODEL || process.env.GAMECASTLE_INTENT_MODEL || 'deepseek-v4-flash',
    threshold: DEFAULT_THRESHOLD,
    stablePrefix: defaultStablePrefix(),
    dynamicTurns: defaultDynamicTurns(),
    writeArtifacts: true,
    outputPrefix: 'deepseek-cache-monitor',
  }, options || {});
  options.responseFixtures = options.responseFixtures ? options.responseFixtures.slice() : null;
  ensureOutputDir();

  var steps = [];
  for (var i = 0; i < options.dynamicTurns.length; i++) {
    var turn = options.dynamicTurns[i];
    var startedAt = Date.now();
    var result = await callResponses(options, turn);
    var gate = evaluateCacheGate(result.usage, options.threshold);
    var role = i === 0 ? 'warmup' : 'hot';
    steps.push({
      id: turn.id || ('turn_' + i),
      userRequest: turn.userRequest,
      expected: turn.expected,
      observation: {
        role: role,
        elapsedMs: Date.now() - startedAt,
        outputText: result.text,
        sseEvents: result.events,
        usage: clone(result.usage),
        cacheGate: role === 'warmup' ? Object.assign({}, gate, {
          passed: true,
          reason: 'warmup step excluded from 90% hot cache gate',
        }) : gate,
      },
    });
  }

  var summary = summarizeHotSteps(steps, options.threshold);
  var report = {
    schemaVersion: DEEPSEEK_CACHE_MONITOR_SCHEMA_VERSION,
    owner: 'DeepSeekCacheMonitor',
    mode: 'real-provider-cache-debug',
    routerSchemaVersion: LLM2_CONTEXT_CACHE_ROUTER_SCHEMA_VERSION,
    provider: {
      endpoint: options.endpoint,
      model: options.model,
      cacheKind: 'deepseek-text-kv-prefix',
    },
    input: {
      stablePrefixChars: options.stablePrefix.length,
      threshold: options.threshold,
      turnCount: options.dynamicTurns.length,
    },
    steps: steps,
    summary: summary,
  };

  if (options.writeArtifacts !== false) {
    writeJson(path.join(OUTPUT_DIR, options.outputPrefix + '-report.json'), report);
    writeHumanSummary(report, path.join(OUTPUT_DIR, options.outputPrefix + '-summary.txt'));
  }
  return report;
}

async function main() {
  var report = await runDeepSeekCacheDebug();
  console.log('[DeepSeekCacheMonitor] passed=' + report.summary.passed + ' hotHitRate=' + report.summary.cacheHitRate + ' threshold=' + report.summary.threshold);
  if (!report.summary.passed) process.exit(1);
}

if (require.main === module) {
  main().catch(function(error) {
    console.error(error && error.stack || error);
    process.exit(1);
  });
}

module.exports = {
  DEEPSEEK_CACHE_MONITOR_SCHEMA_VERSION: DEEPSEEK_CACHE_MONITOR_SCHEMA_VERSION,
  DEFAULT_THRESHOLD: DEFAULT_THRESHOLD,
  cacheUsage: cacheUsage,
  cacheHitRate: cacheHitRate,
  evaluateCacheGate: evaluateCacheGate,
  runDeepSeekCacheDebug: runDeepSeekCacheDebug,
  defaultStablePrefix: defaultStablePrefix,
  defaultDynamicTurns: defaultDynamicTurns,
};
