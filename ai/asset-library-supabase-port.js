/* Domain adapter over the pinned Supabase Storage service. It owns no storage protocol or metadata database. */
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var StorageClient = require('@supabase/storage-js').StorageClient;
var contract = require('../shared/asset-library-contract.json');
var frameSet = require('./frame-set');

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function digest(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'SupabaseAssetLibraryPort'; throw error; }
function required(value, name) { if (!value || typeof value !== 'string') fail('ASSET_LIBRARY_CONFIGURATION_MISSING', 'Missing required AssetLibrary configuration: ' + name + '.'); return value; }
function cleanUrl(value) { var raw = required(value, 'GAMECASTLE_ASSET_LIBRARY_URL'), url; try { url = new URL(raw); } catch (_error) { fail('ASSET_LIBRARY_CONFIGURATION_INVALID', 'GAMECASTLE_ASSET_LIBRARY_URL must be an HTTP(S) URL.'); } if (url.protocol !== 'http:' && url.protocol !== 'https:') fail('ASSET_LIBRARY_CONFIGURATION_INVALID', 'GAMECASTLE_ASSET_LIBRARY_URL must use HTTP(S).'); return url.toString().replace(/\/$/, ''); }
function safeSegment(value, name) { if (typeof value !== 'string' || !/^[A-Za-z0-9._-]+$/.test(value)) fail('ASSET_LIBRARY_PATH_INVALID', name + ' contains an unsafe storage path segment.'); return value; }
function backend() { return contract.backend || {}; }
function layout() { var value = backend().objectLayout || {}; return { recordPrefix: required(value.recordPrefix, 'AssetLibrary.recordPrefix'), blobPrefix: required(value.blobPrefix, 'AssetLibrary.blobPrefix'), recordIdPrefix: required(value.recordIdPrefix, 'AssetLibrary.recordIdPrefix') }; }
function recordId(fingerprint) { return layout().recordIdPrefix + '.' + safeSegment(fingerprint, 'requirementFingerprint'); }
function fingerprintFromRecordId(value) { var prefix = layout().recordIdPrefix + '.'; if (typeof value !== 'string' || value.indexOf(prefix) !== 0) fail('ASSET_LIBRARY_RECORD_INVALID', 'AssetLibrary record id is not owned by this backend.'); return safeSegment(value.slice(prefix.length), 'recordId'); }
function recordKey(fingerprint) { return layout().recordPrefix + '/' + safeSegment(fingerprint, 'requirementFingerprint') + '.json'; }
function blobKey(sha256, format) { return layout().blobPrefix + '/' + safeSegment(sha256, 'sha256') + '.' + safeSegment(String(format).toLowerCase(), 'format'); }
function storageUri(bucket, key) { return 'supabase-storage://' + safeSegment(bucket, 'bucket') + '/' + key; }
function parseStorageUri(value, bucket) { var prefix = 'supabase-storage://' + safeSegment(bucket, 'bucket') + '/'; if (typeof value !== 'string' || value.indexOf(prefix) !== 0) fail('ASSET_LIBRARY_OBJECT_REFERENCE_INVALID', 'AssetLibrary revision does not point at this configured bucket.'); var key = value.slice(prefix.length); if (!key || key.indexOf('..') >= 0 || key[0] === '/') fail('ASSET_LIBRARY_OBJECT_REFERENCE_INVALID', 'AssetLibrary object key is invalid.'); return key; }
function bytesFrom(file) { if (!file || !fs.existsSync(file)) fail('ASSET_LIBRARY_SOURCE_UNAVAILABLE', 'Accepted revision payload is unavailable for publication.'); return fs.readFileSync(file); }
function blobFrom(result, code) { if (!result || result.error) { var error = result && result.error; fail(code, error && error.message || 'Supabase Storage request failed.'); } return result.data; }
function statusOf(error) { return Number(error && (error.statusCode || error.status)); }
function sameRevision(left, right) { if (frameSet.isFrameSet(left)) return frameSet.isFrameSet(right) && left.revisionId === right.revisionId && left.contentHash === right.contentHash; return !!left && !!right && left.revisionId === right.revisionId && left.sha256 === right.sha256 && left.resourceKind === right.resourceKind && String(left.format).toLowerCase() === String(right.format).toLowerCase(); }
function writeMaterialized(target, bytes, expectedHash) { if (digest(bytes) !== expectedHash) fail('ASSET_LIBRARY_MATERIALIZE_HASH_MISMATCH', 'Downloaded AssetLibrary object hash does not match its accepted revision.'); fs.mkdirSync(path.dirname(target), { recursive: true }); if (fs.existsSync(target)) { if (digest(fs.readFileSync(target)) !== expectedHash) fail('ASSET_LIBRARY_MATERIALIZE_CONFLICT', 'Project materialization target already contains different content.'); return target; } var temporary = target + '.tmp-' + process.pid + '-' + crypto.randomUUID(); fs.writeFileSync(temporary, bytes); try { fs.renameSync(temporary, target); } catch (error) { if (!fs.existsSync(target)) throw error; if (digest(fs.readFileSync(target)) !== expectedHash) throw error; fs.rmSync(temporary, { force: true }); } return target; }

