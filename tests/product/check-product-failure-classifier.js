var assert = require('assert');
var classifier = require('../../ai/product-failure-classifier');

function assetError(debts) {
  var error = new Error('asset stage rejected');
  error.code = 'SEMANTIC_ASSET_PRODUCT_BLOCKED';
  error.owner = 'SemanticAssetProductPipeline';
  error.assetState = { debts: debts };
  return error;
}

var semanticDebt = { debtId: 'debt.player', slotId: 'player_visual', code: 'ASSET_FINAL_REVIEW_REJECTED', owner: 'CLIPImageReviewer', message: 'Final pixels do not read as the player.' };
var retry = classifier.classify('asset', assetError([semanticDebt]), { attempt: 1, canRetry: true });
assert.strictEqual(retry.route, 'retry-stage');
assert.deepStrictEqual(retry.issue.targets, [{ collection: 'assetIntents', semanticId: 'player_visual' }]);
var revise = classifier.classify('asset', assetError([semanticDebt]), { attempt: 2, canRetry: false });
assert.strictEqual(revise.route, 'semantic-revision');
assert.deepStrictEqual(revise.issues.map(function(issue) { return issue.code; }), ['ASSET_FINAL_REVIEW_REJECTED']);

var integrityDebt = { debtId: 'debt.integrity', slotId: 'player_visual', code: 'ASSET_ACCEPTANCE_EVIDENCE_INVALID', owner: 'AssetWorld', message: 'Acceptance evidence is invalid.' };
assert.strictEqual(classifier.classify('asset', assetError([integrityDebt]), { attempt: 1, canRetry: true }).route, 'system-blocked', 'Integrity failures never ask LLM2 to rewrite meaning.');
assert.strictEqual(classifier.classify('asset', Object.assign(new Error('unknown crash'), { code: 'ASSET_WORKER_CRASHED' }), { attempt: 1, canRetry: true }).route, 'system-blocked', 'Unproven direct asset errors fail closed.');

var spatialLimit = Object.assign(new Error('planner exhausted'), { plannerRun: { status: 'round-limit', contentHash: 'planner.run', rounds: 2 } });
assert.strictEqual(classifier.classify('spatial', spatialLimit, { attempt: 1, canRetry: true }).route, 'retry-stage');
var spatialRevision = classifier.classify('spatial', spatialLimit, { attempt: 2, canRetry: false, source: { layoutIntents: [{ semanticId: 'player_layout' }] } });
assert.strictEqual(spatialRevision.route, 'semantic-revision');
assert.deepStrictEqual(spatialRevision.issue.targets, [{ collection: 'layoutIntents', semanticId: 'player_layout' }]);
var providerFailure = Object.assign(new Error('provider unavailable'), { plannerRun: { status: 'provider-failed', contentHash: 'planner.failed' } });
assert.strictEqual(classifier.classify('spatial', providerFailure, { attempt: 1, canRetry: true }).route, 'system-blocked');

var rejectedReview = {
  decision: 'rejected',
  contentHash: 'assembly-review.rejected',
  observations: [{ code: 'ASSEMBLY_LEGIBILITY_FAILED', description: 'Player silhouette is unreadable.', targets: [{ collection: 'assetIntents', semanticId: 'player_visual' }], evidence: { browserCaptureHash: 'browser-capture.real', visualFact: 'Player silhouette is unreadable.', screenshotRegion: null } }]
};
var assemblyRevision = classifier.classify('assembly', Object.assign(new Error('assembly rejected'), { assemblyReview: rejectedReview }), { attempt: 1 });
assert.strictEqual(assemblyRevision.route, 'semantic-revision');
assert.deepStrictEqual(assemblyRevision.issue.targets, rejectedReview.observations[0].targets);
assert.strictEqual(assemblyRevision.issue.evidence.browserCaptureHash, 'browser-capture.real');
var systemReview = { decision: 'rejected', contentHash: 'assembly-review.system', observations: [{ code: 'PROVIDER_TIMEOUT', description: 'Provider timed out.', targets: [{ collection: 'assetIntents', semanticId: 'player_visual' }], evidence: {} }] };
assert.strictEqual(classifier.classify('assembly', Object.assign(new Error('invalid review'), { assemblyReview: systemReview }), { attempt: 1 }).route, 'system-blocked', 'System codes in reviewer output never become LLM2 feedback.');
assert.strictEqual(classifier.classify('assembly', Object.assign(new Error('browser crashed'), { code: 'GDJS_BROWSER_CAPTURE_RUNTIME_ERROR' }), { attempt: 1 }).route, 'system-blocked');

console.log('[ProductFailureClassifier] semantic-quality retry/revision routes and system fail-closed routes passed');
