/* Live acceptance probe: real ComfyUI creation -> private cloud publication -> cross-project reuse. */
var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var assetEngine = require('../../packages/assets/src/asset-engine-langgraph');
var outboxModule = require('../../packages/assets/src/asset-publication-outbox');
var publisher = require('../../packages/assets/src/asset-library-publisher');
var providerRuntime = require('../../packages/providers/src/provider-runtime');
var supabaseAssetLibrary = require('../../packages/assets/src/asset-library-supabase-port');

['GAMECASTLE_ASSET_LIBRARY_URL', 'GAMECASTLE_ASSET_LIBRARY_SERVICE_KEY', 'GAMECASTLE_ASSET_LIBRARY_BUCKET', 'COMFYUI_ENDPOINT', 'COMFYUI_ALLOW_LOCAL', 'COMFYUI_MODEL_PATH', 'COMFYUI_MODEL_SHA256'].forEach(function(name) {
  if (!process.env[name]) throw new Error('Cloud-library live smoke requires ' + name + '.');
});
if (process.env.COMFYUI_ALLOW_LOCAL !== 'true') throw new Error('Cloud-library live smoke requires COMFYUI_ALLOW_LOCAL=true.');

var probeId = 'cloud_library_blue_gem_' + Date.now(), staticId = probeId + '_static', animationId = probeId + '_animation';
function requirements() {
  return {
    schemaVersion: 2,
    documentKind: 'semantic-asset-requirements',
    sourceHash: 'gamecastle.cloud-library.live-smoke.' + probeId,
    requirements: [{
      semanticId: staticId,
      subject: 'blue gem',
      description: 'Single small blue gem game icon, chunky low-resolution raster-toon silhouette, limited blue color ramp, transparent background, no text.',
      roles: ['gem', probeId],
      gdjsBindings: [],
      productionFamily: 'prop',
      recipeId: 'prop-sprite.v1',
      styleId: 'gamecastle.style-dna.v1',
      constraints: { width: 256, height: 256, transparent: true }
    }, {
      semanticId: animationId,
      subject: 'blue gem',
      description: 'Single small blue gem idle animation, chunky low-resolution raster-toon silhouette, limited blue color ramp, transparent background, no text.',
      roles: ['gem', 'animated', probeId],
      gdjsBindings: [],
      productionFamily: 'effect-animation',
      recipeId: 'effect-frame-set.v1',
      styleId: 'gamecastle.style-dna.v1',
      constraints: { width: 128, height: 128, transparent: true },
      animation: { initialStateId: 'idle', states: [{ stateId: 'idle', loop: true, frameCount: 4, frameDurationMs: 120, derivationProfileId: 'idle-bob' }] }
    }]
  };
}

function input(runId, projectId, projectAssetDir, libraryPort, runtime) {
  return {
    runId: runId,
    projectId: projectId,
    assetRequirementContract: requirements(),
    sources: (function() { var value = {}; value[staticId] = { kind: 'generation_required' }; value[animationId] = { kind: 'generation_required' }; return value; })(),
    providerRuntime: runtime,
    executionProfileId: 'asset-engine-production.v1',
    providerOptions: { provider: 'comfyui-local', estimatedCost: 0 },
    modelPolicy: { provider: 'comfyui-local', localAllowed: true },
    assetLibraryPort: libraryPort,
    projectAssetDir: projectAssetDir
  };
}
function failureSummary(result) {
  return {
    modelPolicy: result.modelPolicyReceipt && { allowed: result.modelPolicyReceipt.allowed, code: result.modelPolicyReceipt.code, provider: result.modelPolicyReceipt.provider },
    debts: (result.debts || []).map(function(item) { return { code: item.code, owner: item.owner, slotId: item.slotId }; }),
    workItems: result.assetProduction && result.assetProduction.workItems && result.assetProduction.workItems.map(function(item) { return { slotId: item.workItem.slotId, loopState: item.loopState, accepted: item.accepted, debt: item.debt && item.debt.code, masterImage: item.masterImage && item.masterImage.revisionId, derivedRevision: item.currentRevision && item.currentRevision.revisionId }; })
  };
}

