var assert = require('assert');
var dictionary = require('../ai/capability-semantic-dictionary');
var api = require('./semantic-engine-api');

(async function() {
  var index = dictionary.buildIndex();
  var source = { schemaVersion: 2, documentKind: 'game-semantic-source', dictionarySource: index.source, game: { semanticId: 'api_demo', name: 'API Demo' }, entities: [], events: [], assetIntents: [], layoutIntents: [], tuningPolicies: { relativeChange: { slight: { mode: 'percentage', value: 0.1 } } } };
  var server = api.createServer({ index: index });
  await new Promise(function(resolve) { server.listen(0, '127.0.0.1', resolve); });
  try {
    var address = server.address();
    var response = await fetch('http://127.0.0.1:' + address.port + '/semantic/execute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: 'api-seed', source: source }) });
    var payload = await response.json();
    assert.strictEqual(response.status, 200);
    assert.strictEqual(payload.execution.artifactKind, 'gdjs-project-seed');
    var rejected = await fetch('http://127.0.0.1:' + address.port + '/semantic/execute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: source, feedback: {} }) });
    var rejectedPayload = await rejected.json();
    assert.strictEqual(rejected.status, 400);
    assert.strictEqual(rejectedPayload.error.code, 'SEMANTIC_EXECUTION_REQUEST_UNKNOWN_FIELD');
    console.log('[SemanticEngineApi] product HTTP boundary accepts only deterministic execution documents');
  } finally { await new Promise(function(resolve) { server.close(resolve); }); }
})().catch(function(error) { console.error(error); process.exit(1); });
