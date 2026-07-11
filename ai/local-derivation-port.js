var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var zlib = require('zlib');
var kernelModule = require('./local-derivation-kernel');

function crc32(buffer) { var value = 0xffffffff; for (var index = 0; index < buffer.length; index++) { value ^= buffer[index]; for (var bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (0xedb88320 & -(value & 1)); } return (value ^ 0xffffffff) >>> 0; }
function chunk(type, data) { var name = Buffer.from(type, 'ascii'), result = Buffer.alloc(12 + data.length); result.writeUInt32BE(data.length, 0); name.copy(result, 4); data.copy(result, 8); result.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length); return result; }
function encodePng(raster) { var scanlines = Buffer.alloc((raster.width * 4 + 1) * raster.height); for (var y = 0; y < raster.height; y++) { scanlines[y * (raster.width * 4 + 1)] = 0; Buffer.from(raster.data.buffer, raster.data.byteOffset, raster.data.byteLength).copy(scanlines, y * (raster.width * 4 + 1) + 1, y * raster.width * 4, (y + 1) * raster.width * 4); } var header = Buffer.alloc(13); header.writeUInt32BE(raster.width, 0); header.writeUInt32BE(raster.height, 4); header[8] = 8; header[9] = 6; return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(scanlines)), chunk('IEND', Buffer.alloc(0))]); }

function createLocalDerivationPort(options) {
  options = options || {};
  var outputDir = path.resolve(options.outputDir || path.join(process.cwd(), 'output', 'assets', 'derived'));
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

module.exports = { createLocalDerivationPort: createLocalDerivationPort, encodePng: encodePng };
