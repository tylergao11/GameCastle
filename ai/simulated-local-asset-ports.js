var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var zlib = require('zlib');
var styleDictionary = require('./asset-style-dictionary');

var PALETTE = ['#ee493a', '#ffd82d', '#63b6ff', '#c6f252'];
var INK = [20, 25, 35, 255];

function crc32(buffer) {
  var value = 0xffffffff;
  for (var index = 0; index < buffer.length; index++) {
    value ^= buffer[index];
    for (var bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
  }
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  var name = Buffer.from(type, 'ascii'); var output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0); name.copy(output, 4); data.copy(output, 8); output.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return output;
}

function png(width, height, pixels) {
  var scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (var y = 0; y < height; y++) { scanlines[y * (width * 4 + 1)] = 0; pixels.copy(scanlines, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4); }
  var header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(scanlines)), chunk('IEND', Buffer.alloc(0))]);
}

function decodePng(bytes) {
  if (!bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('Simulated sheet is not PNG');
  var offset = 8, width = 0, height = 0, parts = [];
  while (offset < bytes.length) { var length = bytes.readUInt32BE(offset), type = bytes.subarray(offset + 4, offset + 8).toString('ascii'), data = bytes.subarray(offset + 8, offset + 8 + length); if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); if (data[8] !== 8 || data[9] !== 6) throw new Error('Simulated sheet must be RGBA'); } if (type === 'IDAT') parts.push(data); offset += length + 12; if (type === 'IEND') break; }
  var raw = zlib.inflateSync(Buffer.concat(parts)), stride = width * 4, pixels = Buffer.alloc(stride * height);
  for (var y = 0; y < height; y++) { if (raw[y * (stride + 1)] !== 0) throw new Error('Simulated sheet only supports filter zero'); raw.copy(pixels, y * stride, y * (stride + 1) + 1, y * (stride + 1) + 1 + stride); }
  return { width: width, height: height, pixels: pixels };
}

function color(hex) { return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255]; }
function set(pixels, width, x, y, rgba) { if (x < 0 || y < 0 || x >= width || y >= pixels.length / 4 / width) return; var at = (y * width + x) * 4; for (var i = 0; i < 4; i++) pixels[at + i] = rgba[i]; }
function disk(pixels, width, cx, cy, radius, rgba) { for (var y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) for (var x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= radius * radius) set(pixels, width, x, y, rgba); }

function subjectName(slot) { return (slot.semanticTags || []).filter(function(tag) { return tag.indexOf('asset.') !== 0; })[0] || slot.slotId.replace(/^asset\./, '').replace(/[._-]/g, ' ') || 'icon'; }
function makeIcon(slot, ordinal) {
  var width = 96, height = 96, pixels = Buffer.alloc(width * height * 4), seed = crypto.createHash('sha256').update(slot.slotId + ':' + ordinal).digest()[0], fill = color(PALETTE[seed % PALETTE.length]);
  var cx = 48 + ((seed % 5) - 2), cy = 47, radius = 25 + (seed % 5);
  disk(pixels, width, cx + 7, cy + 10, radius, [20, 25, 35, 92]);
  disk(pixels, width, cx, cy, radius + 4, INK);
  disk(pixels, width, cx, cy, radius, fill);
  disk(pixels, width, cx - radius * .28, cy - radius * .31, Math.max(4, radius * .18), [255, 247, 229, 148]);
  disk(pixels, width, cx - radius * .30, cy + radius * .10, 3, INK); disk(pixels, width, cx + radius * .30, cy + radius * .10, 3, INK);
  for (var x = -7; x <= 7; x++) { var y = Math.round(cy + radius * .37 + (x * x) / 22); set(pixels, width, cx + x, y, INK); set(pixels, width, cx + x, y + 1, INK); }
  return { bytes: png(width, height, pixels), width: width, height: height, subject: subjectName(slot), fill: PALETTE[seed % PALETTE.length] };
}

function makeSheet(slots) {
  var width = 96 * slots.length, height = 96, pixels = Buffer.alloc(width * height * 4);
  slots.forEach(function(slot, ordinal) { var icon = decodePng(makeIcon(slot, ordinal).bytes); for (var y = 0; y < height; y++) icon.pixels.copy(pixels, (y * width + ordinal * 96) * 4, y * 96 * 4, (y + 1) * 96 * 4); });
  return { bytes: png(width, height, pixels), width: width, height: height, frameWidth: 96, frameHeight: 96, frameCount: slots.length };
}

function cropSheet(bytes, frameWidth, frameHeight, frameCount) {
  var source = decodePng(bytes), frames = [];
  if (source.height !== frameHeight || source.width < frameWidth * frameCount) throw new Error('Simulated sheet dimensions do not match frame grid');
  for (var frame = 0; frame < frameCount; frame++) { var pixels = Buffer.alloc(frameWidth * frameHeight * 4); for (var y = 0; y < frameHeight; y++) source.pixels.copy(pixels, y * frameWidth * 4, (y * source.width + frame * frameWidth) * 4, (y * source.width + (frame + 1) * frameWidth) * 4); frames.push(png(frameWidth, frameHeight, pixels)); }
  return frames;
}

function createSimulatedLocalAssetPorts(options) {
  options = options || {}; var outputDir = path.resolve(options.outputDir || path.join(process.cwd(), 'output'));
  function writeCandidate(state, ordinal, source, parentRevisionId) {
    var icon = makeIcon(state.slot, ordinal); var digest = crypto.createHash('sha256').update(icon.bytes).digest('hex'); var dir = state.projectAssetDir || path.join(outputDir, 'assets', 'simulated'); fs.mkdirSync(dir, { recursive: true }); var file = path.join(dir, 'simulated-' + digest.slice(0, 16) + '.png'); fs.writeFileSync(file, icon.bytes);
    return { assetId: 'simulated.' + digest.slice(0, 16), sha256: digest, path: file, format: 'png', width: icon.width, height: icon.height, transparent: true, styleId: state.slot.styleId || styleDictionary.dictionary.defaultStyleId, semanticTags: state.slot.semanticTags || [], styleTags: state.slot.styleTags || [styleDictionary.dictionary.defaultStyleId], source: source, status: source === 'imageEdit' ? 'variant' : 'generated', parentRevisionId: parentRevisionId || null, provenance: 'simulated-local-v1', license: 'simulation-only', simulated: true, model: { provider: 'simulated-local', model: 'style-1-icon-synthesizer', subject: icon.subject, fill: icon.fill }, publishability: { playable: true, publishable: false, blocksFinalExport: false } };
  }
  return {
    generate: async function(state) { return writeCandidate(state, 0, 'imageGeneration'); },
    edit: async function(state) { return writeCandidate(state, 1, 'imageEdit', state.source && state.source.parentRevisionId); },
    variant: async function(state) { return writeCandidate(state, 2, 'deterministicVariant', state.source && state.source.asset && state.source.asset.assetId); },
    review: async function(state) {
      var candidate = state.candidate || {}; var pass = candidate.simulated === true && candidate.transparent === true && candidate.format === 'png' && candidate.width >= 48 && candidate.height >= 48;
      return { pass: pass, repairable: !pass, provider: 'simulated-local', model: 'style-1-vision-contract', simulated: true, confidence: pass ? 1 : 0, issues: pass ? [] : ['simulated_contract_invalid'] };
    },
  };
}

module.exports = { createSimulatedLocalAssetPorts: createSimulatedLocalAssetPorts, makeIcon: makeIcon, makeSheet: makeSheet, cropSheet: cropSheet };
