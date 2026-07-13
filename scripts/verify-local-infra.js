/* Real-stack probe: PostgreSQL/pgvector migrations plus MinIO health and required buckets. */
var { Client } = require('pg');
var { S3Client, ListBucketsCommand } = require('@aws-sdk/client-s3');

function required(value, name) { if (!value) throw new Error(name + ' is required'); return value; }
async function main() {
  var databaseUrl = process.env.GAMECASTLE_DATABASE_URL || 'postgres://gamecastle:gamecastle_dev_only@127.0.0.1:5432/gamecastle';
  var endpoint = process.env.GAMECASTLE_S3_ENDPOINT || 'http://127.0.0.1:9000';
  var client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    var vector = await client.query("SELECT extversion FROM pg_extension WHERE extname = 'vector'");
    if (vector.rows.length !== 1) throw new Error('pgvector extension is unavailable');
    var migrations = await client.query('SELECT version FROM schema_migration ORDER BY version');
    var expected = ['001_cloud_library', '002_module_release_history', '003_module_provenance_and_compositions'];
    if (expected.some(function(version) { return migrations.rows.map(function(row) { return row.version; }).indexOf(version) < 0; })) throw new Error('cloud-library migrations are incomplete');
    var health = await fetch(endpoint.replace(/\/$/, '') + '/minio/health/live');
    if (!health.ok) throw new Error('MinIO health endpoint returned ' + health.status);
    var s3 = new S3Client({ region: process.env.GAMECASTLE_S3_REGION || 'us-east-1', endpoint: endpoint, forcePathStyle: true, credentials: { accessKeyId: process.env.GAMECASTLE_S3_ACCESS_KEY || 'gamecastle', secretAccessKey: process.env.GAMECASTLE_S3_SECRET_KEY || 'gamecastle_dev_only' } });
    var buckets = await s3.send(new ListBucketsCommand({}));
    var names = (buckets.Buckets || []).map(function(bucket) { return bucket.Name; });
    ['gamecastle-assets', 'gamecastle-artifacts'].forEach(function(bucket) { if (names.indexOf(bucket) < 0) throw new Error('required MinIO bucket is unavailable: ' + bucket); });
    console.log('[LocalInfra] PostgreSQL pgvector ' + vector.rows[0].extversion + ', migrations ' + expected.length + ', MinIO health, and required buckets passed');
  } finally { await client.end().catch(function() {}); }
}
main().catch(function(error) { console.error('[LocalInfra] ' + error.message); process.exit(1); });
