// Product total scheduler as LangGraph:
// decide -> schedule (Send fan-out) -> semantic|asset lanes -> merge/seal -> assembly_gate -> assembly | decide | end
// Placeholder ledger is the join key; assembly does not invent slots; asset fills only sealed ids.

var crypto = require('crypto');
var dsl = require('./product-dispatch-dsl');
var promptApi = require('./product-dispatch-prompt');
var ledgerApi = require('./product-dispatch-ledger');
var modelPortApi = require('./director-model-port');

var SCHEMA_VERSION = 1;
var DOCUMENT_KIND = 'product-dispatch-run';
var DEFAULT_MAX_DECIDES = 32;

function fail(code, message) {
  var error = new Error(message);
  error.code = code;
  error.owner = 'ProductDispatchLangGraph';
  throw error;
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24);
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail('PRODUCT_DISPATCH_INPUT_INVALID', label + ' must be non-empty text.');
  return value.trim();
}

function assertDomains(domains) {
  if (!domains || typeof domains.invoke !== 'function') fail('PRODUCT_DISPATCH_DOMAIN_API_INVALID', 'Product dispatch requires PlannerDomainApi.invoke(call).');
  return domains;
}

function sessionId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

function summaryOf(session, task, output, error) {
  if (session && typeof session.summarize === 'function') {
    try { return session.summarize(task, output, error) || null; } catch (_err) { return null; }
  }
  if (error) return { code: error.code || 'PRODUCT_DISPATCH_DOMAIN_FAILED', message: String(error.message || '').slice(0, 240) };
  if (output && typeof output === 'object') {
    if (output.contentHash) return { contentHash: output.contentHash };
    if (output.document && output.document.source) return { hasSource: true };
    if (output.ok === false) return { ok: false };
  }
  return { ok: true };
}

function extractPlaceholders(session, output, task) {
  if (session && typeof session.extractPlaceholders === 'function') {
    var custom = session.extractPlaceholders(output, task) || [];
    return Array.isArray(custom) ? custom : [];
  }
  if (output && Array.isArray(output.placeholders)) return output.placeholders;
  if (output && output.assetRequirements && Array.isArray(output.assetRequirements.requirements)) {
    return output.assetRequirements.requirements.map(function(req) {
      return {
        id: req.semanticId || req.slotId || req.id,
        kind: req.resourceKind || req.kind || 'image',
        subject: req.subject || req.semanticId || req.id,
        required: req.required !== false,
        reservation: req.reservation || null,
        requirement: req,
        sourceHash: output.sourceHash || null
      };
    }).filter(function(item) { return item.id; });
  }
  return [];
}

function extractFills(session, output, task, ledger) {
  if (session && typeof session.extractFills === 'function') {
    var custom = session.extractFills(output, task, ledger) || [];
    return Array.isArray(custom) ? custom : [];
  }
  if (output && Array.isArray(output.fills)) return output.fills;
  if (output && output.ok !== false) {
    return ledgerApi.unfilledSealed(ledger).map(function(item) {
      return { id: item.id, fill: { contentHash: output.contentHash || null, workOrderId: task && task.id || null } };
    });
  }
  return [];
}

