var crypto = require('crypto');
var dsl = require('./director-planner-dsl');
var prompt = require('./director-planner-prompt');
var modelPortApi = require('./director-model-port');

function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'DirectorPlannerLangGraph'; throw error; }
function receiptSummary(receipt) { if (!receipt || typeof receipt !== 'object') return null; return { receiptId: receipt.receiptId || null, provider: receipt.provider || null, model: receipt.model || null, status: receipt.status || null }; }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24); }
function sessionId() { return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'); }
function assertDomainApi(domains) { if (!domains || typeof domains.invoke !== 'function') fail('DIRECTOR_DOMAIN_API_INVALID', 'Director requires the unified domain API invoke(call).'); return domains; }
function assertSession(session) {
  if (!session || typeof session !== 'object' || typeof session.inputFor !== 'function' || typeof session.onSuccess !== 'function' || typeof session.onFailure !== 'function') fail('DIRECTOR_SESSION_INVALID', 'Director session requires inputFor, onSuccess, and onFailure callbacks.');
  return session;
}
function normalizeDirective(value, label) {
  if (!value || typeof value !== 'object') fail('DIRECTOR_SESSION_INVALID', label + ' must return a directive.');
  if (value.kind === 'dispatch') { if (typeof value.taskId !== 'string' || !value.taskId) fail('DIRECTOR_SESSION_INVALID', label + ' dispatch directive requires taskId.'); return { kind: 'dispatch', taskId: value.taskId }; }
  if (value.kind === 'end') return { kind: 'end', status: value.status || 'completed' };
  fail('DIRECTOR_SESSION_INVALID', label + ' directive kind is invalid.');
}
function normalizeFrozenPlan(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.program !== 'string' || !value.program.trim()) fail('DIRECTOR_FROZEN_PLAN_INVALID', 'Frozen Director plan requires its canonical DSL program.');
  if (value.languageId !== undefined && value.languageId !== dsl.LANGUAGE_ID) fail('DIRECTOR_FROZEN_PLAN_INVALID', 'Frozen Director plan language is invalid.');
  var plan = dsl.parseProgram(value.program), planHash = 'director-plan.' + hash(plan);
  if (value.planHash !== undefined && value.planHash !== planHash) fail('DIRECTOR_FROZEN_PLAN_INVALID', 'Frozen Director plan does not match its persisted plan hash.');
  return { plan: plan, planHash: planHash, receipt: receiptSummary(value.receipt || value) };
}

