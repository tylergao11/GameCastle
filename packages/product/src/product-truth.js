// Single product-truth pin: one delivery authority, one source hash lineage, no dual entry.
// Code and docs must agree with this module. Tests assert these constants.

var DELIVERY_OWNER = 'ProductDeliveryOrchestrator';
var DELIVERY_CONTRACT = 'packages/product/contracts/product-delivery-contract.json';

// Production HTTP path owns accepted products. Experimental free dispatch is not a second delivery.
var ENTRY = Object.freeze({
  production: {
    http: 'POST /product/deliver',
    owner: DELIVERY_OWNER,
    graph: 'director-dsl-v1 sealed stages: semantic.design -> asset.realize -> assembly.verify',
    lifecycle: 'product-delivery-run'
  },
  // Scaffold for parallel semantic|asset after placeholders seal. Not an alternate accepted-product authority.
  experimentalDispatch: {
    modules: 'product-dispatch-*',
    role: 'lane scheduler scaffold (placeholder ledger + Send fan-out + assembly gate)',
    mustNot: 'issue a second accepted product identity without ProductDeliveryRun'
  }
});

// Cross-domain truth objects (exactly one of each per accepted delivery).
var ARTIFACT_TRUTH = Object.freeze({
  semanticIntent: 'GameSemanticSource / sourceHash',
  assetAcceptance: 'semantic-asset-world (complete) or blocking debt (no partial world)',
  spatialAcceptance: 'spatial resolution + accepted GDJS projection',
  assemblyAcceptance: 'assembly review bound to capture + projection hashes',
  multiplayerAdmission: 'deliveryAttestation.sourceHash (friend-invite rooms)'
});

// Placeholder ledger phases (product-dispatch): intent vs pixels.
// sealed = semantic/product intent settled for a slot; filled = asset pipeline accepted that slot.
var PLACEHOLDER_TRUTH = Object.freeze({
  declared: 'slot named, not yet committed for production',
  sealed: 'intent settled — asset may run; not yet pixels',
  filled: 'asset accepted for sealed slot',
  invalid: 'slot rejected; must not fill'
});

// Assembly: gate-driven, not planner work-order.
var ASSEMBLY_TRUTH = Object.freeze({
  entry: 'gate (assemblyReady / after asset.realize)',
  not: 'model plan-task / free dispatch-task route=assembly',
  failureLoop: 'ProductDeliveryOrchestrator routes semantic-revision or retry-stage'
});

function assertNoSecondDeliveryAuthority(label, claim) {
  if (claim && claim.owner && claim.owner !== DELIVERY_OWNER && claim.claimsAcceptedProduct === true) {
    var error = new Error(label + ' cannot claim accepted product authority outside ' + DELIVERY_OWNER);
    error.code = 'PRODUCT_TRUTH_DUAL_AUTHORITY';
    error.owner = 'ProductTruth';
    throw error;
  }
  return true;
}

module.exports = {
  DELIVERY_OWNER: DELIVERY_OWNER,
  DELIVERY_CONTRACT: DELIVERY_CONTRACT,
  ENTRY: ENTRY,
  ARTIFACT_TRUTH: ARTIFACT_TRUTH,
  PLACEHOLDER_TRUTH: PLACEHOLDER_TRUTH,
  ASSEMBLY_TRUTH: ASSEMBLY_TRUTH,
  assertNoSecondDeliveryAuthority: assertNoSecondDeliveryAuthority
};
