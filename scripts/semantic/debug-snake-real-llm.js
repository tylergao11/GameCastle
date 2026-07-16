var fs = require('fs');
var path = require('path');
var dictionary = require('../../packages/semantic/src/capability-semantic-dictionary');
var llmProvider = require('../../packages/providers/src/llm-provider');
var providerGovernance = require('../../packages/providers/src/ai-provider-governance');
var semanticRuntime = require('../../packages/semantic/src/semantic-llm2-runtime');
var sourceContract = require('../../packages/semantic/src/game-semantic-source');
var modelPolicy = require('../../packages/semantic/src/semantic-model-policy');
var trainingLog = require('../../packages/semantic/src/semantic-training-log');
var semanticParser = require('../../packages/semantic/src/semantic-dsl-parser');
var semanticDraft = require('../../packages/semantic/src/semantic-draft');
var semanticReferences = require('../../packages/semantic/src/semantic-reference-runtime');
var seedLoader = require('../../packages/semantic/src/semantic-seed-loader');
var repositoryPath = require('../shared/repository-path');
var snakeBenchmark = require('../../tests/benchmarks/snake-semantic-benchmark');

var index = dictionary.loadIndex();
var runId = 'snake-live-' + new Date().toISOString().replace(/[:.]/g, '-');
var outputDirectory = path.join(repositoryPath.root, '.gamecastle', 'output', 'semantic-live');
var record = { runId: runId, runTrace: [] };
var creativeFileArgument = process.argv.filter(function(argument) { return argument.indexOf('--creative-file=') === 0; })[0] || null;
var timeoutArgument = process.argv.filter(function(argument) { return argument.indexOf('--timeout-ms=') === 0; })[0] || null;
var maxTokensArgument = process.argv.filter(function(argument) { return argument.indexOf('--max-tokens=') === 0; })[0] || null;
var taskArgument = process.argv.filter(function(argument) { return argument.indexOf('--task=') === 0; })[0] || null;
var seedFileArgument = process.argv.filter(function(argument) { return argument.indexOf('--seed-file=') === 0; })[0] || null;
var benchmarkTaskArgument = process.argv.filter(function(argument) { return argument.indexOf('--benchmark-task=') === 0; })[0] || null;
var skipLlm1 = process.argv.indexOf('--skip-llm1') >= 0;
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
record.probe = { semanticTimeoutMs: semanticTimeoutMs, semanticMaxTokens: semanticMaxTokens, skipLlm1: skipLlm1, benchmarkId: benchmarkTask ? snakeBenchmark.contract.benchmarkId : null, benchmarkTaskId: benchmarkTask ? benchmarkTask.id : null, task: semanticTask, seedFile: seedSelection ? seedSelection.locator : null };

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

function writeDeepSeekOutput(role, sequence, requestId, output) {
  var fields = ['role=' + role];
  if (sequence !== null && sequence !== undefined) fields.push('sequence=' + sequence);
  if (requestId) fields.push('requestId=' + requestId);
  process.stdout.write('[DeepSeekOutput] begin ' + fields.join(' ') + '\n');
  process.stdout.write(String(output || '') + '\n');
  process.stdout.write('[DeepSeekOutput] end ' + fields.join(' ') + '\n');
}

