var assert = require('assert');
var api = require('../../packages/product/src/planner-domain-api');

(async function() {
  var calls = [];
  function port(domain) { return { invoke: async function(input) { calls.push({ domain: domain, input: input }); return { ok: true, receipt: domain + '.receipt' }; } }; }
  var domains = api.create({ semantic: port('semantic'), asset: port('asset'), assembly: port('assembly') });
  assert.deepStrictEqual(domains.describe().map(function(item) { return item.operation; }), ['semantic.design', 'asset.realize', 'assembly.verify']);
  var result = await domains.invoke({ domain: 'semantic', operation: 'semantic.design', input: { request: 'snake' } });
  assert.strictEqual(result.outputKind, 'semantic-design-result');
  assert.strictEqual(result.output.receipt, 'semantic.receipt');
  assert.deepStrictEqual(calls, [{ domain: 'semantic', input: { request: 'snake' } }]);
  assert.throws(function() { api.create({ semantic: port('semantic'), asset: port('asset') }); }, function(error) { return error.code === 'PLANNER_DOMAIN_API_INVALID'; });
  await assert.rejects(function() { return domains.invoke({ domain: 'semantic', operation: 'asset.realize', input: {} }); }, function(error) { return error.code === 'PLANNER_DOMAIN_OPERATION_INVALID'; });
  console.log('[PlannerDomainApi] one typed Semantic/Asset/Assembly API surface for the future director Planner passed');
})().catch(function(error) { console.error(error); process.exit(1); });
