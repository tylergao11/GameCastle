var assert = require('assert');
var crypto = require('crypto');
var fs = require('fs');
var os = require('os');
var path = require('path');
var dictionary = require('./capability-semantic-dictionary');
var linker = require('./semantic-runtime-linker');
var engine = require('./asset-engine-langgraph');
var binder = require('./gdjs-project-asset-binder');

function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }

(async function() {
  var index = dictionary.buildIndex();
  var source = {
    schemaVersion: 2,
    documentKind: 'game-semantic-source',
    dictionarySource: index.source,
    game: { semanticId: 'font_resource_demo', name: 'Font Resource Demo' },
    entities: [{ semanticId: 'caption', roles: ['ui', 'text'], objectTypeRef: 'gdjs://object/TextObject::Text', behaviorTypeRefs: [], members: [] }],
    events: [],
    assetIntents: [{ semanticId: 'caption_font', roles: ['ui', 'font'], subject: 'caption', description: 'A readable UI font.', productionFamily: 'ui', styleId: 'gamecastle.style-dna.v1', constraints: {}, bindings: [] }],
    layoutIntents: [],
    tuningPolicies: { relativeChange: { slight: { mode: 'percentage', value: 0.1 } } }
  };
  var assembly = linker.assemble(source, { index: index });
  var requirement = assembly.assetRequirements.requirements[0];
  assert.strictEqual(requirement.resourceKind, 'font');
  assert.deepStrictEqual(requirement.acceptedFormats, ['ttf', 'otf', 'woff', 'woff2']);

  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-non-image-resource-'));
  try {
    var bytes = Buffer.from('accepted font fixture; binary bytes are source-hash verified by this deterministic test\n', 'utf8');
    var file = path.join(root, 'caption.ttf');
    fs.writeFileSync(file, bytes);
    var result = await engine.runAssetEngine({
      runId: 'accepted-font-resource',
      assetRequirementContract: assembly.assetRequirements,
      localAssets: { caption_font: { path: file, sha256: sha(bytes), resourceKind: 'font', format: 'ttf', publishability: { playable: true, publishable: true, blocksFinalExport: false } } },
      modelPolicy: { provider: 'external-provider', simulated: false },
      projectAssetDir: path.join(root, 'resolved')
    });
    assert.strictEqual(result.assetProduction.pass, true, 'Accepted external font must not invoke or require an image-model path.');
    assert.strictEqual(result.assetWorld.slots[0].resourceKind, 'font');
    assert.strictEqual(result.assetWorld.slots[0].format, 'ttf');
    var bound = binder.bind(assembly.projectSeed, result.assetWorld);
    assert.strictEqual(bound.resources[0].kind, 'font');
    assert.strictEqual(bound.generatedCode.length, 1, 'The official Text configuration must compile with the accepted font resource.');
    var missing = await engine.runAssetEngine({ runId: 'missing-font-resource', assetRequirementContract: assembly.assetRequirements, modelPolicy: { provider: 'external-provider', simulated: false }, projectAssetDir: path.join(root, 'missing') });
    assert.strictEqual(missing.assetProduction.pass, false);
    assert.strictEqual(missing.debts[0].code, 'ASSET_PRODUCTION_EXTERNAL_RESOURCE_REQUIRED');
    console.log('[NonImageResourceIngestion] accepted font resource is type-preserved, model-independent, source-bound, and libGD-compiled');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(function(error) { console.error(error); process.exit(1); });