function create(options) {
  options = options || {};
  var domains = assertDomainApi(options.domains), modelPort = modelPortApi.assertPort(options.modelPort), sessions = new Map(), compiledGraphPromise = null, metrics = { graphInitializations: 0, graphInitializationFailures: 0, invokes: 0 };

  function sessionFor(state) { var session = sessions.get(state.sessionId); if (!session) fail('DIRECTOR_SESSION_MISSING', 'Director execution session is unavailable.'); return session; }
  function append(state, entry) { state.trace = (state.trace || []).concat([entry]); }

  async function compileGraph() {
    metrics.graphInitializations += 1;
    var lg = await import('@langchain/langgraph');
    if (!lg || !lg.Annotation || !lg.Annotation.Root || !lg.StateGraph || lg.START === undefined || lg.END === undefined) fail('DIRECTOR_LANGGRAPH_RUNTIME_INVALID', 'Official @langchain/langgraph runtime is unavailable.');
    var A = lg.Annotation.Root({ state: lg.Annotation({ reducer: function(_left, right) { return right; }, default: function() { return null; } }) });
    function node(work) { return async function(wire) { var state = Object.assign({}, wire.state); await work(state); return { state: state }; }; }
    var graph = new lg.StateGraph(A);
    graph.addNode('director-plan', node(async function(state) {
      var session = sessionFor(state), request, result;
      if (state.frozenPlan) {
        state.plan = state.frozenPlan.plan;
        state.planHash = state.frozenPlan.planHash;
        state.planReceipt = state.frozenPlan.receipt;
        append(state, { stage: 'director-plan-reused', planHash: state.planHash, receipt: state.planReceipt, operations: state.plan.calls.map(function(call) { return call.operation; }) });
        if (typeof session.onPlan === 'function') await session.onPlan({ plan: state.plan, planHash: state.planHash, receipt: state.planReceipt });
        state.nextTaskId = state.plan.calls[0].id;
        return;
      }
      request = prompt.build({ requestId: state.requestId, projectId: state.projectId, userRequest: state.userRequest, sourceMode: session.sourceMode ? session.sourceMode() : 'new', feedbackPending: session.feedbackPending ? session.feedbackPending() : false });
      try { result = await modelPort.invoke({ requestId: state.requestId + ':director-plan', projectId: state.projectId, systemPrompt: request.systemPrompt, prompt: request.prompt }); }
      catch (error) { fail(error.code || 'DIRECTOR_MODEL_FAILED', error.message || 'Director Planner invocation failed.'); }
      if (!result || result.ok !== true || !result.output || typeof result.output.text !== 'string') { var debt = result && result.debt || {}; fail(debt.code || 'DIRECTOR_MODEL_FAILED', debt.message || 'Director Planner returned no DSL text.'); }
      var plan = dsl.parseProgram(result.output.text);
      state.plan = plan;
      state.planHash = 'director-plan.' + hash(plan);
      state.planReceipt = receiptSummary(result.receipt);
      append(state, { stage: 'director-plan', planHash: state.planHash, receipt: state.planReceipt, operations: plan.calls.map(function(call) { return call.operation; }) });
      if (typeof session.onPlan === 'function') await session.onPlan({ plan: plan, planHash: state.planHash, receipt: state.planReceipt });
      state.nextTaskId = plan.calls[0].id;
    }));
    graph.addNode('domain-dispatch', node(async function(state) {
      var session = sessionFor(state), task = (state.plan && state.plan.calls || []).filter(function(item) { return item.id === state.nextTaskId; })[0];
      if (!task) fail('DIRECTOR_TASK_MISSING', 'Director task is absent from its frozen plan: ' + String(state.nextTaskId));
      var rawPreflight = typeof session.beforeDispatch === 'function' ? await session.beforeDispatch(task) : null;
      var preflight = rawPreflight ? normalizeDirective(rawPreflight, 'beforeDispatch') : null;
      if (preflight) { state.next = preflight.kind === 'dispatch' ? 'dispatch' : 'end'; state.nextTaskId = preflight.taskId || null; state.status = preflight.status || state.status; append(state, { stage: 'domain-skip', operation: task.operation, next: state.nextTaskId || null }); return; }
      var domain = task.operation.split('.')[0], input = await session.inputFor(task), result;
      try {
        result = await domains.invoke({ domain: domain, operation: task.operation, input: input });
        var accepted = normalizeDirective(await session.onSuccess(task, result.output), 'onSuccess');
        state.next = accepted.kind === 'dispatch' ? 'dispatch' : 'end'; state.nextTaskId = accepted.taskId || null; state.status = accepted.status || state.status;
        append(state, { stage: 'domain-result', domain: domain, operation: task.operation, outputKind: result.outputKind, next: state.nextTaskId || null, summary: typeof session.summarize === 'function' ? session.summarize(task, result.output) : null });
      } catch (error) {
        var recovered = normalizeDirective(await session.onFailure(task, error), 'onFailure');
        state.next = recovered.kind === 'dispatch' ? 'dispatch' : 'end'; state.nextTaskId = recovered.taskId || null; state.status = recovered.status || state.status;
        append(state, { stage: 'domain-failure', domain: domain, operation: task.operation, code: error.code || 'DIRECTOR_DOMAIN_FAILED', owner: error.owner || null, next: state.nextTaskId || null });
      }
    }));
    graph.addEdge(lg.START, 'director-plan');
    graph.addEdge('director-plan', 'domain-dispatch');
    graph.addConditionalEdges('domain-dispatch', function(wire) { return wire.state.next; }, { dispatch: 'domain-dispatch', end: lg.END });
    return graph.compile();
  }

  function graph() {
    if (!compiledGraphPromise) compiledGraphPromise = compileGraph().catch(function(error) { metrics.graphInitializationFailures += 1; compiledGraphPromise = null; throw error; });
    return compiledGraphPromise;
  }

  async function run(input) {
    input = input || {};
    if (!input.requestId || !input.projectId || typeof input.userRequest !== 'string' || !input.userRequest.trim()) fail('DIRECTOR_INPUT_INVALID', 'Director run requires requestId, projectId, and userRequest.');
    var session = assertSession(input.session), id = sessionId();
    var frozenPlan = input.frozenPlan === undefined || input.frozenPlan === null ? null : normalizeFrozenPlan(input.frozenPlan);
    sessions.set(id, session);
    metrics.invokes += 1;
    try {
      var compiled = await graph(), output = await compiled.invoke({ state: { sessionId: id, requestId: input.requestId, projectId: input.projectId, userRequest: input.userRequest.trim(), frozenPlan: frozenPlan, plan: null, planHash: null, planReceipt: null, nextTaskId: null, next: null, status: 'running', trace: [] } }), state = output.state;
      return { schemaVersion: 1, documentKind: 'director-planner-run', languageId: dsl.LANGUAGE_ID, plan: state.plan, planHash: state.planHash, planReceipt: state.planReceipt, status: state.status, trace: state.trace };
    } finally { sessions.delete(id); }
  }

  return { run: run, prewarm: function() { return graph(); }, metrics: function() { return Object.assign({}, metrics, { activeSessions: sessions.size, graphReady: !!compiledGraphPromise }); } };
}

module.exports = { create: create };
