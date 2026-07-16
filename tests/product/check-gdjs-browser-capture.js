var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var dictionary = require('../../packages/semantic/src/capability-semantic-dictionary');
var sourceContract = require('../../packages/semantic/src/game-semantic-source');
var assetPipeline = require('../../packages/product/src/semantic-asset-product-pipeline');
var spatialPipeline = require('../../packages/product/src/spatial-product-pipeline');
var assetPorts = require('../fixtures/test-asset-engine-ports');
var captureApi = require('../../packages/gdjs/src/gdjs-browser-capture');
var headlessPort = require('../../packages/gdjs/src/gdjs-headless-browser-capture-port');
var reviewerApi = require('../../packages/product/src/assembly-reviewer');

(async function() {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-browser-capture-check-'));
  try {
    var index = dictionary.buildIndex();
    var source = sourceContract.validateSource({
      schemaVersion: sourceContract.SCHEMA_VERSION,
      documentKind: 'game-semantic-source',
      dictionarySource: index.source,
      game: { semanticId: 'browser_capture_demo', name: 'Browser Capture Demo' },
      entities: [{ semanticId: 'player', roles: ['player'], objectTypeRef: 'gdjs://object/Sprite::Sprite', behaviorTypeRefs: [], members: [] }],
      components: [],
      events: [],
      assetIntents: [{ semanticId: 'player_visual', roles: ['player', 'visual'], subject: 'player', description: 'A readable player sprite.', productionFamily: 'character', styleId: 'gamecastle.style-dna.v1', constraints: { width: 32, height: 32, transparent: true }, bindings: [] }],
      layoutIntents: [{ semanticId: 'player_layout', roles: ['world'], subject: 'player', bounds: { width: 64, height: 64 }, relations: [{ semanticId: 'player_anchor', layoutRef: 'gc-layout://world/center', subjects: ['player'] }], bindings: [] }],
      tuningPolicies: { relativeChange: { slight: { mode: 'percentage', value: 0.1 } } }
    }, { index: index });
    var assetProduct = await assetPipeline.run({
      runId: 'browser-capture-assets', projectId: 'browser-capture-assets', source: source, index: index,
      projectAssetDir: path.join(root, 'assets'),
      assetEngine: { ports: assetPorts.createTestAssetEnginePorts({ outputDir: path.join(root, 'masters') }), modelPolicy: { provider: 'deepseek', simulated: true } }
    });
    var outputs = ['PLACE subject="player" x=368 y=268 width=64 height=64 angle=0 layer="" zOrder=31', 'ACCEPT'];
    var spatialProduct = await spatialPipeline.run({
      runId: 'browser-capture-spatial', projectId: 'browser-capture-spatial', assetProduct: assetProduct,
      previewDir: path.join(root, 'preview'), maxRounds: 2,
      plannerPort: { invoke: async function() { return { ok: true, output: { text: outputs.shift() }, receipt: { receiptId: 'browser-capture.fixture', provider: 'fixture', model: 'fixture-vision', status: 'succeeded', provenance: { simulated: false } } }; } }
    });
    assert.throws(function() { headlessPort.create({ capturePort: {} }); }, function(error) { return error.code === 'GDJS_BROWSER_CAPTURE_INPUT_INVALID'; }, 'The retired caller capturePort is not a browser option.');
    await assert.rejects(function() { return captureApi.capture({ assetProduct: assetProduct, spatialProduct: spatialProduct, outputDir: path.join(root, 'capture'), capturePort: {} }); }, function(error) { return error.code === 'GDJS_BROWSER_CAPTURE_INVALID'; }, 'The public capture boundary rejects capturePort injection.');
    var captureAuthority = captureApi.create({ timeoutMs: 30000, settleMs: 200 });
    var capture = await captureAuthority.capture({ assetProduct: assetProduct, spatialProduct: spatialProduct, outputDir: path.join(root, 'capture') });
    assert.strictEqual(capture.schemaVersion, 3);
    assert.strictEqual(capture.sourceHash, assetProduct.sourceHash);
    assert.strictEqual(capture.assetWorldHash, assetProduct.assetState.assetWorld.contentHash);
    assert.strictEqual(capture.spatialResolutionHash, spatialProduct.resolution.contentHash);
    assert.strictEqual(capture.finalProjectionHash, spatialProduct.acceptedProjection.contentHash);
    assert(capture.runtimeBuildHash.indexOf('gdjs-runtime-build.') === 0 && capture.buildManifestHash.indexOf('gdjs-build-manifest.') === 0);
    assert(fs.statSync(capture.imagePath).size > 1000, 'Real Chrome screenshot contains rendered PNG bytes.');
    assert.deepStrictEqual(capture.viewport, { width: 800, height: 600 });
    assert.deepStrictEqual(capture.consoleErrors, []);
    assert.strictEqual(captureAuthority.verifyAttestation(capture), true);
    assert.throws(function() { captureApi.create().verifyAttestation(capture); }, function(error) { return error.code === 'GDJS_BROWSER_CAPTURE_ATTESTATION_INVALID'; }, 'A different capture authority cannot attest this browser evidence.');
    var reviewer = reviewerApi.create({ captureVerifier: captureAuthority.verifyAttestation, reviewerPort: { reviewAssembly: async function(input) {
      assert.strictEqual(input.assetProductHash, assetProduct.contentHash);
      assert.strictEqual(input.spatialProductHash, spatialProduct.contentHash);
      return { receiptId: 'assembly-review.real-browser', modelFingerprint: 'fixture-reviewer.v1', decision: 'accepted', observations: [] };
    } } });
    var accepted = await reviewer.review({ requestNamespace: 'product.capture-check', projectId: 'capture-check', assetProduct: assetProduct, spatialProduct: spatialProduct, browserEvidence: capture, assetCards: null });
    assert.strictEqual(accepted.decision, 'accepted');
    var invalidRegionReviewer = reviewerApi.create({ captureVerifier: captureAuthority.verifyAttestation, reviewerPort: { reviewAssembly: async function() {
      return { receiptId: 'assembly-review.invalid-region', modelFingerprint: 'fixture-reviewer.v1', decision: 'rejected', observations: [{ code: 'ASSEMBLY_LEGIBILITY_FAILED', description: 'Claimed fact outside the screenshot.', targets: [{ collection: 'layoutIntents', semanticId: assetProduct.source.layoutIntents[0].semanticId }], evidence: { browserCaptureHash: capture.contentHash, visualFact: 'Claimed pixels are outside the viewport.', screenshotRegion: { x: 799, y: 599, width: 2, height: 2 } } }] };
    } } });
    await assert.rejects(function() { return invalidRegionReviewer.review({ requestNamespace: 'product.capture-check', projectId: 'capture-check', assetProduct: assetProduct, spatialProduct: spatialProduct, browserEvidence: capture, assetCards: null }); }, function(error) { return error.code === 'ASSEMBLY_REVIEW_EVIDENCE_INVALID'; }, 'Assembly facts cannot cite a screenshot rectangle outside the attested viewport.');
    var dataPath = path.join(capture.buildDir, 'data.js'), originalData = fs.readFileSync(dataPath);
    fs.appendFileSync(dataPath, '\n// tampered after capture\n');
    assert.throws(function() { reviewerApi.validateBrowserEvidence(capture, { sourceHash: capture.sourceHash, assetWorldHash: capture.assetWorldHash, spatialResolutionHash: capture.spatialResolutionHash, finalProjectionHash: capture.finalProjectionHash }); }, function(error) { return error.code === 'ASSEMBLY_BROWSER_EVIDENCE_HASH_MISMATCH'; }, 'Post-capture runtime byte tampering invalidates assembly evidence.');
    fs.writeFileSync(dataPath, originalData);
    var originalImage = fs.readFileSync(capture.imagePath);
    fs.writeFileSync(capture.imagePath, Buffer.concat([originalImage, Buffer.from('tamper')]));
    assert.throws(function() { reviewerApi.validateBrowserEvidence(capture, { sourceHash: capture.sourceHash, assetWorldHash: capture.assetWorldHash, spatialResolutionHash: capture.spatialResolutionHash, finalProjectionHash: capture.finalProjectionHash }); }, function(error) { return error.code === 'ASSEMBLY_BROWSER_EVIDENCE_HASH_MISMATCH'; }, 'Post-capture screenshot tampering invalidates assembly evidence.');
    console.log('[GDJSBrowserCapture] final accepted projection, official libGD export, loopback HTTP, real Chrome CDP, HMAC attestation, in-viewport facts, and tamper gates passed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(function(error) { console.error(error); process.exit(1); });
