var crypto = require('crypto');
var fs = require('fs');
var path = require('path');

function decodePng(dataUrl) {
  var match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!match) throw Object.assign(new Error('Only PNG data URLs are accepted.'), { code: 'ASSET_PNG_REQUIRED' });
  var bytes = Buffer.from(match[1], 'base64');
  if (bytes.length < 33 || bytes.length > 4 * 1024 * 1024 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw Object.assign(new Error('PNG input is invalid.'), { code: 'ASSET_PNG_CONTRACT_INVALID' });
  var width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20), colorType = bytes[25];
  if (!width || !height || width * height > 4096 * 4096 || (colorType !== 4 && colorType !== 6)) throw Object.assign(new Error('PNG must contain an alpha channel within pixel limits.'), { code: 'ASSET_PNG_CONTRACT_INVALID' });
  return { bytes: bytes, width: width, height: height };
}
function safe(value) { return /^[A-Za-z0-9._-]{1,128}$/.test(String(value || '')); }
function createLocalAssetInputStore(options) {
  var root = path.join(path.resolve(options.outputDir), 'assets', 'inputs'), indexPath = path.join(root, 'input-index.json');
  function read() { try { return JSON.parse(fs.readFileSync(indexPath, 'utf8')); } catch (_error) { return { schemaVersion: 1, inputs: [] }; } }
  function write(value) { fs.mkdirSync(root, { recursive: true }); fs.writeFileSync(indexPath, JSON.stringify(value, null, 2), 'utf8'); }
  async function ingest(input) {
    if (!input || !safe(input.projectId) || !safe(input.slotId) || !input.asset) throw Object.assign(new Error('Asset input requires projectId, slotId and asset.'), { code: 'ASSET_INPUT_INVALID' });
    var png = decodePng(input.asset.png), sha256 = crypto.createHash('sha256').update(png.bytes).digest('hex'), file = path.join(root, sha256 + '.png'); fs.mkdirSync(root, { recursive: true }); if (!fs.existsSync(file)) fs.writeFileSync(file, png.bytes);
    var record = { inputId: 'asset-input.' + sha256.slice(0, 24), projectId: input.projectId, slotId: input.slotId, path: file, sha256: sha256, width: png.width, height: png.height, scope: 'private-local', source: 'user-input', immutable: true };
    var index = read(); index.inputs = index.inputs.filter(function(item) { return !(item.projectId === record.projectId && item.slotId === record.slotId); }); index.inputs.push(record); write(index); return record;
  }
  return { ingest: ingest, list: function(projectId) { return read().inputs.filter(function(item) { return !projectId || item.projectId === projectId; }); }, indexPath: indexPath };
}
module.exports = { createLocalAssetInputStore: createLocalAssetInputStore };
