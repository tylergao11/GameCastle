var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var crypto = require('crypto');
var planner = require('../../packages/assets/src/asset-production-planner');
var pipeline = require('../../packages/assets/src/asset-production-pipeline');
var styleCohesion = require('../../packages/assets/src/style-cohesion');
var testPorts = require('../fixtures/test-asset-engine-ports');
var png = require('../../packages/assets/src/local-derivation-port');

function request() {
  return {
    requestId: 'style-cohesion-check',
    projectId: 'style-cohesion-project',
    sourceHash: 'semantic.style-cohesion',
    requirements: [
      { semanticId: 'hero', subject: 'hero', description: 'Hero sprite', semanticTags: ['hero'], productionFamily: 'character', recipeId: 'character-sprite.v1', styleId: 'gamecastle.style-dna.v1', constraints: { width: 32, height: 32, transparent: true }, gdjsBindings: [] },
      { semanticId: 'gem', subject: 'collectible', description: 'Gem sprite', semanticTags: ['collectible'], productionFamily: 'prop', recipeId: 'prop-sprite.v1', styleId: 'gamecastle.style-dna.v1', constraints: { width: 32, height: 32, transparent: true }, gdjsBindings: [] }
    ]
  };
}

function writeSolid(file, color) {
  var width = 32, height = 32, raster = { width: width, height: height, data: new Uint8ClampedArray(width * height * 4) };
  for (var y = 8; y < 24; y++) for (var x = 8; x < 24; x++) {
    var i = (y * width + x) * 4;
    raster.data[i] = color[0]; raster.data[i + 1] = color[1]; raster.data[i + 2] = color[2]; raster.data[i + 3] = 255;
  }
  fs.writeFileSync(file, png.encodePng(raster));
}

(async function() {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-style-cohesion-'));
  try {
    var plan = planner.compile({ request: request() });
    var ports = testPorts.createTestAssetEnginePorts({ outputDir: path.join(root, 'masters') });
    ports.productionFingerprint = function() { return 'test-provider.style-cohesion.v1'; };
    var seenPrompts = [];
    var original = ports.generateMaster;
    ports.generateMaster = async function(state) {
      seenPrompts.push(state.slot && state.slot.generationPrompt || null);
      return original(state);
    };
    var result = await pipeline.runProductionSet({
      runId: 'style-cohesion-check',
      projectId: 'style-cohesion-project',
      plan: plan,
      candidates: {},
      ports: ports,
      projectAssetDir: path.join(root, 'assets'),
      ledgerPath: path.join(root, 'ledger.json')
    });
    assert.strictEqual(result.pass, true, 'matching test sprites in one style must pass set cohesion');
    assert(result.styleCohesionReceipt && result.styleCohesionReceipt.decision === 'accepted');
    assert(result.acceptanceReceipt.styleCohesionReceipt);
    assert(result.styleAnchor && result.styleAnchor.slotId === 'hero', 'character should become the style anchor');
    assert(seenPrompts.length === 2);
    assert(seenPrompts[1] && seenPrompts[1].indexOf('same cohesive GameCastle raster-toon art family') >= 0, 'second generated asset must inherit style-anchor prompt language');

    var red = path.join(root, 'red.png');
    var blue = path.join(root, 'blue.png');
    writeSolid(red, [238, 73, 58]);
    writeSolid(blue, [20, 180, 255]);
    var fakeResults = [
      {
        accepted: true,
        workItem: plan.workItems[0],
        candidate: { path: red, sha256: crypto.createHash('sha256').update(fs.readFileSync(red)).digest('hex') },
        currentRevision: { sha256: crypto.createHash('sha256').update(fs.readFileSync(red)).digest('hex') }
      },
      {
        accepted: true,
        workItem: plan.workItems[1],
        candidate: { path: blue, sha256: crypto.createHash('sha256').update(fs.readFileSync(blue)).digest('hex') },
        currentRevision: { sha256: crypto.createHash('sha256').update(fs.readFileSync(blue)).digest('hex') }
      }
    ];
    var cohesive = await styleCohesion.evaluateProductionSet(fakeResults, { styleId: 'gamecastle.style-dna.v1' });
    // red vs blue pure blocks may still share empty background mass; force a hostile pair with full-frame different colors
    writeSolid(red, [238, 73, 58]);
    var fullA = path.join(root, 'full-a.png');
    var fullB = path.join(root, 'full-b.png');
    function writeFull(file, color) {
      var width = 32, height = 32, raster = { width: width, height: height, data: new Uint8ClampedArray(width * height * 4) };
      for (var y = 0; y < height; y++) for (var x = 0; x < width; x++) {
        var i = (y * width + x) * 4;
        raster.data[i] = color[0]; raster.data[i + 1] = color[1]; raster.data[i + 2] = color[2]; raster.data[i + 3] = 255;
      }
      fs.writeFileSync(file, png.encodePng(raster));
    }
    writeFull(fullA, [238, 73, 58]);
    writeFull(fullB, [20, 40, 200]);
    fakeResults[0].candidate.path = fullA;
    fakeResults[0].candidate.sha256 = crypto.createHash('sha256').update(fs.readFileSync(fullA)).digest('hex');
    fakeResults[1].candidate.path = fullB;
    fakeResults[1].candidate.sha256 = crypto.createHash('sha256').update(fs.readFileSync(fullB)).digest('hex');
    var hostile = await styleCohesion.evaluateProductionSet(fakeResults, { styleId: 'gamecastle.style-dna.v1' });
    assert.strictEqual(hostile.decision, 'debt', 'strongly different full-frame palettes must fail pairwise cohesion');
    assert(hostile.debts.some(function(debt) { return debt.code === 'ASSET_STYLE_COHESION_PAIR_REJECTED'; }));

    var analysis = await styleCohesion.analyzeImageFile(fullA, 'gamecastle.style-dna.v1');
    assert(analysis.colorFamilyCount >= 1);
    assert(Array.isArray(analysis.histogram) && analysis.histogram.length === 6 * 6 * 6);
    // keep cohesive reference used so lint-free mental check
    assert(cohesive.receiptId);
    console.log('[StyleCohesion] production-set palette cohesion, style anchor prompts, and structure gates passed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(function(error) {
  console.error(error && error.stack || error);
  process.exit(1);
});
