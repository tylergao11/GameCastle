var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var dictionary = require('../../packages/semantic/src/capability-semantic-dictionary');
var sourceContract = require('../../packages/semantic/src/game-semantic-source');
var linker = require('../../packages/semantic/src/semantic-runtime-linker');
var engine = require('../../packages/assets/src/asset-engine-langgraph');
var outboxModule = require('../../packages/assets/src/asset-publication-outbox');
var publisher = require('../../packages/assets/src/asset-library-publisher');
var frameSet = require('../../packages/assets/src/frame-set');
var libraryPorts = require('../fixtures/test-asset-library-ports');
var enginePorts = require('../fixtures/test-asset-engine-ports');
var binder = require('../../packages/gdjs/src/gdjs-project-asset-binder');

var index = dictionary.buildIndex();
var source = { schemaVersion: sourceContract.SCHEMA_VERSION, documentKind: 'game-semantic-source', dictionarySource: index.source, game: { semanticId: 'animated_asset_demo', name: 'Animated Asset Demo' }, entities: [{ semanticId: 'player', roles: ['player'], objectTypeRef: 'gdjs://object/Sprite::Sprite', behaviorTypeRefs: [], members: [] }], components: [], events: [], assetIntents: [{ semanticId: 'player_animation', roles: ['player', 'visual'], subject: 'player', description: 'A readable player movement animation.', productionFamily: 'character-animation', styleId: 'gamecastle.style-dna.v1', constraints: { transparent: true }, animation: { initialStateId: 'idle', states: [{ stateId: 'idle', loop: true, frameCount: 4, frameDurationMs: 120, derivationProfileId: 'idle-bob' }, { stateId: 'move', loop: true, frameCount: 4, frameDurationMs: 90, derivationProfileId: 'move-bob' }] }, bindings: [] }], layoutIntents: [{ semanticId: 'player_layout', roles: ['world'], subject: 'player', bounds: { width: 64, height: 64 }, relations: [{ semanticId: 'player_anchor', layoutRef: 'gc-layout://world/center', subjects: ['player'] }], bindings: [] }], tuningPolicies: { relativeChange: { slight: { mode: 'percentage', value: 0.1 } } } };
var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-animated-asset-engine-'));
(async function() {
  try {
    var assembly = linker.assemble(source, { index: index });
    assert.strictEqual(assembly.assetRequirements.requirements[0].artifactKind, 'frame-set');
    var libraryPort = libraryPorts.createTestAssetLibraryPort();
    var result = await engine.runAssetEngine({ runId: 'animated-asset-first', assetRequirementContract: assembly.assetRequirements, ports: enginePorts.createTestAssetEnginePorts({ outputDir: path.join(root, 'generated') }), assetLibraryPort: libraryPort, modelPolicy: { provider: 'deepseek', simulated: true }, projectAssetDir: path.join(root, 'assets') });
    assert.strictEqual(result.accepted, true);
    assert.strictEqual(result.assetWorld.slots[0].frameSet.documentKind, frameSet.contract.documentKind);
    assert.strictEqual(result.assetPublicationOutboxEntries.length, 1);
    await publisher.drain({ outbox: outboxModule.create({ path: result.assetPublicationOutbox.path }), assetLibraryPort: libraryPort });
    assert.strictEqual(binder.bindResources(assembly.projectSeed, result.assetWorld).project.objects[0].assetBinding.adapterId, 'gdjs.configuration.sprite-frame-set.v1');
    var reused = await engine.runAssetEngine({ runId: 'animated-asset-reuse', assetRequirementContract: assembly.assetRequirements, assetLibraryPort: libraryPort, modelPolicy: { provider: 'external-provider', simulated: false }, projectAssetDir: path.join(root, 'reuse') });
    assert.strictEqual(reused.accepted, true);
    assert.strictEqual(reused.assetWorld.slots[0].frameSet.revisionId, result.assetWorld.slots[0].frameSet.revisionId);
    assert.strictEqual(reused.assetPublicationOutboxEntries.length, 0);
    console.log('[AnimatedAssetEngine] semantic animation intent, FrameSet acceptance, library publication/reuse, AssetWorld, and official GDJS binding passed');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
})().catch(function(error) { console.error(error); process.exit(1); });
