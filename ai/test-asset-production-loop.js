var assert = require('assert');
var crypto = require('crypto');
var fs = require('fs');
var os = require('os');
var path = require('path');
var planner = require('./asset-production-planner');
var loop = require('./asset-production-loop-graph');
var png = require('./local-derivation-port');

function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function candidate(dir, name, width, height, pixel, source) {
  var raster = { width: width, height: height, data: new Uint8ClampedArray(width * height * 4) };
  for (var y = 2; y < height - 2; y++) for (var x = 2; x < width - 2; x++) { var at = (y * width + x) * 4; raster.data[at] = pixel[0]; raster.data[at + 1] = pixel[1]; raster.data[at + 2] = pixel[2]; raster.data[at + 3] = pixel[3]; }
  var bytes = png.encodePng(raster), digest = sha(bytes), file = path.join(dir, name + '-' + digest.slice(0, 8) + '.png'); fs.writeFileSync(file, bytes);
  return { assetId: name + '.' + digest.slice(0, 8), path: file, sha256: digest, format: 'png', width: width, height: height, transparent: true, semanticTags: [name], styleTags: ['gamecastle.style-dna.v1'], styleId: 'gamecastle.style-dna.v1', source: source || 'imageGeneration', status: source === 'imageEdit' ? 'variant' : 'generated', providerReceipt: { receiptId: 'provider.' + name + '.' + digest.slice(0, 8), workflowId: 'test-only' }, publishability: { playable: true, publishable: true, blocksFinalExport: false } };
}
function mask(dir, name, width, height, selectedCenter) {
  var raster = { width: width, height: height, data: new Uint8ClampedArray(width * height * 4) };
  for (var y = 0; y < height; y++) for (var x = 0; x < width; x++) { var at = (y * width + x) * 4, center = x >= 2 && x < width - 2 && y >= 2 && y < height - 2; raster.data[at] = raster.data[at + 1] = raster.data[at + 2] = 255; raster.data[at + 3] = center === selectedCenter ? 255 : 0; }
  var bytes = png.encodePng(raster), digest = sha(bytes), file = path.join(dir, name + '-' + digest.slice(0, 8) + '.png'); fs.writeFileSync(file, bytes);
  return { path: file, sha256: digest, width: width, height: height, format: 'png', transparent: true, providerReceipt: { receiptId: 'segment.' + digest.slice(0, 8) } };
}
function mutateCandidate(dir, base, name, source, mutate) {
  var raster = png.decodePng(fs.readFileSync(base.path)); mutate(raster); var bytes = png.encodePng(raster), digest = sha(bytes), file = path.join(dir, name + '-' + digest.slice(0, 8) + '.png'); fs.writeFileSync(file, bytes);
  return Object.assign({}, base, { assetId: name + '.' + digest.slice(0, 8), path: file, sha256: digest, source: source, status: 'variant', providerReceipt: { receiptId: 'provider.' + name + '.' + digest.slice(0, 8) } });
}
function request() { return { requestId: 'loop.semantic', projectId: 'loop-project', sourceHash: 'semantic.loop.fixture', requirements: [
  { semanticId: 'hero', subject: 'hero', description: 'Hero sprite', roles: ['hero'], productionFamily: 'character', recipeId: 'character-sprite.v1', styleId: 'gamecastle.style-dna.v1', constraints: { width: 12, height: 12 }, gdjsBindings: [] },
  { semanticId: 'enemy', subject: 'enemy', description: 'Enemy sprite', roles: ['enemy'], productionFamily: 'character', recipeId: 'character-sprite.v1', styleId: 'gamecastle.style-dna.v1', constraints: { width: 12, height: 12 }, gdjsBindings: [] },
  { semanticId: 'collectible', subject: 'collectible', description: 'Collectible sprite', roles: ['collectible'], productionFamily: 'prop', recipeId: 'prop-sprite.v1', styleId: 'gamecastle.style-dna.v1', constraints: { width: 12, height: 12 }, gdjsBindings: [] }
] }; }
function plan() { return planner.compile({ request: request() }); }

