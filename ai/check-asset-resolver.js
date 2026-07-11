var fs = require('fs');
var path = require('path');
var assetResolver = require('./asset-resolver');

var ROOT = path.join(__dirname, '..');
var OUTPUT_DIR = path.join(ROOT, 'output');
var CACHE_PATH = path.join(OUTPUT_DIR, '.asset-resolver-test-cache.json');
var LOCAL_REPO = path.join(__dirname, 'assets', 'local-repo.json');
var CLOUD_REPO = path.join(__dirname, 'assets', 'cloud-repo.json');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeSlot(slotId, kind, semanticTags, styleTags, options) {
  options = options || {};
  return {
    slotId: slotId,
    kind: kind,
    purpose: options.purpose || slotId,
    required: true,
    owner: 'RuntimeAssetResolver',
    semanticTags: semanticTags,
    styleTags: styleTags,
    target: {
      scene: options.scene || null,
      object: options.object || null,
      binding: options.binding || 'uiImage',
      moduleId: options.moduleId || null,
    },
    constraints: {
      width: options.width || 128,
      height: options.height || 128,
      transparent: options.transparent !== false,
      style: styleTags[0] || 'arcade',
      semantic: semanticTags,
      negative: [],
    },
    repoPolicy: {
      preferReuse: true,
      lookupOrder: options.lookupOrder || ['exactCache', 'cloudRepoExact', 'cloudRepoSemantic', 'localProject', 'externalGeneration', 'runtimePlaceholder'],
      maxCandidates: 3,
      allowCrossGameReuse: true,
      allowLicensedAssets: true,
      requiredLicense: options.requiredLicense || 'commercial',
      minConfidence: options.minConfidence === undefined ? 0.7 : options.minConfidence,
    },
    resolutionPolicy: {
      allowExactCache: true,
      allowRepoMatch: true,
      allowVariant: true,
      allowGeneration: options.allowGeneration !== false,
      allowPlaceholder: options.allowPlaceholder !== false,
      visionReview: 'lowConfidence',
    },
    fallback: {
      strategy: 'placeholder',
      source: 'runtimeFallback',
      placeholderColor: '#ff00ff',
      reason: 'Prototype continuity fallback.',
      publishable: false,
      repoEligible: false,
      trainingEligible: false,
      blocksFinalExport: true,
      debt: 'asset_missing',
    },
    publishPolicy: {
      playableWithPlaceholder: true,
      publishableWithPlaceholder: false,
      repoEligibleWhenGenerated: false,
      trainingEligibleWhenGenerated: false,
    },
  };
}

function makeBuildContract(slots) {
  return {
    meta: {
      schemaVersion: 1,
      contractId: 'asset-resolver-test',
      createdAt: '2026-07-08T00:00:00.000Z',
      owner: 'CreativeImagination',
      status: 'ready',
    },
    assetContract: {
      slots: slots,
      globalConstraints: {
        allowTextInImages: false,
        allowedFormats: ['png', 'webp'],
        outputRoot: 'output/assets',
        cloudRepoRequired: false,
      },
      resolutionDefaults: {
        preferRepo: true,
        generateOnlyOnMiss: true,
        placeholderIsDebt: true,
        cacheKeyFields: ['kind', 'semanticTags', 'styleTags', 'width', 'height', 'transparent', 'requiredLicense'],
      },
    },
  };
}

function cleanup() {
  if (fs.existsSync(CACHE_PATH)) fs.unlinkSync(CACHE_PATH);
}

function resolve(slots) {
  return assetResolver.resolveAssetContract(makeBuildContract(slots), {
    repositoryPaths: [LOCAL_REPO, CLOUD_REPO],
    cachePath: CACHE_PATH,
  });
}

function testRepoResolutionAndPlaceholderDebt() {
  cleanup();
  var manifest = resolve([
    makeSlot('asset.ui.play_icon', 'icon', ['play', 'start', 'primary_action'], ['arcade', 'bright', 'flat']),
    makeSlot('asset.sprite.unknown_boss', 'sprite', ['boss', 'dragon'], ['ink', 'dark'], {
      width: 256,
      height: 256,
      minConfidence: 0.95,
    }),
  ]);
  var playIcon = manifest.assets.find(function(asset) { return asset.slotId === 'asset.ui.play_icon'; });
  var boss = manifest.assets.find(function(asset) { return asset.slotId === 'asset.sprite.unknown_boss'; });
  assert(playIcon.status === 'reused', 'play icon should reuse cloud repo asset');
  assert(playIcon.source === 'cloudRepo', 'play icon should come from cloud repo on first run');
  assert(playIcon.resolution.strategy === 'repoExact', 'play icon should use exact repo strategy');
  assert(playIcon.publishability.publishable === true, 'repo asset should be publishable');
  assert(boss.status === 'placeholder', 'missing boss should become placeholder debt');
  assert(boss.source === 'runtimeFallback', 'missing boss should use runtime fallback');
  assert(boss.publishability.playable === true, 'placeholder should keep prototype playable');
  assert(boss.publishability.publishable === false, 'placeholder should not be publishable');
  assert(boss.publishability.repoEligible === false, 'placeholder must not be repo eligible');
  assert(boss.publishability.trainingEligible === false, 'placeholder must not be training eligible');
  assert(boss.publishability.blocksFinalExport === true, 'placeholder should block final export');
  assert(boss.resolution.ownerOnFailure === 'ImageAgent', 'generation-allowed miss should route future repair to ImageAgent');
  assert(manifest.summary.reused === 1, 'summary should count reused assets');
  assert(manifest.summary.placeholders === 1, 'summary should count placeholders');
  assert(manifest.summary.publishable === false, 'placeholder debt should make manifest non-publishable');
}

function testExactCacheHit() {
  var first = resolve([
    makeSlot('asset.ui.play_icon', 'icon', ['play', 'start', 'primary_action'], ['arcade', 'bright', 'flat']),
  ]);
  assert(first.assets[0].source === 'exactCache', 'second run setup should already hit cache from previous test');

  var second = resolve([
    makeSlot('asset.ui.play_icon', 'icon', ['play', 'start', 'primary_action'], ['arcade', 'bright', 'flat']),
  ]);
  assert(second.assets[0].source === 'exactCache', 'second equivalent resolve should use exact cache');
  assert(second.assets[0].resolution.cacheHit === true, 'cache hit flag should be true');
  assert(second.summary.cacheHit === true, 'manifest summary should report cache hit');
}

function testLocalRepositoryResolution() {
  cleanup();
  var manifest = resolve([
    makeSlot('asset.sprite.hero', 'sprite', ['hero', 'player', 'runner'], ['arcade', 'prototype', 'bright'], {
      width: 32,
      height: 48,
      binding: 'objectTexture',
      requiredLicense: 'prototype',
      lookupOrder: ['localProject', 'runtimePlaceholder'],
    }),
  ]);
  assert(manifest.assets[0].source === 'localProject', 'local manifest should satisfy local project lookup');
  assert(manifest.assets[0].repoAssetId.indexOf('gamecastle.local.prototype') === 0, 'local repo id should be recorded');
}

function main() {
  assetResolver.loadAssetRepositoryManifest(LOCAL_REPO);
  assetResolver.loadAssetRepositoryManifest(CLOUD_REPO);
  testRepoResolutionAndPlaceholderDebt();
  console.log('[AssetResolver] repo resolution and placeholder debt passed');
  testExactCacheHit();
  console.log('[AssetResolver] exact cache hit passed');
  testLocalRepositoryResolution();
  console.log('[AssetResolver] local repository lookup passed');
  cleanup();
  console.log('[AssetResolver] all passed');
}

main();
