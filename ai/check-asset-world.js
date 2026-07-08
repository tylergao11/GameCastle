var path = require('path');
var assetResolver = require('./asset-resolver');
var assetWorld = require('./asset-world');

var LOCAL_REPO = path.join(__dirname, 'assets', 'local-repo.json');
var CLOUD_REPO = path.join(__dirname, 'assets', 'cloud-repo.json');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeGeneratedAsset(slotId) {
  return {
    slotId: slotId,
    status: 'generated',
    source: 'generatedExternal',
    assetId: 'generated.enemy.dragon.001',
    repoAssetId: null,
    provider: 'external-image-api',
    path: 'output/assets/generated-enemy-dragon.png',
    format: 'png',
    sha1: 'generated-dragon-sha1',
    width: 256,
    height: 256,
    transparent: true,
    semanticTags: ['enemy', 'dragon', 'boss'],
    styleTags: ['arcade', 'bright'],
    confidence: 0.92,
    prompt: 'Arcade dragon enemy sprite.',
    negativePrompt: '',
    seed: 42,
    cost: {
      currency: 'USD',
      estimated: 0.08,
      reason: 'external image generation'
    },
    resolution: {
      strategy: 'generate',
      rank: 0,
      candidatesConsidered: 0,
      cacheHit: false,
      ownerOnFailure: 'ImageAgent'
    },
    publishability: {
      playable: true,
      publishable: true,
      repoEligible: true,
      trainingEligible: false,
      blocksFinalExport: false,
      debt: 'none'
    }
  };
}

function makePlaceholderAsset(slotId) {
  return {
    slotId: slotId,
    status: 'placeholder',
    source: 'runtimeFallback',
    assetId: null,
    repoAssetId: null,
    provider: null,
    path: 'runtime://placeholder/' + slotId,
    format: 'png',
    sha1: 'placeholder-sha1',
    width: 128,
    height: 128,
    transparent: true,
    semanticTags: ['background'],
    styleTags: ['arcade'],
    confidence: 0,
    resolution: {
      strategy: 'placeholder',
      rank: 0,
      candidatesConsidered: 0,
      cacheHit: false,
      ownerOnFailure: 'ImageAgent'
    },
    publishability: {
      playable: true,
      publishable: false,
      repoEligible: false,
      trainingEligible: false,
      blocksFinalExport: true,
      debt: 'asset_missing'
    }
  };
}

function testAssetWorldFromResolverManifest() {
  var slot = {
    slotId: 'asset.ui.play_icon',
    kind: 'icon',
    purpose: 'play button',
    required: true,
    owner: 'RuntimeAssetResolver',
    semanticTags: ['play', 'start', 'primary_action'],
    styleTags: ['arcade', 'bright', 'flat'],
    target: { scene: 'Start', object: 'StartButton', binding: 'uiImage', moduleId: 'shell.start_screen' },
    constraints: {
      width: 128,
      height: 128,
      transparent: true,
      style: 'arcade',
      semantic: ['play', 'start', 'primary_action'],
      negative: []
    },
    repoPolicy: {
      preferReuse: true,
      lookupOrder: ['cloudRepoExact'],
      maxCandidates: 3,
      allowCrossGameReuse: true,
      allowLicensedAssets: true,
      requiredLicense: 'commercial',
      minConfidence: 0.7
    },
    resolutionPolicy: {
      allowExactCache: false,
      allowRepoMatch: true,
      allowVariant: true,
      allowGeneration: true,
      allowPlaceholder: true,
      visionReview: 'lowConfidence'
    },
    fallback: {
      strategy: 'placeholder',
      source: 'runtimeFallback',
      publishable: false,
      repoEligible: false,
      trainingEligible: false,
      blocksFinalExport: true,
      debt: 'asset_missing'
    },
    publishPolicy: {
      playableWithPlaceholder: true,
      publishableWithPlaceholder: false,
      repoEligibleWhenGenerated: true,
      trainingEligibleWhenGenerated: false
    }
  };
  var manifest = assetResolver.resolveAssetContract({
    meta: { contractId: 'asset-world-resolver-test' },
    assetContract: {
      slots: [slot],
      resolutionDefaults: { cacheKeyFields: [] }
    }
  }, {
    repositoryPaths: [LOCAL_REPO, CLOUD_REPO]
  });
  var world = assetWorld.buildAssetWorld(manifest, null);
  assert(world.slots.length === 1, 'asset world should include resolved slot');
  assert(world.slots[0].source === 'cloudRepo', 'asset world should preserve asset source');
  assert(world.summary.reused === 1, 'asset world should summarize reused assets');
  assert(world.summary.debtCount === 0, 'asset world should not invent debt');
}

function testPromotionQueueAndVersionStability() {
  var manifest = {
    meta: { contractId: 'asset-world-test:asset-manifest' },
    buildContractId: 'asset-world-test',
    assets: [
      makeGeneratedAsset('asset.enemy.dragon'),
      makePlaceholderAsset('asset.background.missing')
    ],
    summary: {
      resolved: 2,
      generated: 1,
      reused: 0,
      placeholders: 1,
      failed: 0,
      cacheHit: false,
      publishable: false
    }
  };
  var first = assetWorld.buildAssetWorld(manifest, null, { styleTags: ['arcade'] });
  var second = assetWorld.buildAssetWorld(manifest, first, { styleTags: ['arcade'] });
  assert(first.cloudPromotionQueue.length === 1, 'generated repo-eligible asset should enter cloud promotion queue');
  assert(first.cloudPromotionQueue[0].slotId === 'asset.enemy.dragon', 'promotion queue should name generated slot');
  assert(first.debts.length === 1, 'placeholder should become asset world debt');
  assert(first.debts[0].blocksFinalExport === true, 'placeholder debt should block final export');
  assert(second.worldVersion === first.worldVersion, 'equivalent asset world should keep stable worldVersion');
  assert(second.semanticHash === first.semanticHash, 'equivalent asset world should keep semanticHash');
}

function main() {
  testAssetWorldFromResolverManifest();
  console.log('[AssetWorld] resolver manifest context passed');
  testPromotionQueueAndVersionStability();
  console.log('[AssetWorld] promotion queue and version stability passed');
  console.log('[AssetWorld] all passed');
}

main();
