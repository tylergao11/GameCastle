var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var ASSET_WORLD_SCHEMA_VERSION = 1;

function clone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function stableStringify(value) {
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(function(key) {
      return JSON.stringify(key) + ':' + stableStringify(value[key]);
    }).join(',') + '}';
  }
  return JSON.stringify(value);
}

function shortHash(value) {
  return crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 8);
}

function loadJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function saveJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function getAssetWorldPath(stateDir) {
  return path.join(stateDir, 'asset-world.json');
}

function loadAssetWorld(stateDir) {
  return loadJson(getAssetWorldPath(stateDir), null);
}

function saveAssetWorld(stateDir, world) {
  saveJson(getAssetWorldPath(stateDir), world);
}

function uniqueSorted(values) {
  var seen = {};
  (values || []).forEach(function(value) {
    if (value !== undefined && value !== null && String(value).trim()) {
      seen[String(value).trim().toLowerCase()] = String(value).trim().toLowerCase();
    }
  });
  return Object.keys(seen).sort();
}

function summarizeSlot(asset) {
  return {
    slotId: asset.slotId,
    status: asset.status,
    source: asset.source,
    assetId: asset.assetId || null,
    repoAssetId: asset.repoAssetId || null,
    path: asset.path,
    format: asset.format,
    width: asset.width,
    height: asset.height,
    transparent: !!asset.transparent,
    confidence: asset.confidence || 0,
    cacheHit: !!(asset.resolution && asset.resolution.cacheHit),
    publishability: clone(asset.publishability),
    debt: asset.publishability ? asset.publishability.debt : 'none',
    ownerOnFailure: asset.resolution ? asset.resolution.ownerOnFailure : null,
  };
}

function makePromotionCandidate(asset) {
  return {
    slotId: asset.slotId,
    assetId: asset.assetId || null,
    path: asset.path,
    provider: asset.provider || null,
    prompt: asset.prompt || '',
    negativePrompt: asset.negativePrompt || '',
    seed: asset.seed === undefined ? null : asset.seed,
    sha1: asset.sha1,
    width: asset.width,
    height: asset.height,
    format: asset.format,
    source: asset.source,
    status: asset.status,
    cost: asset.cost || null,
    reason: 'Generated or edited asset is repo eligible; promote to cloud repository candidate.',
  };
}

function buildAssetWorld(assetManifest, previousWorld, options) {
  options = options || {};
  assetManifest = assetManifest || { assets: [], summary: {} };
  var assets = assetManifest.assets || [];
  var slots = assets.map(summarizeSlot).sort(function(a, b) {
    return a.slotId.localeCompare(b.slotId);
  });
  var debts = slots.filter(function(slot) {
    return slot.debt && slot.debt !== 'none';
  }).map(function(slot) {
    return {
      slotId: slot.slotId,
      debt: slot.debt,
      blocksFinalExport: !!(slot.publishability && slot.publishability.blocksFinalExport),
      ownerOnFailure: slot.ownerOnFailure,
    };
  });
  var cloudPromotionQueue = assets.filter(function(asset) {
    return (asset.status === 'generated' || asset.status === 'variant') &&
      asset.publishability &&
      asset.publishability.repoEligible === true;
  }).map(makePromotionCandidate);

  var world = {
    schemaVersion: ASSET_WORLD_SCHEMA_VERSION,
    worldVersion: 1,
    buildContractId: assetManifest.buildContractId || null,
    assetManifestId: assetManifest.meta ? assetManifest.meta.contractId : null,
    styleTags: uniqueSorted([].concat.apply([], assets.map(function(asset) {
      return asset.styleTags || [];
    })).concat(options.styleTags || [])),
    slots: slots,
    debts: debts,
    cloudPromotionQueue: cloudPromotionQueue,
    summary: {
      totalSlots: slots.length,
      resolved: assetManifest.summary ? assetManifest.summary.resolved || 0 : 0,
      reused: assetManifest.summary ? assetManifest.summary.reused || 0 : 0,
      generated: assetManifest.summary ? assetManifest.summary.generated || 0 : 0,
      placeholders: assetManifest.summary ? assetManifest.summary.placeholders || 0 : 0,
      failed: assetManifest.summary ? assetManifest.summary.failed || 0 : 0,
      cacheHit: !!(assetManifest.summary && assetManifest.summary.cacheHit),
      publishable: !!(assetManifest.summary && assetManifest.summary.publishable),
      promotionCandidates: cloudPromotionQueue.length,
      debtCount: debts.length,
    },
  };

  var semanticPayload = {
    buildContractId: world.buildContractId,
    slots: world.slots,
    debts: world.debts,
    cloudPromotionQueue: world.cloudPromotionQueue,
    summary: world.summary,
  };
  world.semanticHash = shortHash(stableStringify(semanticPayload));
  if (previousWorld && previousWorld.semanticHash === world.semanticHash) {
    world.worldVersion = previousWorld.worldVersion || 1;
  } else if (previousWorld && previousWorld.worldVersion) {
    world.worldVersion = previousWorld.worldVersion + 1;
  }
  return world;
}

module.exports = {
  ASSET_WORLD_SCHEMA_VERSION: ASSET_WORLD_SCHEMA_VERSION,
  buildAssetWorld: buildAssetWorld,
  getAssetWorldPath: getAssetWorldPath,
  loadAssetWorld: loadAssetWorld,
  saveAssetWorld: saveAssetWorld,
};
