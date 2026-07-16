var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var dictionary = require('../../packages/semantic/src/capability-semantic-dictionary');
var sourceContract = require('../../packages/semantic/src/game-semantic-source');
var orchestratorApi = require('../../packages/product/src/product-delivery-orchestrator');

function clone(value) { return JSON.parse(JSON.stringify(value)); }

(async function() {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-assembly-feedback-loop-'));
  try {
    var index = dictionary.buildIndex();
    var source = sourceContract.validateSource({
      schemaVersion: sourceContract.SCHEMA_VERSION, documentKind: 'game-semantic-source', dictionarySource: index.source,
      game: { semanticId: 'assembly_loop', name: 'Assembly Loop' },
      entities: [{ semanticId: 'player', roles: ['player'], objectTypeRef: 'gdjs://object/Sprite::Sprite', behaviorTypeRefs: [], members: [] }], components: [], events: [],
      assetIntents: [{ semanticId: 'player_visual', roles: ['player'], subject: 'player', description: 'Readable player.', productionFamily: 'character', styleId: 'gamecastle.style-dna.v1', constraints: { transparent: true }, bindings: [] }],
      layoutIntents: [{ semanticId: 'player_layout', roles: ['world'], subject: 'player', bounds: { width: 32, height: 32 }, relations: [{ semanticId: 'player_anchor', layoutRef: 'gc-layout://world/center', subjects: ['player'] }], bindings: [] }],
      tuningPolicies: { relativeChange: { slight: { mode: 'percentage', value: 0.1 } } }
    }, { index: index });
    var sourceHashes = [], reviewCalls = 0, semanticCalls = 0, directorCalls = 0;
    var directorProgram = [
      'CALL id=semantic operation=semantic.design after=none',
      'CALL id=asset operation=asset.realize after=semantic',
      'CALL id=assembly operation=assembly.verify after=asset',
      'REPAIR from=assembly.verify to=semantic.design'
    ].join('\n');
    var fakeAsset = { run: async function(input) { var hash = sourceContract.sourceHash(input.source); sourceHashes.push(hash); return { schemaVersion: 2, documentKind: 'semantic-asset-product', sourceHash: hash, source: clone(input.source), contentHash: 'semantic-asset-product.' + hash, assembly: { assetRequirements: { requirements: [] }, componentExpansion: { contentHash: 'component.' + hash } }, assetState: { accepted: true, debts: [], assetWorld: { contentHash: 'asset-world.' + hash, productionSetId: 'production.' + hash, slots: [] } }, artifact: { contentHash: 'asset-bound-seed.' + hash } }; } };
    var fakeSpatial = { run: async function(input) { var hash = input.assetProduct.sourceHash; return { schemaVersion: 3, documentKind: 'semantic-spatial-product', sourceHash: hash, assetProductHash: input.assetProduct.contentHash, contentHash: 'semantic-spatial-product.' + hash, geometryFacts: { contentHash: 'geometry.' + hash }, resolution: { contentHash: 'resolution.' + hash }, acceptedProjection: { contentHash: 'projection.' + hash, assetWorldHash: 'asset-world.' + hash } }; } };
    var fakeCapture = { capture: async function(input) { return { contentHash: 'browser.' + input.assetProduct.sourceHash }; } };
    var fakeReviewer = { review: async function(input) {
      reviewCalls += 1;
      if (input.assetProduct.source.layoutIntents[0].bounds.width === 32) {
        var review = { decision: 'rejected', contentHash: 'assembly-review.rejected', observations: [{ code: 'ASSEMBLY_LEGIBILITY_FAILED', description: 'Player is too small to read in the final browser viewport.', targets: [{ collection: 'layoutIntents', semanticId: 'player_layout' }], evidence: { browserCaptureHash: input.browserEvidence.contentHash, visualFact: 'Player silhouette is below the legibility threshold.', screenshotRegion: null } }] };
        var error = new Error('Independent Assembly Reviewer rejected the final product.'); error.code = 'ASSEMBLY_REVIEW_REJECTED'; error.owner = 'AssemblyReviewer'; error.assemblyReview = review; throw error;
      }
      return { decision: 'accepted', contentHash: 'assembly-review.accepted' };
    } };
    var fakeSemantic = { invoke: async function(input) {
      semanticCalls += 1;
      assert.strictEqual(input.feedbackBatch.entries[0].kind, 'assembly-observation');
      assert.deepStrictEqual(input.feedbackBatch.entries[0].targets, [{ collection: 'layoutIntents', semanticId: 'player_layout' }]);
      assert.strictEqual(input.feedbackBatch.entries[0].observation.evidence.stage, 'assembly');
      assert.strictEqual(Object.prototype.hasOwnProperty.call(input, 'changeScope'), false);
      var next = clone(input.source); next.layoutIntents[0].bounds = { width: 64, height: 64 };
      var revision = { schemaVersion: sourceContract.SCHEMA_VERSION, documentKind: 'game-semantic-revision', baseSourceHash: sourceContract.sourceHash(input.source), operations: [{ op: 'upsert', collection: 'layoutIntents', value: next.layoutIntents[0] }] };
      return { ok: true, document: { revision: revision, source: sourceContract.applyRevision(input.source, revision, { index: index }) } };
    } };
    var fakeDirector = { invoke: async function() { directorCalls += 1; return { ok: true, output: { text: directorProgram }, receipt: { receiptId: 'fixture.director.' + directorCalls, provider: 'fixture', model: 'fixture-director', status: 'succeeded' } }; } };
    var orchestrator = orchestratorApi.create({ storageRoot: root, index: index, budgets: { semanticCycles: 2, stageAttemptsPerSource: { asset: 1, spatial: 1, assembly: 1 }, repeatedObservationLimit: 2, elapsedMs: 60000, costUsd: 1 }, providerRuntime: { listReceipts: function() { return []; } }, directorModelPort: fakeDirector, semanticRuntime: fakeSemantic, assetPipeline: fakeAsset, spatialPipeline: fakeSpatial, browserCapture: fakeCapture, assemblyReviewer: fakeReviewer });
    var product = await orchestrator.run({ deliveryId: 'assembly-loop', projectId: 'assembly-loop', source: source, userRequest: 'Build a readable player.' });
    assert.strictEqual(product.deliveryRun.status, 'accepted');
    assert.strictEqual(reviewCalls, 2, 'Assembly is re-reviewed after the semantic Revision.');
    assert.strictEqual(semanticCalls, 1, 'One factual assembly rejection reaches LLM2 once.');
    assert.strictEqual(sourceHashes.length, 2, 'Source Revision invalidates and reruns asset production instead of retaining stale downstream artifacts.');
    assert.notStrictEqual(sourceHashes[0], sourceHashes[1]);
    assert.strictEqual(product.source.layoutIntents[0].bounds.width, 64);
    assert.strictEqual(directorCalls, 1, 'The frozen Director plan coordinates the semantic repair loop without a second planning call.');
    assert(product.deliveryRun.history.some(function(event) { return event.kind === 'observation' && event.code === 'ASSEMBLY_LEGIBILITY_FAILED'; }));
    console.log('[ProductAssemblyFeedbackLoop] browser assembly rejection -> factual Feedback -> LLM2 Revision -> full downstream invalidation -> re-review acceptance passed');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
})().catch(function(error) { console.error(error); process.exit(1); });
