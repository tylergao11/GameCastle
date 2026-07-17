var assert = require('assert');
var dsl = require('../../packages/product/src/product-dispatch-dsl');
var prompt = require('../../packages/product/src/product-dispatch-prompt');
var ledgerApi = require('../../packages/product/src/product-dispatch-ledger');
var runtimeApi = require('../../packages/product/src/product-dispatch-runtime');
var langgraphApi = require('../../packages/product/src/product-dispatch-langgraph');
var domainApi = require('../../packages/product/src/planner-domain-api');

function sleep(ms) { return new Promise(function(resolve) { setTimeout(resolve, ms); }); }

function modelPortFrom(script) {
  var queue = script.slice();
  return {
    invoke: async function() {
      var text = queue.shift();
      assert(text, 'unexpected extra decide round');
      return { ok: true, output: { text: text }, receipt: { receiptId: 'fix', provider: 'fixture', model: 'dispatch-fixture', status: 'succeeded' } };
    }
  };
}

(async function() {
  // --- DSL ---
  var taskProgram = dsl.parseProgram('dispatch-task id=makeSnake route=semantic goal="Create the snake and game shell"');
  assert.strictEqual(taskProgram.task.operation, 'semantic.design');
  assert.strictEqual(dsl.stringify(dsl.parseProgram('dispatch-complete')), 'dispatch-complete');
  assert.throws(function() { dsl.parseProgram('{"kind":"task"}'); }, function(e) { return e.code === 'PRODUCT_DISPATCH_DSL_JSON_FORBIDDEN'; });
  assert.throws(function() { dsl.parseProgram('dispatch-task id=x route=assembly goal="no"'); }, function(e) { return e.code === 'PRODUCT_DISPATCH_DSL_INVALID'; });

  // --- Ledger: seal before fill; assembly gate ---
  var ledger = ledgerApi.declareMany(ledgerApi.empty(), [
    { id: 'bg', kind: 'image', subject: 'Background', required: true },
    { id: 'snake', kind: 'image', subject: 'Snake', required: true }
  ]);
  assert.strictEqual(ledgerApi.assemblyReady(ledger).ready, false);
  assert.throws(function() { ledgerApi.fill(ledger, 'bg', { ok: true }); }, function(e) { return e.code === 'PRODUCT_DISPATCH_LEDGER_NOT_SEALED'; });
  ledger = ledgerApi.seal(ledger);
  assert.strictEqual(ledgerApi.hasSealed(ledger), true);
  assert.strictEqual(ledgerApi.assemblyReady(ledger).ready, false);
  ledger = ledgerApi.fill(ledger, 'bg', { contentHash: 'h-bg' });
  ledger = ledgerApi.fill(ledger, 'snake', { contentHash: 'h-snake' });
  assert.strictEqual(ledgerApi.assemblyReady(ledger).ready, true);

  // --- Prompt v2: graph + placeholders ---
  var built = prompt.build({
    requestId: 'r1',
    projectId: 'p1',
    userRequest: 'Snake with background.',
    progress: [],
    ledger: ledger
  });
  assert.strictEqual(built.protocolVersion, 'product-dispatch-prompt-v2');
  assert.strictEqual(built.systemPrompt.indexOf('LangGraph') >= 0, true);
  assert.strictEqual(built.systemPrompt.indexOf('PLACEHOLDERS|') >= 0, true);
  assert.strictEqual(built.prompt.indexOf('assemblyReady') >= 0, true);

  // --- Happy path: semantic seals placeholders -> asset fills -> assembly gate auto ---
  var domainCalls = [];
  var domains = domainApi.create({
    semantic: {
      invoke: async function(input) {
        domainCalls.push({ domain: 'semantic', at: Date.now(), goal: input.workOrder.goal });
        return {
          ok: true,
          placeholders: [
            { id: 'bg', kind: 'image', subject: 'Background', required: true },
            { id: 'snakeArt', kind: 'image', subject: 'Snake', required: true }
          ]
        };
      }
    },
    asset: {
      invoke: async function(input) {
        domainCalls.push({ domain: 'asset', at: Date.now(), unfilled: (input.unfilled || []).map(function(i) { return i.id; }) });
        assert.strictEqual((input.unfilled || []).length >= 1, true, 'asset sees sealed-unfilled placeholders');
        return { ok: true, contentHash: 'asset.wave1' };
      }
    },
    assembly: {
      invoke: async function(input) {
        domainCalls.push({ domain: 'assembly', at: Date.now() });
        assert.strictEqual(ledgerApi.assemblyReady(input.ledger).ready, true, 'assembly only with green gate');
        return { ok: true, documentKind: 'assembly-verification-result' };
      }
    }
  });
  var runtime = runtimeApi.create({
    domains: domains,
    modelPort: modelPortFrom([
      'dispatch-task id=makeSnake route=semantic goal="Create snake and declare asset placeholders"',
      'dispatch-task id=drawArts route=asset goal="Fill sealed placeholders"',
      'dispatch-complete'
    ]),
    maxDecides: 8
  });
  var run = await runtime.run({ requestId: 'd1', projectId: 'p1', userRequest: 'Snake with art.' });
  assert.strictEqual(run.documentKind, 'product-dispatch-run');
  assert.strictEqual(run.status, 'completed');
  assert.strictEqual(run.assembled, true);
  assert.strictEqual(run.ledgerSummary.assemblyReady, true);
  assert.strictEqual(run.ledgerSummary.byStatus.filled, 2);
  assert.deepStrictEqual(domainCalls.map(function(c) { return c.domain; }), ['semantic', 'asset', 'assembly']);
  assert.strictEqual(runtime.metrics().graphInitializations >= 1, true, 'LangGraph compiled');
  assert.strictEqual(runtime.metrics().semanticInvokes, 1);
  assert.strictEqual(runtime.metrics().assetInvokes, 1);
  assert.strictEqual(runtime.metrics().assemblyInvokes, 1);

  // --- Asset before seal is blocked ---
  var blocked = await runtimeApi.create({
    domains: domainApi.create({
      semantic: { invoke: async function() { return { ok: true }; } },
      asset: { invoke: async function() { throw new Error('should not run'); } },
      assembly: { invoke: async function() { throw new Error('should not run'); } }
    }),
    modelPort: modelPortFrom(['dispatch-task id=earlyArt route=asset goal="Too early"']),
    maxDecides: 4
  }).run({ requestId: 'd2', projectId: 'p1', userRequest: 'Art first.' });
  assert.strictEqual(blocked.status, 'blocked');
  assert.strictEqual(blocked.lastError.code, 'PRODUCT_DISPATCH_PLACEHOLDER_NOT_SEALED');

  // --- Parallel fan-out via expandOrders (semantic + asset in one schedule with Send) ---
  var parallelStarts = [];
  var parallelDomains = domainApi.create({
    semantic: {
      invoke: async function() {
        parallelStarts.push({ domain: 'semantic', t: Date.now() });
        await sleep(40);
        parallelStarts.push({ domain: 'semantic-done', t: Date.now() });
        return { ok: true, placeholders: [] };
      }
    },
    asset: {
      invoke: async function() {
        parallelStarts.push({ domain: 'asset', t: Date.now() });
        await sleep(40);
        parallelStarts.push({ domain: 'asset-done', t: Date.now() });
        return {
          ok: true,
          fills: [
            { id: 'bg', fill: { contentHash: 'bg-par' } },
            { id: 'snakeArt', fill: { contentHash: 'sn-par' } }
          ]
        };
      }
    },
    assembly: {
      invoke: async function() {
        parallelStarts.push({ domain: 'assembly', t: Date.now() });
        return { ok: true };
      }
    }
  });
  var seedLedger = ledgerApi.seal(ledgerApi.declareMany(ledgerApi.empty(), [
    { id: 'bg', kind: 'image', subject: 'Background', required: true },
    { id: 'snakeArt', kind: 'image', subject: 'Snake', required: true }
  ]));
  var parRuntime = langgraphApi.create({
    domains: parallelDomains,
    modelPort: modelPortFrom([
      'dispatch-task id=moreRules route=semantic goal="Add movement rules while art fills"',
      'dispatch-complete'
    ]),
    maxDecides: 6
  });
  var parRun = await parRuntime.run({
    requestId: 'd3',
    projectId: 'p1',
    userRequest: 'Parallel lanes.',
    ledger: seedLedger,
    session: {
      expandOrders: function(task) {
        return [
          task,
          { id: 'fillArts', route: 'asset', goal: 'Fill sealed placeholders in parallel' }
        ];
      }
    }
  });
  assert.strictEqual(parRun.status, 'completed');
  assert.strictEqual(parRun.assembled, true);
  assert.strictEqual(parRuntime.metrics().parallelFanouts >= 1, true, 'Send fan-out recorded');
  var semStart = parallelStarts.filter(function(x) { return x.domain === 'semantic'; })[0];
  var assetStart = parallelStarts.filter(function(x) { return x.domain === 'asset'; })[0];
  var semDone = parallelStarts.filter(function(x) { return x.domain === 'semantic-done'; })[0];
  var assetDone = parallelStarts.filter(function(x) { return x.domain === 'asset-done'; })[0];
  assert(semStart && assetStart, 'both lanes started');
  assert.strictEqual(assetStart.t < semDone.t, true, 'asset started before semantic finished');
  assert.strictEqual(semStart.t < assetDone.t, true, 'semantic started before asset finished');
  assert.strictEqual(parRun.progress.length, 2);
  assert.strictEqual(parRun.ledgerSummary.byStatus.filled, 2);

  // --- Assembly not auto-entered when gate closed; complete without assembly ---
  var sealedOnly = await runtimeApi.create({
    autoAssembly: false,
    domains: domainApi.create({
      semantic: {
        invoke: async function() {
          return { ok: true, placeholders: [{ id: 'only', kind: 'image', subject: 'Only', required: true }] };
        }
      },
      asset: { invoke: async function() { throw new Error('no asset'); } },
      assembly: { invoke: async function() { throw new Error('assembly must stay closed'); } }
    }),
    modelPort: modelPortFrom([
      'dispatch-task id=shell route=semantic goal="Declare placeholders only"',
      'dispatch-complete'
    ]),
    maxDecides: 4
  }).run({ requestId: 'd4', projectId: 'p1', userRequest: 'No assembly yet.' });
  assert.strictEqual(sealedOnly.status, 'completed');
  assert.strictEqual(sealedOnly.assembled, false);
  assert.strictEqual(sealedOnly.ledgerSummary.byStatus.sealed, 1);
  assert.strictEqual(sealedOnly.ledgerSummary.assemblyReady, false);

  // --- Facade identity ---
  assert.strictEqual(runtimeApi.create, langgraphApi.create);

  console.log('[ProductDispatch] LangGraph total scheduler: ledger gate, seal-before-asset, parallel Send lanes, assembly join passed');
})().catch(function(error) {
  console.error(error && error.stack || error);
  process.exit(1);
});
