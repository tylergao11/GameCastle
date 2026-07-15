var prompt = require('./semantic-llm2-prompt');
var parser = require('./semantic-dsl-parser');
var pipeline = require('./semantic-run-pipeline');
var draftApi = require('./semantic-draft');
var referenceRuntime = require('./semantic-reference-runtime');
var contextBuilder = require('./semantic-commander-context');
var ledgerApi = require('./semantic-run-ledger');
var sourceContract = require('./game-semantic-source');
var runtimeLinker = require('./semantic-runtime-linker');
var feedbackContract = require('./semantic-feedback-contract');
var providerRuntime = require('./provider-runtime');
var dictionary = require('./capability-semantic-dictionary');
var modelPolicy = require('./semantic-model-policy');

var INPUT_FIELDS = ['requestId', 'projectId', 'estimatedCost', 'timeoutMs', 'maxTokens', 'maxRounds', 'userRequest', 'creativeVision', 'world', 'source', 'feedbackBatch', 'onSemanticRound', 'index'];
var DEFAULT_MAX_ROUNDS = 8;
var DEFAULT_TIMEOUT_MS = 120000;
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'SemanticLLM2Runtime'; throw error; }
function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function report(input, entry) { if (typeof input.onSemanticRound === 'function') input.onSemanticRound(clone(entry)); }
function traced(error, trace, ledger, draft) { error.runTrace = clone(trace); error.runLedger = ledgerApi.snapshot(ledger); error.draft = draftApi.structure(draft); return error; }