(async function() {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-production-loop-'));
  try {
    var generated = 0, reviewed = 0;
    var shortest = await loop.runProductionSet({ runId: 'shortest', projectId: 'loop-project', plan: plan(), projectAssetDir: root, ports: {
      generate: async function(state) { generated++; return candidate(root, state.slot.slotId, 12, 12, [238, 73, 58, 255]); },
      review: async function() { reviewed++; return { pass: true, repairable: false, issues: [], evidence: { confidence: 1 }, providerReceipt: { receiptId: 'review.pass' } }; }
    } });
    assert.strictEqual(shortest.pass, true);
    assert.strictEqual(generated, 3);
    assert.strictEqual(reviewed, 3);
    assert.strictEqual(shortest.acceptanceReceipt.requiredSlotCoverage.complete, true);
    shortest.workItems.forEach(function(item) { assert.strictEqual(item.observations.length, 1); assert.strictEqual(item.revisions.length, 1); assert.strictEqual(item.acceptanceReceipt.finalRevisionId, item.currentRevision.revisionId); });

    var durableGenerated = 0, ledgerPath = path.join(root, 'asset-production-ledger.json');
    var durableInput = { runId: 'durable', projectId: 'loop-project', plan: plan(), projectAssetDir: root, ledgerPath: ledgerPath, ports: {
      generate: async function(state) { durableGenerated++; return candidate(root, state.slot.slotId, 12, 12, [238, 73, 58, 255]); },
      review: async function() { return { pass: true, repairable: false, issues: [], evidence: { confidence: 1 }, providerReceipt: { receiptId: 'review.durable' } }; }
    } };
    await loop.runProductionSet(durableInput);
    var persistedLedger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    assert.strictEqual(Object.keys(persistedLedger.workItems).length, 3);
    assert(Object.keys(persistedLedger.workItems).every(function(id) { return persistedLedger.workItems[id].accepted === true; }), 'durable ledger terminal states: ' + JSON.stringify(Object.keys(persistedLedger.workItems).map(function(id) { return { id: id, accepted: persistedLedger.workItems[id].accepted, phase: persistedLedger.workItems[id].phase }; })));
    await loop.runProductionSet(durableInput);
    assert.strictEqual(durableGenerated, 3, 'durable accepted work items must not regenerate after a fresh invocation');
    assert(fs.existsSync(ledgerPath), 'production loop must persist an atomic durable ledger');

    var recoveryGenerated = 0, interrupted = false, recoveryLedger = path.join(root, 'asset-production-recovery-ledger.json'), recoveryPorts = {
      generate: async function(state) { recoveryGenerated++; return candidate(root, state.slot.slotId, 12, 12, [238, 73, 58, 255]); },
      review: async function() { return { pass: true, repairable: false, issues: [], evidence: { confidence: 1 }, providerReceipt: { receiptId: 'review.recovery' } }; }
    };
    await assert.rejects(function() { return loop.runProductionSet({ runId: 'recovery', projectId: 'loop-project', plan: plan(), projectAssetDir: root, ledgerPath: recoveryLedger, ports: recoveryPorts, onCheckpoint: function(snapshot) { if (!interrupted && snapshot.phase === 'observing') { interrupted = true; throw new Error('injected-process-stop'); } } }); }, /injected-process-stop/);
    var recovered = await loop.runProductionSet({ runId: 'recovery', projectId: 'loop-project', plan: plan(), projectAssetDir: root, ledgerPath: recoveryLedger, ports: recoveryPorts });
    assert.strictEqual(recovered.pass, true); assert.strictEqual(recoveryGenerated, 3, 'restart must resume the persisted observing phase without regenerating completed pixels');

    var backgroundReviews = 0;
    var cutout = await loop.runWorkItem({ runId: 'cutout', projectId: 'loop-project', productionSetId: plan().productionSetId, workItem: plan().workItems[0], projectAssetDir: root, ports: {
      generate: async function() { var item = candidate(root, 'hero', 12, 12, [70, 120, 240, 255]); var raster = png.decodePng(fs.readFileSync(item.path)); for (var i = 0; i < raster.width * raster.height; i++) raster.data[i * 4 + 3] = 255; var bytes = png.encodePng(raster); fs.writeFileSync(item.path, bytes); item.sha256 = sha(bytes); item.transparent = false; return item; },
      review: async function(state) { backgroundReviews++; return state.candidate.source === 'localDerivation' ? { pass: true, repairable: false, issues: [], evidence: { confidence: 1 }, providerReceipt: { receiptId: 'review.cutout.pass' } } : { pass: false, repairable: true, issues: ['background_contamination'], evidence: { confidence: 0.9 }, providerReceipt: { receiptId: 'review.background' } }; },
      segment: async function() { return mask(root, 'hero-mask', 12, 12, true); }
    } });
    assert.strictEqual(cutout.accepted, true);
    assert.strictEqual(cutout.maskRevisions.length, 1);
    assert.strictEqual(cutout.revisions.length, 2);
    assert(backgroundReviews >= 3, 'generation, mask observation, and cutout pixels must each be reviewed');
    assert.strictEqual(cutout.currentRevision.revisionKind, 'cutout');
    assert.notStrictEqual(cutout.observations[0].sourceRevisionId, cutout.observations[cutout.observations.length - 1].sourceRevisionId);

    var repaired = await loop.runWorkItem({ runId: 'repair', projectId: 'loop-project', productionSetId: plan().productionSetId, workItem: plan().workItems[0], projectAssetDir: root, ports: {
      generate: async function() { return candidate(root, 'hero', 12, 12, [238, 73, 58, 255]); },
      review: async function(state) { return state.candidate.source === 'imageEdit' ? { pass: true, repairable: false, issues: [], evidence: { confidence: 1 }, providerReceipt: { receiptId: 'review.repair.pass' } } : { pass: false, repairable: true, issues: ['local_shape_defect'], evidence: { confidence: 0.8 }, providerReceipt: { receiptId: 'review.repairable' } }; },
      segment: async function() { return mask(root, 'repair-mask', 12, 12, true); },
      edit: async function(state) { return mutateCandidate(root, state.candidate, 'hero-repaired', 'imageEdit', function(raster) { for (var y = 4; y < 8; y++) for (var x = 4; x < 8; x++) raster.data[(y * raster.width + x) * 4 + 1] = 120; }); }
    } });
    assert.strictEqual(repaired.accepted, true); assert.strictEqual(repaired.repairPlans.length, 1); assert.strictEqual(repaired.revisions[1].revisionKind, 'repair'); assert(repaired.observations.length >= 3, 'masked repair must be reobserved');

    var colored = await loop.runWorkItem({ runId: 'color', projectId: 'loop-project', productionSetId: plan().productionSetId, workItem: plan().workItems[0], projectAssetDir: root, ports: {
      generate: async function() { return candidate(root, 'hero', 12, 12, [238, 73, 58, 255]); },
      review: async function(state) { return state.candidate.source === 'colorDerivation' ? { pass: true, repairable: false, issues: [], evidence: { confidence: 1 }, providerReceipt: { receiptId: 'review.color.pass' } } : { pass: false, repairable: true, issues: ['palette_mismatch'], evidence: { confidence: 0.8 }, providerReceipt: { receiptId: 'review.color' } }; },
      colorize: async function(state) { return mutateCandidate(root, state.candidate, 'hero-colored', 'colorDerivation', function(raster) { for (var i = 0; i < raster.width * raster.height; i++) if (raster.data[i * 4 + 3] > 0) raster.data[i * 4 + 2] = 180; }); }
    } });
    assert.strictEqual(colored.accepted, true); assert.strictEqual(colored.colorPlans.length, 1); assert.strictEqual(colored.revisions[1].revisionKind, 'color'); assert.strictEqual(colored.observations.length, 2);

    var normalized = await loop.runWorkItem({ runId: 'normalize', projectId: 'loop-project', productionSetId: plan().productionSetId, workItem: plan().workItems[0], projectAssetDir: root, ports: {
      generate: async function() { return candidate(root, 'hero', 12, 12, [238, 73, 58, 255]); },
      review: async function(state) { return state.candidate.source === 'localDerivation' ? { pass: true, repairable: false, issues: [], evidence: { confidence: 1 }, providerReceipt: { receiptId: 'review.normalize.pass' } } : { pass: false, repairable: true, issues: ['outline_inconsistent'], evidence: { confidence: 0.8 }, providerReceipt: { receiptId: 'review.normalize' } }; },
      normalize: async function(state) { return mutateCandidate(root, state.candidate, 'hero-normalized', 'localDerivation', function(raster) { raster.data[(5 * raster.width + 5) * 4] = 237; }); }
    } });
    assert.strictEqual(normalized.accepted, true); assert.strictEqual(normalized.revisions[1].revisionKind, 'normalized'); assert.strictEqual(normalized.observations.length, 2);

    var denied = await loop.runProductionSet({ runId: 'partial-denied', projectId: 'loop-project', plan: plan(), projectAssetDir: root, ports: {
      generate: async function(state) { return candidate(root, state.slot.slotId, 12, 12, [238, 73, 58, 255]); },
      review: async function(state) { return state.slot.slotId === 'enemy' ? { pass: false, repairable: false, issues: ['wrong_subject'], evidence: { confidence: 0 }, providerReceipt: { receiptId: 'review.reject' } } : { pass: true, repairable: false, issues: [], evidence: { confidence: 1 }, providerReceipt: { receiptId: 'review.pass' } }; }
    } });
    assert.strictEqual(denied.pass, false);
    assert.strictEqual(denied.acceptanceReceipt.requiredSlotCoverage.complete, false);
    assert.deepStrictEqual(denied.acceptanceReceipt.requiredSlotCoverage.missingTargetVisualSlotIds, ['semantic.enemy.enemy']);
    assert(denied.workItems.find(function(item) { return item.workItem.slotId === 'enemy'; }).debt);

    var invalidMask = await loop.runWorkItem({ runId: 'bad-mask', projectId: 'loop-project', productionSetId: plan().productionSetId, workItem: plan().workItems[0], projectAssetDir: root, ports: {
      generate: async function() { var item = candidate(root, 'hero-bad-mask', 12, 12, [70, 120, 240, 255]); var raster = png.decodePng(fs.readFileSync(item.path)); for (var i = 0; i < raster.width * raster.height; i++) raster.data[i * 4 + 3] = 255; var bytes = png.encodePng(raster); fs.writeFileSync(item.path, bytes); item.sha256 = sha(bytes); return item; },
      review: async function() { return { pass: false, repairable: true, issues: ['background_contamination'], evidence: { confidence: 0.5 }, providerReceipt: { receiptId: 'review.bad-mask' } }; },
      segment: async function() { var item = mask(root, 'full-mask', 12, 12, true), raster = png.decodePng(fs.readFileSync(item.path)); for (var i = 0; i < raster.width * raster.height; i++) raster.data[i * 4 + 3] = 255; var bytes = png.encodePng(raster); fs.writeFileSync(item.path, bytes); item.sha256 = sha(bytes); return item; }
    } });
    assert.strictEqual(invalidMask.phase, 'debt');
    assert.strictEqual(invalidMask.debt.code, 'ASSET_PRODUCTION_MASK_EMPTY_OR_FULL');
    console.log('[AssetProductionLoop] shortest path, durable idempotency/restart, segment/cutout, RepairPlan, ColorPlan, normalize, forced reobservation, full coverage and partial-set rejection passed');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
})().catch(function(error) { console.error(error); process.exit(1); });
