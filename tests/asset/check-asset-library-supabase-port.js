var assert = require('assert');
var crypto = require('crypto');
var fs = require('fs');
var http = require('http');
var os = require('os');
var path = require('path');
var libraryModule = require('../../packages/assets/src/asset-library');
var supabasePort = require('../../packages/assets/src/asset-library-supabase-port');
var frameSet = require('../../packages/assets/src/frame-set');
var png = require('../../packages/assets/src/local-derivation-port');

function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function response(reply, status, value, headers) { reply.writeHead(status, Object.assign({ 'Content-Type': 'application/json' }, headers || {})); reply.end(Buffer.isBuffer(value) ? value : JSON.stringify(value)); }
function read(request) { return new Promise(function(resolve, reject) { var parts = []; request.on('data', function(part) { parts.push(part); }); request.on('end', function() { resolve(Buffer.concat(parts)); }); request.on('error', reject); }); }
function storageFixture() {
  var buckets = new Set(), objects = new Map();
  var server = http.createServer(async function(request, reply) {
    if (request.headers.authorization !== 'Bearer fixture-service-key' || request.headers.apikey !== 'fixture-service-key') return response(reply, 401, { message: 'unauthorized' });
    var url = new URL(request.url, 'http://fixture'), parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (request.method === 'GET' && parts[0] === 'bucket' && parts.length === 2) return buckets.has(parts[1]) ? response(reply, 200, { id: parts[1], name: parts[1], public: false }) : response(reply, 404, { message: 'bucket missing' });
    if (request.method === 'POST' && parts[0] === 'bucket' && parts.length === 1) { var bucket = JSON.parse((await read(request)).toString('utf8')).id; buckets.add(bucket); return response(reply, 200, { id: bucket, name: bucket, public: false }); }
    if (parts[0] === 'object' && parts.length >= 3) {
      var key = parts.slice(2).join('/'), index = parts[1] + '/' + key;
      if (request.method === 'POST') { if (objects.has(index)) return response(reply, 409, { message: 'already exists' }); objects.set(index, await read(request)); return response(reply, 200, { Key: key }); }
      if (request.method === 'GET') { if (!objects.has(index)) return response(reply, 404, { message: 'object missing' }); return response(reply, 200, objects.get(index), { 'Content-Type': 'application/octet-stream' }); }
    }
    return response(reply, 404, { message: 'route missing' });
  });
  return { server: server, buckets: buckets, objects: objects };
}

(async function() {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-supabase-library-')), fixture = storageFixture();
  try {
    await new Promise(function(resolve) { fixture.server.listen(0, '127.0.0.1', resolve); });
    var address = fixture.server.address(), port = supabasePort.create({ url: 'http://127.0.0.1:' + address.port, serviceKey: 'fixture-service-key', bucket: 'gamecastle-assets' }), library = libraryModule.create(port);
    var imageA = png.encodePng({ width: 2, height: 2, data: Buffer.from([1,2,3,255, 4,5,6,255, 7,8,9,255, 10,11,12,255]) }), imageB = png.encodePng({ width: 2, height: 2, data: Buffer.from([12,11,10,255, 9,8,7,255, 6,5,4,255, 3,2,1,255]) });
    var staticPath = path.join(root, 'source.png'), frameAPath = path.join(root, 'frame-a.png'), frameBPath = path.join(root, 'frame-b.png'); fs.writeFileSync(staticPath, imageA); fs.writeFileSync(frameAPath, imageA); fs.writeFileSync(frameBPath, imageB);
    var staticRequirement = { semanticId: 'gem', description: 'Blue gem', roles: ['collectible'], productionFamily: 'prop', recipeId: 'prop-sprite.v1', styleId: 'gamecastle.style-dna.v1', constraints: { transparent: true }, resourceKind: 'image', acceptedFormats: ['png'] };
    var staticRevision = { revisionId: 'revision.gem.1', sha256: sha(imageA), resourceKind: 'image', format: 'png', path: staticPath, status: 'accepted' };
    await library.publish(staticRequirement, staticRevision, { source: 'fixture' });
    var staticRecord = await library.lookup(staticRequirement), staticMaterialized = await library.materialize(staticRecord, { projectId: 'project-b', targetDirectory: path.join(root, 'project-b') });
    assert.strictEqual(sha(fs.readFileSync(staticMaterialized.path)), staticRevision.sha256);
    assert(staticMaterialized.path.indexOf(path.join(root, 'project-b')) === 0);
    var animationRequirement = Object.assign({}, staticRequirement, { semanticId: 'gem-animation', description: 'Blue gem idle animation', productionFamily: 'effect-animation', recipeId: 'effect-frame-set.v1' });
    var animation = frameSet.accept({ schemaVersion: frameSet.contract.schemaVersion, documentKind: frameSet.contract.candidateDocumentKind, resourceKind: frameSet.contract.resource.resourceKind, format: frameSet.contract.resource.format, initialStateId: 'idle', canvas: { width: 2, height: 2 }, anchor: { x: 1, y: 2 }, frames: [{ frameId: 'idle.0', sha256: sha(imageA), path: frameAPath, width: 2, height: 2, durationMs: 120 }, { frameId: 'idle.1', sha256: sha(imageB), path: frameBPath, width: 2, height: 2, durationMs: 120 }], states: [{ stateId: 'idle', frameIds: ['idle.0', 'idle.1'], loop: true }] }, 'acceptance.frames.gem.idle.1');
    await library.publish(animationRequirement, animation, { source: 'fixture' });
    var animationRecord = await library.lookup(animationRequirement), animationMaterialized = await library.materialize(animationRecord, { projectId: 'project-c', targetDirectory: path.join(root, 'project-c') });
    assert.strictEqual(animationMaterialized.contentHash, animation.contentHash);
    assert(animationMaterialized.frames.every(function(frame) { return frame.path.indexOf(path.join(root, 'project-c')) === 0 && sha(fs.readFileSync(frame.path)) === frame.sha256; }));
    assert.strictEqual(fixture.buckets.has('gamecastle-assets'), true);
    assert.strictEqual(fixture.objects.size, 4, 'content-addressed blobs must deduplicate while each requirement keeps one immutable record');
    console.log('[SupabaseAssetLibraryPort] immutable publication, lookup, cross-project materialization, FrameSet path independence, and upstream StorageClient mapping passed');
  } finally { await new Promise(function(resolve) { fixture.server.close(resolve); }); fs.rmSync(root, { recursive: true, force: true }); }
})().catch(function(error) { console.error(error); process.exit(1); });
