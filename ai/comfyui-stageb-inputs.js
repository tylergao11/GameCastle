/* Controlled image-reference bridge. Domain code supplies immutable refs; this module alone handles bytes/transit. */
var crypto = require('crypto');
var fs = require('fs');
var os = require('os');
var path = require('path');

function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'ComfyUIStageBInputBridge'; throw error; }
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function root() { var value = path.resolve(process.env.COMFYUI_TRANSIT_DIR || path.join(os.tmpdir(), 'gamecastle-comfy-transit')); fs.mkdirSync(value, { recursive: true }); return value; }
function indexFile() { return path.join(root(), 'stageb-input-index.json'); }
function readIndex() { try { return JSON.parse(fs.readFileSync(indexFile(), 'utf8')); } catch (_error) { return {}; } }
function writeIndex(index) { fs.writeFileSync(indexFile(), JSON.stringify(index, null, 2)); }
function safePng(bytes, validatePng) { try { return validatePng(bytes); } catch (error) { fail('COMFYUI_INPUT_INVALID', error.message || 'Controlled input is not a valid PNG.'); } }
function store(input, validatePng) {
  if (!input || !Buffer.isBuffer(input.bytes)) fail('COMFYUI_INPUT_REF_INVALID', 'Resolved input must provide PNG bytes.');
  var info = safePng(input.bytes, validatePng);
  var digest = sha256(input.bytes); if (input.sha256 && input.sha256 !== digest) fail('COMFYUI_INPUT_HASH_MISMATCH', 'Resolved input hash does not match bytes.');
  var filename = 'gamecastle-input-' + digest + '.png', file = path.join(root(), filename), blobId = 'input.' + sha256(digest + ':' + String(input.refId || input.revisionId || 'asset')).slice(0, 24);
  if (!fs.existsSync(file)) fs.writeFileSync(file, input.bytes);
  var index = readIndex(); index[blobId] = { filename: filename, sha256: digest, scope: input.scope, projectId: input.projectId, revisionId: input.revisionId || null, familyId: input.familyId || null, expiresAt: Date.now() + 3600000 }; writeIndex(index);
  return { blobId: blobId, sha256: digest, filename: filename, scope: input.scope, projectId: input.projectId, revisionId: input.revisionId || null, familyId: input.familyId || null, width: info.width, height: info.height, transparent: info.transparent };
}
async function resolve(options, reference, state, kind, validatePng) {
  if (!reference || typeof reference !== 'object' || !reference.refId) fail('COMFYUI_INPUT_REF_INVALID', kind + ' requires a typed immutable reference.');
  if (!options || typeof options.resolveAssetInput !== 'function') fail('COMFYUI_INPUT_RESOLVER_UNAVAILABLE', kind + ' requires an AssetRevision input resolver.');
  var resolved = await options.resolveAssetInput({ reference: Object.assign({}, reference), projectId: state.projectId, kind: kind });
  if (!resolved || resolved.projectId !== state.projectId || !resolved.scope || !resolved.consent) fail('COMFYUI_INPUT_SCOPE_DENIED', kind + ' input is not authorized for this project and purpose.');
  if (reference.sha256 && resolved.sha256 !== reference.sha256) fail('COMFYUI_INPUT_HASH_MISMATCH', kind + ' reference hash does not match resolved input.');
  if (kind === 'parent' && (!resolved.revisionId || resolved.revisionId !== reference.revisionId)) fail('COMFYUI_PARENT_REVISION_INVALID', 'Parent input must resolve the requested immutable revision.');
  resolved.refId = reference.refId; var stored = store(resolved, validatePng); if (kind === 'mask' && !stored.transparent) fail('COMFYUI_MASK_INVALID', 'Mask must be an alpha PNG.'); return stored;
}
function lookup(reference, validatePng) {
  if (!reference || !reference.sha256 || !reference.blobId) fail('COMFYUI_INPUT_REF_INVALID', 'Input blob reference is invalid.');
  var index = readIndex(), entry = index[reference.blobId];
  if (!entry || entry.expiresAt < Date.now()) fail('COMFYUI_INPUT_EXPIRED', 'Controlled input has expired.');
  var file = path.join(root(), entry.filename); if (!fs.existsSync(file)) fail('COMFYUI_INPUT_LOST', 'Controlled input bytes are unavailable.');
  var bytes = fs.readFileSync(file); if (sha256(bytes) !== entry.sha256) fail('COMFYUI_INPUT_HASH_MISMATCH', 'Controlled input bytes changed.');
  var info = safePng(bytes, validatePng);
  return { bytes: bytes, filename: entry.filename, sha256: entry.sha256, scope: entry.scope, projectId: entry.projectId, revisionId: entry.revisionId, familyId: entry.familyId, width: info.width, height: info.height, transparent: info.transparent };
}
module.exports = { resolve: resolve, lookup: lookup, store: store, root: root };
