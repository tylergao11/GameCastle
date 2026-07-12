var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var zlib = require('zlib');
var kernelModule = require('./local-derivation-kernel');
var encoder = require('./local-derivation-port');
var localContract = require('../shared/local-derivation-contract.json');

function error(code, message) { var value = new Error(message); value.code = code; return value; }
function decodePng(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw error('LOCAL_PLAN_PNG_REQUIRED', 'Cloud local plan requires a PNG blob.');
  var offset = 8, width = 0, height = 0, channels = 0, parts = [];
  while (offset + 12 <= bytes.length) { var length = bytes.readUInt32BE(offset), type = bytes.subarray(offset + 4, offset + 8).toString('ascii'), data = bytes.subarray(offset + 8, offset + 8 + length); if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); if (data[8] !== 8 || (data[9] !== 6 && data[9] !== 4)) throw error('LOCAL_PLAN_PNG_UNSUPPORTED', 'Cloud local plan supports 8-bit RGBA or grayscale-alpha PNG only.'); channels = data[9] === 6 ? 4 : 2; } if (type === 'IDAT') parts.push(data); offset += length + 12; if (type === 'IEND') break; }
  var stride = width * channels, raw = zlib.inflateSync(Buffer.concat(parts)), dataOut = new Uint8ClampedArray(width * height * 4), previous = Buffer.alloc(stride), source = 0;
  for (var y = 0; y < height; y++) { var filter = raw[source++], row = Buffer.alloc(stride); for (var x = 0; x < stride; x++) { var value = raw[source++], left = x >= channels ? row[x - channels] : 0, up = previous[x], upLeft = x >= channels ? previous[x - channels] : 0; if (filter === 1) value = (value + left) & 255; else if (filter === 2) value = (value + up) & 255; else if (filter === 3) value = (value + Math.floor((left + up) / 2)) & 255; else if (filter === 4) { var p = left + up - upLeft, pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft); value = (value + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft)) & 255; } else if (filter !== 0) throw error('LOCAL_PLAN_PNG_UNSUPPORTED', 'Cloud local plan encountered unsupported PNG filter.'); row[x] = value; } for (var pixel = 0; pixel < width; pixel++) { var out = (y * width + pixel) * 4, inAt = pixel * channels; if (channels === 4) { dataOut[out] = row[inAt]; dataOut[out + 1] = row[inAt + 1]; dataOut[out + 2] = row[inAt + 2]; dataOut[out + 3] = row[inAt + 3]; } else { dataOut[out] = row[inAt]; dataOut[out + 1] = row[inAt]; dataOut[out + 2] = row[inAt]; dataOut[out + 3] = row[inAt + 1]; } } previous = row; }
  return { width: width, height: height, data: dataOut };
}
function createCloudLocalPlanRunner(options) {
  options = options || {}; var outputDir = path.resolve(options.outputDir || path.join(process.cwd(), 'output', 'assets', 'cloud-derived')), kernel = options.kernel || kernelModule.createLocalDerivationKernel();
  return {
    run: async function(state) {
      var source = state.source || {}, asset = source.asset || {}, plan = source.localPlan || asset.localPlan;
      if (!plan || plan.requiresNewPixels === true) throw error('LOCAL_PLAN_INVALID', 'Cloud plan requires new pixels and cannot run locally.');
      if (!asset.path || !fs.existsSync(asset.path)) throw error('LOCAL_PLAN_SOURCE_MISSING', 'Cloud plan source blob is unavailable.');
      var sourceBytes = fs.readFileSync(asset.path), parentRevisionId = asset.revisionId || asset.assetId, receipts = [];
      (plan.operations || []).forEach(function(operation, index) { if (!operation || localContract.operations.indexOf(operation.op) < 0) throw error('LOCAL_PLAN_OPERATION_INVALID', 'Cloud plan contains an undeclared local operation.'); receipts.push({ operation: operation, index: index }); });
      if (!receipts.length) { var directHash = crypto.createHash('sha256').update(sourceBytes).digest('hex'); fs.mkdirSync(outputDir, { recursive: true }); var directFile = path.join(outputDir, 'cloud-derived-' + directHash.slice(0, 16) + '.png'); if (!fs.existsSync(directFile)) fs.writeFileSync(directFile, sourceBytes); return { assetId: 'cloud-derived.' + directHash.slice(0, 16), sha256: directHash, path: directFile, format: 'png', width: asset.width, height: asset.height, transparent: asset.transparent === true, styleId: asset.styleId, semanticTags: asset.semanticTags || [], styleTags: asset.styleTags || [], parentRevisionId: parentRevisionId, provenance: 'cloud-local-plan', operationReceipts: [], publishability: { playable: true, publishable: true, repoEligible: false, blocksFinalExport: false } }; }
      var raster = decodePng(sourceBytes);
      for (var index = 0; index < receipts.length; index++) { var operation = receipts[index].operation, receipt = await kernel.execute({ schemaVersion: 1, dictionaryId: 'gamecastle.asset-style-dictionary', styleId: asset.styleId, operationId: 'cloud-plan.' + (asset.revisionId || asset.assetId) + '.' + index, op: operation.op, input: { assetId: asset.assetId, contentHash: crypto.createHash('sha256').update(Buffer.from(raster.data)).digest('hex') }, params: operation.params || {}, output: { format: 'png', transparent: true }, scope: 'project-local' }, { raster: raster, parentRevisionId: parentRevisionId }); raster = receipt.raster; parentRevisionId = receipt.parentRevisionId; receipts[index] = receipt; }
      var bytes = encoder.encodePng(raster), sha256 = crypto.createHash('sha256').update(bytes).digest('hex'); fs.mkdirSync(outputDir, { recursive: true }); var file = path.join(outputDir, 'cloud-derived-' + sha256.slice(0, 16) + '.png'); if (!fs.existsSync(file)) fs.writeFileSync(file, bytes);
      return { assetId: 'cloud-derived.' + sha256.slice(0, 16), sha256: sha256, path: file, format: 'png', width: raster.width, height: raster.height, transparent: true, styleId: asset.styleId, semanticTags: asset.semanticTags || [], styleTags: asset.styleTags || [], parentRevisionId: parentRevisionId, provenance: 'cloud-local-plan', operationReceipts: receipts, publishability: { playable: true, publishable: true, repoEligible: false, blocksFinalExport: false } };
    }
  };
}
module.exports = { createCloudLocalPlanRunner: createCloudLocalPlanRunner, decodePng: decodePng };
