var prompt = require('./semantic-llm2-prompt');
var promptBundle = require('./semantic-prompt-bundle');
var parser = require('./semantic-dsl-parser');
var pipeline = require('./semantic-run-pipeline');
var draftApi = require('./semantic-draft');
var referenceRuntime = require('./semantic-reference-runtime');
var contextBuilder = require('./semantic-commander-context');
var taskPlanApi = require('./semantic-task-plan');
var taskSliceApi = require('./semantic-task-draft-slice');
var stateMachine = require('./semantic-run-state-machine');
var observer = require('./semantic-run-observer');
var sourceContract = require('./game-semantic-source');
var semanticAssemblyApi = require('./semantic-assembly');
var feedbackContract = require('./semantic-feedback-contract');
var dictionary = require('./capability-semantic-dictionary');
var modelPolicy = require('./semantic-model-policy');
var semanticModelPort = require('./semantic-model-port');
var trainingLog = require('./semantic-training-log');
var dslGrammar = require('./semantic-dsl-gbnf');
var INPUT_FIELDS = ['requestId', 'projectId', 'estimatedCost', 'timeoutMs', 'maxTokens', 'userRequest', 'planDsl', 'source', 'feedbackBatch', 'onSemanticEvent', 'index'];
var HARD_TIMEOUT_MS = 300000;
var MAX_TOKENS = modelPolicy.OUTPUT_TOKEN_LIMIT;
var CALL_POLICY = Object.freeze({ planner: { maxTokens: MAX_TOKENS, expectedMode: 'task-plan' }, task: { maxTokens: MAX_TOKENS, expectedMode: 'draft-write' } });

function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'SemanticLLM2Runtime'; return error; }
function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function report(input, entry) {
  if (typeof input.onSemanticEvent !== 'function') return null;
  try { input.onSemanticEvent(clone(entry)); return null; }
  catch (error) { return { code: 'SEMANTIC_OBSERVER_CALLBACK_FAILED', owner: 'SemanticLLM2Runtime', message: error && error.message || String(error) }; }
}
function subjectHash(phase, taskId, text, commands) { return 'semantic.subject.' + promptBundle.hashCanonical({ phase: phase, taskId: taskId || null, text: String(text || ''), commands: commands || [] }); }
function feedbackKey(target) { return target.collection + '/' + target.semanticId; }
function planFeedbackKey(target) {
  if (target.kind === 'game') return 'game/' + target.semanticId;
  if (target.kind === 'entity') return 'entities/' + target.semanticId;
  if (target.kind === 'member') return 'entities/' + target.owner;
  if (target.kind === 'component') return 'components/' + target.semanticId;
  if (target.kind === 'event') return 'events/' + target.semanticId;
  if (target.kind === 'asset') return 'assetIntents/' + target.semanticId;
  if (target.kind === 'layout') return 'layoutIntents/' + target.semanticId;
  return null;
}
// Dispatch-only plans have no structure targets; feedback scope is advisory for free replan.
function assertFeedbackPlan(plan, feedbackBatch) {
  if (!feedbackBatch) return;
  if (!plan || !plan.tasks || !plan.tasks.length) throw fail('SEMANTIC_FEEDBACK_PLAN_INCOMPLETE', 'TaskPlan is empty under feedback.');
}
function taskReceiptHashes(ledger) { return ledger.events.filter(function(event) { return event.type === stateMachine.EVENT_TYPES.TASK_COMMITTED; }).map(function(event) { return event.payload.receiptHash; }); }

