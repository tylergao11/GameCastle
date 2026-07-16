var assert = require('assert');
var crypto = require('crypto');
var fs = require('fs');
var os = require('os');
var path = require('path');
var dictionary = require('../../packages/semantic/src/capability-semantic-dictionary');
var sourceContract = require('../../packages/semantic/src/game-semantic-source');
var orchestratorApi = require('../../packages/product/src/product-delivery-orchestrator');
var deliveryRunApi = require('../../packages/product/src/product-delivery-run');
var providerRuntimeApi = require('../../packages/providers/src/provider-runtime');
var directorModelPortApi = require('../../packages/product/src/director-model-port');

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, {}); return value; }
function productNamespace(deliveryId, projectId) { return 'product.' + crypto.createHash('sha256').update(JSON.stringify(stable({ deliveryId: deliveryId, projectId: projectId }))).digest('hex').slice(0, 24); }

(async function() {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-product-orchestrator-'));
  try {
    var index = dictionary.buildIndex();
    var source = {
      schemaVersion: sourceContract.SCHEMA_VERSION,
      documentKind: 'game-semantic-source',
      dictionarySource: index.source,
      game: { semanticId: 'product_loop_demo', name: 'Product Loop Demo' },
      entities: [{ semanticId: 'player', roles: ['player'], objectTypeRef: 'gdjs://object/Sprite::Sprite', behaviorTypeRefs: [], members: [] }],
      components: [], events: [],
      assetIntents: [{ semanticId: 'player_visual', roles: ['player', 'visual'], subject: 'player', description: 'A red player sprite.', productionFamily: 'character', styleId: 'gamecastle.style-dna.v1', constraints: { transparent: true }, bindings: [] }],
      layoutIntents: [{ semanticId: 'player_layout', roles: ['world'], subject: 'player', bounds: { width: 64, height: 64 }, relations: [{ semanticId: 'player_anchor', layoutRef: 'gc-layout://world/center', subjects: ['player'] }], bindings: [] }],
      tuningPolicies: { relativeChange: { slight: { mode: 'percentage', value: 0.1 } } }
    };
    source = sourceContract.validateSource(source, { index: index });
    var assetCalls = [], semanticCalls = [], directorCalls = [], receipts = [], provider = { listReceipts: function() { return clone(receipts); } };
    var directorProgram = [
      'CALL id=semantic operation=semantic.design after=none',
      'CALL id=asset operation=asset.realize after=semantic',
      'CALL id=assembly operation=assembly.verify after=asset',
      'REPAIR from=assembly.verify to=semantic.design'
    ].join('\n');
    var fakeSemantic = { invoke: async function(input) {
      semanticCalls.push(input);
      assert.strictEqual(input.feedbackBatch.schemaVersion, 3);
      assert.deepStrictEqual(input.feedbackBatch.entries[0].targets, [{ collection: 'assetIntents', semanticId: 'player_visual' }]);
      assert.strictEqual(Object.prototype.hasOwnProperty.call(input, 'changeScope'), false, 'TaskPlan is the only internal mutation scope.');
      var next = clone(input.source); next.assetIntents[0].description = 'A blue player sprite with an unmistakable player silhouette.';
      var revision = { schemaVersion: sourceContract.SCHEMA_VERSION, documentKind: 'game-semantic-revision', baseSourceHash: sourceContract.sourceHash(input.source), operations: [{ op: 'upsert', collection: 'assetIntents', value: clone(next.assetIntents[0]) }] };
      return { ok: true, document: { source: sourceContract.applyRevision(input.source, revision, { index: index }), revision: revision } };
    } };
    var fakeAsset = { run: async function(input) {
      assetCalls.push({ sourceHash: sourceContract.sourceHash(input.source), runId: input.runId });
      if (assetCalls.length === 1) {
        receipts.push({ requestId: 'product.unrelated_asset_attempt-1', receiptId: 'provider.unrelated', cost: { settled: 100 } });
        receipts.push({ requestId: (input.runId + ':fixture').replace(/[^A-Za-z0-9_.-]/g, '_'), receiptId: 'provider.owned', cost: { settled: 0.25 } });
      }
      if (input.source.assetIntents[0].description.indexOf('red') >= 0) {
        var blocked = new Error('asset review rejected'); blocked.code = 'SEMANTIC_ASSET_PRODUCT_BLOCKED'; blocked.owner = 'SemanticAssetProductPipeline';
        blocked.assetState = { accepted: false, assetWorld: null, debts: [{ debtId: 'debt.player', slotId: 'player_visual', code: 'ASSET_FINAL_REVIEW_REJECTED', owner: 'CLIPImageReviewer', message: 'Final pixels do not read as the player.' }] };
        throw blocked;
      }
      return {
        schemaVersion: 2, documentKind: 'semantic-asset-product', sourceHash: sourceContract.sourceHash(input.source), source: clone(input.source), contentHash: 'semantic-asset-product.accepted',
        assembly: { assetRequirements: { requirements: [{ semanticId: 'player_visual', subject: 'player', description: input.source.assetIntents[0].description }] }, componentExpansion: { contentHash: 'component-expansion.accepted' } },
        assetState: { accepted: true, debts: [], assetWorld: { contentHash: 'asset-world.accepted', productionSetId: 'production.accepted', slots: [{ semanticId: 'player_visual', revisionId: 'asset-revision.accepted', resourceKind: 'image', format: 'png', sha256: 'pixels.accepted' }] } },
        artifact: { contentHash: 'asset-bound-seed.accepted' }
      };
    } };
    var fakeSpatial = { run: async function(input) {
      assert.strictEqual(Object.prototype.hasOwnProperty.call(input, 'geometryFacts'), false);
      assert.strictEqual(input.maxRounds, 3, 'Product contract owns the Spatial Planner round ceiling.');
      assert.strictEqual(input.maxTokens, 4096, 'Product contract owns the Spatial Planner token ceiling.');
      return { schemaVersion: 3, documentKind: 'semantic-spatial-product', sourceHash: input.assetProduct.sourceHash, assetProductHash: input.assetProduct.contentHash, contentHash: 'spatial-product.accepted', geometryFacts: { contentHash: 'geometry.accepted' }, resolution: { contentHash: 'resolution.accepted' }, acceptedProjection: { contentHash: 'projection.accepted', assetWorldHash: 'asset-world.accepted' } };
    } };
    var fakeCapture = { capture: async function() { return { contentHash: 'browser-capture.accepted' }; } };
    var fakeReviewer = { review: async function() { return { decision: 'accepted', contentHash: 'assembly-review.accepted' }; } };
    var fakeDirector = { invoke: async function(input) {
      directorCalls.push(input);
      return { ok: true, output: { text: directorProgram }, receipt: { receiptId: 'fixture.director.' + directorCalls.length, provider: 'fixture', model: 'fixture-director', status: 'succeeded' } };
    } };
    var budgets = { semanticCycles: 2, stageAttemptsPerSource: { asset: 2 }, repeatedObservationLimit: 2, elapsedMs: 60000, costUsd: 1 };
    var orchestrator = orchestratorApi.create({ storageRoot: root, index: index, budgets: budgets, providerRuntime: provider, directorModelPort: fakeDirector, semanticRuntime: fakeSemantic, assetPipeline: fakeAsset, spatialPipeline: fakeSpatial, browserCapture: fakeCapture, assemblyReviewer: fakeReviewer });
    await assert.rejects(function() { return orchestrator.run({ deliveryId: 'legacy-capture', projectId: 'project-demo', source: source, capturePort: {} }); }, function(error) { return error.code === 'PRODUCT_DELIVERY_INPUT_INVALID'; }, 'Public capturePort injection is deleted; only the product-owned browser capture path exists.');
    await assert.rejects(function() { return orchestrator.run({ deliveryId: 'legacy-reviewer', projectId: 'project-demo', source: source, reviewerPort: {} }); }, function(error) { return error.code === 'PRODUCT_DELIVERY_INPUT_INVALID'; }, 'Public reviewerPort injection is deleted; the product-owned independent reviewer is fixed at construction.');
    await assert.rejects(function() { return orchestrator.run({ deliveryId: 'legacy-world', projectId: 'project-demo', source: source, assetEngine: { previousAssetWorld: null } }); }, function(error) { return error.code === 'PRODUCT_DELIVERY_INPUT_INVALID'; }, 'The entire caller-authored asset-engine control object is deleted from the product input.');
    await assert.rejects(function() { return orchestrator.run({ deliveryId: '../escape', projectId: 'project-demo', source: source }); }, function(error) { return error.code === 'PRODUCT_DELIVERY_INPUT_INVALID'; }, 'Product identities cannot escape product-owned storage.');
    await assert.rejects(function() { return orchestrator.run({ deliveryId: 'caller-path', projectId: 'project-demo', source: source, deliveryRunPath: path.join(root, 'forged.json') }); }, function(error) { return error.code === 'PRODUCT_DELIVERY_INPUT_INVALID'; }, 'Caller-authored filesystem paths have no product input compatibility path.');
    var product = await orchestrator.run({ deliveryId: 'delivery-demo', projectId: 'project-demo', source: source, userRequest: 'Build the demo.' });
    assert.strictEqual(product.deliveryRun.status, 'accepted');
    assert.strictEqual(assetCalls.length, 3, 'Asset stage retries locally twice before one source-bound semantic repair and retest.');
    assert.strictEqual(semanticCalls.length, 1, 'Only exhausted semantic asset rejection reaches LLM2.');
    assert.notStrictEqual(assetCalls[1].sourceHash, assetCalls[2].sourceHash, 'Revision invalidates the old sourceHash before downstream retest.');
    assert.strictEqual(product.assetCards.cards[0].intent.description, 'A blue player sprite with an unmistakable player silhouette.');
    assert.strictEqual(product.deliveryRun.artifacts.assetWorldHash, 'asset-world.accepted');
    assert.strictEqual(product.deliveryRun.artifacts.browserCaptureHash, 'browser-capture.accepted');
    assert.strictEqual(product.deliveryRun.usage.settledCostUsd, 0.25, 'Provider receipts are isolated by the collision-resistant delivery namespace; unrelated concurrent costs are ignored.');
    assert.strictEqual(product.directorRun.languageId, 'director-dsl-v1');
    assert.strictEqual(product.deliveryRun.director.planHash, product.directorRun.planHash, 'The persisted product run binds the frozen Director plan, not individual domain internals.');
    assert(fs.existsSync(path.join(root, 'project-demo', 'delivery-demo', 'product-delivery-run.json')), 'ProductDeliveryRun path is derived below the product-owned root.');
    assert(fs.readdirSync(path.join(root, 'project-demo', 'delivery-demo', 'sources')).length >= 2, 'Every active source revision is persisted by sourceHash for crash-safe recovery.');
    assert(product.deliveryRun.history.some(function(event) { return event.kind === 'observation' && event.code === 'ASSET_FINAL_REVIEW_REJECTED'; }));

    var malformedProvider = providerRuntimeApi.createProviderRuntime({
      maxCost: 1,
      invokeTransport: async function(context) {
        assert.strictEqual(context.request.role, 'director-plan');
        return { output: { text: '{"operation":"semantic.design"}' }, cost: 0.01 };
      }
    });
    var malformedOrchestrator = orchestratorApi.create({
      storageRoot: path.join(root, 'malformed-director'),
      index: index,
      budgets: budgets,
      providerRuntime: malformedProvider,
      directorDynamicPlanning: true,
      directorModelPort: directorModelPortApi.fromProviderRuntime(malformedProvider, { provider: 'simulated-local', model: 'simulated-text', estimatedCost: 0.01 }),
      semanticRuntime: fakeSemantic,
      assetPipeline: fakeAsset,
      spatialPipeline: fakeSpatial,
      browserCapture: fakeCapture,
      assemblyReviewer: fakeReviewer
    });
    var malformedError = null;
    await assert.rejects(function() { return malformedOrchestrator.run({ deliveryId: 'director-malformed', projectId: 'project-demo', source: source, userRequest: 'Build the demo.' }); }, function(error) { malformedError = error; return error.code === 'PRODUCT_DELIVERY_BLOCKED' && error.issue && error.issue.code === 'DIRECTOR_DSL_JSON_FORBIDDEN'; }, 'A malformed Director JSON response must fail closed as a persisted product block.');
    var malformedRun = malformedError.deliveryRun, malformedReceipts = malformedProvider.listReceipts();
    assert.strictEqual(malformedRun.status, 'blocked');
    assert.strictEqual(malformedRun.blocked.stage, 'director');
    assert.strictEqual(malformedRun.usage.settledCostUsd, 0.01, 'A model response rejected by the Director DSL parser is still settled before the product run is blocked.');
    assert.strictEqual(malformedReceipts.length, 1);
    assert.strictEqual(malformedReceipts[0].status, 'succeeded');
    assert(malformedRun.history.some(function(event) { return event.kind === 'cost-settled' && event.receiptIds.indexOf(malformedReceipts[0].receiptId) >= 0; }), 'The malformed Director receipt is recorded in ProductDeliveryRun history.');
    assert(malformedRun.history.findIndex(function(event) { return event.kind === 'cost-settled'; }) < malformedRun.history.findIndex(function(event) { return event.kind === 'blocked'; }), 'Cost settlement precedes the terminal Director failure record.');

    var recoveryPath = path.join(root, 'project-demo', 'recovery-demo', 'product-delivery-run.json'), recoverySource = product.source;
    var interrupted = deliveryRunApi.create({ deliveryId: 'recovery-demo', projectId: 'project-demo', sourceHash: sourceContract.sourceHash(recoverySource), budgets: budgets });
    interrupted = deliveryRunApi.recordDirectorPlan(interrupted, clone(product.deliveryRun.director));
    interrupted = deliveryRunApi.beginStage(interrupted, 'asset');
    interrupted = deliveryRunApi.recordArtifacts(interrupted, 'asset', { assetWorldHash: 'asset-world.interrupted', assetBoundSeedHash: 'asset-bound-seed.interrupted' });
    interrupted = deliveryRunApi.beginStage(interrupted, 'spatial');
    interrupted = deliveryRunApi.recordArtifacts(interrupted, 'spatial', { geometryFactSetHash: 'geometry.interrupted', spatialResolutionHash: 'resolution.interrupted', finalProjectionHash: 'projection.interrupted' });
    interrupted = deliveryRunApi.beginStage(interrupted, 'assembly');
    deliveryRunApi.write(recoveryPath, interrupted);
    receipts.push({ requestId: (productNamespace('recovery-demo', 'project-demo') + ':assembly-attempt-1:crash-settlement').replace(/[^A-Za-z0-9_.-]/g, '_'), receiptId: 'provider.recovery-crash', cost: { settled: 0.4 } });
    var recovered = await orchestrator.run({ deliveryId: 'recovery-demo', projectId: 'project-demo', source: recoverySource, userRequest: 'Resume it.' });
    assert.strictEqual(recovered.deliveryRun.status, 'accepted');
    assert(recovered.deliveryRun.history.some(function(event) { return event.kind === 'recovery-restarted' && event.previousStatus === 'assembly-reviewing'; }), 'An interrupted assembly invalidates downstream truth and performs one bounded full rerun.');
    assert.strictEqual(recovered.deliveryRun.usage.stageAttempts[sourceContract.sourceHash(recoverySource) + '/assembly'], 2, 'The second assembly attempt is the explicit bounded recovery allowance.');
    assert.strictEqual(recovered.deliveryRun.usage.settledCostUsd, 0.4, 'Recovery reconciles a durable provider settlement that landed before the interrupted ProductDeliveryRun write.');
    assert.strictEqual(recovered.directorRun.trace[0].stage, 'director-plan-reused', 'A recovered delivery reuses its persisted DSL plan without a second planner-model call.');
    assert.strictEqual(directorCalls.length, 0, 'The canonical Director fast path is deterministic and remains model-free across retries and crash recovery.');
    console.log('[ProductDeliveryOrchestrator] isolated provider accounting, asset retry, typed feedback, Revision invalidation, interrupted-assembly recovery, retest, and final acceptance passed');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
})().catch(function(error) { console.error(error); process.exit(1); });
