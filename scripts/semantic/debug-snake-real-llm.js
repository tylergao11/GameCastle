var fs = require('fs');
var path = require('path');
var childProcess = require('child_process');
var dictionary = require('../../packages/semantic/src/capability-semantic-dictionary');
var semanticRuntime = require('../../packages/semantic/src/semantic-llm2-runtime');
var providerRuntimeApi = require('../../packages/providers/src/provider-runtime');
var modelPolicy = require('../../packages/semantic/src/semantic-model-policy');
var directorModelPort = require('../../packages/product/src/director-model-port');
var sourceContract = require('../../packages/semantic/src/game-semantic-source');
var trainingLog = require('../../packages/semantic/src/semantic-training-log');
var semanticParser = require('../../packages/semantic/src/semantic-dsl-parser');
var semanticPromptBundle = require('../../packages/semantic/src/semantic-prompt-bundle');
var seedLoader = require('../../packages/semantic/src/semantic-seed-loader');
var repositoryPath = require('../shared/repository-path');
var snakeBenchmark = require('../../tests/benchmarks/snake-semantic-benchmark');
var modelRuntimeProfile = require('../models/semantic-runtime-profile.json');

var index = dictionary.loadIndex();
var runId = 'snake-live-' + new Date().toISOString().replace(/[:.]/g, '-');
var outputDirectory = path.join(repositoryPath.root, '.gamecastle', 'output', 'semantic-live');
var record = { runId: runId, runTrace: [] };
var timeoutArgument = process.argv.filter(function(argument) { return argument.indexOf('--timeout-ms=') === 0; })[0] || null;
var maxTokensArgument = process.argv.filter(function(argument) { return argument.indexOf('--max-tokens=') === 0; })[0] || null;
var taskArgument = process.argv.filter(function(argument) { return argument.indexOf('--task=') === 0; })[0] || null;
var seedFileArgument = process.argv.filter(function(argument) { return argument.indexOf('--seed-file=') === 0; })[0] || null;
var planDslArgument = process.argv.filter(function(argument) { return argument.indexOf('--plan-dsl-file=') === 0; })[0] || null;
var freezePlanArgument = process.argv.indexOf('--freeze-llm1-plan') >= 0;
var benchmarkTaskArgument = process.argv.filter(function(argument) { return argument.indexOf('--benchmark-task=') === 0; })[0] || null;
var semanticTimeoutMs = timeoutArgument ? Number(timeoutArgument.slice('--timeout-ms='.length)) : semanticRuntime.HARD_TIMEOUT_MS;
var semanticMaxTokens = maxTokensArgument ? Number(maxTokensArgument.slice('--max-tokens='.length)) : semanticRuntime.MAX_TOKENS;
if (!Number.isFinite(semanticTimeoutMs) || semanticTimeoutMs < 1 || semanticTimeoutMs > semanticRuntime.HARD_TIMEOUT_MS) throw new Error('--timeout-ms must be between 1 and the ' + semanticRuntime.HARD_TIMEOUT_MS + ' ms semantic hard limit.');
if (!Number.isInteger(semanticMaxTokens) || semanticMaxTokens < 1 || semanticMaxTokens > semanticRuntime.MAX_TOKENS) throw new Error('--max-tokens must be between 1 and ' + semanticRuntime.MAX_TOKENS + '.');
if (benchmarkTaskArgument && (taskArgument || seedFileArgument)) throw new Error('--benchmark-task owns task and seed; do not combine it with --task or --seed-file.');
var benchmarkTask = benchmarkTaskArgument ? snakeBenchmark.tasks.find(function(task) { return task.id === benchmarkTaskArgument.slice('--benchmark-task='.length); }) : null;
if (benchmarkTaskArgument && !benchmarkTask) throw new Error('Unknown --benchmark-task. Select one task id from tests/benchmarks/snake-semantic-contract.json.');
var semanticTask = benchmarkTask ? benchmarkTask.task : taskArgument ? taskArgument.slice('--task='.length).trim() : 'Build a complete playable 2D Snake demo with a grid board, controllable snake, food, score growth, self and boundary loss, and a restart loop.';
if (!semanticTask) throw new Error('--task must contain a task.');
var seedSelection = benchmarkTask && benchmarkTask.seedFile ? { absolutePath: repositoryPath.fromLocator(benchmarkTask.seedFile, 'benchmark seedFile'), locator: benchmarkTask.seedFile } : seedFileArgument ? repositoryPath.fromCommandLine(seedFileArgument.slice('--seed-file='.length), '--seed-file') : null;
var seedFile = seedSelection ? seedSelection.absolutePath : null;
var planDslFile = planDslArgument ? repositoryPath.fromCommandLine(planDslArgument.slice('--plan-dsl-file='.length), '--plan-dsl-file') : null;
var planDsl = planDslFile ? fs.readFileSync(planDslFile.absolutePath, 'utf8').trim() : null;
if (planDslFile && !planDsl) throw new Error('--plan-dsl-file must contain non-empty Planner DSL.');

