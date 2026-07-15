var fs = require('fs');
var path = require('path');
var dictionary = require('../ai/capability-semantic-dictionary');
var llmProvider = require('../ai/llm-provider');
var semanticRuntime = require('../ai/semantic-llm2-runtime');
var sourceContract = require('../ai/game-semantic-source');
var modelPolicy = require('../ai/semantic-model-policy');
var semanticParser = require('../ai/semantic-dsl-parser');
var semanticDraft = require('../ai/semantic-draft');
var semanticReferences = require('../ai/semantic-reference-runtime');

var index = dictionary.loadIndex();
var runId = 'snake-live-' + new Date().toISOString().replace(/[:.]/g, '-');
var outputDirectory = path.join(process.cwd(), 'output', 'semantic-live');
var record = { runId: runId, runTrace: [] };
var creativeFileArgument = process.argv.filter(function(argument) { return argument.indexOf('--creative-file=') === 0; })[0] || null;
var timeoutArgument = process.argv.filter(function(argument) { return argument.indexOf('--timeout-ms=') === 0; })[0] || null;
var maxTokensArgument = process.argv.filter(function(argument) { return argument.indexOf('--max-tokens=') === 0; })[0] || null;
var maxRoundsArgument = process.argv.filter(function(argument) { return argument.indexOf('--max-rounds=') === 0; })[0] || null;
var taskArgument = process.argv.filter(function(argument) { return argument.indexOf('--task=') === 0; })[0] || null;
var seedFileArgument = process.argv.filter(function(argument) { return argument.indexOf('--seed-file=') === 0; })[0] || null;
var skipLlm1 = process.argv.indexOf('--skip-llm1') >= 0;
var semanticTimeoutMs = timeoutArgument ? Number(timeoutArgument.slice('--timeout-ms='.length)) : 120000;
var semanticMaxTokens = maxTokensArgument ? Number(maxTokensArgument.slice('--max-tokens='.length)) : 8192;
var semanticMaxRounds = maxRoundsArgument ? Number(maxRoundsArgument.slice('--max-rounds='.length)) : 1;
if (!Number.isFinite(semanticTimeoutMs) || semanticTimeoutMs < 1) throw new Error('--timeout-ms must be a positive number.');
if (!Number.isInteger(semanticMaxTokens) || semanticMaxTokens < 1) throw new Error('--max-tokens must be a positive integer.');
if (!Number.isInteger(semanticMaxRounds) || semanticMaxRounds < 1) throw new Error('--max-rounds must be a positive integer.');
var semanticTask = taskArgument ? taskArgument.slice('--task='.length).trim() : 'Build a complete playable 2D Snake demo with a grid board, controllable snake, food, score growth, self and boundary loss, and a restart loop.';
if (!semanticTask) throw new Error('--task must contain a task.');
var seedFile = seedFileArgument ? path.resolve(seedFileArgument.slice('--seed-file='.length)) : null;
record.probe = { semanticTimeoutMs: semanticTimeoutMs, semanticMaxTokens: semanticMaxTokens, semanticMaxRounds: semanticMaxRounds, skipLlm1: skipLlm1, task: semanticTask, seedFile: seedFile };

function loadSeedSource() {
  if (!seedFile) return null;
  var parsed = semanticParser.parse(fs.readFileSync(seedFile, 'utf8'));
  if (parsed.warnings.length) throw new Error('Seed DSL is invalid: ' + parsed.warnings.join(' | '));
  var references = semanticReferences.create(index);
  var draft = semanticDraft.create(references, null);
  parsed.commands.forEach(function(command) { semanticDraft.execute(draft, command); });
  return sourceContract.validateSource(semanticDraft.materialize(draft), { index: index });
}

function writeResult(value) {
  fs.mkdirSync(outputDirectory, { recursive: true });
  var file = path.join(outputDirectory, runId + '.json');
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
  return file;
}

function writeDeepSeekOutput(role, round, requestId, output) {
  var fields = ['role=' + role];
  if (round !== null && round !== undefined) fields.push('round=' + round);
  if (requestId) fields.push('requestId=' + requestId);
  process.stdout.write('[DeepSeekOutput] begin ' + fields.join(' ') + '\n');
  process.stdout.write(String(output || '') + '\n');
  process.stdout.write('[DeepSeekOutput] end ' + fields.join(' ') + '\n');
}

