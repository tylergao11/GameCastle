var crypto = require('crypto');

var days = Number(process.argv[2]);
if (!Number.isInteger(days) || days < 1) throw new Error('Usage: node scripts/generate-asset-library-dev-secrets.js <expires-days>');
function base64url(value) { return Buffer.from(value).toString('base64url'); }
var now = Math.floor(Date.now() / 1000), secret = crypto.randomBytes(32).toString('base64url');
var header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
var payload = base64url(JSON.stringify({ role: 'service_role', iss: 'gamecastle-asset-library', iat: now, exp: now + days * 24 * 60 * 60 }));
var signature = crypto.createHmac('sha256', secret).update(header + '.' + payload).digest('base64url');
process.stdout.write('GAMECASTLE_STORAGE_JWT_SECRET=' + secret + '\nGAMECASTLE_ASSET_LIBRARY_SERVICE_KEY=' + header + '.' + payload + '.' + signature + '\n');