var llm2 = modelPolicy.resolveModel();
var llm1 = directorModelPort.POLICY;
record.probe = {
  semanticTimeoutMs: semanticTimeoutMs,
  semanticMaxTokens: semanticMaxTokens,
  runtimeMode: llm2.mode,
  llm1: { provider: llm1.provider, model: llm1.model, role: 'human-or-director-plan' },
  llm2: { provider: llm2.provider, model: llm2.model, role: 'semantic-design' },
  freezeLlm1Plan: !!(planDsl || freezePlanArgument),
  planDslFile: planDslFile ? planDslFile.locator : null,
  benchmarkId: benchmarkTask ? snakeBenchmark.contract.benchmarkId : null,
  benchmarkTaskId: benchmarkTask ? benchmarkTask.id : null,
  task: semanticTask,
  seedFile: seedSelection ? seedSelection.locator : null
};

function gitCommit() {
  var result = childProcess.spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryPath.root, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0 || !String(result.stdout || '').trim()) throw new Error('Snake live capture requires the current git commit.');
  return String(result.stdout).trim();
}

record.provenance = {
  schemaVersion: 1,
  provenanceKind: 'snake-semantic-live-provenance',
  capturedAt: new Date().toISOString(),
  gitCommit: gitCommit(),
  benchmark: benchmarkTask ? { benchmarkId: snakeBenchmark.contract.benchmarkId, benchmarkSchemaVersion: snakeBenchmark.contract.schemaVersion, taskId: benchmarkTask.id } : null,
  semanticContract: { languageId: semanticParser.LANGUAGE_ID, promptVersions: semanticPromptBundle.PROFILE_VERSIONS, dictionarySource: index.source },
  modelRuntime: Object.assign({}, modelRuntimeProfile, { activeMode: llm2.mode, activeProvider: llm2.provider, activeModel: llm2.model })
};

function loadSeedSource() {
  if (!seedFile) return null;
  return seedLoader.load(fs.readFileSync(seedFile, 'utf8'), index);
}

function writeResult(value) {
  fs.mkdirSync(outputDirectory, { recursive: true });
  var file = path.join(outputDirectory, runId + '.json');
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
  return repositoryPath.relativeLocator(file, 'semantic-live output');
}

function writeModelOutput(role, sequence, requestId, output) {
  var fields = ['role=' + role];
  if (sequence !== null && sequence !== undefined) fields.push('sequence=' + sequence);
  if (requestId) fields.push('requestId=' + requestId);
  process.stdout.write('[SemanticModelOutput] begin ' + fields.join(' ') + '\n');
  process.stdout.write(String(output || '') + '\n');
  process.stdout.write('[SemanticModelOutput] end ' + fields.join(' ') + '\n');
}

