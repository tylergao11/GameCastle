var assert = require('assert');
var dictionary = require('../../packages/semantic/src/capability-semantic-dictionary');
var sourceContract = require('../../packages/semantic/src/game-semantic-source');
var api = require('../../apps/api/src/server');

var TOKEN = 'product-engine-test-token';
function headers(withAuth) { var value = { 'Content-Type': 'application/json' }; if (withAuth !== false) value.Authorization = 'Bearer ' + TOKEN; return value; }

(async function() {
  var index = dictionary.buildIndex();
  var source = { schemaVersion: sourceContract.SCHEMA_VERSION, documentKind: 'game-semantic-source', dictionarySource: index.source, game: { semanticId: 'api_demo', name: 'API Demo' }, entities: [], components: [], events: [], assetIntents: [], layoutIntents: [], tuningPolicies: { relativeChange: { slight: { mode: 'percentage', value: 0.1 } } } };
  var productInput = null;
  var server = api.createServer({ authToken: TOKEN, index: index, productOrchestrator: { run: async function(input) { productInput = input; if (input.deliveryId === 'blocked-api') { var error = new Error('Blocked fixture.'); error.code = 'PRODUCT_DELIVERY_BLOCKED'; error.issue = { code: 'SPATIAL_PROVIDER_FAILED', owner: 'SpatialPlanner', stage: 'spatial', message: 'Provider unavailable.', evidenceHash: 'evidence.fixture', privateEvidence: { localPath: 'C:\\secret\\trace.json' } }; error.deliveryRun = { deliveryId: input.deliveryId, projectId: input.projectId, status: 'blocked', currentSourceHash: 'semantic.api', budgets: { secret: true }, usage: { secret: true }, history: [{ localPath: 'C:\\secret\\trace.json' }], blocked: error.issue, contentHash: 'product-delivery-run.blocked' }; throw error; } return { schemaVersion: 1, documentKind: 'product-delivery-product', deliveryId: input.deliveryId, projectId: input.projectId, sourceHash: 'semantic.api', source: source, assetCards: { documentKind: 'asset-card-set' }, deliveryRun: { status: 'accepted', artifacts: { sourceHash: 'semantic.api' }, contentHash: 'product-delivery-run.fixture' }, browserCapture: { imagePath: 'C:\\secret\\capture.png', pageUrl: 'http://127.0.0.1/?capture=secret' }, contentHash: 'product-delivery-product.fixture' }; } } });
  await new Promise(function(resolve) { server.listen(0, '127.0.0.1', resolve); });
  try {
    var address = server.address(), base = 'http://127.0.0.1:' + address.port;
    var unauthorized = await fetch(base + '/product/deliver', { method: 'POST', headers: headers(false), body: '{}' });
    assert.strictEqual(unauthorized.status, 401);
    var wrongType = await fetch(base + '/product/deliver', { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'text/plain' }, body: '{}' });
    assert.strictEqual(wrongType.status, 415);
    var response = await fetch(base + '/semantic/execute', { method: 'POST', headers: headers(), body: JSON.stringify({ requestId: 'api-seed', source: source }) });
    var payload = await response.json();
    assert.strictEqual(response.status, 200);
    assert.strictEqual(payload.execution.artifactKind, 'gdjs-project-seed');
    var rejected = await fetch(base + '/semantic/execute', { method: 'POST', headers: headers(), body: JSON.stringify({ source: source, feedback: {} }) });
    var rejectedPayload = await rejected.json();
    assert.strictEqual(rejected.status, 400);
    assert.strictEqual(rejectedPayload.error.code, 'SEMANTIC_EXECUTION_REQUEST_UNKNOWN_FIELD');
    var assetWorldRejected = await fetch(base + '/semantic/execute', { method: 'POST', headers: headers(), body: JSON.stringify({ source: source, assetWorld: {} }) });
    assert.strictEqual(assetWorldRejected.status, 400, 'Deterministic API cannot bypass ProductDeliveryOrchestrator with a caller-authored AssetWorld.');
    var sourceRejected = await fetch(base + '/product/deliver', { method: 'POST', headers: headers(), body: JSON.stringify({ deliveryId: 'delivery-api', projectId: 'project-api', source: source }) });
    assert.strictEqual(sourceRejected.status, 400, 'HTTP product delivery owns initial LLM2 design and cannot accept a caller-authored Source.');
    var pathRejected = await fetch(base + '/product/deliver', { method: 'POST', headers: headers(), body: JSON.stringify({ deliveryId: 'delivery-api', projectId: 'project-api', deliveryRunPath: 'C:\\forged.json' }) });
    assert.strictEqual(pathRejected.status, 400, 'HTTP callers cannot choose product filesystem paths.');
    var productResponse = await fetch(base + '/product/deliver', { method: 'POST', headers: headers(), body: JSON.stringify({ deliveryId: 'delivery-api', projectId: 'project-api', userRequest: 'Build it.', creativeVision: 'Readable.' }) });
    var productPayload = await productResponse.json();
    assert.strictEqual(productResponse.status, 200);
    assert.strictEqual(productPayload.product.documentKind, 'product-delivery-result');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(productPayload.product, 'browserCapture'), false, 'HTTP result does not leak local build paths or loopback tokens.');
    assert.strictEqual(JSON.stringify(productPayload).indexOf('C:\\secret'), -1);
    assert.deepStrictEqual(productInput, { deliveryId: 'delivery-api', projectId: 'project-api', userRequest: 'Build it.', creativeVision: 'Readable.' });
    var blockedResponse = await fetch(base + '/product/deliver', { method: 'POST', headers: headers(), body: JSON.stringify({ deliveryId: 'blocked-api', projectId: 'project-api', userRequest: 'Build it.', creativeVision: 'Readable.' }) });
    var blockedPayload = await blockedResponse.json();
    assert.strictEqual(blockedResponse.status, 503);
    assert.strictEqual(blockedPayload.error.deliveryRun.status, 'blocked');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(blockedPayload.error.deliveryRun, 'history'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(blockedPayload.error.issue, 'privateEvidence'), false);
    assert.strictEqual(JSON.stringify(blockedPayload).indexOf('C:\\secret'), -1, 'HTTP failures expose only the sanitized delivery summary.');
    var missing = await fetch(base + '/legacy/product', { method: 'POST', headers: headers(), body: '{}' });
    assert.strictEqual(missing.status, 404);
    assert.strictEqual(api.statusFor({ code: 'PRODUCT_DELIVERY_BLOCKED', issue: { code: 'SPATIAL_PROVIDER_FAILED' } }), 503, 'Wrapped provider failures retain service-unavailable HTTP meaning.');
    assert.strictEqual(api.statusFor({ code: 'PRODUCT_DELIVERY_BLOCKED', issue: { code: 'ASSEMBLY_REVIEW_REJECTED' } }), 409, 'Factual terminal rejection remains a delivery conflict.');
  } finally { await new Promise(function(resolve) { server.close(resolve); }); }

  var smallServer = api.createServer({ authToken: TOKEN, maxBodyBytes: 8, productOrchestrator: { run: async function() { throw new Error('must not run'); } } });
  await new Promise(function(resolve) { smallServer.listen(0, '127.0.0.1', resolve); });
  try {
    var smallAddress = smallServer.address();
    var oversized = await fetch('http://127.0.0.1:' + smallAddress.port + '/product/deliver', { method: 'POST', headers: headers(), body: JSON.stringify({ deliveryId: 'too-large' }) });
    var oversizedPayload = await oversized.json();
    assert.strictEqual(oversized.status, 413);
    assert.strictEqual(oversizedPayload.error.code, 'PRODUCT_ENGINE_REQUEST_TOO_LARGE');
  } finally { await new Promise(function(resolve) { smallServer.close(resolve); }); }
  console.log('[ProductEngineApi] authenticated loopback product route, product-owned inputs, sanitized output, and strict semantic sub-boundary passed');
})().catch(function(error) { console.error(error); process.exit(1); });