async function main() {
  var seedSource = loadSeedSource();
  var semanticWorld = seedSource ? sourceContract.structureView(seedSource, { index: index }) : { mode: 'baseline', world: { sourceHash: 'semantic.snake.initial', structureHash: 'structure.snake.initial', payload: {} } };
  var creativeVision;
  if (skipLlm1) {
    creativeVision = '';
    process.stdout.write('[SnakeLive] creative=skipped\n');
  } else if (creativeFileArgument) {
    var creativeRecord = JSON.parse(fs.readFileSync(path.resolve(creativeFileArgument.slice('--creative-file='.length)), 'utf8'));
    creativeVision = creativeRecord.creativeVision;
    record.creativeSource = path.resolve(creativeFileArgument.slice('--creative-file='.length));
    process.stdout.write('[SnakeLive] creative=reused source=' + record.creativeSource + '\n');
  } else creativeVision = await llmProvider.callTextModel(
      'Create a compact creative vision for a 2D Snake game. Cover player fantasy, grid atmosphere, readable snake and food art direction, score progression, growth rhythm, loss moment, and restart energy. Write concise production-ready prose.',
      'You are LLM1, the creative director for GameCastle. Produce a vivid game vision that gives LLM2 clear artistic and experiential direction.',
      { agentRole: 'creative', provider: modelPolicy.LLM1.provider, model: modelPolicy.LLM1.model, projectId: runId + '-creative', requestId: runId + '-creative', estimatedCost: 0.01, timeoutMs: 30000, maxTokens: 1200, thinking: modelPolicy.LLM1.thinking, reasoningEffort: modelPolicy.LLM1.reasoningEffort, temperature: modelPolicy.LLM1.temperature },
      function(message) { process.stdout.write(message + '\n'); }
    );
  if (!skipLlm1 && !creativeVision) throw new Error('LLM1 did not return a creative vision.');
  record.creativeVision = creativeVision;
  if (!skipLlm1) writeDeepSeekOutput('LLM1', null, runId + '-creative', creativeVision);
  writeResult(record);

  var result;
  try {
    result = await semanticRuntime.create().invoke({
      requestId: runId + '-semantic',
      projectId: runId,
      estimatedCost: 0.01,
      timeoutMs: semanticTimeoutMs,
      maxTokens: semanticMaxTokens,
      maxRounds: semanticMaxRounds,
      userRequest: semanticTask,
      creativeVision: creativeVision,
      world: semanticWorld,
      source: seedSource,
      onSemanticRound: function(entry) {
        record.runTrace.push(entry);
        writeResult(record);
        writeDeepSeekOutput('LLM2', entry.round, entry.requestId, entry.output);
        var providerDiagnostics = entry.provider && entry.provider.diagnostics || {};
        process.stdout.write('[DeepSeekRound] round=' + entry.round + ' finish=' + (entry.provider && entry.provider.finishReason || 'unknown') + ' reasoningChars=' + (providerDiagnostics.reasoningChars || 0) + ' contentChars=' + (providerDiagnostics.contentChars || 0) + ' chunks=' + (providerDiagnostics.chunkCount || 0) + ' firstReasoningMs=' + (providerDiagnostics.firstReasoningMs === null || providerDiagnostics.firstReasoningMs === undefined ? 'none' : providerDiagnostics.firstReasoningMs) + ' firstContentMs=' + (providerDiagnostics.firstContentMs === null || providerDiagnostics.firstContentMs === undefined ? 'none' : providerDiagnostics.firstContentMs) + ' elapsedMs=' + (providerDiagnostics.elapsedMs || 0) + '\n');
        var commands = (entry.commands || []).map(function(command) { return command.type; }).join(',');
        var failures = (entry.results || []).filter(function(item) { return !item.ok; }).map(function(item) { return (item.code || 'FAILED') + ':' + item.message; }).join(' | ');
        process.stdout.write('[SnakeLive] round=' + entry.round + ' mode=' + entry.kind + ' commands=' + commands + ' status=' + (failures ? 'feedback ' + failures : 'applied') + '\n');
      },
      index: index
    });
  } catch (error) {
    record.error = { code: error.code || error.name || 'FAILED', message: error.message, runTrace: error.runTrace || record.runTrace, runLedger: error.runLedger || null, document: error.document || null };
    error.outputFile = writeResult(record);
    throw error;
  }
  record.result = result;
  record.runTrace = result.runTrace || record.runTrace;
  record.runLedger = result.runLedger || null;
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
