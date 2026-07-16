var assert = require('assert');
var providerPort = require('../../packages/product/src/assembly-review-provider-port');

(async function() {
  var observed = null;
  var runtime = { invokeRole: async function(request) {
    observed = request;
    return {
      ok: true,
      output: { text: JSON.stringify({ decision: 'rejected', observations: [{ code: 'ASSEMBLY_LEGIBILITY_FAILED', description: 'The player is not legible at the captured viewport.', targets: [{ collection: 'layoutIntents', semanticId: 'player_layout' }], evidence: { visualFact: 'The player occupies fewer than 16 visible pixels.', screenshotRegion: { x: 390, y: 290, width: 12, height: 12 } } }] }) },
      receipt: { receiptId: 'provider.assembly-review', provider: 'fixture-vision', model: 'fixture-vision-v1', provenance: { simulated: false } }
    };
  } };
  var port = providerPort.create(runtime, { provider: 'fixture-vision', estimatedCost: 0.01, timeoutMs: 1000, maxTokens: 512 });
  var result = await port.reviewAssembly({
    requestNamespace: 'product.assembly-review-check', projectId: 'assembly-review-check',
    source: { game: { semanticId: 'demo' }, entities: [], components: [], events: [], assetIntents: [], layoutIntents: [{ semanticId: 'player_layout' }] },
    assetCards: { documentKind: 'asset-card-set' }, assetProductHash: 'semantic-asset-product.fixture', spatialProductHash: 'semantic-spatial-product.fixture', resolutionHash: 'spatial-layout-resolution.fixture', projectionHash: 'gdjs-spatial-projection.fixture',
    browserEvidence: { contentHash: 'gdjs-browser-capture.fixture', runtimeBuildHash: 'gdjs-runtime-build.fixture', imagePath: __filename }
  });
  assert.strictEqual(observed.role, 'vision-review');
  assert.strictEqual(observed.requestId.indexOf('product.assembly-review-check:assembly-review:'), 0);
  assert.strictEqual(observed.projectId, 'assembly-review-check');
  assert.strictEqual(observed.input.imagePath, __filename);
  assert.strictEqual(observed.input.jsonSchema.name, 'gamecastle_assembly_review');
  assert(observed.input.systemPrompt.indexOf('never repair instructions') >= 0);
  assert.strictEqual(result.decision, 'rejected');
  assert.strictEqual(result.observations[0].evidence.browserCaptureHash, 'gdjs-browser-capture.fixture');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(result.observations[0], 'suggestedFix'), false);
  assert(result.modelFingerprint.indexOf('assembly-review-model.') === 0);
  assert.throws(function() { providerPort.validateOutput({ decision: 'rejected', observations: [{ code: 'ASSEMBLY_LEGIBILITY_FAILED', description: 'Fact.', targets: [{ collection: 'layoutIntents', semanticId: 'player_layout' }], evidence: { visualFact: 'Visible fact.', screenshotRegion: null, suggestedFix: 'Move it.' } }] }); }, function(error) { return error.code === 'ASSEMBLY_REVIEW_PROVIDER_OUTPUT_INVALID'; }, 'Repair instructions cannot hide inside evidence.');
  assert.throws(function() { providerPort.validateOutput({ decision: 'accepted', observations: [{ code: 'ASSEMBLY_LEGIBILITY_FAILED', description: 'Still broken.', targets: [{ collection: 'layoutIntents', semanticId: 'player_layout' }], evidence: { visualFact: 'Visible fact.', screenshotRegion: null } }] }); }, function(error) { return error.code === 'ASSEMBLY_REVIEW_PROVIDER_OUTPUT_INVALID'; }, 'Accepted provider output cannot retain unresolved observations.');
  assert.throws(function() { providerPort.validateOutput({ decision: 'rejected', observations: [{ code: 'PROVIDER_TIMEOUT', description: 'Not a visual fact.', targets: [{ collection: 'layoutIntents', semanticId: 'player_layout' }], evidence: { visualFact: 'No visual fact.', screenshotRegion: null } }] }); }, function(error) { return error.code === 'ASSEMBLY_REVIEW_PROVIDER_OUTPUT_INVALID'; }, 'System failure codes cannot masquerade as assembly facts.');
  assert.throws(function() { providerPort.validateOutput({ decision: 'rejected', observations: [{ code: 'ASSEMBLY_LEGIBILITY_FAILED', description: 'Fact.', targets: [{ collection: 'layoutIntents', semanticId: 'player_layout' }], evidence: { visualFact: 'Visible fact.', screenshotRegion: { x: -1, y: 0, width: 10, height: 10 } } }] }); }, function(error) { return error.code === 'ASSEMBLY_REVIEW_PROVIDER_OUTPUT_INVALID'; }, 'Screenshot evidence cannot use negative coordinates.');
  assert.throws(function() { providerPort.validateOutput({ decision: 'rejected', observations: [{ code: 'ASSEMBLY_LEGIBILITY_FAILED', description: 'Fact.', targets: [{ collection: 'layoutIntents', semanticId: 'player_layout' }, { collection: 'layoutIntents', semanticId: 'player_layout' }], evidence: { visualFact: 'Visible fact.', screenshotRegion: null } }] }); }, function(error) { return error.code === 'ASSEMBLY_REVIEW_PROVIDER_OUTPUT_INVALID'; }, 'Assembly observations cannot repeat one semantic target.');
  assert.throws(function() { providerPort.create(runtime, { route: 'llm2' }); }, function(error) { return error.code === 'ASSEMBLY_REVIEW_PROVIDER_INPUT_INVALID'; }, 'Reviewer configuration cannot author a repair route.');
  console.log('[AssemblyReviewProviderPort] independent vision review, strict factual JSON, source targets, and capture-bound evidence passed');
})().catch(function(error) { console.error(error); process.exit(1); });
