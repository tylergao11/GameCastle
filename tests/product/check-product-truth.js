var assert = require('assert');
var truth = require('../../packages/product/src/product-truth');
var ledger = require('../../packages/product/src/product-dispatch-ledger');
var deliveryContract = require('../../packages/product/contracts/product-delivery-contract.json');
var fs = require('fs');
var path = require('path');

assert.strictEqual(truth.DELIVERY_OWNER, 'ProductDeliveryOrchestrator');
assert.strictEqual(truth.ENTRY.production.http, 'POST /product/deliver');
assert.strictEqual(truth.ENTRY.experimentalDispatch.role.indexOf('scaffold') >= 0, true);
assert.strictEqual(truth.ASSEMBLY_TRUTH.entry.indexOf('gate') >= 0, true);
assert.strictEqual(truth.PLACEHOLDER_TRUTH.sealed.indexOf('intent') >= 0, true);
assert.strictEqual(truth.PLACEHOLDER_TRUTH.filled.indexOf('asset') >= 0, true);

assert.strictEqual(deliveryContract.truthModel.deliveryAuthority.indexOf('ProductDeliveryOrchestrator') >= 0, true);
assert.strictEqual(deliveryContract.forbidden.some(function(line) {
  return /second accepted-product/i.test(line);
}), true);

// Intent settled ≠ asset filled.
var L = ledger.empty();
L = ledger.declareMany(L, [{ id: 'hero', kind: 'image', subject: 'player', required: true }]);
L = ledger.seal(L, ['hero']);
var mid = ledger.summary(L);
assert.deepStrictEqual(mid.intentSettledIds, ['hero']);
assert.deepStrictEqual(mid.assetFilledIds, []);
assert.strictEqual(mid.placeholders[0].intentSettled, true);
assert.strictEqual(mid.placeholders[0].assetFilled, false);
assert.strictEqual(ledger.assemblyReady(L).ready, false);

L = ledger.fill(L, 'hero', { revisionId: 'rev1' });
var done = ledger.summary(L);
assert.deepStrictEqual(done.assetFilledIds, ['hero']);
assert.strictEqual(done.placeholders[0].assetFilled, true);
assert.strictEqual(ledger.assemblyReady(L).ready, true);

assert.throws(function() {
  truth.assertNoSecondDeliveryAuthority('dispatch', {
    owner: 'ProductDispatchLangGraph',
    claimsAcceptedProduct: true
  });
}, function(error) { return error.code === 'PRODUCT_TRUTH_DUAL_AUTHORITY'; });

// Architecture and semantic docs pin single delivery owner.
var arch = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'architecture.md'), 'utf8');
assert(arch.indexOf('One production delivery authority') >= 0 || arch.indexOf('ProductDeliveryOrchestrator') >= 0);
assert(arch.indexOf('lane scheduler scaffold') >= 0 || arch.indexOf('scaffold') >= 0);
var semanticDoc = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'semantic.md'), 'utf8');
assert(semanticDoc.indexOf('ProductDeliveryOrchestrator') >= 0);
assert(semanticDoc.indexOf('product-truth.js') >= 0);

console.log('[ProductTruth] single delivery authority + intentSettled vs assetFilled pin passed');
