var assert = require('assert');
var crypto = require('crypto');
var fs = require('fs');
var os = require('os');
var path = require('path');
var dictionary = require('../../packages/semantic/src/capability-semantic-dictionary');
var semantic = require('@gamecastle/semantic-module');
var assemblyModule = require('@gamecastle/assembly-module');
var binder = require('../../packages/gdjs/src/gdjs-project-asset-binder');
var frameSet = require('../../packages/assets/src/frame-set');
var assetWorld = require('../../packages/assets/src/asset-world');
var png = require('../../packages/assets/src/local-derivation-port');
var sourceContract = require('../../packages/semantic/src/game-semantic-source');

var index = dictionary.loadIndex();
var source = { schemaVersion: sourceContract.SCHEMA_VERSION, documentKind: 'game-semantic-source', dictionarySource: semantic.dictionary.source, game: { semanticId: 'frame_set_binding_demo', name: 'Frame Set Binding Demo' }, entities: [{ semanticId: 'player', roles: ['player'], objectTypeRef: 'gdjs://object/Sprite::Sprite', behaviorTypeRefs: [], members: [] }], components: [], events: [], assetIntents: [{ semanticId: 'player_animation', roles: ['player', 'visual'], subject: 'player', description: 'A readable player movement animation.', productionFamily: 'character', styleId: 'gamecastle.style-dna.v1', constraints: { transparent: true }, bindings: [] }], layoutIntents: [{ semanticId: 'player_layout', roles: ['world'], subject: 'player', bounds: { width: 64, height: 64 }, relations: [{ semanticId: 'player_anchor', layoutRef: 'gc-layout://world/center', subjects: ['player'] }], bindings: [] }], tuningPolicies: { relativeChange: { slight: { mode: 'percentage', value: 0.1 } } } };
var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-project-frame-set-binder-'));
try {
  function acceptedWorld(seed, revision, suffix) {
    var target = 'semantic.player.player_animation', workItemPlanId = 'work.player_animation.' + suffix, reviewReceipt = { receiptId: 'asset-review.fixture.' + suffix, owner: 'FixtureReview', phase: 'final-derived-asset', workItemPlanId: workItemPlanId, targetVisualSlotId: target, modelFingerprint: 'fixture-model.v1', imageSha256s: revision.frames.map(function(frame) { return frame.sha256; }), semanticMargin: 1, styleMargin: 1, decision: 'accepted' };
    var workReceipt = { workItemPlanId: workItemPlanId, finalRevisionId: revision.revisionId, targetVisualSlotId: target, deterministicEvidenceIds: [revision.contentHash, revision.acceptanceReceiptId], reviewReceiptId: reviewReceipt.receiptId, styleId: 'gamecastle.style-dna.v1', decision: 'accepted' };
    var workReceiptId = 'work-acceptance.' + crypto.createHash('sha256').update(JSON.stringify(workReceipt)).digest('hex').slice(0, 24), productionSetId = 'production.frame-set.' + suffix, revisions = {};
    revisions[target] = revision.revisionId;
    return assetWorld.buildAcceptedAssetWorld({ assetManifest: { meta: { status: 'ready' }, summary: { publishable: true }, sourceHash: seed.sourceHash, productionSetId: productionSetId, assets: [{ slotId: 'player_animation', targetVisualSlotId: target, assetId: revision.revisionId, revisionId: revision.revisionId, frameSet: revision, resourceKind: 'image', source: 'fixture' }] }, productionSetAcceptanceReceipt: { productionSetId: productionSetId, workItemAcceptanceReceiptIds: [workReceiptId], requiredSlotCoverage: { expectedTargetVisualSlotIds: [target], acceptedTargetVisualSlotIds: [target], missingTargetVisualSlotIds: [], complete: true }, acceptedRevisionByTargetVisualSlotId: revisions, decision: 'accepted' }, workItemAcceptanceReceipts: [workReceipt], reviewReceipts: [reviewReceipt] });
  }
  function file(name, rgba) { var bytes = png.encodePng({ width: 2, height: 2, data: Buffer.from(rgba) }); var target = path.join(root, name + '.png'); fs.writeFileSync(target, bytes); return { path: target, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }; }
  var first = file('move-0', [64, 192, 255, 255, 64, 192, 255, 255, 64, 192, 255, 255, 64, 192, 255, 255]);
  var second = file('move-1', [255, 192, 64, 255, 255, 192, 64, 255, 255, 192, 64, 255, 255, 192, 64, 255]);
  var candidate = { schemaVersion: frameSet.contract.schemaVersion, documentKind: frameSet.contract.candidateDocumentKind, resourceKind: frameSet.contract.resource.resourceKind, format: frameSet.contract.resource.format, initialStateId: 'move', canvas: { width: 2, height: 2 }, anchor: { x: 1, y: 2 }, frames: [{ frameId: 'move.0', sha256: first.sha256, path: first.path, width: 2, height: 2, durationMs: 100 }, { frameId: 'move.1', sha256: second.sha256, path: second.path, width: 2, height: 2, durationMs: 100 }], states: [{ stateId: 'move', frameIds: ['move.0', 'move.1'], loop: true }] };
  var revision = frameSet.accept(candidate, 'acceptance.frames.player.move.v1');
  var seed = assemblyModule.createProjectSeed({ source: source });
  var world = acceptedWorld(seed, revision, 'uniform');
  var bound = binder.bindResources(seed, world);
  assert.strictEqual(bound.resources.length, 2);
  assert.strictEqual(bound.project.objects[0].assetBinding.adapterId, 'gdjs.configuration.sprite-frame-set.v1');
  assert.strictEqual(bound.project.objects[0].assetBinding.frameSet.states[0].durationMs, 100);
  assert.strictEqual(bound.generatedCode.length, 1, 'FrameSet projection must compile through official libGD.');
  var uneven = frameSet.accept(Object.assign({}, candidate, { frames: [Object.assign({}, candidate.frames[0], { durationMs: 80 }), Object.assign({}, candidate.frames[1], { durationMs: 120 })] }), 'acceptance.frames.player.uneven.v1');
  assert.throws(function() { binder.bindResources(seed, acceptedWorld(seed, uneven, 'uneven')); }, function(error) { return error.code === 'FRAME_SET_GDJS_VARIABLE_TIMING_UNSUPPORTED'; });
  console.log('[GDJSProjectFrameSetBinder] accepted uniform-timing FrameSetRevision is source-bound and libGD-compiled; variable timing is fail-closed');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