function create(options) {
  options = options || {};
  var domains = assertDomains(options.domains);
  var modelPort = modelPortApi.assertPort(options.modelPort);
  var maxDecides = Number(options.maxDecides || options.maxRounds || DEFAULT_MAX_DECIDES);
  if (!Number.isFinite(maxDecides) || maxDecides < 1 || maxDecides > 256) fail('PRODUCT_DISPATCH_INPUT_INVALID', 'maxDecides must be between 1 and 256.');
  var autoAssembly = options.autoAssembly !== false;
  var sessions = new Map();
  var compiledGraphPromise = null;
  var metrics = {
    graphInitializations: 0,
    graphInitializationFailures: 0,
    invokes: 0,
    modelDecides: 0,
    domainInvokes: 0,
    semanticInvokes: 0,
    assetInvokes: 0,
    assemblyInvokes: 0,
    parallelFanouts: 0,
    completedOrders: 0,
    failures: 0
  };

  function sessionFor(state) {
    var session = sessions.get(state.sessionId);
    if (!session) fail('PRODUCT_DISPATCH_SESSION_MISSING', 'Product dispatch session is unavailable.');
    return session;
  }

  async function compileGraph() {
    metrics.graphInitializations += 1;
    var lg = await import('@langchain/langgraph');
    if (!lg || !lg.Annotation || !lg.Annotation.Root || !lg.StateGraph || lg.START === undefined || lg.END === undefined || typeof lg.Send !== 'function') {
      fail('PRODUCT_DISPATCH_LANGGRAPH_RUNTIME_INVALID', 'Official @langchain/langgraph with Annotation, StateGraph, START, END, and Send is required.');
    }

    var replace = function(left, right) { return right === undefined ? left : right; };
    var appendTrace = function(left, right) {
      var base = Array.isArray(left) ? left : [];
      if (right == null) return base;
      return base.concat(Array.isArray(right) ? right : [right]);
    };
    // Parallel lane results: concat; merge clears with null.
    var laneReducer = function(left, right) {
      if (right === null) return [];
      var base = Array.isArray(left) ? left : [];
      if (right == null) return base;
      return base.concat(Array.isArray(right) ? right : [right]);
    };

    var A = lg.Annotation.Root({
      sessionId: lg.Annotation({ reducer: replace, default: function() { return null; } }),
      requestId: lg.Annotation({ reducer: replace, default: function() { return null; } }),
      projectId: lg.Annotation({ reducer: replace, default: function() { return null; } }),
      userRequest: lg.Annotation({ reducer: replace, default: function() { return null; } }),
      world: lg.Annotation({ reducer: replace, default: function() { return null; } }),
      progress: lg.Annotation({ reducer: replace, default: function() { return []; } }),
      ledger: lg.Annotation({ reducer: replace, default: function() { return ledgerApi.empty(); } }),
      queuedOrders: lg.Annotation({ reducer: replace, default: function() { return []; } }),
      laneResults: lg.Annotation({ reducer: laneReducer, default: function() { return []; } }),
      decideCount: lg.Annotation({ reducer: replace, default: function() { return 0; } }),
      wantComplete: lg.Annotation({ reducer: replace, default: function() { return false; } }),
      assembled: lg.Annotation({ reducer: replace, default: function() { return false; } }),
      assemblyOutput: lg.Annotation({ reducer: replace, default: function() { return null; } }),
      status: lg.Annotation({ reducer: replace, default: function() { return 'running'; } }),
      route: lg.Annotation({ reducer: replace, default: function() { return 'decide'; } }),
      lastError: lg.Annotation({ reducer: replace, default: function() { return null; } }),
      laneTask: lg.Annotation({ reducer: replace, default: function() { return null; } }),
      trace: lg.Annotation({ reducer: appendTrace, default: function() { return []; } })
    });

    function node(work) {
      return async function(state) {
        var next = Object.assign({}, state);
        await work(next);
        return next;
      };
    }

    var graph = new lg.StateGraph(A);

    graph.addNode('decide', node(async function(state) {
      var session = sessionFor(state);
      state.decideCount = Number(state.decideCount || 0) + 1;
      if (state.decideCount > maxDecides) {
        state.status = 'expired';
        state.route = 'end';
        state.trace = [{ stage: 'dispatch-expired', decideCount: state.decideCount, maxDecides: maxDecides }];
        return;
      }

      if (typeof session.world === 'function') {
        state.world = session.world({ progress: state.progress, ledger: state.ledger, decideCount: state.decideCount }) || state.world;
      }
      var feedback = typeof session.feedback === 'function'
        ? session.feedback({ progress: state.progress, ledger: state.ledger, decideCount: state.decideCount })
        : null;

      var request = promptApi.build({
        requestId: state.requestId,
        projectId: state.projectId,
        userRequest: state.userRequest,
        progress: state.progress,
        world: state.world,
        feedback: feedback,
        ledger: state.ledger
      });

      var modelResult;
      try {
        modelResult = await modelPort.invoke({
          requestId: state.requestId + ':product-dispatch:decide:' + state.decideCount,
          projectId: state.projectId,
          systemPrompt: request.systemPrompt,
          prompt: request.prompt
        });
      } catch (error) {
        fail(error.code || 'PRODUCT_DISPATCH_MODEL_FAILED', error.message || 'Product dispatcher model invocation failed.');
      }
      if (!modelResult || modelResult.ok !== true || !modelResult.output || typeof modelResult.output.text !== 'string') {
        var debt = modelResult && modelResult.debt || {};
        fail(debt.code || 'PRODUCT_DISPATCH_MODEL_FAILED', debt.message || 'Product dispatcher returned no DSL text.');
      }
      metrics.modelDecides += 1;

      var program;
      try {
        program = dsl.parseProgram(modelResult.output.text);
      } catch (error) {
        metrics.failures += 1;
        state.status = 'blocked';
        state.route = 'end';
        state.lastError = { code: error.code || 'PRODUCT_DISPATCH_DSL_INVALID', message: error.message };
        state.trace = [{ stage: 'dispatch-parse-failed', decideCount: state.decideCount, code: state.lastError.code, message: state.lastError.message }];
        return;
      }

      if (program.kind === 'complete') {
        state.wantComplete = true;
        state.queuedOrders = [];
        state.route = 'schedule';
        state.trace = [{ stage: 'dispatch-complete-requested', decideCount: state.decideCount, ledger: ledgerApi.summary(state.ledger) }];
        return;
      }

      var task = program.task;
      if ((state.progress || []).some(function(item) { return item.id === task.id; })) {
        metrics.failures += 1;
        state.status = 'blocked';
        state.route = 'end';
        state.lastError = { code: 'PRODUCT_DISPATCH_DUPLICATE_ID', message: 'Work order id already completed: ' + task.id };
        state.trace = [{ stage: 'dispatch-duplicate-id', id: task.id }];
        return;
      }

      var orders = [task];
      if (typeof session.expandOrders === 'function') {
        var expanded = session.expandOrders(task, {
          progress: state.progress,
          ledger: state.ledger,
          world: state.world,
          decideCount: state.decideCount
        });
        if (Array.isArray(expanded) && expanded.length) {
          orders = expanded.map(function(item, index) {
            return dsl.validateProgram({ languageId: dsl.LANGUAGE_ID, kind: 'task', task: item }).task;
          });
        }
      }

      // Hard gate: any asset order requires sealed placeholders.
      for (var i = 0; i < orders.length; i++) {
        if (orders[i].route === 'asset' && !ledgerApi.hasSealed(state.ledger)) {
          metrics.failures += 1;
          state.status = 'blocked';
          state.route = 'end';
          state.lastError = { code: 'PRODUCT_DISPATCH_PLACEHOLDER_NOT_SEALED', message: 'Asset work requires sealed placeholders before route=asset.' };
          state.trace = [{ stage: 'dispatch-asset-before-seal', id: orders[i].id, ledger: ledgerApi.summary(state.ledger) }];
          return;
        }
        if ((state.progress || []).some(function(item) { return item.id === orders[i].id; })) {
          metrics.failures += 1;
          state.status = 'blocked';
          state.route = 'end';
          state.lastError = { code: 'PRODUCT_DISPATCH_DUPLICATE_ID', message: 'Work order id already completed: ' + orders[i].id };
          state.trace = [{ stage: 'dispatch-duplicate-id', id: orders[i].id }];
          return;
        }
      }

      state.queuedOrders = orders;
      state.wantComplete = false;
      state.route = 'schedule';
      state.trace = [{
        stage: 'dispatch-queued',
        decideCount: state.decideCount,
        orders: orders.map(function(item) { return { id: item.id, route: item.route }; })
      }];
    }));

    graph.addNode('schedule', function(state) { return state; });

    graph.addNode('run_semantic', async function(state) {
      var session = sessions.get(state.sessionId);
      if (!session) fail('PRODUCT_DISPATCH_SESSION_MISSING', 'Product dispatch session is unavailable.');
      var task = state.laneTask;
      if (!task || task.route !== 'semantic') fail('PRODUCT_DISPATCH_LANE_INVALID', 'run_semantic requires a semantic laneTask.');

      var domainInput;
      if (typeof session.inputFor === 'function') {
        domainInput = await session.inputFor(task, {
          progress: state.progress || [],
          ledger: state.ledger,
          world: state.world,
          decideCount: state.decideCount,
          userRequest: state.userRequest
        });
      } else {
        domainInput = {
          requestId: state.requestId + ':semantic:' + task.id,
          projectId: state.projectId,
          userRequest: state.userRequest,
          workOrder: { id: task.id, route: task.route, goal: task.goal },
          progress: clone(state.progress || []),
          ledger: clone(state.ledger),
          world: state.world
        };
      }

      metrics.domainInvokes += 1;
      metrics.semanticInvokes += 1;
      try {
        var result = await domains.invoke({ domain: 'semantic', operation: 'semantic.design', input: domainInput });
        if (typeof session.onSuccess === 'function') await session.onSuccess(task, result.output, { ledger: state.ledger });
        return {
          laneResults: [{
            route: 'semantic',
            task: task,
            ok: true,
            output: result.output,
            placeholders: extractPlaceholders(session, result.output, task),
            error: null
          }],
          trace: [{ stage: 'lane-semantic-ok', id: task.id }]
        };
      } catch (error) {
        metrics.failures += 1;
        if (typeof session.onFailure === 'function') {
          var directive = await session.onFailure(task, error, { ledger: state.ledger });
          if (directive && directive.kind === 'continue') {
            return {
              laneResults: [{ route: 'semantic', task: task, ok: false, output: null, placeholders: [], error: { code: error.code || 'SEMANTIC_FAILED', message: error.message }, soft: true }],
              trace: [{ stage: 'lane-semantic-soft-fail', id: task.id, code: error.code || null }]
            };
          }
        }
        return {
          laneResults: [{ route: 'semantic', task: task, ok: false, output: null, placeholders: [], error: { code: error.code || 'SEMANTIC_FAILED', message: error.message }, soft: false }],
          status: 'blocked',
          lastError: { code: error.code || 'SEMANTIC_FAILED', message: error.message },
          trace: [{ stage: 'lane-semantic-fail', id: task.id, code: error.code || null }]
        };
      }
    });

    graph.addNode('run_asset', async function(state) {
      var session = sessions.get(state.sessionId);
      if (!session) fail('PRODUCT_DISPATCH_SESSION_MISSING', 'Product dispatch session is unavailable.');
      var task = state.laneTask;
      if (!task || task.route !== 'asset') fail('PRODUCT_DISPATCH_LANE_INVALID', 'run_asset requires an asset laneTask.');
      if (!ledgerApi.hasSealed(state.ledger)) {
        return {
          laneResults: [{ route: 'asset', task: task, ok: false, output: null, fills: [], error: { code: 'PRODUCT_DISPATCH_PLACEHOLDER_NOT_SEALED', message: 'Asset lane refused: placeholders not sealed.' }, soft: false }],
          status: 'blocked',
          lastError: { code: 'PRODUCT_DISPATCH_PLACEHOLDER_NOT_SEALED', message: 'Asset lane refused: placeholders not sealed.' },
          trace: [{ stage: 'lane-asset-refused-unsealed', id: task.id }]
        };
      }

      var domainInput;
      if (typeof session.inputFor === 'function') {
        domainInput = await session.inputFor(task, {
          progress: state.progress || [],
          ledger: state.ledger,
          world: state.world,
          decideCount: state.decideCount,
          userRequest: state.userRequest,
          unfilled: ledgerApi.unfilledSealed(state.ledger)
        });
      } else {
        domainInput = {
          requestId: state.requestId + ':asset:' + task.id,
          projectId: state.projectId,
          userRequest: state.userRequest,
          workOrder: { id: task.id, route: task.route, goal: task.goal },
          progress: clone(state.progress || []),
          ledger: clone(state.ledger),
          unfilled: ledgerApi.unfilledSealed(state.ledger),
          world: state.world
        };
      }

      metrics.domainInvokes += 1;
      metrics.assetInvokes += 1;
      try {
        var result = await domains.invoke({ domain: 'asset', operation: 'asset.realize', input: domainInput });
        if (typeof session.onSuccess === 'function') await session.onSuccess(task, result.output, { ledger: state.ledger });
        return {
          laneResults: [{
            route: 'asset',
            task: task,
            ok: true,
            output: result.output,
            fills: extractFills(session, result.output, task, state.ledger),
            error: null
          }],
          trace: [{ stage: 'lane-asset-ok', id: task.id }]
        };
      } catch (error) {
        metrics.failures += 1;
        if (typeof session.onFailure === 'function') {
          var directive = await session.onFailure(task, error, { ledger: state.ledger });
          if (directive && directive.kind === 'continue') {
            return {
              laneResults: [{ route: 'asset', task: task, ok: false, output: null, fills: [], error: { code: error.code || 'ASSET_FAILED', message: error.message }, soft: true }],
              trace: [{ stage: 'lane-asset-soft-fail', id: task.id, code: error.code || null }]
            };
          }
        }
        return {
          laneResults: [{ route: 'asset', task: task, ok: false, output: null, fills: [], error: { code: error.code || 'ASSET_FAILED', message: error.message }, soft: false }],
          status: 'blocked',
          lastError: { code: error.code || 'ASSET_FAILED', message: error.message },
          trace: [{ stage: 'lane-asset-fail', id: task.id, code: error.code || null }]
        };
      }
    });

    graph.addNode('merge', node(async function(state) {
      var session = sessionFor(state);
      var results = Array.isArray(state.laneResults) ? state.laneResults.slice() : [];
      var progress = Array.isArray(state.progress) ? state.progress.slice() : [];
      var ledger = state.ledger ? clone(state.ledger) : ledgerApi.empty();
      var hardFail = false;

      results.forEach(function(result) {
        if (!result || !result.task) return;
        if (progress.some(function(item) { return item.id === result.task.id; })) return;
        progress.push({
          id: result.task.id,
          route: result.task.route,
          goal: result.task.goal,
          status: result.ok ? 'succeeded' : 'failed',
          summary: summaryOf(session, result.task, result.output, result.error ? Object.assign(new Error(result.error.message), result.error) : null),
          decideCount: state.decideCount
        });
        metrics.completedOrders += 1;

        if (result.route === 'semantic' && result.ok) {
          var declared = result.placeholders || [];
          if (declared.length) {
            ledger = ledgerApi.declareMany(ledger, declared);
            ledger = ledgerApi.seal(ledger, declared.map(function(item) { return item.id; }).filter(Boolean));
          }
          if (typeof session.afterSemantic === 'function') {
            var afterSem = session.afterSemantic(result.task, result.output, { ledger: ledger, progress: progress });
            if (afterSem && typeof afterSem.then === 'function') { /* sync preferred */ }
          }
        }

        if (result.route === 'asset' && result.ok) {
          (result.fills || []).forEach(function(fillItem) {
            if (!fillItem || !fillItem.id) return;
            ledger = ledgerApi.fill(ledger, fillItem.id, fillItem.fill || { ok: true });
          });
        }

        if (!result.ok && !result.soft) hardFail = true;
      });

      state.progress = progress;
      state.ledger = ledger;
      state.laneResults = null; // clear via laneReducer
      state.queuedOrders = [];
      state.trace = [{
        stage: 'merge',
        applied: results.length,
        ledger: ledgerApi.summary(ledger),
        progressCount: progress.length
      }];

      if (hardFail) {
        state.status = 'blocked';
        state.route = 'end';
        return;
      }

      var gate = ledgerApi.assemblyReady(ledger);
      if (autoAssembly && gate.ready && !state.assembled) {
        state.route = 'assembly';
        return;
      }
      if (state.wantComplete) {
        state.status = 'completed';
        state.route = 'end';
        return;
      }
      state.route = 'decide';
    }));

    graph.addNode('assembly', node(async function(state) {
      var session = sessionFor(state);
      var gate = ledgerApi.assemblyReady(state.ledger);
      if (!gate.ready) {
        state.status = 'blocked';
        state.route = 'end';
        state.lastError = { code: 'PRODUCT_DISPATCH_ASSEMBLY_GATE_CLOSED', message: 'Assembly refused: ' + gate.reason };
        state.trace = [{ stage: 'assembly-gate-closed', gate: gate }];
        return;
      }

      var domainInput;
      if (typeof session.inputForAssembly === 'function') {
        domainInput = await session.inputForAssembly({
          progress: state.progress,
          ledger: state.ledger,
          world: state.world,
          userRequest: state.userRequest
        });
      } else {
        domainInput = {
          requestId: state.requestId + ':assembly',
          projectId: state.projectId,
          userRequest: state.userRequest,
          progress: clone(state.progress),
          ledger: clone(state.ledger),
          world: state.world
        };
      }

      metrics.domainInvokes += 1;
      metrics.assemblyInvokes += 1;
      try {
        var result = await domains.invoke({ domain: 'assembly', operation: 'assembly.verify', input: domainInput });
        state.assemblyOutput = result.output;
        state.assembled = true;
        if (typeof session.onAssembly === 'function') await session.onAssembly(result.output, { ledger: state.ledger });
        state.trace = [{ stage: 'assembly-ok', ledger: ledgerApi.summary(state.ledger) }];
        if (state.wantComplete) {
          state.status = 'completed';
          state.route = 'end';
        } else {
          state.route = 'decide';
        }
      } catch (error) {
        metrics.failures += 1;
        state.status = 'blocked';
        state.route = 'end';
        state.lastError = { code: error.code || 'ASSEMBLY_FAILED', message: error.message };
        state.trace = [{ stage: 'assembly-fail', code: error.code || null }];
      }
    }));

    function scheduleEdge(state) {
      if (state.route === 'end' || state.status === 'blocked' || state.status === 'expired' || state.status === 'completed') {
        return lg.END;
      }

      var orders = Array.isArray(state.queuedOrders) ? state.queuedOrders : [];
      var sends = [];
      orders.forEach(function(task) {
        if (!task || !task.route) return;
        var payload = {
          sessionId: state.sessionId,
          requestId: state.requestId,
          projectId: state.projectId,
          userRequest: state.userRequest,
          world: state.world,
          progress: state.progress,
          ledger: state.ledger,
          decideCount: state.decideCount,
          laneTask: task,
          status: state.status,
          wantComplete: state.wantComplete,
          assembled: state.assembled
        };
        if (task.route === 'semantic') sends.push(new lg.Send('run_semantic', payload));
        if (task.route === 'asset') sends.push(new lg.Send('run_asset', payload));
      });

      if (!sends.length) {
        if (state.wantComplete) {
          if (autoAssembly && ledgerApi.assemblyReady(state.ledger).ready && !state.assembled) return 'assembly';
          return lg.END;
        }
        return 'decide';
      }
      if (sends.length > 1) metrics.parallelFanouts += 1;
      return sends;
    }

    graph.addEdge(lg.START, 'decide');
    graph.addConditionalEdges('decide', function(state) {
      if (state.route === 'end') return lg.END;
      return 'schedule';
    });
    graph.addConditionalEdges('schedule', scheduleEdge);
    graph.addEdge('run_semantic', 'merge');
    graph.addEdge('run_asset', 'merge');
    graph.addConditionalEdges('merge', function(state) {
      if (state.route === 'end') return lg.END;
      if (state.route === 'assembly') return 'assembly';
      return 'decide';
    });
    graph.addConditionalEdges('assembly', function(state) {
      if (state.route === 'end') return lg.END;
      return 'decide';
    });

    return graph.compile();
  }

  function graph() {
    if (!compiledGraphPromise) {
      compiledGraphPromise = compileGraph().catch(function(error) {
        metrics.graphInitializationFailures += 1;
        compiledGraphPromise = null;
        throw error;
      });
    }
    return compiledGraphPromise;
  }

  async function run(input) {
    input = input || {};
    var requestId = text(input.requestId, 'requestId');
    var projectId = text(input.projectId, 'projectId');
    var userRequest = text(input.userRequest, 'userRequest');
    var session = input.session && typeof input.session === 'object' ? input.session : {};
    var id = sessionId();
    sessions.set(id, session);
    metrics.invokes += 1;

    try {
      var compiled = await graph();
      var initialLedger = ledgerApi.empty();
      if (input.ledger) {
        initialLedger = ledgerApi.restore(ledgerApi.list(input.ledger));
      }

      var output = await compiled.invoke({
        sessionId: id,
        requestId: requestId,
        projectId: projectId,
        userRequest: userRequest,
        world: input.world || null,
        progress: Array.isArray(input.progress) ? clone(input.progress) : [],
        ledger: initialLedger,
        queuedOrders: [],
        laneResults: [],
        decideCount: 0,
        wantComplete: false,
        assembled: false,
        assemblyOutput: null,
        status: 'running',
        route: 'decide',
        lastError: null,
        laneTask: null,
        trace: []
      });

      var status = output.status;
      if (status === 'running') {
        if (output.wantComplete || (output.assembled && !output.lastError)) status = 'completed';
        else if (output.lastError) status = 'blocked';
        else status = 'completed';
      }

      var runDoc = {
        schemaVersion: SCHEMA_VERSION,
        documentKind: DOCUMENT_KIND,
        languageId: dsl.LANGUAGE_ID,
        protocolVersion: promptApi.PROFILE_VERSION,
        requestId: requestId,
        projectId: projectId,
        userRequest: userRequest,
        status: status,
        decideCount: output.decideCount,
        rounds: output.decideCount,
        progress: output.progress || [],
        ledger: output.ledger,
        ledgerSummary: ledgerApi.summary(output.ledger),
        assembled: !!output.assembled,
        assemblyOutput: output.assemblyOutput || null,
        world: output.world,
        lastError: output.lastError || null,
        trace: output.trace || []
      };
      runDoc.contentHash = 'product-dispatch-run.' + digest({
        requestId: requestId,
        projectId: projectId,
        status: runDoc.status,
        progress: runDoc.progress,
        ledger: ledgerApi.summary(runDoc.ledger),
        assembled: runDoc.assembled,
        traceStages: (runDoc.trace || []).map(function(entry) { return entry.stage; })
      });
      return runDoc;
    } finally {
      sessions.delete(id);
    }
  }

  return {
    run: run,
    prewarm: function() { return graph(); },
    metrics: function() {
      return Object.assign({}, metrics, { activeSessions: sessions.size, graphReady: !!compiledGraphPromise });
    }
  };
}

module.exports = {
  SCHEMA_VERSION: SCHEMA_VERSION,
  DOCUMENT_KIND: DOCUMENT_KIND,
  DEFAULT_MAX_DECIDES: DEFAULT_MAX_DECIDES,
  create: create
};
