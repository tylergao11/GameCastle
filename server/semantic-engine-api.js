var http = require('http');
var executor = require('../ai/semantic-product-executor');

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}
function readJson(request, limit) {
  return new Promise(function(resolve, reject) {
    var chunks = [], size = 0;
    request.on('data', function(chunk) { size += chunk.length; if (size > limit) { var error = new Error('Request body exceeds the semantic execution limit.'); error.code = 'SEMANTIC_EXECUTION_REQUEST_TOO_LARGE'; reject(error); request.destroy(); return; } chunks.push(chunk); });
    request.on('end', function() { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (error) { error.code = 'SEMANTIC_EXECUTION_REQUEST_JSON_INVALID'; reject(error); } });
    request.on('error', reject);
  });
}
function errorPayload(error) { return { ok: false, error: { code: error.code || 'SEMANTIC_EXECUTION_FAILED', owner: error.owner || 'SemanticEngineApi', message: error.message } }; }
function createServer(options) {
  options = options || {};
  var limit = options.maxBodyBytes || 4 * 1024 * 1024;
  return http.createServer(async function(request, response) {
    if (request.method !== 'POST' || request.url !== '/semantic/execute') return json(response, 404, { ok: false, error: { code: 'SEMANTIC_EXECUTION_ROUTE_NOT_FOUND', message: 'Use POST /semantic/execute.' } });
    try {
      var result = executor.execute(await readJson(request, limit), { index: options.index });
      json(response, 200, { ok: true, execution: result });
    } catch (error) {
      json(response, 400, errorPayload(error));
    }
  });
}
if (require.main === module) {
  var port = Number(process.env.SEMANTIC_ENGINE_PORT || 3030);
  createServer().listen(port, function() { process.stdout.write('[SemanticEngineApi] listening on :' + port + '\n'); });
}
module.exports = { createServer: createServer };
