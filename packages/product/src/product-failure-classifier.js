var crypto = require('crypto');
var productContract = require('../contracts/product-delivery-contract.json');

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, {}); return value; }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0, 24); }
function issue(stage, error, code, targets, evidence) {
  var value = {
    stage: stage,
    code: code || error && error.code || 'PRODUCT_STAGE_FAILURE_UNKNOWN',
    owner: error && error.owner || 'ProductDeliveryOrchestrator',
    message: error && error.message || 'Product stage failed without a classified fact.',
    targets: clone(targets || []),
    evidence: clone(evidence || {})
  };
  value.evidenceHash = 'product-evidence.' + digest({ stage: value.stage, code: value.code, targets: value.targets, evidence: value.evidence });
  return value;
}
function result(route, value) { return { route: route, issue: value }; }
function assetTarget(slotId) { return slotId ? [{ collection: 'assetIntents', semanticId: slotId }] : []; }

var SYSTEM_CODE_PATTERNS = [
  /^PROVIDER_/,
  /^MODEL_BUDGET_/,
  /^ASSET_REVISION_(MISSING|HASH_MISMATCH)$/,
  /^ASSET_(SEMANTIC_REVIEW_EVIDENCE|ACCEPTANCE_EVIDENCE|WORLD_INJECTION)_/,
  /^ASSET_CARD_/,
  /^SEMANTIC_ASSET_(WORLD|FILE|FORMAT|RESOURCE|BINDING|PROJECT)/,
  /^ASSET_PRODUCTION_FINGERPRINT_/,
  /^SPATIAL_GEOMETRY_/,
  /^SPATIAL_ASSEMBLY_(GEOMETRY|ASSET|STAGE)/,
  /^SPATIAL_COORDINATE_/,
  /^GDJS_SPATIAL_PREVIEW_(IMAGE|CANVAS|INPUT)/,
  /^GDJS_BROWSER_CAPTURE_/,
  /^PRODUCT_DELIVERY_/
];
function isSystemCode(code) { return SYSTEM_CODE_PATTERNS.some(function(pattern) { return pattern.test(code); }); }

function classifyAsset(error, context) {
  var state = error && error.assetState, debts = state && state.debts || [];
  if (!debts.length) {
    var directCode = error && error.code || 'ASSET_STAGE_FAILURE_UNKNOWN';
    return result('system-blocked', issue('asset', error, directCode, [], { attempt: context.attempt }));
  }
  var normalized = debts.map(function(debt) {
    return issue('asset', { code: debt.code, owner: debt.owner, message: debt.message || ('Asset debt for ' + (debt.slotId || 'unknown slot') + '.') }, debt.code, assetTarget(debt.slotId), { slotId: debt.slotId || null, debtId: debt.debtId || null, attempt: context.attempt });
  });
  if (normalized.some(function(value) { return isSystemCode(value.code); })) return result('system-blocked', normalized.filter(function(value) { return isSystemCode(value.code); })[0]);
  var semanticCodes = ['ASSET_FINAL_REVIEW_REJECTED', 'ASSET_SEMANTIC_REVIEW_REJECTED', 'MASTER_IMAGE_QUALITY_REJECTED'];
  var semantic = normalized.filter(function(value) { return semanticCodes.indexOf(value.code) >= 0; });
  if (context.canRetry && semantic.length === normalized.length) return result('retry-stage', semantic[0]);
  if (semantic.length === normalized.length) return { route: 'semantic-revision', issue: semantic[0], issues: semantic };
  return result('system-blocked', normalized[0]);
}

function classifySpatial(error, context) {
  var planner = error && error.plannerRun || null;
  if (planner) {
    if (planner.status === 'provider-failed') return result('system-blocked', issue('spatial', error, 'SPATIAL_PROVIDER_FAILED', [], { plannerRunHash: planner.contentHash || null, attempt: context.attempt }));
    if (planner.status === 'round-limit' && context.canRetry) return result('retry-stage', issue('spatial', error, 'SPATIAL_PLANNER_ROUND_LIMIT', [], { plannerRunHash: planner.contentHash || null, attempt: context.attempt }));
    if (planner.status === 'round-limit') {
      var targets = (context.source && context.source.layoutIntents || []).map(function(intent) { return { collection: 'layoutIntents', semanticId: intent.semanticId }; });
      return result('semantic-revision', issue('spatial', error, 'SPATIAL_LAYOUT_NOT_CONVERGED', targets, { plannerRunHash: planner.contentHash || null, rounds: planner.rounds, attempt: context.attempt }));
    }
    return result('system-blocked', issue('spatial', error, 'SPATIAL_PRODUCT_INCOMPLETE', [], { plannerStatus: planner.status, plannerRunHash: planner.contentHash || null, attempt: context.attempt }));
  }
  var code = error && error.code || 'SPATIAL_STAGE_FAILURE_UNKNOWN';
  if (isSystemCode(code)) return result('system-blocked', issue('spatial', error, code, [], { attempt: context.attempt }));
  if (context.canRetry) return result('retry-stage', issue('spatial', error, code, [], { attempt: context.attempt }));
  return result('system-blocked', issue('spatial', error, code, [], { attempt: context.attempt }));
}

function classifyAssembly(error, context) {
  var review = error && error.assemblyReview || null;
  if (review && review.decision === 'rejected' && Array.isArray(review.observations) && review.observations.length) {
    var invalidObservation = review.observations.filter(function(observation) { return isSystemCode(observation.code) || productContract.semanticAssemblyObservationCodes.indexOf(observation.code) < 0; })[0];
    if (invalidObservation) return result('system-blocked', issue('assembly', error, invalidObservation.code || 'ASSEMBLY_REVIEW_CODE_INVALID', [], { assemblyReviewHash: review.contentHash || null, attempt: context.attempt }));
    var issues = review.observations.map(function(observation) {
      return issue('assembly', { code: observation.code, owner: 'AssemblyReviewer', message: observation.description }, observation.code, observation.targets, Object.assign({ assemblyReviewHash: review.contentHash || null, attempt: context.attempt }, clone(observation.evidence || {})));
    });
    return { route: 'semantic-revision', issue: issues[0], issues: issues };
  }
  return result('system-blocked', issue('assembly', error, error && error.code || 'ASSEMBLY_REVIEW_FAILED', [], { attempt: context.attempt }));
}

function classify(stage, error, context) {
  context = context || {};
  if (stage === 'asset') return classifyAsset(error, context);
  if (stage === 'spatial') return classifySpatial(error, context);
  if (stage === 'assembly') return classifyAssembly(error, context);
  return result('system-blocked', issue(stage, error, error && error.code || 'PRODUCT_STAGE_FAILURE_UNKNOWN', [], { attempt: context.attempt || 1 }));
}

module.exports = { classify: classify, isSystemCode: isSystemCode };
