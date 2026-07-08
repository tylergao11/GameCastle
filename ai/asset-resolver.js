var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var ASSET_REPOSITORY_SCHEMA_VERSION = 1;
var ASSET_CACHE_SCHEMA_VERSION = 1;
var ASSET_MANIFEST_SCHEMA_VERSION = 1;

function clone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
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

function sha1(text) {
  return crypto.createHash('sha1').update(String(text)).digest('hex');
}

function normalizeTags(tags) {
  return (tags || []).map(function(tag) {
    return String(tag).trim().toLowerCase();
  }).filter(Boolean).sort();
}

function hasAllTags(candidateTags, requestedTags) {
  var set = {};
  normalizeTags(candidateTags).forEach(function(tag) { set[tag] = true; });
  return normalizeTags(requestedTags).every(function(tag) { return !!set[tag]; });
}

function overlapCount(candidateTags, requestedTags) {
  var set = {};
  normalizeTags(candidateTags).forEach(function(tag) { set[tag] = true; });
  return normalizeTags(requestedTags).filter(function(tag) { return !!set[tag]; }).length;
}

function safeNumber(value, fallback) {
  var number = Number(value);
  return isFinite(number) ? number : fallback;
}

function loadAssetRepositoryManifest(filePath) {
  var manifest = readJson(filePath);
  validateAssetRepositoryManifest(manifest, filePath);
  return manifest;
}

function loadAssetRepositories(filePaths) {
  return (filePaths || []).map(loadAssetRepositoryManifest);
}

function validateAssetRepositoryManifest(manifest, filePath) {
  if (!manifest || manifest.schemaVersion !== ASSET_REPOSITORY_SCHEMA_VERSION) {
    throw new Error('Unsupported asset repository schemaVersion: ' + filePath);
  }
  if (!manifest.repositoryId) throw new Error('Asset repository missing repositoryId: ' + filePath);
  if (['local', 'cloud'].indexOf(manifest.scope) < 0) {
    throw new Error('Asset repository ' + manifest.repositoryId + ' invalid scope: ' + manifest.scope);
  }
  if (!Array.isArray(manifest.assets)) {
    throw new Error('Asset repository ' + manifest.repositoryId + ' must define assets');
  }
  var seen = {};
  manifest.assets.forEach(function(asset) {
    ['assetId', 'kind', 'path', 'format', 'sha1', 'width', 'height', 'transparent', 'license'].forEach(function(field) {
      if (asset[field] === undefined || asset[field] === null) {
        throw new Error('Asset ' + (asset.assetId || '<unknown>') + ' missing field: ' + field);
      }
    });
    if (seen[asset.assetId]) throw new Error('Duplicate assetId in repository ' + manifest.repositoryId + ': ' + asset.assetId);
    seen[asset.assetId] = true;
    if (!Array.isArray(asset.semanticTags) || !Array.isArray(asset.styleTags)) {
      throw new Error('Asset ' + asset.assetId + ' must define semanticTags and styleTags arrays');
    }
  });
}

function loadAssetCache(cachePath) {
  if (!cachePath || !fs.existsSync(cachePath)) {
    return {
      schemaVersion: ASSET_CACHE_SCHEMA_VERSION,
      entries: {},
    };
  }
  var cache = readJson(cachePath);
  if (!cache || cache.schemaVersion !== ASSET_CACHE_SCHEMA_VERSION || !cache.entries) {
    throw new Error('Unsupported asset cache schemaVersion: ' + cachePath);
  }
  return cache;
}

function saveAssetCache(cachePath, cache) {
  if (!cachePath) return;
  writeJson(cachePath, cache);
}

function makeSlotSignature(slot, assetContract) {
  var constraints = slot.constraints || {};
  var repoPolicy = slot.repoPolicy || {};
  var defaults = (assetContract && assetContract.resolutionDefaults) || {};
  var key = {
    kind: slot.kind,
    semanticTags: normalizeTags(slot.semanticTags || constraints.semantic),
    styleTags: normalizeTags(slot.styleTags || [constraints.style]),
    width: safeNumber(constraints.width, 0),
    height: safeNumber(constraints.height, 0),
    transparent: !!constraints.transparent,
    requiredLicense: repoPolicy.requiredLicense || 'any',
    cacheKeyFields: defaults.cacheKeyFields || [],
  };
  return sha1(stableStringify(key));
}

