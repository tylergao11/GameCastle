var assert = require('assert');
var providerPort = require('../../packages/product/src/assembly-review-provider-port');

(async function() {
  var observed = null;
  var runtime = { invokeRole: async function(request) {
    observed = request;
    return {
      ok: true,
      output: { text: [
        'REJECT',
        'OBSERVE code=ASSEMBLY_LEGIBILITY_FAILED description="The player is not legible at the captured viewport."',
        'EVIDENCE visualFact="The player occupies fewer than 16 visible pixels."',
        'REGION x=390 y=290 width=12 height=12',
        'TARGET collection="layoutIntents" semanticId="player_layout"',
        'END'
      ].join('\n') },
      receipt: { receiptId: 'provider.assembly-review', provider: 'fixture-vision', model: 'fixture-vision-v1', provenance: { simulated: false } }
    };
  } };
  var port = providerPort.create(runtime, { provider: 'fixture-vision', estimatedCost: 0.01, timeoutMs: 1000, maxTokens: 512 });
  var reviewInput = {
    requestNamespace: 'product.assembly-review-check', projectId: 'assembly-review-check',
    source: { game: { semanticId: 'demo' }, entities: [], components: [], events: [], assetIntents: [], layoutIntents: [{ semanticId: 'player_layout' }] },
    assetCards: { documentKind: 'asset-card-set' }, assetProductHash: 'semantic-asset-product.fixture', spatialProductHash: 'semantic-spatial-product.fixture', resolutionHash: 'spatial-layout-resolution.fixture', projectionHash: 'gdjs-spatial-projection.fixture',
    browserEvidence: { contentHash: 'gdjs-browser-capture.fixture', runtimeBuildHash: 'gdjs-runtime-build.fixture', imagePath: __filename }
  };
  var result = await port.reviewAssembly(reviewInput);
  assert.strictEqual(observed.role, 'vision-review');
  assert.strictEqual(observed.requestId.indexOf('product.assembly-review-check:assembly-review:'), 0);
  assert.strictEqual(observed.projectId, 'assembly-review-check');
  assert.strictEqual(observed.input.imagePath, __filename);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(observed.input, 'jsonSchema'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(providerPort, 'OUTPUT_SCHEMA'), false);
  assert.strictEqual(providerPort.LANGUAGE_ID, 'assembly-review-dsl-v1');
  assert(observed.input.systemPrompt.indexOf('never repair instructions') >= 0);
  assert(observed.input.systemPrompt.indexOf('Return only assembly-review-dsl-v1 commands') >= 0);
  assert(observed.input.prompt.indexOf('CONTEXT language="assembly-review-dsl-v1"') >= 0);
  assert(observed.input.prompt.indexOf('FACT scope="source" path="/game/semanticId" kind=text value="demo"') >= 0);
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
  var invalidDslPort = providerPort.create({ invokeRole: async function() { return { ok: true, output: { text: '{ not-an-assembly-review-program }' }, receipt: {} }; } });
  var invalidDslError = null;
  try { await invalidDslPort.reviewAssembly(reviewInput); } catch (error) { invalidDslError = error; }
  assert(invalidDslError, 'A non-DSL model response must fail the provider port.');
  assert.strictEqual(invalidDslError.code, 'ASSEMBLY_REVIEW_PROVIDER_OUTPUT_INVALID');
  console.log('[AssemblyReviewProviderPort] independent vision review, strict factual DSL, source targets, and capture-bound evidence passed');
})().catch(function(error) { console.error(error); process.exit(1); });
