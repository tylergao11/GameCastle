var assert = require('assert');
var crypto = require('crypto');
var fs = require('fs');
var os = require('os');
var path = require('path');
var dictionary = require('./capability-semantic-dictionary');
var linker = require('./semantic-runtime-linker');
var binder = require('./gdjs-project-asset-binder');
var frameSet = require('./frame-set');
var assetWorld = require('./asset-world');
var png = require('./local-derivation-port');
var sourceContract = require('./game-semantic-source');

var index = dictionary.buildIndex();
var source = { schemaVersion: sourceContract.SCHEMA_VERSION, documentKind: 'game-semantic-source', dictionarySource: index.source, game: { semanticId: 'frame_set_binding_demo', name: 'Frame Set Binding Demo' }, entities: [{ semanticId: 'player', roles: ['player'], objectTypeRef: 'gdjs://object/Sprite::Sprite', behaviorTypeRefs: [], members: [] }], components: [], events: [], assetIntents: [{ semanticId: 'player_animation', roles: ['player', 'visual'], subject: 'player', description: 'A readable player movement animation.', productionFamily: 'character', styleId: 'gamecastle.style-dna.v1', constraints: { transparent: true }, bindings: [] }], layoutIntents: [{ semanticId: 'player_layout', roles: ['world'], subject: 'player', bounds: { width: 64, height: 64 }, relations: [{ semanticId: 'player_anchor', layoutRef: 'gc-layout://world/center', subjects: ['player'] }], bindings: [] }], tuningPolicies: { relativeChange: { slight: { mode: 'percentage', value: 0.1 } } } };
var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-project-frame-set-binder-'));
try {
  function file(name, rgba) { var bytes = png.encodePng({ width: 2, height: 2, data: Buffer.from(rgba) }); var target = path.join(root, name + '.png'); fs.writeFileSync(target, bytes); return { path: target, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }; }
  var first = file('move-0', [64, 192, 255, 255, 64, 192, 255, 255, 64, 192, 255, 255, 64, 192, 255, 255]);
  var second = file('move-1', [255, 192, 64, 255, 255, 192, 64, 255, 255, 192, 64, 255, 255, 192, 64, 255]);
  var candidate = { schemaVersion: frameSet.contract.schemaVersion, documentKind: frameSet.contract.candidateDocumentKind, resourceKind: frameSet.contract.resource.resourceKind, format: frameSet.contract.resource.format, initialStateId: 'move', canvas: { width: 2, height: 2 }, anchor: { x: 1, y: 2 }, frames: [{ frameId: 'move.0', sha256: first.sha256, path: first.path, width: 2, height: 2, durationMs: 100 }, { frameId: 'move.1', sha256: second.sha256, path: second.path, width: 2, height: 2, durationMs: 100 }], states: [{ stateId: 'move', frameIds: ['move.0', 'move.1'], loop: true }] };
  var revision = frameSet.accept(candidate, 'acceptance.frames.player.move.v1');
  var seed = linker.assemble(source, { index: index }).projectSeed;
  var world = assetWorld.buildAssetWorld({ sourceHash: seed.sourceHash, productionSetId: 'production.frame-set.fixture', assets: [{ slotId: 'player_animation', targetVisualSlotId: 'semantic.player.player_animation', assetId: revision.revisionId, frameSet: revision, source: 'assetLibrary' }] });
  var bound = binder.bindResources(seed, world);
  assert.strictEqual(bound.resources.length, 2);
  assert.strictEqual(bound.project.objects[0].assetBinding.adapterId, 'gdjs.configuration.sprite-frame-set.v1');
  assert.strictEqual(bound.project.objects[0].assetBinding.frameSet.states[0].durationMs, 100);
  assert.strictEqual(bound.generatedCode.length, 1, 'FrameSet projection must compile through official libGD.');
  var uneven = frameSet.accept(Object.assign({}, candidate, { frames: [Object.assign({}, candidate.frames[0], { durationMs: 80 }), Object.assign({}, candidate.frames[1], { durationMs: 120 })] }), 'acceptance.frames.player.uneven.v1');
  assert.throws(function() { binder.bindResources(seed, Object.assign({}, world, { slots: [{ semanticId: 'player_animation', frameSet: uneven }] })); }, function(error) { return error.code === 'FRAME_SET_GDJS_VARIABLE_TIMING_UNSUPPORTED'; });
  console.log('[GDJSProjectFrameSetBinder] accepted uniform-timing FrameSetRevision is source-bound and libGD-compiled; variable timing is fail-closed');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
