var registry = require('../shared/wp2-internal-module-origin-receipts.json');
function resolve(receiptId, moduleId, revision) {
  var receipt = registry.receipts[receiptId];
  if (!receipt) throw new Error('Unknown internal module origin receipt: ' + receiptId);
  if (receipt.moduleId !== moduleId || receipt.revision !== revision) throw new Error('Internal module origin receipt identity mismatch: ' + receiptId);
  if (receipt.licenseDecision !== 'accepted' || receipt.assetPolicy !== 'self-authored-or-generated') throw new Error('Internal module origin receipt is not promotable: ' + receiptId);
  return receipt;
}
function forModule(moduleId, revision) {
  var receiptId = Object.keys(registry.receipts).find(function(id) { var item = registry.receipts[id]; return item.moduleId === moduleId && item.revision === revision; });
  return receiptId ? resolve(receiptId, moduleId, revision) : null;
}
module.exports = { registry: registry, resolve: resolve, forModule: forModule };
