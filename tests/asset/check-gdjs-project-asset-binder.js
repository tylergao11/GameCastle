var assert = require('assert');
var crypto = require('crypto');
var fs = require('fs');
var os = require('os');
var path = require('path');
var dictionary = require('../../packages/semantic/src/capability-semantic-dictionary');
var sourceContract = require('../../packages/semantic/src/game-semantic-source');
var linker = require('../../packages/semantic/src/semantic-runtime-linker');
var binder = require('../../packages/gdjs/src/gdjs-project-asset-binder');
var assetWorldContract = require('../../packages/assets/src/asset-world');
var png = require('../../packages/assets/src/local-derivation-port');

function acceptedWorld(seed, spec) {
  var targetVisualSlotId = 'semantic.' + spec.subject + '.' + spec.semanticId;
  var revisionId = 'asset-revision.' + spec.sha256;
  var workItemPlanId = 'work.' + spec.semanticId;
  var reviewReceipt = { receiptId: 'asset-review.fixture.' + spec.semanticId, owner: 'FixtureReview', phase: 'final-derived-asset', workItemPlanId: workItemPlanId, targetVisualSlotId: targetVisualSlotId, modelFingerprint: 'fixture-model.v1', imageSha256s: [spec.sha256], semanticMargin: 1, styleMargin: 1, decision: 'accepted' };
  var workReceipt = { workItemPlanId: workItemPlanId, finalRevisionId: revisionId, targetVisualSlotId: targetVisualSlotId, deterministicEvidenceIds: [spec.sha256], reviewReceiptId: reviewReceipt.receiptId, styleId: 'gamecastle.style-dna.v1', decision: 'accepted' };
  var workReceiptId = 'work-acceptance.' + crypto.createHash('sha256').update(JSON.stringify(workReceipt)).digest('hex').slice(0, 24);
  var manifest = { meta: { status: 'ready' }, summary: { publishable: true }, sourceHash: seed.sourceHash, productionSetId: 'production.' + spec.semanticId, assets: [{ slotId: spec.semanticId, targetVisualSlotId: targetVisualSlotId, assetId: 'asset.' + spec.sha256.slice(0, 24), revisionId: revisionId, path: spec.path, sha256: spec.sha256, format: 'png', resourceKind: 'image', width: 1, height: 1, transparent: false, source: 'fixture', derivationReceipts: [] }] };
  var setReceipt = { productionSetId: manifest.productionSetId, workItemAcceptanceReceiptIds: [workReceiptId], requiredSlotCoverage: { expectedTargetVisualSlotIds: [targetVisualSlotId], acceptedTargetVisualSlotIds: [targetVisualSlotId], missingTargetVisualSlotIds: [], complete: true }, acceptedRevisionByTargetVisualSlotId: {}, decision: 'accepted' };
  setReceipt.acceptedRevisionByTargetVisualSlotId[targetVisualSlotId] = revisionId;
  return assetWorldContract.buildAcceptedAssetWorld({ assetManifest: manifest, productionSetAcceptanceReceipt: setReceipt, workItemAcceptanceReceipts: [workReceipt], reviewReceipts: [reviewReceipt] });
}

var index = dictionary.buildIndex();
var source = {
  schemaVersion: sourceContract.SCHEMA_VERSION,
  documentKind: 'game-semantic-source',
  dictionarySource: index.source,
  game: { semanticId: 'asset_binding_demo', name: 'Asset Binding Demo' },
  entities: [{ semanticId: 'player', roles: ['player'], objectTypeRef: 'gdjs://object/Sprite::Sprite', behaviorTypeRefs: [], members: [] }],
  components: [],
  events: [],
  assetIntents: [{ semanticId: 'player_visual', roles: ['player', 'visual'], subject: 'player', description: 'A readable player sprite.', productionFamily: 'character', styleId: 'gamecastle.style-dna.v1', constraints: { transparent: true }, bindings: [] }],
  layoutIntents: [{ semanticId: 'player_layout', roles: ['world'], subject: 'player', bounds: { width: 64, height: 64 }, relations: [{ semanticId: 'player_anchor', layoutRef: 'gc-layout://world/center', subjects: ['player'] }], bindings: [] }],
  tuningPolicies: { relativeChange: { slight: { mode: 'percentage', value: 0.1 } } }
};

var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-project-asset-binder-'));
try {
  var bytes = png.encodePng({ width: 1, height: 1, data: Buffer.from([64, 192, 255, 255]) });
  var digest = crypto.createHash('sha256').update(bytes).digest('hex');
  var imagePath = path.join(root, digest + '.png');
  fs.writeFileSync(imagePath, bytes);
  var seed = linker.assemble(source, { index: index }).projectSeed;
  var assetWorld = acceptedWorld(seed, { semanticId: 'player_visual', subject: 'player', path: imagePath, sha256: digest });
  var bound = binder.bindResources(seed, assetWorld);
  assert.strictEqual(bound.documentKind, 'gdjs-asset-bound-project-seed');
  assert.strictEqual(bound.resources.length, 1);
  assert.strictEqual(bound.resources[0].file, imagePath);
  assert.strictEqual(bound.project.objects[0].assetBinding.adapterId, 'gdjs.configuration.sprite-first-frame.v1');
  assert.strictEqual(bound.project.objects[0].assetBinding.resourceKind, 'image');
  assert.strictEqual(bound.generatedCode.length, 1, 'Bound project must compile through official libGD.');
  assert.throws(function() { binder.bindResources(seed, Object.assign({}, assetWorld, { sourceHash: 'semantic.other' })); }, function(error) { return error.code === 'SEMANTIC_ASSET_WORLD_SOURCE_MISMATCH'; });
  assert.throws(function() { binder.bindResources(seed, Object.assign({}, assetWorld, { contentHash: 'asset-world.forged' })); }, function(error) { return error.code === 'SEMANTIC_ASSET_WORLD_CONTENT_HASH_INVALID'; });
  var forgedReview = JSON.parse(JSON.stringify(assetWorld)); forgedReview.reviewReceipts[0].receiptId = 'asset-review.missing';
  assert.throws(function() { binder.bindResources(seed, forgedReview); }, function(error) { return error.code === 'SEMANTIC_ASSET_WORLD_REVIEW_INVALID'; });
  var otherWorld = acceptedWorld(seed, { semanticId: 'other_visual', subject: 'other', path: imagePath, sha256: digest });
  assert.throws(function() { binder.bindResources(seed, otherWorld); }, function(error) { return error.code === 'SEMANTIC_ASSET_REQUIRED_MISSING'; });
  fs.writeFileSync(imagePath, Buffer.from('tampered'));
  assert.throws(function() { binder.bindResources(seed, assetWorld); }, function(error) { return error.code === 'SEMANTIC_ASSET_FILE_HASH_MISMATCH'; });
  console.log('[GDJSProjectAssetBinder] accepted-world receipts, content identity, file hashes, and official Sprite configuration passed');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