(async function() {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-cloud-library-live-'));
  try {
    var libraryPort = supabaseAssetLibrary.create();
    var runtime = providerRuntime.createProviderRuntime({ maxCost: 2 });
    var created = await assetEngine.runAssetEngine(input('cloud-library-create-' + Date.now(), 'cloud-library-project-a', path.join(root, 'project-a'), libraryPort, runtime));
    if (!created.accepted) throw new Error('ComfyUI creation must complete acceptance before publication: ' + JSON.stringify(failureSummary(created)));
    assert.equal(created.assetPublicationOutboxEntries.length, 2, 'The first project must enqueue the static and FrameSet revisions: ' + JSON.stringify({ entries: created.assetPublicationOutboxEntries.length, assets: created.assetManifest.assets.map(function(asset) { return { slotId: asset.slotId, source: asset.source, frameSet: !!asset.frameSet }; }), events: created.assetLibraryAccelerationReport.events }));
    var firstStatic = created.assetManifest.assets.find(function(asset) { return !asset.frameSet; }), firstAnimation = created.assetManifest.assets.find(function(asset) { return asset.frameSet; });
    assert.equal(fs.existsSync(firstStatic.path), true, 'The accepted first-project static resource must be materialized locally.');
    assert(firstAnimation.frameSet.frames.every(function(frame) { return fs.existsSync(frame.path); }), 'Every first-project FrameSet frame must be materialized locally.');
    var publication = await publisher.drain({ outbox: outboxModule.create({ path: created.assetPublicationOutbox.path }), assetLibraryPort: libraryPort });
    assert.equal(publication.published.length, 2, 'The accumulation chain must publish both accepted revisions.');
    var reused = await assetEngine.runAssetEngine(input('cloud-library-reuse-' + Date.now(), 'cloud-library-project-b', path.join(root, 'project-b'), libraryPort, runtime));
    if (!reused.accepted) throw new Error('Cloud-library reuse must satisfy the same requirement: ' + JSON.stringify(failureSummary(reused)));
    assert.equal(reused.assetPublicationOutboxEntries.length, 0, 'The reused revision must not be republished.');
    var secondStatic = reused.assetManifest.assets.find(function(asset) { return !asset.frameSet; }), secondAnimation = reused.assetManifest.assets.find(function(asset) { return asset.frameSet; });
    assert.equal(secondStatic.source, 'assetLibrary', 'The second project static asset must resolve from AssetLibrary.'); assert.equal(secondAnimation.source, 'assetLibrary', 'The second project FrameSet must resolve from AssetLibrary.');
    assert.equal(secondStatic.sha256, firstStatic.sha256, 'Cross-project static materialization must retain SHA-256.'); assert.equal(secondAnimation.frameSet.contentHash, firstAnimation.frameSet.contentHash, 'Cross-project FrameSet materialization must retain content identity.');
    assert.equal(fs.existsSync(secondStatic.path), true, 'The reused static resource must be materialized into the second project.'); assert(secondAnimation.frameSet.frames.every(function(frame) { return fs.existsSync(frame.path); }), 'Every reused FrameSet frame must be materialized into the second project.');
    process.stdout.write('[AssetEngineCloudLibraryLiveSmoke] ' + JSON.stringify({ firstProjectSources: created.assetManifest.assets.map(function(asset) { return asset.source; }), secondProjectSources: reused.assetManifest.assets.map(function(asset) { return asset.source; }), staticSha256: secondStatic.sha256, frameSetContentHash: secondAnimation.frameSet.contentHash, publicationCount: publication.published.length, reusePublicationCount: reused.assetPublicationOutboxEntries.length }) + '\n');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
})().catch(function(error) { console.error('[AssetEngineCloudLibraryLiveSmoke] ' + (error.stack || error.message)); process.exit(1); });
