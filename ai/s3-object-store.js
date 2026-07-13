/* Immutable content-addressed object storage port for MinIO/S3. */
var crypto = require('crypto');
var s3 = require('@aws-sdk/client-s3');

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function required(value, name) { if (!value) throw new Error(name + ' is required'); return value; }
function extension(value) {
  var result = String(value || 'png').replace(/^\./, '').toLowerCase();
  if (!/^[a-z0-9]{1,12}$/.test(result)) throw new Error('extension is invalid');
  return result;
}
function createS3ObjectStore(options) {
  options = options || {};
  var bucket = options.bucket || process.env.GAMECASTLE_S3_ASSET_BUCKET;
  var client = options.client || new s3.S3Client({
    region: options.region || process.env.GAMECASTLE_S3_REGION || 'us-east-1',
    endpoint: options.endpoint || process.env.GAMECASTLE_S3_ENDPOINT,
    forcePathStyle: options.forcePathStyle === undefined ? true : !!options.forcePathStyle,
    credentials: { accessKeyId: options.accessKey || process.env.GAMECASTLE_S3_ACCESS_KEY, secretAccessKey: options.secretKey || process.env.GAMECASTLE_S3_SECRET_KEY }
  });
  async function put(input) {
    required(input, 'object input');
    var bytes = Buffer.isBuffer(input.bytes) ? input.bytes : Buffer.from(input.bytes || '');
    if (!bytes.length) throw new Error('object bytes are required');
    var digest = sha256(bytes);
    if (input.sha256 && input.sha256 !== digest) throw new Error('object sha256 does not match bytes');
    var objectKey = 'assets/' + digest + '.' + extension(input.extension);
    await client.send(new s3.PutObjectCommand({ Bucket: required(bucket, 'bucket'), Key: objectKey, Body: bytes, ContentType: input.mediaType || 'application/octet-stream', Metadata: { sha256: digest, origin: String(input.origin || 'internal-generated') } }));
    return { bucket: bucket, objectKey: objectKey, sha256: digest, byteLength: bytes.length, mediaType: input.mediaType || 'application/octet-stream' };
  }
  return { put: put };
}
module.exports = { createS3ObjectStore: createS3ObjectStore, sha256: sha256 };
