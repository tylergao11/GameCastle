/**
 * Offline style-margin baseline probe.
 * Builds synthetic good/bad sprites and reviews the real rembg diagnostic asset
 * through the pinned CLIPImageReviewer + Style DNA review texts.
 */
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var styleDNA = require('../../packages/assets/src/style-dna');
var reviewer = require('../../packages/assets/src/clip-image-reviewer');

function crc32(buf) {
  var table = crc32.table;
  if (!table) {
    table = crc32.table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
  }
  var crc = 0xffffffff;
  for (var i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  var len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  var typeBuf = Buffer.from(type, 'ascii');
  var body = Buffer.concat([typeBuf, data]);
  var crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  var raw = Buffer.alloc((width * 4 + 1) * height);
  for (var y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  var zlib = require('zlib');
  var ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function fillCircle(rgba, w, h, cx, cy, r, color) {
  for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
    if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) {
      var i = (y * w + x) * 4;
      rgba[i] = color[0]; rgba[i + 1] = color[1]; rgba[i + 2] = color[2]; rgba[i + 3] = color[3];
    }
  }
}

function makeToonHero() {
  var w = 96, h = 96, rgba = Buffer.alloc(w * h * 4);
  // paper-ish transparent bg
  fillCircle(rgba, w, h, 48, 30, 18, [255, 216, 45, 255]); // yellow head
  fillCircle(rgba, w, h, 48, 62, 22, [99, 182, 255, 255]); // blue body
  // dark outline-ish edge by larger circle underneath already solid; draw ink rim
  for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
    var i = (y * w + x) * 4;
    if (!rgba[i + 3]) continue;
    var edge = false;
    for (var dy = -1; dy <= 1 && !edge; dy++) for (var dx = -1; dx <= 1; dx++) {
      var nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || !rgba[(ny * w + nx) * 4 + 3]) edge = true;
    }
    if (edge) { rgba[i] = 20; rgba[i + 1] = 25; rgba[i + 2] = 35; }
  }
  return encodePng(w, h, rgba);
}

function makePhotoNoise() {
  var w = 96, h = 96, rgba = Buffer.alloc(w * h * 4);
  for (var i = 0; i < rgba.length; i += 4) {
    var v = Math.floor(Math.random() * 255);
    rgba[i] = v; rgba[i + 1] = Math.floor(v * 0.9); rgba[i + 2] = Math.floor(v * 0.7); rgba[i + 3] = 255;
  }
  return encodePng(w, h, rgba);
}

function makeFlatUi() {
  var w = 96, h = 96, rgba = Buffer.alloc(w * h * 4);
  for (var y = 20; y < 76; y++) for (var x = 16; x < 80; x++) {
    var i = (y * w + x) * 4;
    rgba[i] = 238; rgba[i + 1] = 73; rgba[i + 2] = 58; rgba[i + 3] = 255;
  }
  for (var y2 = 20; y2 < 76; y2++) for (var x2 = 16; x2 < 80; x2++) {
    if (y2 === 20 || y2 === 75 || x2 === 16 || x2 === 79) {
      var j = (y2 * w + x2) * 4;
      rgba[j] = 20; rgba[j + 1] = 25; rgba[j + 2] = 35;
    }
  }
  return encodePng(w, h, rgba);
}

function makeToonGem() {
  var w = 64, h = 64, rgba = Buffer.alloc(w * h * 4);
  fillCircle(rgba, w, h, 32, 32, 20, [99, 182, 255, 255]);
  fillCircle(rgba, w, h, 26, 26, 6, [198, 242, 82, 255]);
  for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
    var i = (y * w + x) * 4;
    if (!rgba[i + 3]) continue;
    var edge = false;
    for (var dy = -1; dy <= 1 && !edge; dy++) for (var dx = -1; dx <= 1; dx++) {
      var nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || !rgba[(ny * w + nx) * 4 + 3]) edge = true;
    }
    if (edge) { rgba[i] = 20; rgba[i + 1] = 25; rgba[i + 2] = 35; }
  }
  return encodePng(w, h, rgba);
}

async function score(name, bytes, slot, phase) {
  var texts = styleDNA.reviewTexts(slot.styleId, slot, phase);
  var results = await reviewer.reviewImages({
    images: [bytes],
    positiveTexts: texts.reviewPositiveTexts,
    negativeTexts: texts.reviewNegativeTexts,
    stylePositiveTexts: texts.stylePositiveTexts,
    styleNegativeTexts: texts.styleNegativeTexts,
    compositionChecks: texts.compositionChecks,
    timeoutMs: 120000
  });
  var r = results[0];
  return {
    name: name,
    phase: phase,
    semanticMargin: r.semanticMargin,
    styleMargin: r.styleMargin,
    styleSimilarity: r.styleSimilarity,
    styleNegativeSimilarity: r.styleNegativeSimilarity,
    composition: (r.compositionChecks || []).map(function(c) { return { id: c.id, margin: c.margin }; })
  };
}

(async function main() {
  var outDir = path.resolve('.gamecastle/output/diagnostics/style-baseline');
  fs.mkdirSync(outDir, { recursive: true });
  var samples = [
    { name: 'synthetic-toon-hero', bytes: makeToonHero(), slot: { description: 'one expressive cartoon hero character', productionFamily: 'character', styleId: 'gamecastle.style-dna.v1', constraints: { transparent: true }, semanticTags: ['hero'] } },
    { name: 'synthetic-toon-gem', bytes: makeToonGem(), slot: { description: 'one blue gem collectible prop', productionFamily: 'prop', styleId: 'gamecastle.style-dna.v1', constraints: { transparent: true }, semanticTags: ['collectible'] } },
    { name: 'synthetic-flat-ui', bytes: makeFlatUi(), slot: { description: 'one game interface button', productionFamily: 'ui', styleId: 'gamecastle.style-dna.v1', constraints: { transparent: true }, semanticTags: ['ui'] } },
    { name: 'synthetic-photo-noise', bytes: makePhotoNoise(), slot: { description: 'one expressive cartoon hero character', productionFamily: 'character', styleId: 'gamecastle.style-dna.v1', constraints: { transparent: true }, semanticTags: ['hero'] } }
  ];
  var rembg = path.resolve('.gamecastle/output/diagnostics/rembg/integrated/static/asset-ac9354c824241a2c.png');
  if (fs.existsSync(rembg)) {
    samples.push({ name: 'real-rembg-blue-asset', bytes: fs.readFileSync(rembg), slot: { description: 'one blue game prop', productionFamily: 'prop', styleId: 'gamecastle.style-dna.v1', constraints: { transparent: true }, semanticTags: ['prop'] } });
  }
  var rows = [];
  for (var i = 0; i < samples.length; i++) {
    var sample = samples[i];
    fs.writeFileSync(path.join(outDir, sample.name + '.png'), sample.bytes);
    rows.push(await score(sample.name, sample.bytes, sample.slot, 'final-derived-asset'));
    rows.push(await score(sample.name + '@master', sample.bytes, sample.slot, 'master-candidate'));
    console.log(JSON.stringify(rows[rows.length - 2]));
  }
  var report = {
    generatedAt: new Date().toISOString(),
    thresholds: reviewer.contract.thresholds,
    rows: rows,
    styleFingerprint: styleDNA.styleFingerprint('gamecastle.style-dna.v1')
  };
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log('[style-baseline] wrote', path.join(outDir, 'report.json'));
  process.exit(0);
})().catch(function(error) {
  console.error(error);
  process.exit(1);
});
