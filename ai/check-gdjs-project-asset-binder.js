var assert = require('assert');
var crypto = require('crypto');
var fs = require('fs');
var os = require('os');
var path = require('path');
var dictionary = require('./capability-semantic-dictionary');
var linker = require('./semantic-runtime-linker');
var binder = require('./gdjs-project-asset-binder');
var png = require('./local-derivation-port');

var index = dictionary.buildIndex();
var source = {
  schemaVersion: 4,
  documentKind: 'game-semantic-source',
  dictionarySource: index.source,
  game: { semanticId: 'asset_binding_demo', name: 'Asset Binding Demo' },
  entities: [{ semanticId: 'player', roles: ['player'], objectTypeRef: 'gdjs://object/Sprite::Sprite', behaviorTypeRefs: [], members: [] }],
  events: [],
  assetIntents: [{ semanticId: 'player_visual', roles: ['player', 'visual'], subject: 'player', description: 'A readable player sprite.', productionFamily: 'character', styleId: 'gamecastle.style-dna.v1', constraints: { transparent: true }, bindings: [] }],
  layoutIntents: [],
  tuningPolicies: { relativeChange: { slight: { mode: 'percentage', value: 0.1 } } }
};

var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-project-asset-binder-'));
try {
  var bytes = png.encodePng({ width: 1, height: 1, data: Buffer.from([64, 192, 255, 255]) });
  var digest = crypto.createHash('sha256').update(bytes).digest('hex');
  var imagePath = path.join(root, digest + '.png');
  fs.writeFileSync(imagePath, bytes);
  var seed = linker.assemble(source, { index: index }).projectSeed;
  var assetWorld = {
    schemaVersion: 2,
    documentKind: 'semantic-asset-world',
    sourceHash: seed.sourceHash,
    contentHash: 'asset-world.fixture',
    slots: [{ semanticId: 'player_visual', path: imagePath, sha256: digest, format: 'png', width: 1, height: 1, transparent: false }]
  };
  var bound = binder.bind(seed, assetWorld);
  assert.strictEqual(bound.documentKind, 'gdjs-bound-project');
  assert.strictEqual(bound.resources.length, 1);
  assert.strictEqual(bound.resources[0].file, imagePath);
  assert.strictEqual(bound.project.objects[0].assetBinding.adapterId, 'gdjs.configuration.sprite-first-frame.v1');
  assert.strictEqual(bound.project.objects[0].assetBinding.resourceKind, 'image');
  assert.strictEqual(bound.generatedCode.length, 1, 'Bound project must compile through official libGD.');
  assert.throws(function() { binder.bind(seed, Object.assign({}, assetWorld, { sourceHash: 'semantic.other' })); }, function(error) { return error.code === 'SEMANTIC_ASSET_WORLD_MISMATCH'; });
  assert.throws(function() { binder.bind(seed, Object.assign({}, assetWorld, { slots: [] })); }, function(error) { return error.code === 'SEMANTIC_ASSET_REQUIRED_MISSING'; });
  console.log('[GDJSProjectAssetBinder] source-bound accepted asset resources and official Sprite configuration passed');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