function isLicenseAllowed(asset, slot) {
  var policy = slot.repoPolicy || {};
  var required = policy.requiredLicense || 'any';
  if (required === 'any') return true;
  if (asset.license === required) return true;
  if (required === 'commercial' && asset.license === 'owned') return true;
  if (required === 'owned' && asset.license !== 'owned') return false;
  return !!policy.allowLicensedAssets && asset.license !== 'prototype';
}

function sizeScore(asset, slot) {
  var constraints = slot.constraints || {};
  var requestedWidth = safeNumber(constraints.width, 0);
  var requestedHeight = safeNumber(constraints.height, 0);
  if (!requestedWidth || !requestedHeight) return 1;
  if (asset.width === requestedWidth && asset.height === requestedHeight) return 1;
  if (asset.width >= requestedWidth && asset.height >= requestedHeight) return 0.9;
  return 0.55;
}

function transparentScore(asset, slot) {
  var constraints = slot.constraints || {};
  if (constraints.transparent === undefined) return 1;
  return asset.transparent === constraints.transparent ? 1 : 0;
}

function scoreAsset(asset, slot, strategy) {
  if (asset.kind !== slot.kind) return 0;
  if (!isLicenseAllowed(asset, slot)) return 0;
  if (transparentScore(asset, slot) === 0) return 0;

  var semanticRequested = normalizeTags(slot.semanticTags || (slot.constraints && slot.constraints.semantic));
  var styleRequested = normalizeTags(slot.styleTags || [slot.constraints && slot.constraints.style]);
  var semanticTotal = Math.max(semanticRequested.length, 1);
  var styleTotal = Math.max(styleRequested.length, 1);
  var semanticScore = overlapCount(asset.semanticTags, semanticRequested) / semanticTotal;
  var styleScore = overlapCount(asset.styleTags, styleRequested) / styleTotal;
  var exactTags = hasAllTags(asset.semanticTags, semanticRequested) && hasAllTags(asset.styleTags, styleRequested);
  var score = (semanticScore * 0.5) + (styleScore * 0.3) + (sizeScore(asset, slot) * 0.15) + 0.05;

  if (strategy === 'repoExact') return exactTags ? Math.min(1, score + 0.15) : 0;
  if (strategy === 'repoSemantic') return semanticScore > 0 ? score : 0;
  if (strategy === 'repoStyle') return styleScore > 0 ? score : 0;
  if (strategy === 'localProject') return score;
  return score;
}

function repoScopeForLookup(lookup) {
  if (lookup === 'localProject') return 'local';
  if (lookup.indexOf('cloudRepo') === 0) return 'cloud';
  return null;
}

function strategyForLookup(lookup) {
  if (lookup === 'cloudRepoExact') return 'repoExact';
  if (lookup === 'cloudRepoSemantic') return 'repoSemantic';
  if (lookup === 'cloudRepoStyle') return 'repoStyle';
  if (lookup === 'localProject') return 'localProject';
  return lookup;
}

function collectCandidates(slot, repositories, lookup) {
  var scope = repoScopeForLookup(lookup);
  if (!scope) return [];
  var strategy = strategyForLookup(lookup);
  var candidates = [];
  repositories.forEach(function(repository) {
    if (repository.scope !== scope) return;
    repository.assets.forEach(function(asset) {
      var confidence = scoreAsset(asset, slot, strategy);
      if (confidence <= 0) return;
      candidates.push({
        repository: repository,
        asset: asset,
        confidence: Math.min(1, confidence),
        strategy: strategy,
      });
    });
  });
  candidates.sort(function(a, b) {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return String(a.asset.assetId).localeCompare(String(b.asset.assetId));
  });
  return candidates;
}

