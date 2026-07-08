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
   * Currently simple: first match with highest tag overlap. Future: scoring like asset-resolver.
   */
  function resolveByTags(kind, semanticTags, styleTags, constraints) {
    var manifest = loadManifest();
    var candidates = manifest.candidates.filter(function(c) {
      return c.status === 'approved' || c.status === 'promoted';
    });

    if (!candidates.length) return null;

    // Simple scoring: prefer approved/promoted with matching kind
    var scored = candidates
      .filter(function(c) {
        var hint = c.distillHint || {};
        return hint.kind === kind;
      })
      .map(function(c) {
        var hint = c.distillHint || {};
        var tagOverlap = (semanticTags || []).filter(function(t) {
          return (hint.semanticTags || []).indexOf(t) >= 0;
        }).length;
        return { candidate: c, score: tagOverlap };
      })
      .filter(function(item) { return item.score > 0; })
      .sort(function(a, b) { return b.score - a.score; });

    if (scored.length) return scored[0].candidate;
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
    getStoreDir: function() { return storeDir; },
  };
}

module.exports = {
  CLOUD_LIBRARY_SCHEMA_VERSION: CLOUD_LIBRARY_SCHEMA_VERSION,
  createCloudLibraryManager: createCloudLibraryManager,
};
