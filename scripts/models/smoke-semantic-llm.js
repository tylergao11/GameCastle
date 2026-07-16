var parser = require('../../packages/semantic/src/semantic-dsl-parser');
var grammar = require('../../packages/semantic/src/semantic-dsl-gbnf');
var runtimeApi = require('../../packages/providers/src/provider-runtime');

(async function() {
  var startedAt = Date.now();
  var runtime = runtimeApi.createProviderRuntime({ maxCost: Infinity });
  var result = await runtime.invokeRole({
    requestId: 'semantic-live-smoke-' + Date.now(),
    projectId: 'gamecastle-local-runtime',
    role: 'semantic-design',
    provider: 'llama-cpp-semantic',
    estimatedCost: 0,
    timeoutMs: 180000,
    input: {
      messages: [
        { role: 'system', content: 'Output semantic-dsl-v9 only. Preserve every provided identifier exactly. Do not explain.' },
        { role: 'user', content: 'Emit exactly this command: entity(slot=head,roles=list(player),kind=sprite,behaviors=list())' }
      ],
      maxTokens: 128,
      thinking: { type: 'disabled' },
      temperature: 0,
      grammar: grammar.forPhase('executor')
    }
  });
  if (!result.ok) throw Object.assign(new Error(result.debt && result.debt.message || 'Semantic model smoke failed.'), { details: result.debt });
  if (result.output.reasoningText) throw new Error('Thinking was disabled but the model emitted reasoning content.');
  var parsed;
  try { parsed = parser.parse(result.output.text, { phase: 'executor' }); }
  catch (error) { error.modelOutput = result.output.text; throw error; }
  var command = parsed.commands[0];
  if (parsed.commands.length !== 1 || command.type !== 'entity' || command.slot !== 'head' || command.kind !== 'sprite' || command.roles.length !== 1 || command.roles[0] !== 'player' || command.behaviors.length !== 0) { var commandError = new Error('Model output was grammatical but did not obey the requested command exactly.'); commandError.modelOutput = result.output.text; throw commandError; }
  process.stdout.write('[SemanticModelLive] non-thinking GBNF DSL passed in ' + (Date.now() - startedAt) + ' ms: ' + result.output.text.trim() + '\n');
})().catch(function(error) { if (error.modelOutput) console.error('Model output:\n' + error.modelOutput); console.error(error.details || error); process.exit(1); });
