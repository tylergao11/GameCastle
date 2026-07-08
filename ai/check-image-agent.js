var fs = require('fs');
var path = require('path');
var os = require('os');
var imageAgent = require('./image-agent');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-image-agent-'));
  try {
    var result = await imageAgent.generateImage({
      assetId: 'sprite.player.runner',
      kind: 'sprite',
      width: 32,
      height: 48,
      transparent: true,
      color: '#4488FF',
      semanticTags: ['player', 'hero', 'runner'],
      styleTags: ['arcade', 'bright'],
    }, tmpDir);

    assert(fs.existsSync(result.path), 'generated image file must exist');
    assert(result.format === 'png', 'default format must be png');
    assert(result.width === 32, 'width must match request');
    assert(result.height === 48, 'height must match request');
    assert(typeof result.sha1 === 'string' && result.sha1.length === 40, 'sha1 must be 40-char hex');

    var hint = result.distillHint;
    assert(hint.schemaVersion === 1, 'distillHint schemaVersion must be 1');
    assert(hint.assetId === 'sprite.player.runner', 'distillHint must preserve assetId');
    assert(hint.kind === 'sprite', 'distillHint must preserve kind');
    assert(hint.generator === 'ImageAgent', 'distillHint generator must be ImageAgent');
    assert(hint.generatorVersion === 'stub', 'generator must be stub until real model is wired');
    assert(hint.reuseHint.reusable === true, 'stub assets should be marked reusable');
    assert(hint.reuseHint.scope === 'private', 'stub assets should be private scope');
    assert(hint.quality.needsDistillation === true, 'stub assets must need distillation');
    assert(Array.isArray(hint.semanticTags), 'semanticTags must be array');
    assert(hint.semanticTags.indexOf('player') >= 0, 'semanticTags must include player');
    assert(Array.isArray(hint.styleTags), 'styleTags must be array');

    console.log('[ImageAgent] generateImage + DistillHint passed');

    // Verify missing required fields throw
    var threw = false;
    try { await imageAgent.generateImage({}, tmpDir); } catch (e) { threw = true; }
    assert(threw, 'generateImage must throw without assetId');

    console.log('[ImageAgent] all passed');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch(function(e) { console.error(e); process.exit(1); });