function create(options) {
  options = options || {};
  var provider = options.providerRuntime || providerRuntime.createProviderRuntime();
  async function invoke(input) {
    input = input || {};
    Object.keys(input).forEach(function(field) { if (INPUT_FIELDS.indexOf(field) < 0) fail('SEMANTIC_LLM2_INPUT_INVALID', 'Unsupported semantic runtime input field: ' + field); });
    if (!input.world || typeof input.world !== 'object') fail('SEMANTIC_LLM2_WORLD_REQUIRED', 'LLM2 requires a semantic world baseline or diff.');
    var index = input.index || dictionary.loadIndex();
    var references = referenceRuntime.create(index);
    var maxRounds = input.maxRounds === undefined ? DEFAULT_MAX_ROUNDS : Number(input.maxRounds);
    if (!Number.isInteger(maxRounds) || maxRounds < 1) fail('SEMANTIC_LLM2_ROUNDS_INVALID', 'maxRounds must be a positive integer.');
    var timeoutBudgetMs = input.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : Number(input.timeoutMs);
    if (!Number.isFinite(timeoutBudgetMs) || timeoutBudgetMs < 1) fail('SEMANTIC_LLM2_TIMEOUT_INVALID', 'timeoutMs must be a positive number.');
    var deadline = Date.now() + timeoutBudgetMs;
    var feedbackBatch = input.feedbackBatch === undefined ? null : feedbackContract.validate(input.feedbackBatch, { source: input.source || null, sourceHash: input.source ? sourceContract.sourceHash(input.source) : null, structureHash: input.world && input.world.world && input.world.world.structureHash || input.world && input.world.structureHash || null });
    var draft = draftApi.create(references, input.source || null);
    var ledger = ledgerApi.create(input.userRequest);
    var retrieved = [], trace = [], noProgressRounds = 0;

    for (var round = 1; round <= maxRounds; round++) {
      var remainingMs = deadline - Date.now();
      if (remainingMs < 1) throw traced(Object.assign(new Error('Semantic runtime exhausted the total time budget.'), { code: 'SEMANTIC_RUN_TIMEOUT', owner: 'SemanticLLM2Runtime' }), trace, ledger, draft);
      var context = contextBuilder.build(references, draft, input.userRequest, input.creativeVision, retrieved, ledger);
      var result = await provider.invokeRole({ requestId: (input.requestId || 'semantic-llm2') + ':round-' + round, projectId: input.projectId || 'local-session', role: 'semantic-design', provider: modelPolicy.LLM2.provider, model: modelPolicy.LLM2.model, estimatedCost: input.estimatedCost, timeoutMs: remainingMs, maxAttempts: 1, input: { messages: [{ role: 'system', content: prompt.buildSystemPrompt() }, { role: 'user', content: prompt.buildUserPrompt({ userRequest: input.userRequest, creativeVision: input.creativeVision, context: context, feedbackBatch: feedbackBatch }) }], maxTokens: input.maxTokens || 4096, thinking: modelPolicy.LLM2.thinking, reasoningEffort: modelPolicy.LLM2.reasoningEffort, temperature: modelPolicy.LLM2.temperature } });
      if (!result.ok) return Object.assign({}, result, { runTrace: trace, runLedger: ledgerApi.snapshot(ledger), draft: draftApi.structure(draft), rounds: round });
      var output = String(result.output && result.output.text || '').trim();
      var parsed;
      try { parsed = parser.parse(output); } catch (error) { parsed = { commands: [], warnings: [error.message], parseError: error }; }
      var validation = pipeline.validate(parsed.commands, parsed.warnings);
      var mode = validation.ok ? validation.mode : 'invalid';
      var progress = false, summaries = [], roundEntry = { kind: mode, round: round, requestId: result.receipt && result.receipt.receiptId || null, inputContext: clone(context), feedbackBatch: clone(feedbackBatch), output: output, provider: { finishReason: result.output && result.output.finishReason || null, diagnostics: clone(result.output && result.output.diagnostics || null), usage: clone(result.receipt && result.receipt.usage || {}) }, commands: clone(parsed.commands), warnings: clone(parsed.warnings || []), results: [] };

      if (!validation.ok) {
        var invalidError = parsed.parseError || new Error(validation.message); invalidError.code = invalidError.code || validation.code; invalidError.owner = invalidError.owner || 'SemanticRunPipeline';
        var invalidLedger = ledgerApi.recordFailure(ledger, { type: 'batch' }, invalidError, round);
        roundEntry.results.push({ ok: false, code: invalidLedger.code, message: invalidLedger.message });
      } else if (mode === 'completion') {
        try {
          var source, revision = null;
          if (draft.baseSource) { revision = draftApi.revision(draft); source = sourceContract.applyRevision(draft.baseSource, revision, { index: index }); }
          else source = sourceContract.validateSource(draftApi.materialize(draft), { index: index });
          var assembly = runtimeLinker.assemble(source, { index: index });
          ledgerApi.recordSuccess(ledger, parsed.commands[0], { summary: 'semantic source validated and assembled' }, round);
          ledgerApi.markCompleted(ledger, round);
          roundEntry.results.push({ ok: true, summary: 'semantic source validated and assembled', componentExpansion: clone(assembly.componentExpansion.components) });
          roundEntry.draft = draftApi.structure(draft);
          trace.push(roundEntry); report(input, roundEntry);
          return { ok: true, document: revision ? { source: source, revision: revision, assembly: assembly } : { source: source, assembly: assembly }, receipt: result.receipt, runTrace: trace, runLedger: ledgerApi.snapshot(ledger), rounds: round };
        } catch (error) { var completionFailure = ledgerApi.recordFailure(ledger, parsed.commands[0], error, round); roundEntry.results.push({ ok: false, code: completionFailure.code, message: completionFailure.message }); }
      } else {
        for (var i = 0; i < parsed.commands.length; i++) {
          var command = parsed.commands[i];
          var completed = ledgerApi.completedSummaryFor(ledger, command);
          if (completed) { roundEntry.results.push({ ok: true, skipped: true, summary: completed }); continue; }
          try {
            var commandResult;
            if (mode === 'parameter-read') { commandResult = references.retrieve(command); var retrieveKey = ledgerApi.signature(command); if (!retrieved.some(function(item) { return item.signature === retrieveKey; })) retrieved.push({ signature: retrieveKey, command: clone(command), result: clone(commandResult) }); }
            else commandResult = draftApi.execute(draft, command);
            var summary = mode === 'parameter-read' ? 'extension operation facts collected for ' + command.group + '/' + command.kind : commandResult.summary;
            ledgerApi.recordSuccess(ledger, command, { summary: summary }, round); summaries.push(summary); roundEntry.results.push({ ok: true, summary: summary }); progress = true;
          } catch (error) { var failure = ledgerApi.recordFailure(ledger, command, error, round); roundEntry.results.push({ ok: false, code: failure.code, message: failure.message }); break; }
        }
      }

      roundEntry.draft = draftApi.structure(draft);
      ledgerApi.recordRound(ledger, round, mode, progress, summaries);
      trace.push(roundEntry); report(input, roundEntry);
      if (ledger.status === 'fused') throw traced(Object.assign(new Error('Semantic runtime fused after the same command failure repeated twice.'), { code: 'SEMANTIC_RUN_FUSED', owner: 'SemanticLLM2Runtime' }), trace, ledger, draft);
      noProgressRounds = progress ? 0 : noProgressRounds + 1;
      if (noProgressRounds >= 2) throw traced(Object.assign(new Error('Semantic runtime fused after two consecutive rounds without new Draft or parameter facts.'), { code: 'SEMANTIC_RUN_NO_PROGRESS', owner: 'SemanticLLM2Runtime' }), trace, ledger, draft);
    }
    throw traced(Object.assign(new Error('Semantic runtime exhausted the round limit.'), { code: 'SEMANTIC_RUN_ROUNDS_EXHAUSTED', owner: 'SemanticLLM2Runtime' }), trace, ledger, draft);
  }
  return { invoke: invoke };
}
module.exports = { create: create };
