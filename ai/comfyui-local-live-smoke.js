/* Explicit opt-in only. Never runs from normal tests and never installs or downloads anything. */
var fs = require('fs');
var os = require('os');
var path = require('path');
var runtimeModule = require('./provider-runtime');
var assetEngine = require('./asset-engine-langgraph');
var persistence = require('./asset-persistence-bridge');
var cloudRepository = require('./cloud-library-repository');
var s3Store = require('./s3-object-store');
var { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');

function requireEnvironment() {
  ['COMFYUI_ALLOW_LOCAL', 'COMFYUI_ENDPOINT', 'COMFYUI_MODEL_PATH', 'COMFYUI_MODEL_SHA256'].forEach(function(name) { if (!process.env[name]) throw new Error('ComfyUI live smoke requires ' + name + '.'); });
  if (process.env.ASSET_MODEL_PROVIDER !== 'comfyui-local') throw new Error('ComfyUI live smoke requires ASSET_MODEL_PROVIDER=comfyui-local.');
  if (process.env.COMFYUI_ALLOW_LOCAL !== 'true') throw new Error('ComfyUI live smoke requires COMFYUI_ALLOW_LOCAL=true.');
}
(async function() {
  requireEnvironment();
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-comfy-live-'));
  var repository = null;
  try {
    var slot = { slotId: 'asset.live.comfy', kind: 'sprite', styleId: 'gamecastle.style-1', semanticTags: ['small game hero'], styleTags: ['gamecastle.style-1'], constraints: { width: 64, height: 64, transparent: false } };
    var runtime = runtimeModule.createProviderRuntime({ maxCost: Number(process.env.COMFYUI_LIVE_SMOKE_MAX_COST || 1), receiptDir: path.join(root, 'receipts') });
    var revisions = [], derivations = [], audits = [], objectRoot = path.join(root, 'object-store'), liveCloud = process.env.GAMECASTLE_LIVE_CLOUD_LIBRARY === 'true', bridge;
    if (liveCloud) {
      repository = cloudRepository.createCloudLibraryRepository(); await repository.connect();
      bridge = persistence.createAssetPersistenceBridge({ objectStore: s3Store.createS3ObjectStore(), repository: repository });
    } else {
      bridge = persistence.createAssetPersistenceBridge({
        objectStore: { put: async function(input) { var objectKey = path.join('objects', input.sha256 + '.' + input.extension); var target = path.join(objectRoot, objectKey); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, input.bytes); return { objectKey: objectKey, byteLength: input.bytes.length, mediaType: input.mediaType }; } },
        repository: { putAssetRevision: async function(input) { revisions.push(input); return input; }, putDerivationReceipt: async function(input) { derivations.push(input); return input; }, audit: async function(action, revisionId, detail) { audits.push({ action: action, revisionId: revisionId, detail: detail }); return 'audit.' + revisionId; } }
      });
    }
    var result = await assetEngine.runAssetEngine({ runId: 'comfy-live-' + Date.now(), projectId: 'comfy-live-smoke', buildContract: { assetContract: { slots: [slot] } }, sources: { 'asset.live.comfy': { kind: 'generation_required' } }, providerRuntime: runtime, providerOptions: { provider: 'comfyui-local', estimatedCost: 0.1, timeoutMs: Number(process.env.COMFYUI_LIVE_SMOKE_TIMEOUT_MS || 600000) }, modelPolicy: { provider: 'comfyui-local', localAllowed: true }, projectAssetDir: path.join(root, 'project-assets'), ledger: {}, persistAcceptedGeneratedAssets: true, persistenceMode: 'verification-staging', assetFamilyIds: { 'asset.live.comfy': 'asset-family.comfy-live-smoke' }, assetPersistenceBridge: bridge });
    if (!result.accepted || result.debts.length) throw new Error('Live asset engine did not accept generated candidate: ' + JSON.stringify(result.debts));
    var asset = result.assetManifest.assets[0];
    if (!fs.existsSync(asset.path) || asset.providerReceipt.simulated) throw new Error('Live smoke did not produce a real project-local PNG.');
    if (!result.cloudLibraryAssets.length || (!liveCloud && (!revisions.length || !derivations.length || !audits.length))) throw new Error('Live smoke did not persist AssetRevision and derivation evidence.');
    if (liveCloud) {
      var persisted = result.cloudLibraryAssets[0], stored = await repository.getAssetRevisionByHash(persisted.sha256);
      if (!stored || stored.revision_id !== persisted.revisionId || stored.object_key !== persisted.objectKey) throw new Error('Live cloud smoke could not read its persisted AssetRevision by SHA-256.');
      var s3 = new S3Client({ region: process.env.GAMECASTLE_S3_REGION || 'us-east-1', endpoint: process.env.GAMECASTLE_S3_ENDPOINT, forcePathStyle: true, credentials: { accessKeyId: process.env.GAMECASTLE_S3_ACCESS_KEY, secretAccessKey: process.env.GAMECASTLE_S3_SECRET_KEY } });
      await s3.send(new HeadObjectCommand({ Bucket: process.env.GAMECASTLE_S3_ASSET_BUCKET, Key: persisted.objectKey }));
      console.log('[ComfyUILiveSmoke] real PNG accepted, PostgreSQL AssetRevision/DerivationReceipt/AuditReceipt persisted, MinIO object verified, and project-local bound: ' + asset.path);
    } else console.log('[ComfyUILiveSmoke] real non-fixture PNG accepted, revision persisted, and project-local bound: ' + asset.path);
  } finally { if (repository) await repository.close(); fs.rmSync(root, { recursive: true, force: true }); }
})().catch(function(error) { console.error('[ComfyUILiveSmoke] ' + error.message); process.exit(1); });