function formatCloudLibraryResult(slot, candidate, rank) {
  var asset = candidate.asset;
  return {
    slotId: slot.slotId,
    status: "reused",
    source: "cloudLibrary",
    assetId: asset.assetId,
    repoAssetId: null,
    provider: "cloud-library",
    path: asset.path,
    format: asset.format,
    sha1: asset.sha1,
    width: asset.width,
    height: asset.height,
    transparent: !!asset.transparent,
    semanticTags: clone(asset.semanticTags || []),
    styleTags: clone(asset.styleTags || []),
    confidence: Number(candidate.confidence.toFixed(4)),
    prompt: "",
    negativePrompt: "",
    seed: null,
    cloudCandidateId: candidate.cloudCandidateId || null,
    resolution: {
      strategy: "cloudLibrary",
      rank: rank,
      candidatesConsidered: 1,
      cacheHit: false,
      ownerOnFailure: "ImageAgent",
    },
    transform: { resize: false, recolor: false, crop: false, atlasPacked: false, processedPath: null },
    publishability: {
      playable: true,
      publishable: true,
      repoEligible: true,
      trainingEligible: false,
      blocksFinalExport: false,
      debt: "none",
    },
    collisionHint: (slot.constraints || {}).collisionHint || undefined,
  };
}

function formatAssetResult(slot, candidate, rank, cacheHit) {
  var asset = candidate.asset;
  var repository = candidate.repository;
  var source = repository.scope === 'local' ? 'localProject' : 'cloudRepo';
  return {
    slotId: slot.slotId,
    status: 'reused',
    source: cacheHit ? 'exactCache' : source,
    assetId: asset.assetId,
    repoAssetId: repository.repositoryId + ':' + asset.assetId,
    provider: repository.provider || null,
    path: asset.path,
    format: asset.format,
    sha1: asset.sha1,
    width: asset.width,
    height: asset.height,
    transparent: !!asset.transparent,
    semanticTags: clone(asset.semanticTags || []),
    styleTags: clone(asset.styleTags || []),
    confidence: Number(candidate.confidence.toFixed(4)),
    prompt: asset.prompt || '',
    negativePrompt: asset.negativePrompt || '',
    seed: asset.seed === undefined ? null : asset.seed,
    resolution: {
      strategy: cacheHit ? 'exactCache' : candidate.strategy,
      rank: rank,
      candidatesConsidered: candidate.candidatesConsidered || 1,
      cacheHit: !!cacheHit,
      ownerOnFailure: 'RuntimeAssetResolver',
    },
    transform: {
      resize: asset.width !== safeNumber((slot.constraints || {}).width, asset.width) ||
        asset.height !== safeNumber((slot.constraints || {}).height, asset.height),
      recolor: false,
      crop: false,
      atlasPacked: false,
      processedPath: null,
    },
    publishability: {
      playable: true,
      publishable: true,
      repoEligible: false,
      trainingEligible: false,
      blocksFinalExport: false,
      debt: 'none',
    },
    collisionHint: (slot.constraints || {}).collisionHint || undefined,
  };
}

function makePlaceholderResult(slot, reason, ownerOnFailure) {
  var fallback = slot.fallback || {};
  var publishPolicy = slot.publishPolicy || {};
  var constraints = slot.constraints || {};
  var safeSlot = slot.slotId.replace(/[^a-zA-Z0-9_.-]/g, '_');
  return {
    slotId: slot.slotId,
    status: 'placeholder',
    source: 'runtimeFallback',
    assetId: null,
    repoAssetId: null,
    provider: null,
    path: 'runtime://placeholder/' + safeSlot,
    format: 'png',
    sha1: sha1('placeholder|' + slot.slotId + '|' + (fallback.strategy || 'placeholder')),
    width: safeNumber(constraints.width, 1),
    height: safeNumber(constraints.height, 1),
    transparent: !!constraints.transparent,
    semanticTags: clone(slot.semanticTags || constraints.semantic || []),
    styleTags: clone(slot.styleTags || [constraints.style].filter(Boolean)),
    confidence: 0,
    prompt: '',
    negativePrompt: '',
    seed: null,
    resolution: {
      strategy: 'placeholder',
      rank: 0,
      candidatesConsidered: 0,
      cacheHit: false,
      ownerOnFailure: ownerOnFailure || 'RuntimeAssetResolver',
    },
    transform: {
      resize: false,
      recolor: false,
      crop: false,
      atlasPacked: false,
      processedPath: null,
    },
    publishability: {
      playable: publishPolicy.playableWithPlaceholder !== false,
      publishable: !!(publishPolicy.publishableWithPlaceholder && fallback.publishable),
      repoEligible: !!fallback.repoEligible,
      trainingEligible: !!fallback.trainingEligible,
      blocksFinalExport: fallback.blocksFinalExport !== false,
      debt: fallback.debt || 'asset_missing',
    },
    collisionHint: constraints.collisionHint || undefined,
    reason: reason || fallback.reason || 'Asset slot unresolved; runtime placeholder inserted.',
  };
}

