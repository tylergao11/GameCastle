var crypto = require('crypto');
var http = require('http');
var path = require('path');
var semanticExecutor = require('../../../packages/semantic/src/semantic-product-executor');
var productOrchestratorApi = require('../../../packages/product/src/product-delivery-orchestrator');

var PRODUCT_FIELDS = ['deliveryId', 'projectId', 'userRequest'];

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(value));
}
function text(value, label) { if (typeof value !== 'string' || !value.trim()) { var error = new Error(label + ' must be non-empty text.'); error.code = 'PRODUCT_ENGINE_CONFIG_INVALID'; throw error; } return value.trim(); }
function allowed(value, fields, label) { Object.keys(value || {}).forEach(function(field) { if (fields.indexOf(field) < 0) { var error = new Error(label + ' contains unsupported field: ' + field); error.code = 'PRODUCT_ENGINE_REQUEST_UNKNOWN_FIELD'; throw error; } }); }
function authorized(request, token) {
  var header = String(request.headers.authorization || ''), expected = 'Bearer ' + token;
  var left = Buffer.from(header), right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function readJson(request, limit) {
  return new Promise(function(resolve, reject) {
    var chunks = [], size = 0, finished = false;
    request.on('data', function(chunk) {
      if (finished) return;
      size += chunk.length;
      if (size > limit) { finished = true; var error = new Error('Request body exceeds the product engine limit.'); error.code = 'PRODUCT_ENGINE_REQUEST_TOO_LARGE'; reject(error); request.resume(); return; }
      chunks.push(chunk);
    });
    request.on('end', function() { if (finished) return; try { var value = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Request body must be a JSON object.'); resolve(value); } catch (error) { error.code = 'PRODUCT_ENGINE_REQUEST_JSON_INVALID'; reject(error); } });
    request.on('error', function(error) { if (!finished) reject(error); });
  });
}
function publicProduct(product) {
  return {
    schemaVersion: 1,
    documentKind: 'product-delivery-result',
    deliveryId: product.deliveryId,
    projectId: product.projectId,
    sourceHash: product.sourceHash,
    contentHash: product.contentHash,
    status: product.deliveryRun && product.deliveryRun.status,
    source: product.source || null,
    assetCards: product.assetCards || null,
    artifacts: product.deliveryRun && product.deliveryRun.artifacts || null,
    deliveryRunHash: product.deliveryRun && product.deliveryRun.contentHash || null
  };
}
function publicIssue(issue) {
  if (!issue || typeof issue !== 'object') return null;
  return { code: issue.code || 'PRODUCT_DELIVERY_BLOCKED', owner: issue.owner || 'ProductDeliveryOrchestrator', stage: issue.stage || null, message: issue.message || 'Product delivery is blocked.', evidenceHash: issue.evidenceHash || null };
}
function publicDeliveryRun(run) {
  if (!run || typeof run !== 'object') return null;
  return { deliveryId: run.deliveryId || null, projectId: run.projectId || null, status: run.status || null, sourceHash: run.currentSourceHash || null, contentHash: run.contentHash || null, blocked: publicIssue(run.blocked) };
}
function errorPayload(error) {
  var payload = { ok: false, error: { code: error.code || 'PRODUCT_ENGINE_FAILED', owner: error.owner || 'ProductEngineApi', message: error.message } };
  if (error.issue) payload.error.issue = publicIssue(error.issue);
  if (error.deliveryRun) payload.error.deliveryRun = publicDeliveryRun(error.deliveryRun);
  return payload;
}
function statusFor(error) {
  var effectiveCode = error && error.issue && error.issue.code || error && error.code || '';
  if (effectiveCode === 'PRODUCT_ENGINE_UNAUTHORIZED') return 401;
  if (effectiveCode === 'PRODUCT_ENGINE_CONTENT_TYPE_INVALID') return 415;
  if (effectiveCode === 'PRODUCT_ENGINE_REQUEST_TOO_LARGE') return 413;
  if (/PROVIDER(?:_|$)|_UNAVAILABLE$/.test(effectiveCode)) return 503;
  if (error && (error.code === 'PRODUCT_DELIVERY_BLOCKED' || error.code === 'PRODUCT_DELIVERY_TERMINAL' || error.code === 'PRODUCT_DELIVERY_ALREADY_RUNNING')) return 409;
  return 400;
}
function prewarm(orchestrator) {
  if (!orchestrator || typeof orchestrator.prewarm !== 'function') return;
  Promise.resolve().then(function() { return orchestrator.prewarm(); }).catch(function(error) {
    process.stderr.write('[ProductEngineApi] graph prewarm deferred: ' + String(error && error.code || error && error.message || error) + '\n');
  });
}
function createServer(options) {
  options = options || {};
  var limit = options.maxBodyBytes || 4 * 1024 * 1024, authToken = text(options.authToken, 'authToken');
  var productOrchestrator = options.productOrchestrator || productOrchestratorApi.create(options.productOptions || {});
  prewarm(productOrchestrator);
  return http.createServer(async function(request, response) {
    if (request.method !== 'POST') return json(response, 404, { ok: false, error: { code: 'PRODUCT_ENGINE_ROUTE_NOT_FOUND', message: 'Use POST /product/deliver or POST /semantic/execute.' } });
    try {
      if (!authorized(request, authToken)) { var authError = new Error('A valid Product Engine bearer token is required.'); authError.code = 'PRODUCT_ENGINE_UNAUTHORIZED'; throw authError; }
      if (!/^application\/json(?:\s*;|$)/i.test(String(request.headers['content-type'] || ''))) { var contentTypeError = new Error('Product Engine accepts application/json only.'); contentTypeError.code = 'PRODUCT_ENGINE_CONTENT_TYPE_INVALID'; throw contentTypeError; }
      var body = await readJson(request, limit);
      if (request.url === '/semantic/execute') return json(response, 200, { ok: true, execution: semanticExecutor.execute(body, { index: options.index }) });
      if (request.url === '/product/deliver') { allowed(body, PRODUCT_FIELDS, 'product delivery request'); return json(response, 200, { ok: true, product: publicProduct(await productOrchestrator.run(body)) }); }
      return json(response, 404, { ok: false, error: { code: 'PRODUCT_ENGINE_ROUTE_NOT_FOUND', message: 'Use POST /product/deliver or POST /semantic/execute.' } });
    } catch (error) { json(response, statusFor(error), errorPayload(error)); }
  });
}

if (require.main === module) {
  var port = Number(process.env.PRODUCT_ENGINE_PORT || 3030), authToken = process.env.PRODUCT_ENGINE_TOKEN;
  if (!authToken) { process.stderr.write('[ProductEngineApi] PRODUCT_ENGINE_TOKEN is required.\n'); process.exit(1); }
  var storageRoot = path.resolve(process.env.PRODUCT_ENGINE_STORAGE_ROOT || path.join(__dirname, '..', '..', '..', '.gamecastle', 'output', 'product-deliveries'));
  createServer({ authToken: authToken, productOptions: { storageRoot: storageRoot } }).listen(port, '127.0.0.1', function() { process.stdout.write('[ProductEngineApi] listening on 127.0.0.1:' + port + '\n'); });
}

module.exports = { createServer: createServer, statusFor: statusFor, publicProduct: publicProduct, publicDeliveryRun: publicDeliveryRun };
