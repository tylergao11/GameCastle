var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var CLOUD_LIBRARY_SCHEMA_VERSION = 1;
var CANDIDATE_STATUSES = ['candidate', 'approved', 'promoted', 'rejected'];

function sha1(text) {
  return crypto.createHash('sha1').update(String(text)).digest('hex');
}

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

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

/**
 * CloudLibraryManager owns deterministic asset lifecycle: store, dedupe, version, permission.
 * It does NOT call LLMs. DistillationAgent handles async promotion.
 */
function createCloudLibraryManager(options) {
  options = options || {};
  var storeDir = options.storeDir || path.join(options.rootDir || '.', 'output', '.cloud-library');
  var manifestPath = path.join(storeDir, 'manifest.json');
  var assetsDir = path.join(storeDir, 'assets');
  var scope = options.scope || 'private'; // private | team | global

  fs.mkdirSync(assetsDir, { recursive: true });

  function loadManifest() {
    return readJson(manifestPath, {
      schemaVersion: CLOUD_LIBRARY_SCHEMA_VERSION,
      scope: scope,
      candidates: [],
    });
  }

  function saveManifest(manifest) {
    writeJson(manifestPath, manifest);
  }

  /**
   * Store a generated asset as a local candidate.
   * Copies the file into the store, records metadata + DistillHint.
   *
   * @param {Object} asset
   * @param {string} asset.path - source file path
   * @param {string} asset.sha1
   * @param {Object} asset.distillHint
   * @returns {{ candidateId: string, status: string, storedPath: string, isDuplicate: boolean }}
   */
  function storeCandidate(asset) {
    if (!asset || !asset.path || !asset.sha1) {
      throw new Error('CloudLibraryManager.storeCandidate requires path and sha1');
    }
    if (!fs.existsSync(asset.path)) {
      throw new Error('CloudLibraryManager.storeCandidate source file not found: ' + asset.path);
    }

    // Dedupe by content hash
    var manifest = loadManifest();
    var contentHash = asset.sha1;
    var existing = manifest.candidates.find(function(c) { return c.contentHash === contentHash; });
    if (existing) {
      return {
        candidateId: existing.candidateId,
        status: existing.status,
        storedPath: existing.storedPath,
        isDuplicate: true,
      };
    }

    // Dedupe by semantic hash (same kind + tags + size + transparency)
    var semanticHash = computeSemanticHash(asset.distillHint || {});
    var semanticExisting = manifest.candidates.find(function(c) {
      return c.semanticHash === semanticHash && c.status !== 'rejected';
    });
    if (semanticExisting) {
      return {
        candidateId: semanticExisting.candidateId,
        status: semanticExisting.status,
        storedPath: semanticExisting.storedPath,
        isDuplicate: true,
      };
    }

    var candidateId = 'candidate_' + contentHash.slice(0, 12);
    var storedFileName = candidateId + path.extname(asset.path);
    var storedPath = path.join(assetsDir, storedFileName);

    // Copy asset file into store
    fs.copyFileSync(asset.path, storedPath);

    var entry = {
      candidateId: candidateId,
      status: 'candidate',
      contentHash: contentHash,
      semanticHash: semanticHash,
      storedPath: storedPath,
      originalPath: asset.path,
      format: asset.format || path.extname(asset.path).replace('.', ''),
      width: (asset.distillHint && asset.distillHint.width) || asset.width || 0,
      height: (asset.distillHint && asset.distillHint.height) || asset.height || 0,
      distillHint: asset.distillHint || null,
      scope: scope,
      needsCloudVerification: true,
      cloudVerifiedAt: null,
      createdAt: new Date().toISOString(),
      promotedAt: null,
    };

    manifest.candidates.push(entry);
    saveManifest(manifest);

    return {
      candidateId: candidateId,
      status: 'candidate',
      storedPath: storedPath,
      isDuplicate: false,
    };
  }

  /**
   * Resolve an asset by semantic tags. Returns the best matching candidate.
   * Currently simple: first match with highest tag overlap. Now uses unified asset-resolver scoring engine.
   */
  /**
   * Resolve an asset by semantic tags using the unified asset-resolver scoring engine.
   * Now delegates to the same scoreAsset used by asset-resolver.js for consistent scoring.
   */
  function resolveByTags(kind, semanticTags, styleTags, constraints) {
    var assetResolver = null;
    try { assetResolver = require("./asset-resolver"); } catch (e) { /* fall through to simple scoring */ }
    
    var manifest = loadManifest();
    var candidates = manifest.candidates.filter(function(c) {
      return c.status === "approved" || c.status === "promoted";
    });

    if (!candidates.length) return null;

    // Build a pseudo-slot for the unified scoring engine
    var slot = {
      kind: kind,
      semanticTags: semanticTags || [],
      styleTags: styleTags || [],
      constraints: constraints || {},
      repoPolicy: { requiredLicense: "any", allowLicensedAssets: true },
    };

    var scored = candidates
      .map(function(c) {
        var hint = c.distillHint || {};
        var asset = {
          kind: hint.kind || "sprite",
          semanticTags: hint.semanticTags || [],
          styleTags: hint.styleTags || [],
          width: c.width || hint.width || 0,
          height: c.height || hint.height || 0,
          transparent: !!(hint.transparent),
          license: "commercial",
        };
        // Use unified scoring if available, fall back to simple overlap
        var score = 0;
        if (assetResolver && typeof assetResolver.scoreAsset === "function") {
          score = assetResolver.scoreAsset(asset, slot, "cloudLibrary");
        } else {
          // Simple fallback: tag overlap scoring
          var tagOverlap = (semanticTags || []).filter(function(t) {
            return (hint.semanticTags || []).indexOf(t) >= 0;
          }).length;
          var styleOverlap = (styleTags || []).filter(function(t) {
            return (hint.styleTags || []).indexOf(t) >= 0;
          }).length;
          score = tagOverlap * 0.6 + styleOverlap * 0.4;
        }
        return { candidate: c, score: score };
      })
      .filter(function(item) { return item.score > 0; })
      .sort(function(a, b) { return b.score - a.score; });

    if (scored.length) {
    // Track reuse for quality audit
    var hit = scored[0].candidate;
    var manifest = loadManifest();
    var entry = manifest.candidates.find(function(c) { return c.candidateId === hit.candidateId; });
    if (entry) {
      entry.reuseCount = (entry.reuseCount || 0) + 1;
      entry.lastReusedAt = new Date().toISOString();
      saveManifest(manifest);
      // Update the returned reference so reuseCount is visible
      hit.reuseCount = entry.reuseCount;
      hit.lastReusedAt = entry.lastReusedAt;
    }
    return hit;
  }
    return null;
  }

    function computeSemanticHash(distillHint) {
    if (!distillHint) return sha1('empty');
    var payload = {
      kind: distillHint.kind || '',
      width: distillHint.width || 0,
      height: distillHint.height || 0,
      transparent: !!distillHint.transparent,
      semanticTags: (distillHint.semanticTags || []).slice().sort(),
    };
    return sha1(stableStringify(payload));
  }

  function getCandidateCount() {
    return loadManifest().candidates.length;
  }

  
  /**
   * Promote a candidate to approved status after distillation.
   * Only callable from DistillationAgent, not from the hot pipeline path.
   */
  function promoteCandidate(candidateId, updatedDistillHint) {
    var manifest = loadManifest();
    var entry = manifest.candidates.find(function(c) { return c.candidateId === candidateId; });
    if (!entry) throw new Error('Candidate not found: ' + candidateId);
    if (entry.status !== 'candidate') throw new Error('Cannot promote candidate with status: ' + entry.status);
    entry.status = 'approved';
    entry.promotedAt = new Date().toISOString();
    if (updatedDistillHint) {
      entry.distillHint = JSON.parse(JSON.stringify(updatedDistillHint));
    }
    if (entry.distillHint) {
      entry.distillHint.quality = entry.distillHint.quality || {};
      entry.distillHint.quality.needsDistillation = false;
      entry.distillHint.quality.confidence = Math.min(1, (entry.distillHint.quality.confidence || 0.5) + 0.3);
      entry.distillHint.quality.needsHumanReview = false;
    }
    saveManifest(manifest);
    return entry;
  }

  /**
   * Reject a candidate that fails distillation quality checks.
   */
  
  /**
   * Promote an approved asset to promoted status for cloud synchronization.
   * Called when an asset has proven quality through high reuse.
   */
  function promoteToCloud(candidateId) {
    var manifest = loadManifest();
    var entry = manifest.candidates.find(function(c) { return c.candidateId === candidateId; });
    if (!entry) throw new Error("Candidate not found: " + candidateId);
    if (entry.status !== "approved") throw new Error("Cannot promote to cloud: status is " + entry.status);
    entry.status = "promoted";
    entry.promotedAt = new Date().toISOString();
    saveManifest(manifest);
    return entry;
  }

  /**
   * Demote an approved/promoted asset back to candidate if quality issues found later.
   */
  function demoteCandidate(candidateId, reason) {
    var manifest = loadManifest();
    var entry = manifest.candidates.find(function(c) { return c.candidateId === candidateId; });
    if (!entry) throw new Error("Candidate not found: " + candidateId);
    if (entry.status === "candidate" || entry.status === "rejected") {
      throw new Error("Cannot demote candidate with status: " + entry.status);
    }
    entry.status = "candidate";
    entry.demotionReason = reason || "Quality audit found issues";
    entry.demotedAt = new Date().toISOString();
    saveManifest(manifest);
    return entry;
  }

  /**
   * Auto-promote approved assets that exceed the reuse threshold.
   */
  function autoPromoteByReuse(minReuseCount) {
    minReuseCount = minReuseCount || 5;
    var manifest = loadManifest();
    var promoted = [];
    manifest.candidates.forEach(function(entry) {
      if (entry.status === "approved" && (entry.reuseCount || 0) >= minReuseCount) {
        entry.status = "promoted";
        entry.promotedAt = new Date().toISOString();
        entry.autoPromoted = true;
        promoted.push(entry.candidateId);
      }
    });
    if (promoted.length) saveManifest(manifest);
    return promoted;
  }
function rejectCandidate(candidateId, reason) {
    var manifest = loadManifest();
    var entry = manifest.candidates.find(function(c) { return c.candidateId === candidateId; });
    if (!entry) throw new Error('Candidate not found: ' + candidateId);
    if (entry.status === 'approved' || entry.status === 'promoted') {
      throw new Error('Cannot reject an ' + entry.status + ' candidate: ' + candidateId);
    }
    entry.status = 'rejected';
    entry.rejectionReason = reason || 'Failed distillation quality checks';
    saveManifest(manifest);
    return entry;
  }

  /**
   * Mark a candidate as cloud-verified (RAG verification passed).
   * Clears the needsCloudVerification flag.
   */
  function markCloudVerified(candidateId, verificationResult) {
    var manifest = loadManifest();
    var entry = manifest.candidates.find(function(c) { return c.candidateId === candidateId; });
    if (!entry) return null;
    entry.needsCloudVerification = false;
    entry.cloudVerifiedAt = new Date().toISOString();
    entry.cloudVerificationResult = verificationResult || null;
    saveManifest(manifest);
    return entry;
  }

  /**
   * Get candidates that are pending cloud verification.
   */
  function getCandidatesNeedingCloudVerification() {
    return loadManifest().candidates.filter(function(c) {
      return c.needsCloudVerification === true && (c.status === 'approved' || c.status === 'promoted');
    });
  }

  function getCandidatesByStatus(status) {
    return loadManifest().candidates.filter(function(c) { return c.status === status; });
  }

  return {
    storeCandidate: storeCandidate,
    resolveByTags: resolveByTags,
    getCandidateCount: getCandidateCount,
    promoteCandidate: promoteCandidate,
    rejectCandidate: rejectCandidate,
    getCandidatesByStatus: getCandidatesByStatus,
    promoteToCloud: promoteToCloud,
    demoteCandidate: demoteCandidate,
    autoPromoteByReuse: autoPromoteByReuse,
    markCloudVerified: markCloudVerified,
    getCandidatesNeedingCloudVerification: getCandidatesNeedingCloudVerification,
    getStoreDir: function() { return storeDir; },
  };
}

module.exports = {
  CLOUD_LIBRARY_SCHEMA_VERSION: CLOUD_LIBRARY_SCHEMA_VERSION,
  createCloudLibraryManager: createCloudLibraryManager,
};
