var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var zlib = require('zlib');
var kernelModule = require('./local-derivation-kernel');

function crc32(buffer) { var value = 0xffffffff; for (var index = 0; index < buffer.length; index++) { value ^= buffer[index]; for (var bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (0xedb88320 & -(value & 1)); } return (value ^ 0xffffffff) >>> 0; }
function chunk(type, data) { var name = Buffer.from(type, 'ascii'), result = Buffer.alloc(12 + data.length); result.writeUInt32BE(data.length, 0); name.copy(result, 4); data.copy(result, 8); result.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length); return result; }
function encodePng(raster) { var scanlines = Buffer.alloc((raster.width * 4 + 1) * raster.height); for (var y = 0; y < raster.height; y++) { scanlines[y * (raster.width * 4 + 1)] = 0; Buffer.from(raster.data.buffer, raster.data.byteOffset, raster.data.byteLength).copy(scanlines, y * (raster.width * 4 + 1) + 1, y * raster.width * 4, (y + 1) * raster.width * 4); } var header = Buffer.alloc(13); header.writeUInt32BE(raster.width, 0); header.writeUInt32BE(raster.height, 4); header[8] = 8; header[9] = 6; return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(scanlines)), chunk('IEND', Buffer.alloc(0))]); }
function paeth(a, b, c) { var p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
function decodePng(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 33 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('PNG signature is invalid.');
  var cursor = 8, width = 0, height = 0, bitDepth = 0, colorType = 0, idat = [];
  while (cursor < bytes.length) { var length = bytes.readUInt32BE(cursor), type = bytes.toString('ascii', cursor + 4, cursor + 8), data = bytes.subarray(cursor + 8, cursor + 8 + length); cursor += length + 12; if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; if (data[12] !== 0) throw new Error('Interlaced PNG is unsupported.'); } else if (type === 'IDAT') idat.push(data); else if (type === 'IEND') break; }
  if (!width || !height || bitDepth !== 8 || [2, 6].indexOf(colorType) < 0) throw new Error('PNG must be 8-bit RGB or RGBA.');
  var channels = colorType === 6 ? 4 : 3, rowBytes = width * channels, decoded = zlib.inflateSync(Buffer.concat(idat)), raw = Buffer.alloc(rowBytes * height), prior = Buffer.alloc(rowBytes);
  if (decoded.length !== height * (rowBytes + 1)) throw new Error('PNG scanline length is invalid.');
  for (var y = 0; y < height; y++) { var filter = decoded[y * (rowBytes + 1)], source = decoded.subarray(y * (rowBytes + 1) + 1, (y + 1) * (rowBytes + 1)), row = raw.subarray(y * rowBytes, (y + 1) * rowBytes); for (var x = 0; x < rowBytes; x++) { var left = x >= channels ? row[x - channels] : 0, up = prior[x], upperLeft = x >= channels ? prior[x - channels] : 0; if (filter === 0) row[x] = source[x]; else if (filter === 1) row[x] = (source[x] + left) & 255; else if (filter === 2) row[x] = (source[x] + up) & 255; else if (filter === 3) row[x] = (source[x] + Math.floor((left + up) / 2)) & 255; else if (filter === 4) row[x] = (source[x] + paeth(left, up, upperLeft)) & 255; else throw new Error('PNG filter is invalid.'); } prior = Buffer.from(row); }
  var data = new Uint8ClampedArray(width * height * 4); for (var index = 0, output = 0; index < raw.length; index += channels, output += 4) { data[output] = raw[index]; data[output + 1] = raw[index + 1]; data[output + 2] = raw[index + 2]; data[output + 3] = channels === 4 ? raw[index + 3] : 255; } return { width: width, height: height, data: data };
}

function createLocalDerivationPort(options) {
  options = options || {};
  var outputDir = path.resolve(options.outputDir || path.join(process.cwd(), '.gamecastle', 'output', 'assets', 'derived'));
  var kernel = options.kernel || kernelModule.createLocalDerivationKernel();
  return {
    derive: async function(state) {
      var source = state.source || {}, spec = source.derivationSpec, context = source.derivationContext || {};
      if (!spec) throw Object.assign(new Error('Deterministic variant requires derivationSpec.'), { code: 'LOCAL_DERIVATION_SPEC_REQUIRED' });
      var receipt = await kernel.execute(spec, context), raster = receipt.raster;
      if (!raster) throw Object.assign(new Error('Deterministic variant must materialize a raster output.'), { code: 'LOCAL_DERIVATION_RASTER_REQUIRED' });
      var bytes = encodePng(raster), sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
      fs.mkdirSync(outputDir, { recursive: true });
      var file = path.join(outputDir, 'derived-' + sha256.slice(0, 16) + '.png');
      if (!fs.existsSync(file)) fs.writeFileSync(file, bytes);
      return { assetId: 'derived.' + sha256.slice(0, 16), sha256: sha256, path: file, format: 'png', width: raster.width, height: raster.height, transparent: true, styleId: spec.styleId, semanticTags: state.slot.semanticTags || [], styleTags: state.slot.styleTags || [], provenance: 'local-derivation:' + spec.op, parentRevisionId: receipt.parentRevisionId, derivationReceipt: receipt, publishability: { playable: true, publishable: true, repoEligible: false, blocksFinalExport: false } };
    },
  };
}

module.exports = { createLocalDerivationPort: createLocalDerivationPort, encodePng: encodePng, decodePng: decodePng };