async function main() {
  var seedSource = loadSeedSource();
  var semanticProvider = providerGovernance.semantic();
  var creativeVision;
  if (skipLlm1) {
    creativeVision = '';
    process.stdout.write('[SnakeLive] creative=skipped\n');
  } else if (creativeFileArgument) {
    var creativeSelection = repositoryPath.fromCommandLine(creativeFileArgument.slice('--creative-file='.length), '--creative-file');
    var creativeRecord = JSON.parse(fs.readFileSync(creativeSelection.absolutePath, 'utf8'));
    creativeVision = creativeRecord.creativeVision;
    record.creativeSource = creativeSelection.locator;
    process.stdout.write('[SnakeLive] creative=reused source=' + record.creativeSource + '\n');
  } else creativeVision = await llmProvider.callTextModel(
      'Create a compact creative vision for a 2D Snake game. Cover player fantasy, grid atmosphere, readable snake and food art direction, score progression, growth rhythm, loss moment, and restart energy. Write concise production-ready prose.',
      'You are LLM1, the creative director for GameCastle. Produce a vivid game vision that gives LLM2 clear artistic and experiential direction.',
      Object.assign({ agentRole: 'creative', provider: semanticProvider.provider, model: semanticProvider.textModel, projectId: runId + '-creative', requestId: runId + '-creative', estimatedCost: 0.01, timeoutMs: 30000, maxTokens: 1200 }, modelPolicy.profile('creative')),
      function(message) { process.stdout.write(message + '\n'); }
    );
  if (!skipLlm1 && !creativeVision) throw new Error('LLM1 did not return a creative vision.');
  record.creativeVision = creativeVision;
  if (!skipLlm1) writeDeepSeekOutput('LLM1', null, runId + '-creative', creativeVision);
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
    result = await semanticRuntime.create({ trainingLogSink: trainingSink, model: { cachePolicy: semanticProvider.cachePolicy, roles: { planner: { provider: semanticProvider.provider, model: semanticProvider.textModel }, executor: { provider: semanticProvider.provider, model: semanticProvider.textModel } } } }).invoke({
      requestId: runId + '-semantic',
      projectId: runId,
      estimatedCost: 0.01,
      timeoutMs: semanticTimeoutMs,
      maxTokens: semanticMaxTokens,
      userRequest: semanticTask,
      creativeVision: creativeVision,
      source: seedSource,
      onSemanticEvent: function(entry) {
        lastObservedSequence = entry.sequence;
        lastObservedAt = Date.now();
        record.runTrace.push(entry);
        writeResult(record);
        writeDeepSeekOutput('LLM2', entry.sequence, entry.requestId, entry.output);
        process.stdout.write('[DeepSeekCall] sequence=' + entry.sequence + ' phase=' + entry.phase + ' state=' + entry.state + ' task=' + (entry.activeTaskId || '-') + ' finish=' + (entry.finishReason || 'unknown') + ' reasoningChars=' + (entry.reasoningChars || 0) + ' contentChars=' + (entry.contentChars || 0) + ' firstReasoningMs=' + (entry.firstReasoningMs === null || entry.firstReasoningMs === undefined ? 'none' : entry.firstReasoningMs) + ' firstContentMs=' + (entry.firstContentMs === null || entry.firstContentMs === undefined ? 'none' : entry.firstContentMs) + ' elapsedMs=' + (entry.elapsedMs || 0) + ' cacheHitRate=' + (entry.cache && entry.cache.hitRate || 0) + '\n');
        var commands = (entry.commands || []).map(function(command) { return command.type; }).join(',');
        var failures = (entry.results || []).filter(function(item) { return !item.ok; }).map(function(item) { return (item.code || 'FAILED') + ':' + item.message; }).join(' | ');
        process.stdout.write('[SnakeLive] sequence=' + entry.sequence + ' mode=' + entry.kind + ' commands=' + commands + ' status=' + (failures ? 'feedback ' + failures : 'accepted') + '\n');
      },
      index: index
    });
  } catch (error) {
    record.error = { code: error.code || error.name || 'FAILED', message: error.message, runTrace: error.runTrace || record.runTrace, runLedger: error.runLedger || null, runState: error.runState || null, taskPlan: error.taskPlan || null, cacheSummary: error.cacheSummary || null, document: error.document || null };
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
    process.stderr.write('[DeepSeekFailure] finish=unknown reasoningChars=' + (diagnostics.reasoningChars || 0) + ' contentChars=' + (diagnostics.contentChars || 0) + ' chunks=' + (diagnostics.chunkCount || 0) + ' firstReasoningMs=' + (diagnostics.firstReasoningMs === null || diagnostics.firstReasoningMs === undefined ? 'none' : diagnostics.firstReasoningMs) + ' firstContentMs=' + (diagnostics.firstContentMs === null || diagnostics.firstContentMs === undefined ? 'none' : diagnostics.firstContentMs) + ' elapsedMs=' + (diagnostics.elapsedMs || 0) + '\n');
    throw Object.assign(new Error('LLM2 semantic run returned a provider debt.'), { code: result.debt && result.debt.code, outputFile: file });
  }
  process.stdout.write('[SnakeLive] sourceHash=' + sourceContract.sourceHash(result.document.source) + ' artifact=' + result.document.assembly.projectSeed.documentKind + ' output=' + file + '\n');
}

main().catch(function(error) {
  process.stderr.write('[SnakeLive] ' + (error.code || error.name || 'FAILED') + ': ' + error.message + (error.outputFile ? ' output=' + error.outputFile : '') + '\n');
  process.exit(1);
});