function stripUndefined(value) {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value && typeof value === 'object') {
    var output = {};
    Object.keys(value).forEach(function(key) {
      if (value[key] !== undefined) output[key] = stripUndefined(value[key]);
    });
    return output;
  }
  return value;
}

function collectCloudLibraryCandidates(slot, cloudLibraryManager) {
  if (!cloudLibraryManager) return [];
  var strategy = "cloudLibrary";
  var candidates = [];
  var approved = cloudLibraryManager.getCandidatesByStatus("approved") || [];
  var promoted = cloudLibraryManager.getCandidatesByStatus("promoted") || [];
  var allCandidates = approved.concat(promoted);
  allCandidates.forEach(function(entry) {
    var hint = entry.distillHint || {};
    var asset = {
      kind: hint.kind || "sprite",
      semanticTags: hint.semanticTags || [],
      styleTags: hint.styleTags || [],
      width: entry.width || hint.width || 0,
      height: entry.height || hint.height || 0,
      transparent: !!(hint.transparent),
      license: "commercial",
      assetId: entry.candidateId,
      path: entry.storedPath,
      format: entry.format || "png",
      sha1: entry.contentHash,
    };
    var confidence = scoreAsset(asset, slot, strategy);
    if (confidence <= 0) return;
    candidates.push({
      repository: null,
      asset: asset,
      confidence: Math.min(1, confidence),
      strategy: strategy,
      source: "cloudLibrary",
      cloudCandidateId: entry.candidateId,
    });
  });
  candidates.sort(function(a, b) {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return String(a.asset.assetId).localeCompare(String(b.asset.assetId));
  });
  return candidates;
}

