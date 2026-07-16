var assert = require('assert');
var dictionary = require('../../packages/semantic/src/capability-semantic-dictionary');
var semantic = require('@gamecastle/semantic-module');
var sourceContract = require('../../packages/semantic/src/game-semantic-source');
var delivery = require('../../packages/product/src/product-delivery-run');
var projector = require('../../packages/product/src/asset-card-projector');

var index = dictionary.loadIndex();
var source = sourceContract.validateSource({
  schemaVersion: sourceContract.SCHEMA_VERSION,
  documentKind: 'game-semantic-source',
  dictionarySource: semantic.dictionary.source,
  game: { semanticId: 'asset_card_demo', name: 'Asset Card Demo' },
  entities: [{ semanticId: 'player', roles: ['player'], objectTypeRef: 'gdjs://object/Sprite::Sprite', behaviorTypeRefs: [], members: [] }],
  components: [],
  events: [],
  assetIntents: [{ semanticId: 'player_visual', roles: ['player', 'visual'], subject: 'player', description: 'A readable player sprite.', productionFamily: 'character', styleId: 'gamecastle.style-dna.v1', constraints: { transparent: true }, bindings: [] }],
  layoutIntents: [],
  tuningPolicies: { relativeChange: { slight: { mode: 'percentage', value: 0.1 } } }
}, { index: index });
var sourceHash = sourceContract.sourceHash(source);
var run = delivery.create({ deliveryId: 'asset-card-demo', projectId: 'asset-card-demo', sourceHash: sourceHash });
run = delivery.beginStage(run, 'asset');
var assetWorld = { contentHash: 'semantic-asset-world.accepted', productionSetId: 'production.accepted', slots: [{ semanticId: 'player_visual', assetId: 'asset.player', revisionId: 'revision.player', resourceKind: 'image', format: 'png', sha256: 'pixels.player' }] };
var cards = projector.project({
  source: source,
  index: index,
  deliveryRun: run,
  assembly: { assetRequirements: { requirements: [{ semanticId: 'player_visual', subject: 'player', description: 'A readable player sprite.' }] } },
  assetState: { assetWorld: assetWorld, debts: [], assetProduction: { plan: { productionSetId: 'production.accepted' } }, assetProductionReport: { workItemReports: [{ semanticId: 'player_visual', loopState: { attempt: 2 } }] } }
});
assert.strictEqual(cards.documentKind, 'asset-card-set');
assert.strictEqual(cards.sourceHash, sourceHash);
assert.strictEqual(cards.assetWorldHash, assetWorld.contentHash);
assert.strictEqual(cards.cards[0].lifecycle.status, 'accepted');
assert.strictEqual(cards.cards[0].lifecycle.attempt, 2);
assert.strictEqual(cards.cards[0].result.revisionId, 'revision.player');
assert(/^asset-card-set\./.test(cards.contentHash));

var changed = JSON.parse(JSON.stringify(source));
changed.assetIntents[0].description = 'A different player sprite.';
assert.throws(function() { projector.project({ source: changed, index: index, deliveryRun: run, assetState: { assetWorld: assetWorld } }); }, function(error) { return error.code === 'ASSET_CARD_SOURCE_MISMATCH'; }, 'AssetCard cannot bridge two source hashes.');
cards.cards[0].intent.description = 'caller mutation';
assert.strictEqual(source.assetIntents[0].description, 'A readable player sprite.', 'AssetCard is a detached read-only projection, never an authored Source.');
assert.strictEqual(run.currentSourceHash, sourceHash, 'AssetCard mutation cannot alter the delivery ledger.');

console.log('[AssetCardProjector] source-bound detached projection, lifecycle evidence, and non-authority checks passed');
