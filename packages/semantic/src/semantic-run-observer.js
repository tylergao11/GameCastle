function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function number(value) { value = Number(value); return Number.isFinite(value) && value >= 0 ? value : 0; }
function usageCounts(usage) {
  usage = usage || {};
  var hit = number(usage.prompt_cache_hit_tokens), miss = number(usage.prompt_cache_miss_tokens);
  if (!hit && !miss) {
    hit = number(usage.input_tokens_details && usage.input_tokens_details.cached_tokens || usage.prompt_tokens_details && usage.prompt_tokens_details.cached_tokens);
    var total = number(usage.input_tokens || usage.prompt_tokens); miss = Math.max(0, total - hit);
  }
  return { hitTokens: hit, missTokens: miss, totalTokens: hit + miss, hitRate: hit + miss ? hit / (hit + miss) : 0 };
}
function observe(input) {
  input = input || {};
  var result = input.result || {}, output = result.output || {}, receipt = result.receipt || {}, diagnostics = output.diagnostics || {}, usage = receipt.usage || {}, cache = usageCounts(usage);
  return {
    sequence: input.sequence,
    kind: input.kind || input.phase,
    phase: input.phase,
    state: input.state,
    activeTaskId: input.activeTaskId || null,
    requestId: receipt.receiptId || null,
    protocolVersion: input.bundle && input.bundle.protocolVersion || null,
    hashes: clone(input.bundle && input.bundle.hashes || {}),
    promptBytes: clone(input.bundle && input.bundle.bytes || {}),
    remainingMs: input.remainingMs,
    elapsedMs: number(diagnostics.elapsedMs || input.elapsedMs),
    firstReasoningMs: diagnostics.firstReasoningMs === undefined ? null : diagnostics.firstReasoningMs,
    firstContentMs: diagnostics.firstContentMs === undefined ? null : diagnostics.firstContentMs,
    finishReason: output.finishReason || null,
    reasoningChars: number(diagnostics.reasoningChars),
    contentChars: number(diagnostics.contentChars),
    usage: clone(usage),
    cache: cache,
    output: String(input.text || ''),
    commands: clone(input.commands || []),
    warnings: clone(input.warnings || []),
    result: clone(input.outcome || null)
  };
}
function percentile(values, fraction) {
  values = values.filter(function(value) { return Number.isFinite(value); }).sort(function(a, b) { return a - b; });
  if (!values.length) return null;
  return values[Math.min(values.length - 1, Math.floor((values.length - 1) * fraction))];
}
function summarize(trace, threshold) {
  threshold = Number(threshold); if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) threshold = 0.9;
  var seen = Object.create(null), eligible = [];
  (trace || []).forEach(function(entry) {
    var stablePrefixHash = entry.hashes && entry.hashes.stablePrefixHash;
    if (!stablePrefixHash) return;
    if (seen[stablePrefixHash]) eligible.push(entry); else seen[stablePrefixHash] = true;
  });
  var totals = eligible.reduce(function(out, entry) { out.hit += number(entry.cache && entry.cache.hitTokens); out.miss += number(entry.cache && entry.cache.missTokens); return out; }, { hit: 0, miss: 0 });
  var total = totals.hit + totals.miss, rate = total ? totals.hit / total : 0;
  return {
    threshold: threshold,
    eligibleCalls: eligible.length,
    hitTokens: totals.hit,
    missTokens: totals.miss,
    cacheHitRate: rate,
    passed: eligible.length > 0 && total > 0 && rate >= threshold,
    zeroHitAnomalies: eligible.filter(function(entry) { return entry.cache && entry.cache.totalTokens > 0 && entry.cache.hitTokens === 0; }).map(function(entry) { return entry.sequence; }),
    p50FirstContentMs: percentile(eligible.map(function(entry) { return entry.firstContentMs; }), 0.5),
    p50ElapsedMs: percentile(eligible.map(function(entry) { return entry.elapsedMs; }), 0.5)
  };
}
module.exports = { usageCounts: usageCounts, observe: observe, summarize: summarize };