function resolveSlot(slot, context) {
  var cache = context.cache;
  var signature = makeSlotSignature(slot, context.assetContract);
  var resolutionPolicy = slot.resolutionPolicy || {};
  if (resolutionPolicy.allowExactCache !== false && cache.entries[signature]) {
    var cached = clone(cache.entries[signature]);
    cached.source = 'exactCache';
    cached.resolution.strategy = 'exactCache';
    cached.resolution.cacheHit = true;
    return cached;
  }

  var repoPolicy = slot.repoPolicy || {};
  var lookupOrder = repoPolicy.lookupOrder || ['cloudRepoExact', 'cloudRepoSemantic', 'localProject', 'runtimePlaceholder'];
  var maxCandidates = repoPolicy.maxCandidates || 5;
  var minConfidence = repoPolicy.minConfidence === undefined ? 0.6 : repoPolicy.minConfidence;
  var considered = 0;
  for (var i = 0; i < lookupOrder.length; i++) {
    var lookup = lookupOrder[i];
    if (lookup === 'cloudLibrary') {
      if (resolutionPolicy.allowRepoMatch === false) continue;
      if (context.cloudLibraryManager) {
        var libCandidates = collectCloudLibraryCandidates(slot, context.cloudLibraryManager).slice(0, maxCandidates);
        considered += libCandidates.length;
        for (var lc = 0; lc < libCandidates.length; lc++) {
          var libCandidate = libCandidates[lc];
          libCandidate.candidatesConsidered = considered;
          if (libCandidate.confidence >= minConfidence) {
            var libResult = formatCloudLibraryResult(slot, libCandidate, lc + 1);
            libResult.resolution.candidatesConsidered = considered;
            cache.entries[signature] = clone(libResult);
            return libResult;
          }
        }
      }
      continue;
    }
    if (lookup === 'exactCache' || lookup === 'variant' || lookup === 'externalGeneration' || lookup === 'runtimePlaceholder') continue;
    if (resolutionPolicy.allowRepoMatch === false) continue;
    var candidates = collectCandidates(slot, context.repositories, lookup).slice(0, maxCandidates);
    considered += candidates.length;
    for (var c = 0; c < candidates.length; c++) {
      var candidate = candidates[c];
      candidate.candidatesConsidered = considered;
      if (candidate.confidence < minConfidence) continue;
      var result = formatAssetResult(slot, candidate, c + 1, false);
      result.resolution.candidatesConsidered = considered;
      cache.entries[signature] = clone(result);
      return result;
    }
  }

  if (resolutionPolicy.allowGeneration) {
    return makePlaceholderResult(slot, 'ImageAgent is not wired; unresolved slot kept playable as placeholder debt.', 'ImageAgent');
  }
  if (resolutionPolicy.allowPlaceholder !== false) {
    return makePlaceholderResult(slot, 'Repository lookup missed and placeholder is allowed.', 'RuntimeAssetResolver');
  }
  var failed = makePlaceholderResult(slot, 'Repository lookup missed and placeholder is not allowed.', 'RuntimeAssetResolver');
  failed.status = 'failed';
  failed.publishability.playable = false;
  failed.publishability.publishable = false;
  failed.publishability.blocksFinalExport = true;
  return failed;
}

function makeMeta(buildContractId, status) {
  return {
    schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
    contractId: buildContractId + ':asset-manifest',
    createdAt: new Date().toISOString(),
    owner: 'RuntimeAssetResolver',
    status: status,
  };
}

function summarizeAssets(assets) {
  var summary = {
    resolved: 0,
    generated: 0,
    reused: 0,
    placeholders: 0,
    failed: 0,
    cacheHit: false,
    publishable: true,
  };
  assets.forEach(function(asset) {
    if (asset.status !== 'failed') summary.resolved++;
    if (asset.status === 'generated') summary.generated++;
    if (asset.status === 'reused' || asset.status === 'variant') summary.reused++;
    if (asset.status === 'placeholder') summary.placeholders++;
    if (asset.status === 'failed') summary.failed++;
    if (asset.resolution && asset.resolution.cacheHit) summary.cacheHit = true;
    if (!asset.publishability || !asset.publishability.publishable) summary.publishable = false;
  });
  return summary;
}

function resolveAssetContract(buildContract, options) {
  options = options || {};
  var assetContract = buildContract.assetContract || buildContract;
  var repositories = options.repositories || loadAssetRepositories(options.repositoryPaths || []);
  var cachePath = options.cachePath || null;
  var cache = loadAssetCache(cachePath);
  var context = {
    cloudLibraryManager: options.cloudLibraryManager || null,
    assetContract: assetContract,
    repositories: repositories,
    cache: cache,
  };
  var slots = assetContract.slots || [];
  var assets = slots.map(function(slot) {
    if (slot.owner !== 'RuntimeAssetResolver') {
      throw new Error('AssetSlot owner must be RuntimeAssetResolver: ' + slot.slotId);
    }
    return stripUndefined(resolveSlot(slot, context));
  });
  saveAssetCache(cachePath, cache);
  var summary = summarizeAssets(assets);
  return {
    meta: makeMeta((buildContract.meta && buildContract.meta.contractId) || 'build-contract', summary.failed ? 'partial' : 'ready'),
    buildContractId: (buildContract.meta && buildContract.meta.contractId) || 'build-contract',
    assets: assets,
    summary: summary,
  };
}

