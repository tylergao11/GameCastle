var assert = require('assert');
var crypto = require('crypto');
var fs = require('fs');
var os = require('os');
var path = require('path');
var dictionary = require('../../packages/semantic/src/capability-semantic-dictionary');
var sourceContract = require('../../packages/semantic/src/game-semantic-source');
var semantic = require('@gamecastle/semantic-module');
var assemblyModule = require('@gamecastle/assembly-module');
var engine = require('../../packages/assets/src/asset-engine-langgraph');
var binder = require('../../packages/gdjs/src/gdjs-project-asset-binder');
var libraryPorts = require('../fixtures/test-asset-library-ports');

function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }

(async function() {
  var index = dictionary.loadIndex();
  var source = {
    schemaVersion: sourceContract.SCHEMA_VERSION,
    documentKind: 'game-semantic-source',
    dictionarySource: semantic.dictionary.source,
    game: { semanticId: 'font_resource_demo', name: 'Font Resource Demo' },
    entities: [{ semanticId: 'caption', roles: ['ui', 'text'], objectTypeRef: 'gdjs://object/TextObject::Text', behaviorTypeRefs: [], members: [] }],
    components: [],
    events: [],
    assetIntents: [{ semanticId: 'caption_font', roles: ['ui', 'font'], subject: 'caption', description: 'A readable UI font.', productionFamily: 'ui', styleId: 'gamecastle.style-dna.v1', constraints: {}, bindings: [] }],
    layoutIntents: [{ semanticId: 'caption_layout', roles: ['ui'], subject: 'caption', bounds: { width: 240, height: 48 }, relations: [{ semanticId: 'caption_anchor', layoutRef: 'gc-layout://screen/top-center', subjects: ['caption'] }], bindings: [] }],
    tuningPolicies: { relativeChange: { slight: { mode: 'percentage', value: 0.1 } } }
  };
  var semanticAssembly = semantic.compileSemanticAssembly(source);
var projectSeed = assemblyModule.createProjectSeed({ semanticAssembly: semanticAssembly });
var assembly = Object.assign({}, semanticAssembly, { projectSeed: projectSeed });
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
      assetLibraryPort: libraryPorts.createTestAssetLibraryPort(),
      modelPolicy: { provider: 'external-provider', simulated: false },
      projectAssetDir: path.join(root, 'resolved')
    });
    assert.strictEqual(result.assetProduction.pass, true, 'Accepted external font must not invoke or require an image-model path.');
    assert.strictEqual(result.assetWorld.slots[0].resourceKind, 'font');
    assert.strictEqual(result.assetWorld.slots[0].format, 'ttf');
    var bound = binder.bindResources(assembly.projectSeed, result.assetWorld);
    assert.strictEqual(bound.resources[0].kind, 'font');
    assert.strictEqual(bound.generatedCode.length, 1, 'The official Text configuration must compile with the accepted font resource.');
    var missing = await engine.runAssetEngine({ runId: 'missing-font-resource', assetRequirementContract: assembly.assetRequirements, assetLibraryPort: libraryPorts.createTestAssetLibraryPort(), modelPolicy: { provider: 'external-provider', simulated: false }, projectAssetDir: path.join(root, 'missing') });
    assert.strictEqual(missing.assetProduction.pass, false);
    assert.strictEqual(missing.debts[0].code, 'ASSET_PRODUCTION_EXTERNAL_RESOURCE_REQUIRED');
    assert.strictEqual(missing.assetWorld, null, 'missing external resources must not expose a partial AssetWorld');
    console.log('[NonImageResourceIngestion] accepted font resource is type-preserved, model-independent, source-bound, and libGD-compiled');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(function(error) { console.error(error); process.exit(1); });
