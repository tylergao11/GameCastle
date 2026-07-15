var fs = require('fs');
var path = require('path');
var dictionary = require('../ai/capability-semantic-dictionary');
var llmProvider = require('../ai/llm-provider');
var semanticRuntime = require('../ai/semantic-llm2-runtime');
var sourceContract = require('../ai/game-semantic-source');
var modelPolicy = require('../ai/semantic-model-policy');

var index = dictionary.loadIndex();
var runId = 'snake-live-' + new Date().toISOString().replace(/[:.]/g, '-');
var outputDirectory = path.join(process.cwd(), 'output', 'semantic-live');
var record = { runId: runId, runTrace: [] };
var creativeFileArgument = process.argv.filter(function(argument) { return argument.indexOf('--creative-file=') === 0; })[0] || null;

function writeResult(value) {
  fs.mkdirSync(outputDirectory, { recursive: true });
  var file = path.join(outputDirectory, runId + '.json');
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
  return file;
}

async function main() {
  var creativeVision;
  if (creativeFileArgument) {
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
  if (!creativeVision) throw new Error('LLM1 did not return a creative vision.');
  record.creativeVision = creativeVision;

  var result;
  try {
    result = await semanticRuntime.create().invoke({
      requestId: runId + '-semantic',
      projectId: runId,
      estimatedCost: 0.01,
      timeoutMs: 30000,
      maxTokens: 8192,
      maxRounds: 3,
      userRequest: 'Build a complete playable 2D Snake demo with a grid board, controllable snake, food, score growth, self and boundary loss, and a restart loop.',
      creativeVision: creativeVision,
      world: { mode: 'baseline', world: { sourceHash: 'semantic.snake.initial', structureHash: 'structure.snake.initial', payload: {} } },
      onSemanticRound: function(entry) {
        record.runTrace.push(entry);
        writeResult(record);
        var commands = (entry.commands || []).map(function(command) { return '>' + command.type; }).join(',');
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
  if (!result.ok) throw Object.assign(new Error('LLM2 semantic run returned a provider debt.'), { code: result.debt && result.debt.code, outputFile: file });
  process.stdout.write('[SnakeLive] sourceHash=' + sourceContract.sourceHash(result.document.source) + ' artifact=' + result.document.assembly.projectSeed.documentKind + ' output=' + file + '\n');
}

main().catch(function(error) {
  process.stderr.write('[SnakeLive] ' + (error.code || error.name || 'FAILED') + ': ' + error.message + (error.outputFile ? ' output=' + error.outputFile : '') + '\n');
  process.exit(1);
});