function create(options) {
  options = options || {};
  var config = {
    url: cleanUrl(options.url || process.env.GAMECASTLE_ASSET_LIBRARY_URL),
    serviceKey: required(options.serviceKey || process.env.GAMECASTLE_ASSET_LIBRARY_SERVICE_KEY, 'GAMECASTLE_ASSET_LIBRARY_SERVICE_KEY'),
    bucket: safeSegment(options.bucket || process.env.GAMECASTLE_ASSET_LIBRARY_BUCKET, 'GAMECASTLE_ASSET_LIBRARY_BUCKET')
  };
  var client = options.client || new StorageClient(config.url, { apikey: config.serviceKey, Authorization: 'Bearer ' + config.serviceKey }, options.fetch);
  var bucket = client.from(config.bucket), bucketReady = null;
  async function ensureBucket() {
    if (bucketReady) return bucketReady;
    bucketReady = (async function() {
      var found = await client.getBucket(config.bucket);
      if (!found.error) return;
      if (statusOf(found.error) !== 404) blobFrom(found, 'ASSET_LIBRARY_BUCKET_LOOKUP_FAILED');
      var created = await client.createBucket(config.bucket, { public: false });
      if (created.error && statusOf(created.error) !== 409) blobFrom(created, 'ASSET_LIBRARY_BUCKET_CREATE_FAILED');
    })();
    try { await bucketReady; } catch (error) { bucketReady = null; throw error; }
  }
  async function download(key, code) {
    var result = await bucket.download(key, {}, { cache: 'no-store' });
    if (result.error) {
      if (statusOf(result.error) === 404) return null;
      blobFrom(result, code || 'ASSET_LIBRARY_DOWNLOAD_FAILED');
    }
    return Buffer.from(await result.data.arrayBuffer());
  }
  async function uploadImmutable(key, bytes, contentType) {
    var result = await bucket.upload(key, bytes, { upsert: false, contentType: contentType, cacheControl: '31536000' });
    if (!result.error) return;
    if (statusOf(result.error) !== 409) blobFrom(result, 'ASSET_LIBRARY_UPLOAD_FAILED');
    var existing = await download(key, 'ASSET_LIBRARY_UPLOAD_CONFLICT_READ_FAILED');
    if (!existing || !existing.equals(Buffer.from(bytes))) fail('ASSET_LIBRARY_IMMUTABLE_CONFLICT', 'Cloud library object already exists with different content.');
  }
  async function storeRevision(revision) {
    if (frameSet.isFrameSet(revision)) {
      var accepted = frameSet.validate(revision), frames = [];
      for (var index = 0; index < accepted.frames.length; index++) {
        var frame = accepted.frames[index], bytes = bytesFrom(frame.path);
        if (digest(bytes) !== frame.sha256) fail('ASSET_LIBRARY_SOURCE_HASH_MISMATCH', 'FrameSet source frame hash does not match accepted content.');
        var key = blobKey(frame.sha256, accepted.format);
        await uploadImmutable(key, bytes, 'image/png');
        frames.push(Object.assign({}, frame, { path: storageUri(config.bucket, key) }));
      }
      return frameSet.validate(Object.assign({}, accepted, { frames: frames }));
    }
    var payload = bytesFrom(revision.path);
    if (digest(payload) !== revision.sha256) fail('ASSET_LIBRARY_SOURCE_HASH_MISMATCH', 'Asset source hash does not match accepted content.');
    var objectKey = blobKey(revision.sha256, revision.format);
    await uploadImmutable(objectKey, payload, 'application/octet-stream');
    return Object.assign({}, clone(revision), { path: storageUri(config.bucket, objectKey) });
  }
  async function readRecord(fingerprint) {
    var bytes = await download(recordKey(fingerprint), 'ASSET_LIBRARY_RECORD_READ_FAILED');
    if (!bytes) return null;
    var record; try { record = JSON.parse(bytes.toString('utf8')); } catch (_error) { fail('ASSET_LIBRARY_RECORD_INVALID', 'Cloud library record is not valid JSON.'); }
    if (!record || record.requirementFingerprint !== fingerprint || record.recordId !== recordId(fingerprint) || record.status !== 'published') fail('ASSET_LIBRARY_RECORD_INVALID', 'Cloud library record violates the AssetLibrary contract.');
    if (frameSet.isFrameSet(record.revision)) record.revision = frameSet.validate(record.revision);
    return record;
  }
  async function lookup(query) { await ensureBucket(); return readRecord(query.requirementFingerprint); }
  async function materialize(query) {
    await ensureBucket();
    var fingerprint = fingerprintFromRecordId(query.recordId), record = await readRecord(fingerprint);
    if (!record || record.revision.revisionId !== query.revisionId) fail('ASSET_LIBRARY_MATERIALIZE_RECORD_MISSING', 'Cloud library record is unavailable for materialization.');
    var revision = record.revision, targetDirectory = path.resolve(query.targetDirectory);
    if (frameSet.isFrameSet(revision)) {
      var frames = [];
      for (var index = 0; index < revision.frames.length; index++) {
        var frame = revision.frames[index], key = parseStorageUri(frame.path, config.bucket), bytes = await download(key, 'ASSET_LIBRARY_MATERIALIZE_DOWNLOAD_FAILED');
        if (!bytes) fail('ASSET_LIBRARY_MATERIALIZE_OBJECT_MISSING', 'Cloud library frame object is missing.');
        frames.push(Object.assign({}, frame, { path: writeMaterialized(path.join(targetDirectory, 'frames', frame.sha256 + '.' + revision.format), bytes, frame.sha256) }));
      }
      return frameSet.validate(Object.assign({}, revision, { frames: frames }));
    }
    var objectKey = parseStorageUri(revision.path, config.bucket), payload = await download(objectKey, 'ASSET_LIBRARY_MATERIALIZE_DOWNLOAD_FAILED');
    if (!payload) fail('ASSET_LIBRARY_MATERIALIZE_OBJECT_MISSING', 'Cloud library object is missing.');
    return Object.assign({}, clone(revision), { path: writeMaterialized(path.join(targetDirectory, revision.sha256 + '.' + revision.format), payload, revision.sha256) });
  }
  async function publish(request) {
    await ensureBucket();
    var fingerprint = safeSegment(request.requirementFingerprint, 'requirementFingerprint'), existing = await readRecord(fingerprint);
    if (existing) {
      if (!sameRevision(existing.revision, request.revision)) fail('ASSET_LIBRARY_IMMUTABLE_CONFLICT', 'Cloud library already has a different accepted revision for this requirement.');
      return { recordId: existing.recordId, revisionId: existing.revision.revisionId, published: true };
    }
    var stored = await storeRevision(request.revision), record = { recordId: recordId(fingerprint), requirementFingerprint: fingerprint, revision: stored, status: 'published', provenance: clone(request.provenance || {}) }, bytes = Buffer.from(JSON.stringify(record));
    await uploadImmutable(recordKey(fingerprint), bytes, 'application/json');
    var committed = await readRecord(fingerprint);
    if (!committed || !sameRevision(committed.revision, request.revision)) fail('ASSET_LIBRARY_PUBLISH_VERIFICATION_FAILED', 'Cloud library publication did not persist the accepted revision.');
    return { recordId: committed.recordId, revisionId: committed.revision.revisionId, published: true };
  }
  return { lookup: lookup, materialize: materialize, publish: publish, config: { url: config.url, bucket: config.bucket } };
}

module.exports = { create: create };