function create(options) {
  options = options || {};
  var modelPort;
  if (options.modelPort) {
    modelPort = semanticModelPort.assertPort(options.modelPort);
  } else if (options.providerRuntime && typeof options.providerRuntime.invokeRole === 'function') {
    // Composition root (product/apps) injects ProviderRuntime; semantic does not own providers.
    modelPort = semanticModelPort.fromProviderRuntime(options.providerRuntime, options.model || {});
  } else {
    throw fail('SEMANTIC_LLM2_PORT_REQUIRED', 'SemanticLLM2Runtime.create requires modelPort or providerRuntime from the product composition root.');
  }
  var trainingSink = options.trainingLogSink ? trainingLog.assertSink(options.trainingLogSink) : null;
  var trainingProvenance = options.trainingProvenance === undefined ? null : clone(options.trainingProvenance);

  async function invoke(input) {
    input = input || {};
    Object.keys(input).forEach(function(field) { if (INPUT_FIELDS.indexOf(field) < 0) throw fail('SEMANTIC_LLM2_INPUT_INVALID', 'Unsupported semantic runtime input field: ' + field); });
    var index = input.index || dictionary.loadIndex();
    var references = referenceRuntime.create(index);
    var timeoutBudgetMs = input.timeoutMs === undefined ? HARD_TIMEOUT_MS : Number(input.timeoutMs);
    if (!Number.isFinite(timeoutBudgetMs) || timeoutBudgetMs < 1 || timeoutBudgetMs > HARD_TIMEOUT_MS) throw fail('SEMANTIC_LLM2_TIMEOUT_INVALID', 'timeoutMs must be between 1 and the ' + HARD_TIMEOUT_MS + ' ms semantic hard limit.');
    var requestedMaxTokens = input.maxTokens === undefined ? MAX_TOKENS : Number(input.maxTokens);
    if (!Number.isInteger(requestedMaxTokens) || requestedMaxTokens < 1 || requestedMaxTokens > MAX_TOKENS) throw fail('SEMANTIC_LLM2_TOKENS_INVALID', 'maxTokens must be an integer between 1 and ' + MAX_TOKENS + '.');
    if (typeof input.userRequest !== 'string' || !input.userRequest.trim()) throw fail('SEMANTIC_LLM2_REQUEST_INVALID', 'userRequest must be non-empty text.');
    if (input.planDsl !== undefined && (typeof input.planDsl !== 'string' || !input.planDsl.trim())) throw fail('SEMANTIC_LLM2_PLAN_INVALID', 'planDsl must be non-empty Planner DSL text.');

    var request = input.userRequest.trim();
    var externalPlanDsl = input.planDsl === undefined ? null : input.planDsl.trim();
    var runStartedAt = Date.now();
    var deadline = Date.now() + timeoutBudgetMs;
    var currentView = input.source ? sourceContract.structureView(input.source, { index: index }) : null;
    var feedbackBatch = input.feedbackBatch === undefined ? null : feedbackContract.validate(input.feedbackBatch, { source: input.source || null, sourceHash: currentView ? currentView.sourceHash : null, structureHash: currentView ? currentView.structureHash : null });
    var draft = draftApi.create(references, input.source || null);
    var ledger = stateMachine.create(request);
    var plan = null;
    var lastPlan = null;
    var trace = [];
    var providerCalls = 0;
    var observerWarnings = [];
    var trainingRecords = [];

    function diagnostics() {
      return {
        runTrace: clone(trace),
        runLedger: clone(ledger),
        runState: clone(stateMachine.project(ledger)),
        taskPlan: clone(plan || lastPlan),
        draft: draftApi.structure(draft),
        cacheSummary: observer.summarize(trace, 0.9, modelPort.cachePolicy),
        modelCalls: providerCalls,
        totalElapsedMs: Date.now() - runStartedAt,
        observerWarnings: clone(observerWarnings),
        trainingRecords: clone(trainingRecords)
      };
    }
    function commanderProjection() { return stateMachine.promptProjection(ledger); }
    function traced(error) { return Object.assign(error, diagnostics()); }
    function ensureBudget() {
      if (Date.now() >= deadline) {
        ledger = stateMachine.transition.expireRun(ledger, 'total semantic runtime deadline reached');
        throw traced(fail('SEMANTIC_RUN_TIMEOUT', 'Semantic runtime exhausted the total time budget.'));
      }
    }
    function appendTrace(call, outcome, results) {
      var projected = stateMachine.project(ledger);
      var entry = observer.observe({
        sequence: call.sequence,
        phase: call.phase,
        state: projected.state,
        activeTaskId: call.taskId,
        remainingMs: call.remainingMs,
        elapsedMs: call.elapsedMs,
        bundle: call.bundle,
        result: call.result,
        text: call.text,
        commands: call.commands,
        warnings: call.warnings,
        outcome: outcome
      });
      entry.kind = call.mode || call.phase;
      entry.results = clone(results || []);
      trace.push(entry);
      var trainingRecord = trainingLog.record({
        sequence: call.sequence,
        phase: call.phase === 'planner' ? 'planner' : 'executor',
        taskId: call.taskId || null,
        languageId: parser.LANGUAGE_ID,
        protocolVersion: call.bundle && call.bundle.protocolVersion || null,
        contract: {
          grammarHash: promptBundle.hashText(dslGrammar.forPhase(call.phase === 'planner' ? 'planner' : 'executor', {
            workMode: call.bundle && call.bundle.system && call.bundle.system.indexOf('WORK_MODE|revision') >= 0 ? 'revision' : 'new'
          })),
          dictionarySource: clone(index.source || null)
        },
        provenance: clone(trainingProvenance),
        prompt: call.bundle ? { system: call.bundle.system, user: call.bundle.user, hashes: clone(call.bundle.hashes) } : null,
        output: { text: call.text || '', reasoningText: call.result && call.result.output && call.result.output.reasoningText || '', finishReason: call.result && call.result.output && call.result.output.finishReason || null },
        parsedCommands: clone(call.commands || []),
        resolvedCommands: clone(call.resolvedCommands || []),
        warnings: clone(call.warnings || []),
        outcome: clone(outcome),
        accepted: !!(outcome && outcome.ok),
        feedback: stateMachine.project(ledger).lastFailure,
        usage: clone(call.result && call.result.receipt && call.result.receipt.usage || call.result && call.result.usage || {}),
        receipt: clone(call.result && call.result.receipt || null),
        elapsedMs: call.elapsedMs
      });
      trainingRecords.push(trainingRecord);
      if (trainingSink) {
        try { trainingSink.append(trainingRecord); }
        catch (trainingError) { observerWarnings.push({ code: trainingError.code || 'SEMANTIC_TRAINING_LOG_WRITE_FAILED', owner: trainingError.owner || 'SemanticTrainingLog', message: trainingError.message || String(trainingError), sequence: entry.sequence }); }
      }
      var observerWarning = report(input, entry);
      if (observerWarning) {
        observerWarning.sequence = entry.sequence;
        observerWarnings.push(observerWarning);
        entry.observerWarning = clone(observerWarning);
      }
    }
    function invokeBeforeDeadline(factory, timeoutMs) {
      return new Promise(function(resolve, reject) {
        var settled = false;
        var timer = setTimeout(function() {
          if (settled) return;
          settled = true;
          reject(fail('SEMANTIC_MODEL_CALL_TIMEOUT', 'Semantic model call exceeded its local phase deadline.'));
        }, Math.max(1, timeoutMs));
        Promise.resolve().then(factory).then(function(value) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        }, function(error) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        });
      });
    }
    async function callModel(phase, context, taskId, extraHashes) {
      ensureBudget();
      var workMode = 'new';
      if (phase !== 'planner' && context && context.l3 && context.l3.draftSlice && context.l3.draftSlice.workMode === 'revision') workMode = 'revision';
      var bundle = phase === 'planner' ? prompt.buildPlannerBundle({ context: context }) : prompt.buildExecutorBundle({ context: context });
      var remainingMs = deadline - Date.now();
      var policy = CALL_POLICY[phase];
      bundle = Object.assign({}, bundle, { hashes: Object.assign({}, bundle.hashes, extraHashes || {}) });
      providerCalls += 1;
      var startedAt = Date.now();
      var result;
      var callTimeoutMs = Math.max(1, remainingMs);
      try { result = await invokeBeforeDeadline(function() { return modelPort.invoke({
        phase: phase === 'planner' ? 'planner' : 'executor',
        workMode: workMode,
        requestId: (input.requestId || 'semantic-llm2') + ':' + phase + ':round-' + providerCalls,
        projectId: input.projectId || 'local-session',
        estimatedCost: input.estimatedCost,
        timeoutMs: callTimeoutMs,
        messages: [{ role: 'system', content: bundle.system }, { role: 'user', content: bundle.user }],
        maxTokens: Math.min(requestedMaxTokens, policy.maxTokens)
      }); }, callTimeoutMs); }
      catch (providerFailure) { result = { ok: false, debt: { code: providerFailure.code || 'SEMANTIC_PROVIDER_THROWN', owner: providerFailure.owner || 'ProviderRuntime', message: providerFailure.message } }; }
      var text = String(result && result.output && result.output.text || '').trim();
      var parsed = { commands: [], warnings: [] };
      if (result && result.ok === true) {
        try { parsed = parser.parse(text, { phase: phase === 'planner' ? 'planner' : 'executor' }); }
        catch (error) { parsed = { commands: [], warnings: [error.message], parseError: error }; }
      }
      var call = { sequence: providerCalls, phase: phase, taskId: taskId || null, bundle: bundle, remainingMs: remainingMs, elapsedMs: Date.now() - startedAt, result: result, text: text, commands: parsed.commands || [], warnings: parsed.warnings || [], parseError: parsed.parseError || null, mode: null };
      if (Date.now() >= deadline) {
        ledger = stateMachine.transition.expireRun(ledger, 'total semantic runtime deadline reached during model call');
        call.mode = 'timeout';
        appendTrace(call, { ok: false, code: 'SEMANTIC_RUN_TIMEOUT', message: 'Semantic runtime exhausted the total time budget.' }, [{ ok: false, code: 'SEMANTIC_RUN_TIMEOUT', message: 'Semantic runtime exhausted the total time budget.' }]);
        throw traced(fail('SEMANTIC_RUN_TIMEOUT', 'Semantic runtime exhausted the total time budget.'));
      }
      return call;
    }
    // Plan-scoped write failures are classified by TaskPlan (empty delta, shell shape vs wrong write).
    function semanticFailure(call, phase, taskId, error, results) {
      error = error || fail('SEMANTIC_RUN_INVALID', 'Semantic model response is invalid.');
      var effectivePhase = phase;
      var effectiveTaskId = taskId;
      if (phase === 'task' && taskPlanApi.isPlanScopedWriteFailure(plan, taskId, error) && !externalPlanDsl) {
        effectivePhase = 'plan';
        effectiveTaskId = null;
        plan = null;
      }
      var fact = {
        phase: effectivePhase,
        code: error.code || 'SEMANTIC_RUN_INVALID',
        owner: error.owner || 'SemanticLLM2Runtime',
        message: error.message || String(error),
        subjectHash: subjectHash(effectivePhase, effectiveTaskId || taskId, call && call.text, call && call.commands)
      };
      if (effectivePhase === 'task') fact.taskId = effectiveTaskId;
      // Clear model feedback: class + ordered repair steps + plan diagnosis (invent-shell vs field mutate).
      var guidance = taskPlanApi.buildFailureFeedback(error, call && call.commands);
      fact.class = guidance.class;
      fact.repair = guidance.repair;
      fact.diagnosis = guidance.diagnosis;
      ledger = stateMachine.transition.recordFailure(ledger, fact);
      var failureOutcome = { ok: false, code: fact.code, message: fact.message };
      if (effectivePhase === 'plan' && phase === 'task') failureOutcome.escalatedToPlan = true;
      if ((results || []).some(function(result) { return result.rolledBack; })) { failureOutcome.rolledBack = true; failureOutcome.beforeDraftHash = call.baseDraftHash; failureOutcome.afterDraftHash = call.baseDraftHash; }
      appendTrace(call, failureOutcome, results || [{ ok: false, code: fact.code, message: fact.message }]);
      if (stateMachine.project(ledger).state === stateMachine.STATES.FUSED) throw traced(fail('SEMANTIC_RUN_FUSED', 'Semantic runtime fused after the same exact failure repeated without progress.'));
    }
    function failedProvider(call, phase, taskId) {
      var debt = call.result && call.result.debt || {};
      var error = fail(debt.code || 'SEMANTIC_PROVIDER_FAILED', debt.message || 'Semantic provider invocation failed.'); error.owner = debt.owner || 'ProviderRuntime';
      semanticFailure(call, phase, taskId, error, [{ ok: false, code: error.code, message: error.message }]);
    }
    function markTaskActivated(taskId) {
      // Dispatch plans have no plan-use retrieval table. Ledger records one activation fingerprint
      // (goal + L1 catalog hash) so TASK_ACTIVE has an append-only audit row before free-write.
      var task = taskPlanApi.taskById(plan, taskId);
      var catalogFacts = contextBuilder.taskFacts(references, task);
      if (!stateMachine.project(ledger).retrievals.some(function(item) { return item.taskId === taskId; })) {
        ledger = stateMachine.transition.recordRetrieve(
          ledger,
          taskId,
          'semantic.task-query.' + promptBundle.hashCanonical({ taskId: task.semanticId, goal: task.goal }),
          'semantic.task-facts.' + promptBundle.hashCanonical(catalogFacts)
        );
      }
      return catalogFacts;
    }
    function prepareAutomaticTransitions() {
      while (true) {
        var view = stateMachine.project(ledger);
        if (view.state === stateMachine.STATES.PLAN_REPAIR) { ledger = stateMachine.transition.retryPlan(ledger); continue; }
        if (view.state === stateMachine.STATES.TASK_REPAIR) { ledger = stateMachine.transition.retryTask(ledger, view.activeTaskId); continue; }
        if (view.state === stateMachine.STATES.TASK_READY) { ledger = stateMachine.transition.startTask(ledger, view.activeTaskId); continue; }
        return;
      }
    }

    while (true) {
      if (Date.now() >= deadline) ensureBudget();
      prepareAutomaticTransitions();
      var view = stateMachine.project(ledger);

      if (view.state === stateMachine.STATES.PLANNING) {
        // Freeze path: one sealed dispatch, then auto-complete after that work order (no multi-task batch plan).
        if (externalPlanDsl) {
          try {
            if (view.completedTaskIds && view.completedTaskIds.length) {
              ledger = stateMachine.transition.completeDispatch(ledger);
              continue;
            }
            var externalParsed = parser.parse(externalPlanDsl, { phase: 'planner' });
            var externalValidation = pipeline.validate(externalParsed.commands, externalParsed.warnings, 'task-plan');
            if (!externalValidation.ok) throw fail(externalValidation.code, externalValidation.message);
            var externalPlan = taskPlanApi.create(externalParsed.commands);
            taskPlanApi.assertFeasible(externalPlan, draftApi.materialize(draft), { revision: !!draft.baseSource });
            if (externalPlan.dispatchComplete) {
              ledger = stateMachine.transition.completeDispatch(ledger);
              continue;
            }
            assertFeedbackPlan(externalPlan, feedbackBatch);
            plan = externalPlan;
            lastPlan = externalPlan;
            ledger = stateMachine.transition.acceptPlan(ledger, plan.planHash, plan.tasks.map(function(task) { return task.semanticId; }));
          } catch (externalPlanError) {
            externalPlanError.code = externalPlanError.code || 'SEMANTIC_LLM2_PLAN_INVALID';
            externalPlanError.owner = externalPlanError.owner || 'SemanticLLM2Runtime';
            throw traced(externalPlanError);
          }
          continue;
        }
        var plannerContext = contextBuilder.planner(references, draft, request, commanderProjection(), feedbackBatch);
        var plannerCall = await callModel('planner', plannerContext, null, { deltaHash: view.headHash });
        if (!plannerCall.result || plannerCall.result.ok !== true) { failedProvider(plannerCall, 'plan', null); continue; }
        var planValidation = pipeline.validate(plannerCall.commands, plannerCall.warnings, 'task-plan');
        plannerCall.mode = planValidation.ok ? planValidation.mode : 'invalid';
        if (!planValidation.ok) {
          var planError = plannerCall.parseError || fail(planValidation.code, planValidation.message); planError.code = planError.code || planValidation.code; planError.owner = planError.owner || 'SemanticRunPipeline';
          semanticFailure(plannerCall, 'plan', null, planError);
          continue;
        }
        try {
          var candidatePlan = taskPlanApi.create(plannerCall.commands);
          taskPlanApi.assertFeasible(candidatePlan, draftApi.materialize(draft), { revision: !!draft.baseSource });
          if (candidatePlan.dispatchComplete) {
            plan = candidatePlan;
            lastPlan = candidatePlan;
            ledger = stateMachine.transition.completeDispatch(ledger);
            appendTrace(plannerCall, { ok: true, planHash: plan.planHash, dispatchComplete: true }, [{ ok: true, summary: 'Dispatch complete; finalizing' }]);
            continue;
          }
          assertFeedbackPlan(candidatePlan, feedbackBatch);
          plan = candidatePlan;
          lastPlan = candidatePlan;
          ledger = stateMachine.transition.acceptPlan(ledger, plan.planHash, plan.tasks.map(function(task) { return task.semanticId; }));
          appendTrace(plannerCall, { ok: true, planHash: plan.planHash, taskIds: plan.tasks.map(function(task) { return task.semanticId; }) }, [{ ok: true, summary: 'One work order accepted', planHash: plan.planHash, goal: plan.tasks[0].goal }]);
        } catch (planError) {
          semanticFailure(plannerCall, 'plan', null, planError);
        }
        continue;
      }

      if (view.state === stateMachine.STATES.TASK_ACTIVE) {
        var taskId = view.activeTaskId, activeTask = taskPlanApi.taskById(plan, taskId), exactFacts;
        try { exactFacts = markTaskActivated(taskId); }
        catch (activateError) {
          var activateCall = { sequence: providerCalls, phase: 'task', taskId: taskId, bundle: null, remainingMs: Math.max(0, deadline - Date.now()), elapsedMs: 0, result: {}, text: '', commands: [], warnings: [], mode: 'task-activate' };
          semanticFailure(activateCall, 'task', taskId, activateError);
          continue;
        }
        var slice = taskSliceApi.create(draft, plan, taskId);
        var taskContext = contextBuilder.task(slice, plan, commanderProjection(), activeTask, exactFacts, feedbackBatch, request);
        var taskCall = await callModel('task', taskContext, taskId, { planHash: plan.planHash, activeTaskHash: 'semantic.task.' + promptBundle.hashCanonical(activeTask), baseDraftHash: slice.baseDraftHash, deltaHash: stateMachine.project(ledger).headHash });
        taskCall.baseDraftHash = slice.baseDraftHash;
        if (!taskCall.result || taskCall.result.ok !== true) { failedProvider(taskCall, 'task', taskId); continue; }
        var taskValidation = pipeline.validate(taskCall.commands, taskCall.warnings, 'draft-write');
        taskCall.mode = taskValidation.ok ? taskValidation.mode : 'invalid';
        if (!taskValidation.ok) {
          var taskValidationError = taskCall.parseError || fail(taskValidation.code, taskValidation.message); taskValidationError.code = taskValidationError.code || taskValidation.code; taskValidationError.owner = taskValidationError.owner || 'SemanticRunPipeline';
          semanticFailure(taskCall, 'task', taskId, taskValidationError);
          continue;
        }
        var candidate = draftApi.fork(draft), beforeDocument = draftApi.materialize(draft), stagedResults = [], writeError = null, resolvedCommands = [];
        try {
          resolvedCommands = taskPlanApi.authorizeWriteBatch(plan, taskId, taskCall.commands, {
            beforeDocument: beforeDocument
          });
          taskCall.resolvedCommands = clone(resolvedCommands);
          resolvedCommands.forEach(function(command) {
            var applied = draftApi.execute(candidate, command);
            stagedResults.push({ ok: true, summary: applied.summary });
          });
          var afterDocument = draftApi.materialize(candidate);
          var taskReceipt = taskPlanApi.verifyBatch(plan, taskId, resolvedCommands, beforeDocument, afterDocument);
          // One-task dispatch: after commit runtime returns to PLANNING (or freeze auto-completes).
          // Optional assembly probe keeps prior behavior for last sealed order.
          try {
            var probeSource = candidate.baseSource ? sourceContract.applyRevision(candidate.baseSource, draftApi.revision(candidate), { index: index }) : sourceContract.validateSource(afterDocument, { index: index });
            semanticAssemblyApi.compileSemanticAssembly(probeSource);
          } catch (_probeError) { /* assembly may fail mid-request; finalizing re-validates */ }
          var receiptHash = 'semantic.task-receipt.' + promptBundle.hashCanonical(taskReceipt);
          ledger = stateMachine.transition.commitTask(ledger, taskId, receiptHash, taskReceipt.beforeDraftHash, taskReceipt.afterDraftHash, activeTask.goal);
          draft = candidate;
          plan = null;
          stagedResults.push({ ok: true, summary: 'Task committed atomically', receiptHash: receiptHash, changedClaims: clone(taskReceipt.changedClaims) });
          appendTrace(taskCall, { ok: true, taskId: taskId, receiptHash: receiptHash }, stagedResults);
        } catch (error) {
          writeError = error;
          stagedResults.forEach(function(result) { result.ok = false; result.rolledBack = true; result.code = 'SEMANTIC_TASK_BATCH_ROLLED_BACK'; result.message = 'The complete task batch was rolled back.'; });
          stagedResults.push({ ok: false, rolledBack: true, beforeDraftHash: slice.baseDraftHash, afterDraftHash: slice.baseDraftHash, code: error.code || 'SEMANTIC_TASK_WRITE_FAILED', message: error.message });
        }
        if (writeError) semanticFailure(taskCall, 'task', taskId, writeError, stagedResults);
        continue;
      }

      if (view.state === stateMachine.STATES.FINALIZING) {
        var source, revision = null, assembly, finalFacts;
        try {
          if (draft.baseSource) {
            revision = draftApi.revision(draft);
            source = sourceContract.applyRevision(draft.baseSource, revision, { index: index });
          } else source = sourceContract.validateSource(draftApi.materialize(draft), { index: index });
          var semanticAssembly = semanticAssemblyApi.compileSemanticAssembly(source);
          // Semantic design output is Source + SemanticAssembly only; project seed is not this domain.
          assembly = semanticAssembly;
          finalFacts = { draftHash: taskPlanApi.documentHash(draftApi.materialize(draft)), sourceHash: sourceContract.sourceHash(source), taskReceiptHashes: taskReceiptHashes(ledger) };
        } catch (finalBuildError) { throw traced(finalBuildError); }
        var sealedPlanHash = (plan && plan.planHash) || (lastPlan && lastPlan.planHash) || 'semantic.plan.dispatch-complete';
        var completionReceiptHash = 'semantic.completion-receipt.' + promptBundle.hashCanonical({ planHash: sealedPlanHash, draftHash: finalFacts.draftHash, sourceHash: finalFacts.sourceHash, taskReceiptHashes: finalFacts.taskReceiptHashes });
        ledger = stateMachine.transition.completeRun(ledger, finalFacts.sourceHash, completionReceiptHash);
        var completionReceipt = { receiptId: completionReceiptHash, owner: 'SemanticLLM2Runtime', status: 'accepted', planHash: sealedPlanHash, draftHash: finalFacts.draftHash, sourceHash: finalFacts.sourceHash, taskReceiptHashes: clone(finalFacts.taskReceiptHashes) };
        return Object.assign({ ok: true, document: revision ? { source: source, revision: revision, assembly: assembly } : { source: source, assembly: assembly }, receipt: completionReceipt }, diagnostics());
      }

      if (view.state === stateMachine.STATES.FUSED) throw traced(fail('SEMANTIC_RUN_FUSED', 'Semantic runtime is fused.'));
      if (view.state === stateMachine.STATES.EXPIRED) throw traced(fail('SEMANTIC_RUN_EXPIRED', view.expirationReason || 'Semantic runtime expired.'));
      if (view.state === stateMachine.STATES.COMPLETED) throw traced(fail('SEMANTIC_RUN_TERMINAL', 'Completed semantic runtime cannot execute again.'));
      throw traced(fail('SEMANTIC_RUN_STATE_INVALID', 'Semantic runtime entered an unsupported state: ' + view.state));
    }
  }

  return { invoke: invoke };
}

module.exports = { HARD_TIMEOUT_MS: HARD_TIMEOUT_MS, MAX_TOKENS: MAX_TOKENS, CALL_POLICY: CALL_POLICY, create: create };
