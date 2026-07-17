/**
 * Semantic-only live probe with full runTrace / runLedger dump.
 * Usage: node scripts/shared/run-with-local-env.js scripts/product/live-semantic-design-diagnostics.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var runtimeApi = require('../../packages/providers/src/provider-runtime');
var semanticRuntimeApi = require('../../packages/semantic/src/semantic-llm2-runtime');

var root = path.resolve(__dirname, '..', '..');
var runId = 'live-semantic-diag-' + Date.now().toString(36);
var outRoot = path.join(root, '.gamecastle', 'output', 'diagnostics', 'live-semantic-design', runId);

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

(async function main() {
  if (!process.env.GAMECASTLE_RUNTIME_MODE) process.env.GAMECASTLE_RUNTIME_MODE = 'development';
  if (!process.env.DEEPSEEK_API_KEY) {
    console.error('[semantic-diag] DEEPSEEK_API_KEY required');
    process.exit(2);
  }
  fs.mkdirSync(outRoot, { recursive: true });
  var started = Date.now();
  console.log('[semantic-diag] runId=', runId);
  console.log('[semantic-diag] RUNTIME_MODE=', process.env.GAMECASTLE_RUNTIME_MODE);

  var providerRuntime = runtimeApi.createProviderRuntime({
    maxCost: Infinity,
    receiptDir: path.join(outRoot, 'provider-receipts')
  });
  var semantic = semanticRuntimeApi.create({ providerRuntime: providerRuntime });
  var userRequest = 'Make a tiny colorful mobile-game scene with one playable hero character sprite and one blue gem collectible. Keep it simple: one level, full-color raster-toon style.';
  writeJson(path.join(outRoot, 'request.json'), { userRequest: userRequest });

  try {
    var output = await semantic.invoke({
      userRequest: userRequest
    });
    writeJson(path.join(outRoot, 'output.json'), {
      ok: output && output.ok,
      modelCalls: output && output.modelCalls,
      totalElapsedMs: output && output.totalElapsedMs,
      runState: output && output.runState,
      taskPlan: output && output.taskPlan,
      hasSource: !!(output && output.document && output.document.source)
    });
    if (output && output.runTrace) writeJson(path.join(outRoot, 'run-trace.json'), output.runTrace);
    if (output && output.runLedger) writeJson(path.join(outRoot, 'run-ledger.json'), output.runLedger);
    console.log('[semantic-diag] ok=', output && output.ok, 'elapsedMs=', Date.now() - started);
    if (output && output.document && output.document.source) {
      writeJson(path.join(outRoot, 'source.json'), output.document.source);
      console.log('[semantic-diag] assetIntents=', (output.document.source.assetIntents || []).length);
      console.log('[semantic-diag] layoutIntents=', (output.document.source.layoutIntents || []).length);
      console.log('[semantic-diag] entities=', (output.document.source.entities || []).length);
    }
    if (output && output.runState) console.log('[semantic-diag] runState=', JSON.stringify(output.runState));
    process.exit(output && output.ok ? 0 : 1);
  } catch (error) {
    var payload = {
      code: error.code || null,
      owner: error.owner || null,
      message: error.message || String(error),
      modelCalls: error.modelCalls || null,
      totalElapsedMs: error.totalElapsedMs || Date.now() - started,
      runState: error.runState || null,
      taskPlan: error.taskPlan || null,
      draft: error.draft || null,
      runTrace: error.runTrace || null,
      runLedger: error.runLedger || null,
      cacheSummary: error.cacheSummary || null,
      observerWarnings: error.observerWarnings || null
    };
    writeJson(path.join(outRoot, 'error-diagnostics.json'), payload);
    var failures = (payload.runLedger && payload.runLedger.events || []).filter(function(event) {
      return event && event.type === 'FAILURE_RECORDED';
    });
    console.error('[semantic-diag] FAIL', payload.code, payload.message);
    console.error('[semantic-diag] failureCount=', failures.length);
    failures.forEach(function(event, index) {
      var p = event.payload || {};
      console.error('[semantic-diag] failure#' + (index + 1), JSON.stringify({
        phase: p.phase,
        code: p.code,
        owner: p.owner,
        message: p.message,
        class: p.class,
        taskId: p.taskId || null,
        subjectHash: p.subjectHash || null,
        diagnosis: p.diagnosis || null,
        repair: p.repair || null
      }));
    });
    var failedTrace = (payload.runTrace || []).filter(function(entry) {
      return entry && entry.outcome && entry.outcome.ok === false;
    });
    console.error('[semantic-diag] failedTrace=', failedTrace.length);
    failedTrace.slice(-8).forEach(function(entry, index) {
      console.error('[semantic-diag] traceFail#' + (index + 1), JSON.stringify({
        phase: entry.phase,
        state: entry.state,
        code: entry.outcome && entry.outcome.code,
        message: entry.outcome && entry.outcome.message,
        results: entry.results
      }).slice(0, 800));
    });
    console.error('[semantic-diag] report=', path.join(outRoot, 'error-diagnostics.json'));
    process.exit(1);
  }
})().catch(function(error) {
  console.error(error && error.stack || error);
  process.exit(1);
});
