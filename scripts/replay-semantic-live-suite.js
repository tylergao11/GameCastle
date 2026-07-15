var fs = require('fs');
var path = require('path');
var dictionary = require('../ai/capability-semantic-dictionary');
var parser = require('../ai/semantic-dsl-parser');
var draftApi = require('../ai/semantic-draft');
var referenceRuntime = require('../ai/semantic-reference-runtime');
var sourceContract = require('../ai/game-semantic-source');
var semanticRuntime = require('../ai/semantic-llm2-runtime');
var taskPlanApi = require('../ai/semantic-task-plan');
var repositoryPath = require('./repository-path');

function fail(message) { throw new Error(message); }
function argument(name) { var prefix = '--' + name + '='; var value = process.argv.filter(function(item) { return item.indexOf(prefix) === 0; })[0]; return value ? value.slice(prefix.length) : null; }
function runFiles() { return process.argv.slice(2).filter(function(item) { return item.indexOf('--') !== 0; }).map(function(item) { return repositoryPath.fromCommandLine(item, 'run file'); }); }
function taskReceiptHashes(ledger) { return (ledger && ledger.events || []).filter(function(event) { return event.type === 'TASK_COMMITTED'; }).map(function(event) { return event.payload.receiptHash; }); }
function terminalSourceHash(ledger) { var event = (ledger && ledger.events || []).filter(function(item) { return item.type === 'RUN_COMPLETED'; })[0]; return event && event.payload.sourceHash || null; }
function loadSeedSource(record, index) {
  var seedLocator = record.probe && record.probe.seedFile;
  if (!seedLocator) return null;
  var seedFile = repositoryPath.fromLocator(seedLocator, 'probe.seedFile');
  var parsed = parser.parse(fs.readFileSync(seedFile, 'utf8'));
  if (parsed.warnings.length) fail('Seed DSL is invalid: ' + parsed.warnings.join(' | '));
  var draft = draftApi.create(referenceRuntime.create(index), null);
  parsed.commands.forEach(function(command) { draftApi.execute(draft, command); });
  return sourceContract.validateSource(draftApi.materialize(draft), { index: index });
}
function metrics(trace, baseDraft, finalDraft, ledger) {
  var entries = trace || [], results = [];
  entries.forEach(function(entry) { results = results.concat(entry.results || []); });
  var emitted = entries.reduce(function(total, entry) { return total + (entry.commands || []).length; }, 0);
  var failureMap = Object.create(null);
  results.filter(function(item) { return !item.ok; }).forEach(function(item) { var code = item.code || 'FAILED', message = item.message || '', key = code + '\n' + message; if (!failureMap[key]) failureMap[key] = { code: code, message: message, count: 0 }; failureMap[key].count++; });
  var failures = Object.keys(failureMap).map(function(key) { return failureMap[key]; });
  var acceptedBatches = entries.filter(function(entry) { return entry.result && entry.result.ok; }).length;
  var committedWrites = entries.reduce(function(total, entry) { return total + (entry.kind === 'draft-write' && entry.result && entry.result.ok ? (entry.commands || []).length : 0); }, 0);
  var rollbackEntries = entries.filter(function(entry) { return entry.result && entry.result.rolledBack; });
  var rollbackVerified = rollbackEntries.every(function(entry) { return entry.result.beforeDraftHash && entry.result.beforeDraftHash === entry.result.afterDraftHash; });
  finalDraft = finalDraft || baseDraft;
  return {
    batchCount: entries.length,
    acceptedBatchCount: acceptedBatches,
    runtimeBatchAcceptanceRate: entries.length ? acceptedBatches / entries.length : 0,
    runtimeBatchAccepted: entries.length > 0 && acceptedBatches === entries.length,
    emittedCommandCount: emitted,
    attemptedCommandCount: results.length,
    committedWriteCommandCount: committedWrites,
    rolledBackCommandCount: results.filter(function(item) { return item.rolledBack === true; }).length,
    rollbackBatchCount: rollbackEntries.length,
    failedBatchRollbackVerified: rollbackEntries.length ? rollbackVerified : null,
    baseDraftHash: taskPlanApi.documentHash(baseDraft),
    finalDraftHash: taskPlanApi.documentHash(finalDraft),
    modelElapsedMs: entries.reduce(function(total, entry) { return total + Number(entry.elapsedMs || 0); }, 0),
    stateSequence: (ledger && ledger.events || []).map(function(event) { return event.type; }),
    taskReceiptHashes: taskReceiptHashes(ledger),
    terminalSourceHash: terminalSourceHash(ledger),
    failures: failures
  };
}
async function replay(file, index) {
  var record = JSON.parse(fs.readFileSync(file.absolutePath, 'utf8'));
  var recordedTrace = (record.runTrace || []).filter(function(entry) { return entry.protocolVersion && entry.hashes && entry.hashes.bundleHash; });
  if (!recordedTrace.length) fail(file.locator + ' has no recorded semantic model calls.');
  var cursor = 0;
  var provider = { invokeRole: async function() {
    if (cursor >= recordedTrace.length) fail(file.locator + ' replay requested an unrecorded provider call.');
    var recorded = recordedTrace[cursor++];
    if (!recorded.result || recorded.result.ok !== true) fail(file.locator + ' contains a failed provider/model call and is not a first-pass benchmark artifact.');
    return { ok: true, output: { text: recorded.output, finishReason: recorded.finishReason || 'replay', diagnostics: { elapsedMs: recorded.elapsedMs, firstReasoningMs: recorded.firstReasoningMs, firstContentMs: recorded.firstContentMs, reasoningChars: recorded.reasoningChars, contentChars: recorded.contentChars } }, receipt: { receiptId: recorded.requestId || 'provider.replay-' + cursor, usage: recorded.usage || {} } };
  } };
  var source = loadSeedSource(record, index);
  var references = referenceRuntime.create(index);
  var baseDraft = draftApi.structure(draftApi.create(references, source));
  var result = null, error = null;
  try {
    result = await semanticRuntime.create({ providerRuntime: provider }).invoke({ requestId: 'semantic.replay', projectId: 'semantic-replay', timeoutMs: 120000, maxTokens: record.probe && record.probe.semanticMaxTokens || 4096, userRequest: record.probe && record.probe.task || '', creativeVision: record.creativeVision || '', source: source, index: index });
  } catch (caught) { error = caught; }
  if (cursor !== recordedTrace.length) fail(file.locator + ' replay consumed ' + cursor + ' of ' + recordedTrace.length + ' recorded model calls.');
  var trace = result && result.runTrace || error && error.runTrace || [];
  var finalDraft = result && result.draft || error && error.draft || baseDraft, ledger = result && result.runLedger || error && error.runLedger || null;
  var recordedResult = record.result || null, recordedError = record.error || null;
  var recordedPlanHash = record.taskPlan && record.taskPlan.planHash || recordedResult && recordedResult.taskPlan && recordedResult.taskPlan.planHash || recordedError && recordedError.taskPlan && recordedError.taskPlan.planHash || null;
  var replayPlanHash = result && result.taskPlan && result.taskPlan.planHash || error && error.taskPlan && error.taskPlan.planHash || null;
  var recordedLedger = record.runLedger || recordedResult && recordedResult.runLedger || recordedError && recordedError.runLedger || null;
  var recordedSourceHash = recordedResult && recordedResult.document && recordedResult.document.source ? sourceContract.sourceHash(recordedResult.document.source) : terminalSourceHash(recordedLedger);
  var replaySourceHash = result && result.document && result.document.source ? sourceContract.sourceHash(result.document.source) : terminalSourceHash(ledger);
  var parity = { planHash: recordedPlanHash === replayPlanHash, taskReceipts: JSON.stringify(taskReceiptHashes(recordedLedger)) === JSON.stringify(taskReceiptHashes(ledger)), sourceHash: recordedSourceHash === replaySourceHash };
  var report = Object.assign({ file: file.locator, terminalCode: result && result.ok ? 'COMPLETE' : error && error.code || 'FAILED', completed: !!(result && result.ok), planHash: replayPlanHash, sourceHash: replaySourceHash, cacheSummary: result && result.cacheSummary || error && error.cacheSummary || null, recordedParity: parity, recordedProtocolVersions: recordedTrace.map(function(entry) { return entry.protocolVersion; }) }, metrics(trace, baseDraft, finalDraft, ledger));
  return { report: report, record: record, source: source, result: result, error: error, trace: trace, baseDraft: baseDraft, finalDraft: finalDraft };
}
async function main() {
  var files = runFiles();
  if (!files.length) fail('Usage: node scripts/replay-semantic-live-suite.js [--output=report.json] [--min-runtime-acceptance=0..1] <run.json> [...]');
  var index = dictionary.loadIndex(), executions = [];
  for (var i = 0; i < files.length; i++) executions.push(await replay(files[i], index));
  var runs = executions.map(function(execution) { return execution.report; });
  var acceptedRuns = runs.filter(function(run) { return run.runtimeBatchAccepted; }).length;
  var acceptedBatches = runs.reduce(function(total, run) { return total + run.acceptedBatchCount; }, 0);
  var batchCount = runs.reduce(function(total, run) { return total + run.batchCount; }, 0);
  var report = {
    schemaVersion: 1,
    reportKind: 'semantic-runtime-replay-suite',
    generatedAt: new Date().toISOString(),
    summary: {
      runCount: runs.length,
      runtimeBatchAcceptedRuns: acceptedRuns,
      runtimeBatchAcceptedRunRate: runs.length ? acceptedRuns / runs.length : 0,
      batchCount: batchCount,
      acceptedBatches: acceptedBatches,
      runtimeBatchAcceptanceRate: batchCount ? acceptedBatches / batchCount : 0,
      emittedCommands: runs.reduce(function(total, run) { return total + run.emittedCommandCount; }, 0),
      attemptedCommands: runs.reduce(function(total, run) { return total + run.attemptedCommandCount; }, 0),
      committedWriteCommands: runs.reduce(function(total, run) { return total + run.committedWriteCommandCount; }, 0),
      rolledBackCommands: runs.reduce(function(total, run) { return total + run.rolledBackCommandCount; }, 0)
    },
    runs: runs
  };
  var output = argument('output');
  if (output) { var outputFile = repositoryPath.fromCommandLine(output, '--output'); fs.mkdirSync(path.dirname(outputFile.absolutePath), { recursive: true }); fs.writeFileSync(outputFile.absolutePath, JSON.stringify(report, null, 2), 'utf8'); report.outputFile = outputFile.locator; }
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  var minimum = argument('min-runtime-acceptance');
  if (minimum !== null) { minimum = Number(minimum); if (!Number.isFinite(minimum) || minimum < 0 || minimum > 1) fail('--min-runtime-acceptance must be between 0 and 1.'); if (report.summary.runtimeBatchAcceptanceRate < minimum) process.exitCode = 1; }
}

if (require.main === module) main().catch(function(error) { process.stderr.write('[SemanticRuntimeReplay] ' + error.message + '\n'); process.exit(1); });
module.exports = { replay: replay, metrics: metrics, loadSeedSource: loadSeedSource, taskReceiptHashes: taskReceiptHashes, terminalSourceHash: terminalSourceHash };
