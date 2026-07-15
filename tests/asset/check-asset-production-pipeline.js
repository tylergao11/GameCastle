var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var planner = require('../../ai/asset-production-planner');
var pipeline = require('../../ai/asset-production-pipeline');
var testPorts = require('../fixtures/test-asset-engine-ports');
var frameSet = require('../../ai/frame-set');

function request() { return { requestId: 'pipeline-check', projectId: 'pipeline-project', sourceHash: 'semantic.pipeline-check', requirements: [
  { semanticId: 'hero', subject: 'hero', description: 'Hero sprite', semanticTags: ['hero'], productionFamily: 'character', recipeId: 'character-sprite.v1', styleId: 'gamecastle.style-dna.v1', constraints: { width: 24, height: 24, transparent: true }, gdjsBindings: [] },
  { semanticId: 'hero_move', subject: 'hero', description: 'Hero movement', semanticTags: ['hero'], productionFamily: 'character-animation', recipeId: 'character-frame-set.v1', styleId: 'gamecastle.style-dna.v1', constraints: { width: 24, height: 24, transparent: true }, animation: { initialStateId: 'move', states: [{ stateId: 'move', loop: true, frameCount: 4, frameDurationMs: 90, derivationProfileId: 'move-bob' }] }, gdjsBindings: [] }
] }; }

(async function() {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-production-pipeline-'));
  try {
    var plan = planner.compile({ request: request() }), generated = 0, fingerprint = 'test-provider.production.v1', ports = testPorts.createTestAssetEnginePorts({ outputDir: path.join(root, 'masters') }), original = ports.generateMaster; ports.productionFingerprint = function() { return fingerprint; }; ports.generateMaster = async function(state) { generated++; return original(state); };
    var ledgerPath = path.join(root, 'ledger.json'), result = await pipeline.runProductionSet({ runId: 'pipeline-check', projectId: 'pipeline-project', plan: plan, candidates: {}, ports: ports, projectAssetDir: path.join(root, 'assets'), ledgerPath: ledgerPath });
    assert.strictEqual(result.pass, true); assert.strictEqual(generated, 2); assert.strictEqual(result.workItems[0].candidate.source, 'deterministicDerivation'); assert(result.workItems[0].candidate.derivationReceipts.length >= 3); assert.strictEqual(frameSet.isFrameSet(result.workItems[1].candidate), true); assert(result.workItems[1].candidate.frames.every(function(frame) { return fs.existsSync(frame.path); }));
    var staleReceipt = JSON.parse(JSON.stringify(result.workItems[0].semanticReviewReceipt)); staleReceipt.reviewPolicyFingerprint = 'stale-policy'; staleReceipt.decisions[0].compositionChecks = [];
    var staleCandidate = Object.assign({}, result.workItems[0].candidate, { source: 'assetLibrary', semanticReviewReceipt: staleReceipt }), rereviews = 0, freshPorts = Object.assign({}, ports, { reviewCandidate: async function(state) { rereviews++; return testPorts.createTestAssetEnginePorts({ outputDir: path.join(root, 'unused-review-provider') }).reviewCandidate(state); } });
    var refreshed = await pipeline.runWorkItem({ runId: 'stale-library-review', projectId: 'pipeline-project', workItem: plan.workItems[0], candidate: staleCandidate, ports: freshPorts, projectAssetDir: path.join(root, 'stale-library-review') });
    assert.strictEqual(refreshed.accepted, true); assert.strictEqual(rereviews, 1, 'stale AssetLibrary review evidence must be ignored and rerun under the current policy'); assert.notStrictEqual(refreshed.semanticReviewReceipt.reviewPolicyFingerprint, staleReceipt.reviewPolicyFingerprint);
    var staleBlocked = await pipeline.runWorkItem({ runId: 'stale-library-blocked', projectId: 'pipeline-project', workItem: plan.workItems[0], candidate: staleCandidate, ports: {}, projectAssetDir: path.join(root, 'stale-library-blocked') });
    assert.strictEqual(staleBlocked.accepted, false); assert.strictEqual(staleBlocked.debt.code, 'ASSET_SEMANTIC_REVIEW_EVIDENCE_INVALID');
    var repeated = await pipeline.runProductionSet({ runId: 'pipeline-check', projectId: 'pipeline-project', plan: plan, candidates: {}, ports: ports, projectAssetDir: path.join(root, 'assets'), ledgerPath: ledgerPath }); assert.strictEqual(repeated.pass, true); assert.strictEqual(generated, 2, 'accepted ledger state must be reused only while its immutable files still exist');
    fs.unlinkSync(result.workItems[0].candidate.path); var recovered = await pipeline.runProductionSet({ runId: 'pipeline-check', projectId: 'pipeline-project', plan: plan, candidates: {}, ports: ports, projectAssetDir: path.join(root, 'assets'), ledgerPath: ledgerPath }); assert.strictEqual(recovered.pass, true); assert.strictEqual(generated, 3, 'missing derived bytes must invalidate the stale ledger entry');
    fingerprint = 'test-provider.production.v2'; var invalidated = await pipeline.runProductionSet({ runId: 'pipeline-check', projectId: 'pipeline-project', plan: plan, candidates: {}, ports: ports, projectAssetDir: path.join(root, 'assets'), ledgerPath: ledgerPath }); assert.strictEqual(invalidated.pass, true); assert.strictEqual(generated, 5, 'provider workflow or model fingerprint changes must invalidate every generated ledger entry'); assert.strictEqual(JSON.parse(fs.readFileSync(ledgerPath, 'utf8')).schemaVersion, 4);
    var rejectingPorts = Object.assign({}, ports, { reviewCandidate: async function() { var error = new Error('wrong subject'); error.code = 'ASSET_FINAL_REVIEW_REJECTED'; error.owner = 'CLIPImageReviewer'; error.diagnostics = [{ phase: 'final-derived-asset', code: 'ASSET_SEMANTIC_REJECTED' }]; throw error; } }), rejected = await pipeline.runWorkItem({ runId: 'rejected', projectId: 'rejected', workItem: plan.workItems[0], ports: rejectingPorts, projectAssetDir: path.join(root, 'rejected'), maxAttempts: 2 }); assert.strictEqual(rejected.accepted, false); assert.strictEqual(rejected.debt.code, 'ASSET_FINAL_REVIEW_REJECTED'); assert.deepStrictEqual(rejected.debt.diagnostics, [{ phase: 'final-derived-asset', code: 'ASSET_SEMANTIC_REJECTED' }]); assert.strictEqual(rejected.debt.attemptDiagnostics.length, 2); assert.deepStrictEqual(rejected.debt.attemptDiagnostics.map(function(item) { return item.productionAttempt; }), [1, 2]);
    var blocked = await pipeline.runWorkItem({ runId: 'blocked', projectId: 'blocked', workItem: plan.workItems[0], ports: {}, projectAssetDir: path.join(root, 'blocked') }); assert.strictEqual(blocked.accepted, false); assert.strictEqual(blocked.debt.code, 'ASSET_PRODUCTION_FINGERPRINT_UNAVAILABLE');
    console.log('[AssetProductionPipeline] master generation, deterministic static/FrameSet derivation, stale-ledger recovery, and fail-closed creation passed');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
})().catch(function(error) { console.error(error); process.exit(1); });