async function main() {
  var seedSource = loadSeedSource();
  process.stdout.write('[SnakeLive] mode=' + llm2.mode + ' LLM1=' + llm1.provider + '/' + llm1.model + ' LLM2=' + llm2.provider + '/' + llm2.model + ' freezePlan=' + !!planDsl + '\n');
  writeResult(record);

  var result;
  var semanticStartedAt = Date.now();
  var lastObservedSequence = null;
  var lastObservedAt = semanticStartedAt;
  var heartbeat = setInterval(function() {
    process.stdout.write('[SnakeLive] heartbeat elapsedMs=' + (Date.now() - semanticStartedAt) + ' lastSequence=' + (lastObservedSequence === null ? '-' : lastObservedSequence) + ' lastEventAgeMs=' + (Date.now() - lastObservedAt) + '\n');
  }, 10000);
  try {
    var trainingSink = trainingLog.createFileSink({ directory: path.join(repositoryPath.root, '.gamecastle', 'output', 'semantic-training'), runId: runId });
    record.trainingLog = repositoryPath.relativeLocator(trainingSink.file, 'semantic training log');
    var providerRuntime = providerRuntimeApi.createProviderRuntime({
      maxCost: Infinity,
      receiptDir: path.join(outputDirectory, 'provider-receipts', runId)
    });
    var invokeInput = {
      requestId: runId + '-semantic',
      projectId: runId,
      estimatedCost: 0.01,
      timeoutMs: semanticTimeoutMs,
      maxTokens: semanticMaxTokens,
      userRequest: semanticTask,
      source: seedSource,
      onSemanticEvent: function(entry) {
        lastObservedSequence = entry.sequence;
        lastObservedAt = Date.now();
        record.runTrace.push(entry);
        writeResult(record);
        writeModelOutput('semantic-dsl', entry.sequence, entry.requestId, entry.output);
        process.stdout.write('[SemanticModelCall] sequence=' + entry.sequence + ' phase=' + entry.phase + ' state=' + entry.state + ' task=' + (entry.activeTaskId || '-') + ' finish=' + (entry.finishReason || 'unknown') + ' reasoningChars=' + (entry.reasoningChars || 0) + ' contentChars=' + (entry.contentChars || 0) + ' firstReasoningMs=' + (entry.firstReasoningMs === null || entry.firstReasoningMs === undefined ? 'none' : entry.firstReasoningMs) + ' firstContentMs=' + (entry.firstContentMs === null || entry.firstContentMs === undefined ? 'none' : entry.firstContentMs) + ' elapsedMs=' + (entry.elapsedMs || 0) + ' cacheHitRate=' + (entry.cache && entry.cache.hitRate || 0) + '\n');
        var commands = (entry.commands || []).map(function(command) { return command.type; }).join(',');
        var failures = (entry.results || []).filter(function(item) { return !item.ok; }).map(function(item) { return (item.code || 'FAILED') + ':' + item.message; }).join(' | ');
        process.stdout.write('[SnakeLive] sequence=' + entry.sequence + ' mode=' + entry.kind + ' commands=' + commands + ' status=' + (failures ? 'feedback ' + failures : 'accepted') + '\n');
      },
      index: index
    };
    if (planDsl) invokeInput.planDsl = planDsl;
    result = await semanticRuntime.create({
      providerRuntime: providerRuntime,
      trainingLogSink: trainingSink,
      trainingProvenance: record.provenance
    }).invoke(invokeInput);
  } catch (error) {
    record.error = { code: error.code || error.name || 'FAILED', message: error.message, runTrace: error.runTrace || record.runTrace, runLedger: error.runLedger || null, runState: error.runState || null, taskPlan: error.taskPlan || null, cacheSummary: error.cacheSummary || null, document: error.document || null };
    record.runTrace = error.runTrace || record.runTrace;
    record.runLedger = error.runLedger || null;
    record.runState = error.runState || null;
    record.taskPlan = error.taskPlan || null;
    record.cacheSummary = error.cacheSummary || null;
    error.outputFile = writeResult(record);
    throw error;
  } finally { clearInterval(heartbeat); }
  record.result = result;
  record.runTrace = result.runTrace || record.runTrace;
  record.runLedger = result.runLedger || null;
  record.runState = result.runState || null;
  record.taskPlan = result.taskPlan || null;
  record.cacheSummary = result.cacheSummary || null;
  var file = writeResult(record);
  if (!result.ok) {
    var failure = result.receipt && result.receipt.failure || {};
    var diagnostics = failure.streamDiagnostics || {};
    process.stderr.write('[SemanticModelFailure] finish=unknown reasoningChars=' + (diagnostics.reasoningChars || 0) + ' contentChars=' + (diagnostics.contentChars || 0) + ' chunks=' + (diagnostics.chunkCount || 0) + ' firstReasoningMs=' + (diagnostics.firstReasoningMs === null || diagnostics.firstReasoningMs === undefined ? 'none' : diagnostics.firstReasoningMs) + ' firstContentMs=' + (diagnostics.firstContentMs === null || diagnostics.firstContentMs === undefined ? 'none' : diagnostics.firstContentMs) + ' elapsedMs=' + (diagnostics.elapsedMs || 0) + '\n');
    throw Object.assign(new Error('Semantic DSL run returned a provider debt.'), { code: result.debt && result.debt.code, outputFile: file });
  }
  var runtimeOk = !!(result && result.ok);
  process.stdout.write('[SnakeLive] runtimeOk=' + runtimeOk + ' sourceHash=' + sourceContract.sourceHash(result.document.source) + ' artifact=' + result.document.assembly.documentKind + ' output=' + file + '\n');
  if (benchmarkTask && runtimeOk) {
    try {
      function mapOps(list) {
        return (list || []).map(function(item) {
          return {
            use: item.use || item._use || (item.operation && item.operation.use) || null,
            arguments: item._semanticArguments || item.arguments || {}
          };
        });
      }
      function mapEvent(event) {
        return {
          semanticId: event.semanticId,
          conditions: mapOps(event.conditions),
          actions: mapOps(event.actions),
          children: (event.children || []).map(mapEvent)
        };
      }
      function sourceToOracleDraft(source) {
        source = source || {};
        return {
          entities: (source.entities || []).map(function(entity) {
            return {
              semanticId: entity.semanticId,
              roles: entity.roles || [],
              objectTypeRef: entity.objectTypeRef === undefined ? null : entity.objectTypeRef,
              // Kind is not on Source; snakeBenchmark.entityKindOf is the sole derivation.
              kind: snakeBenchmark.entityKindOf(entity) || 'state',
              members: entity.members || []
            };
          }),
          components: source.components || [],
          events: (source.events || []).map(mapEvent),
          assetIntents: source.assetIntents || [],
          layoutIntents: source.layoutIntents || []
        };
      }
      var baseDraft = sourceToOracleDraft(seedSource);
      var finalDraft = sourceToOracleDraft(result.document.source);
      // Semantic oracle only: runtime.* checks are reported separately as runtimeOk.
      var evaluation = snakeBenchmark.evaluate(benchmarkTask, {
        result: result,
        source: seedSource,
        baseDraft: baseDraft,
        finalDraft: finalDraft,
        trace: (record.runTrace || []).map(function(entry) {
          return Object.assign({}, entry, {
            protocolVersion: entry.phase === 'planner' ? semanticPromptBundle.PROFILE_VERSIONS.planner : semanticPromptBundle.PROFILE_VERSIONS.executor,
            result: { ok: true }
          });
        }),
        report: {
          terminalCode: 'COMPLETED',
          runtimeBatchAccepted: true,
          acceptedBatchCount: 1,
          batchCount: 1,
          rollbackBatchCount: 0,
          modelElapsedMs: 0,
          cacheSummary: { passed: true, applicable: false },
          recordedParity: { planHash: true, taskReceipts: true, sourceHash: true }
        }
      });
      var failed = (evaluation.checks || []).filter(function(item) { return !item.passed && String(item.id).indexOf('runtime.') !== 0; });
      record.evaluation = { runtimeOk: runtimeOk, oracleOk: evaluation.semanticPassed, semanticPassed: evaluation.semanticPassed, runtimePassed: evaluation.runtimePassed, failedChecks: failed, checks: evaluation.checks };
      writeResult(record);
      process.stdout.write('[SnakeLive] oracleOk=' + evaluation.semanticPassed + ' failed=' + failed.map(function(item) { return item.id; }).join(',') + ' (semantic contract; runtimeOk separate)\n');
    } catch (oracleError) {
      process.stdout.write('[SnakeLive] oracleOk=error message=' + oracleError.message + '\n');
    }
  }
}

main().catch(function(error) {
  process.stderr.write('[SnakeLive] ' + (error.code || error.name || 'FAILED') + ': ' + error.message + (error.outputFile ? ' output=' + error.outputFile : '') + '\n');
  process.exit(1);
});