async function resolveAssetContractAsync(buildContract, options) {
  options = options || {};
  var assetContract = buildContract.assetContract || buildContract;
  var repositories = options.repositories || loadAssetRepositories(options.repositoryPaths || []);
  var cachePath = options.cachePath || null;
  var cache = loadAssetCache(cachePath);
  var cloudLibraryManager = options.cloudLibraryManager || null;
  var generateAsset = options.generateAsset || null;
  var context = {
    cloudLibraryManager: cloudLibraryManager,
    assetContract: assetContract,
    repositories: repositories,
    cache: cache,
  };
  var slots = assetContract.slots || [];
  var assets = [];
  for (var i = 0; i < slots.length; i++) {
    var slot = slots[i];
    if (slot.owner !== "RuntimeAssetResolver") {
      throw new Error("AssetSlot owner must be RuntimeAssetResolver: " + slot.slotId);
    }
    // Use sync resolution first, then generation if needed
    var result = resolveSlot(slot, context);
    // If sync resolution returned a placeholder and generation is allowed, try generation
    var resolutionPolicy = slot.resolutionPolicy || {};
    if (result.status === "placeholder" && resolutionPolicy.allowGeneration && generateAsset) {
      try {
        var generated = await generateAsset(slot);
        if (generated) {
          result = {
            slotId: slot.slotId,
            status: "generated",
            source: "generatedExternal",
            assetId: generated.assetId || ("generated." + slot.slotId),
            repoAssetId: null,
            provider: "ImageAgent",
            path: generated.path,
            format: generated.format || "png",
            sha1: generated.sha1,
            width: generated.width,
            height: generated.height,
            transparent: !!generated.transparent,
            semanticTags: clone(slot.semanticTags || (slot.constraints && slot.constraints.semantic) || []),
            styleTags: clone(slot.styleTags || [slot.constraints && slot.constraints.style].filter(Boolean)),
            confidence: 0.5,
            prompt: generated.prompt || "",
            negativePrompt: generated.negativePrompt || "",
            seed: generated.seed || null,
            distillHint: generated.distillHint || null,
            resolution: { strategy: "generate", rank: 0, candidatesConsidered: 0, cacheHit: false, ownerOnFailure: "ImageAgent" },
            transform: { resize: false, recolor: false, crop: false, atlasPacked: false, processedPath: null },
            publishability: { playable: true, publishable: true, repoEligible: !!(generated.distillHint), trainingEligible: false, blocksFinalExport: false, debt: "needs_distillation" },
            collisionHint: (slot.constraints || {}).collisionHint || undefined,
          };
          // Store in cloud library if available
          if (cloudLibraryManager && generated.distillHint) {
            cloudLibraryManager.storeCandidate({
              path: generated.path,
              sha1: generated.sha1,
              format: generated.format || "png",
              width: generated.width,
              height: generated.height,
              distillHint: generated.distillHint,
            });
          }
        }
      } catch (genErr) {
        // Keep the placeholder on generation failure
      }
    }
    assets.push(stripUndefined(result));
  }
  saveAssetCache(cachePath, cache);
  var summary = summarizeAssets(assets);
  return {
    meta: makeMeta((buildContract.meta && buildContract.meta.contractId) || "build-contract", summary.failed ? "partial" : "ready"),
    buildContractId: (buildContract.meta && buildContract.meta.contractId) || "build-contract",
    assets: assets,
    summary: summary,
  };
}

module.exports = {
  ASSET_REPOSITORY_SCHEMA_VERSION: ASSET_REPOSITORY_SCHEMA_VERSION,
  ASSET_CACHE_SCHEMA_VERSION: ASSET_CACHE_SCHEMA_VERSION,
  ASSET_MANIFEST_SCHEMA_VERSION: ASSET_MANIFEST_SCHEMA_VERSION,
  loadAssetRepositoryManifest: loadAssetRepositoryManifest,
  loadAssetRepositories: loadAssetRepositories,
  validateAssetRepositoryManifest: validateAssetRepositoryManifest,
  loadAssetCache: loadAssetCache,
  saveAssetCache: saveAssetCache,
  makeSlotSignature: makeSlotSignature,
  resolveAssetContract: resolveAssetContract,
  resolveAssetContractAsync: resolveAssetContractAsync,
  scoreAsset: scoreAsset,
};
