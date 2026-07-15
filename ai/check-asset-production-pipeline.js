var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var planner = require('./asset-production-planner');
var pipeline = require('./asset-production-pipeline');
var testPorts = require('./test-asset-engine-ports');
var frameSet = require('./frame-set');

function request() { return { requestId: 'pipeline-check', projectId: 'pipeline-project', sourceHash: 'semantic.pipeline-check', requirements: [
  { semanticId: 'hero', subject: 'hero', description: 'Hero sprite', semanticTags: ['hero'], productionFamily: 'character', recipeId: 'character-sprite.v1', styleId: 'gamecastle.style-dna.v1', constraints: { width: 24, height: 24, transparent: true }, gdjsBindings: [] },
  { semanticId: 'hero_move', subject: 'hero', description: 'Hero movement', semanticTags: ['hero'], productionFamily: 'character-animation', recipeId: 'character-frame-set.v1', styleId: 'gamecastle.style-dna.v1', constraints: { width: 24, height: 24, transparent: true }, animation: { initialStateId: 'move', states: [{ stateId: 'move', loop: true, frameCount: 4, frameDurationMs: 90, derivationProfileId: 'move-bob' }] }, gdjsBindings: [] }
] }; }

(async function() {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-production-pipeline-'));
  try {
    var plan = planner.compile({ request: request() }), generated = 0, ports = testPorts.createTestAssetEnginePorts({ outputDir: path.join(root, 'masters') }), original = ports.generateMaster; ports.generateMaster = async function(state) { generated++; return original(state); };
    var ledgerPath = path.join(root, 'ledger.json'), result = await pipeline.runProductionSet({ runId: 'pipeline-check', projectId: 'pipeline-project', plan: plan, candidates: {}, ports: ports, projectAssetDir: path.join(root, 'assets'), ledgerPath: ledgerPath });
    assert.strictEqual(result.pass, true); assert.strictEqual(generated, 2); assert.strictEqual(result.workItems[0].candidate.source, 'deterministicDerivation'); assert(result.workItems[0].candidate.derivationReceipts.length >= 3); assert.strictEqual(frameSet.isFrameSet(result.workItems[1].candidate), true); assert(result.workItems[1].candidate.frames.every(function(frame) { return fs.existsSync(frame.path); }));
    var repeated = await pipeline.runProductionSet({ runId: 'pipeline-check', projectId: 'pipeline-project', plan: plan, candidates: {}, ports: ports, projectAssetDir: path.join(root, 'assets'), ledgerPath: ledgerPath }); assert.strictEqual(repeated.pass, true); assert.strictEqual(generated, 2, 'accepted ledger state must be reused only while its immutable files still exist');
    fs.unlinkSync(result.workItems[0].candidate.path); var recovered = await pipeline.runProductionSet({ runId: 'pipeline-check', projectId: 'pipeline-project', plan: plan, candidates: {}, ports: ports, projectAssetDir: path.join(root, 'assets'), ledgerPath: ledgerPath }); assert.strictEqual(recovered.pass, true); assert.strictEqual(generated, 3, 'missing derived bytes must invalidate the stale ledger entry');
    var blocked = await pipeline.runWorkItem({ runId: 'blocked', projectId: 'blocked', workItem: plan.workItems[0], ports: {}, projectAssetDir: path.join(root, 'blocked') }); assert.strictEqual(blocked.accepted, false); assert.strictEqual(blocked.debt.code, 'MASTER_IMAGE_PROVIDER_UNAVAILABLE');
    console.log('[AssetProductionPipeline] master generation, deterministic static/FrameSet derivation, stale-ledger recovery, and fail-closed creation passed');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
})().catch(function(error) { console.error(error); process.exit(1); });
