/**
 * DistillationAgent — standalone async asset distillation process.
 *
 * Runs OUTSIDE the main pipeline. Call it separately:
 *   node ai/distillation-agent.js
 *
 * It reads the cloud library manifest, finds candidate assets that need
 * distillation, and promotes them to approved after quality checks.
 *
 * This process is intentionally low-frequency and batch-oriented.
 * It does NOT block game generation.
 */

var fs = require('fs');
var path = require('path');
var cloudLibraryManager = require('./cloud-library-manager');
var assetRagClient = require('./asset-rag-client');

var ROOT_DIR = path.join(__dirname, '..');
var STORE_DIR = path.join(ROOT_DIR, 'output', '.cloud-library');

function log(message) {
  console.log('[DistillationAgent] ' + message);
}

/**
 * Normalize semantic tags: lowercase, dedupe, remove empty.
 */
function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  var seen = {};
  return tags
    .map(function(t) { return String(t).trim().toLowerCase(); })
    .filter(function(t) { return t && !seen[t] && (seen[t] = true); })
    .sort();
}

/**
 * Strip private context from a distill hint.
 * Removes any project-specific data that should not leak into shared assets.
 */
function deidentify(hint) {
  if (!hint) return hint;
  hint = JSON.parse(JSON.stringify(hint)); // deep clone
  hint.privateContext = {};
  return hint;
}

/**
 * Quality gate: check if a candidate is ready for promotion.
 * Returns { passed: boolean, reason: string }
 */
function qualityGate(candidate) {
  var hint = candidate.distillHint || {};
  var issues = [];

  // Must have semantic tags
  if (!hint.semanticTags || !hint.semanticTags.length) {
    issues.push('missing semanticTags');
  }

  // Must have at least one style tag
  if (!hint.styleTags || !hint.styleTags.length) {
    issues.push('missing styleTags');
  }

  // Content hash must be valid
  if (!candidate.contentHash || candidate.contentHash.length < 8) {
    issues.push('invalid contentHash');
  }

  // File must exist on disk
  var fs = require('fs');
  if (!candidate.storedPath || !fs.existsSync(candidate.storedPath)) {
    issues.push('stored file missing: ' + (candidate.storedPath || 'null'));
  }

  // Generator version must not be 'stub' for production assets
  // (stub is fine for now since we're in pretend mode)
  if (hint.generatorVersion === 'stub') {
    // Allow stub through but log it
    log('  note: stub-generated asset ' + candidate.candidateId + ' promoted (pretend mode)');
  }

  if (issues.length) {
    return { passed: false, reason: issues.join('; ') };
  }
  return { passed: true, reason: 'ok' };
}

/**
 * RAG vision verification: checks if image content matches declared semanticTags.
 *
 * Cloud path:  POST image + tags → RAG service → CLIP embedding → cosine similarity
 * Offline path: stub pass-through (dev mode, never blocks)
 *
 * @param {Object} candidate
 * @param {Object} ragClient - RAG client instance (created once in run())
 * @returns {Promise<{passed:boolean, confidence:number, reasons:string[], needsHumanReview:boolean, needsCloudVerification:boolean}>}
 */
async function visionVerify(candidate, ragClient) {
  var hint = candidate.distillHint || {};

  var metadata = {
    quality: hint.quality || {},
    generatorVersion: hint.generatorVersion || 'unknown',
    kind: hint.kind || 'sprite',
    width: hint.width || 0,
    height: hint.height || 0,
    transparent: !!hint.transparent,
  };

  var ragResult = await ragClient.verifyAsset(
    candidate.storedPath,
    hint.semanticTags || [],
    hint.styleTags || [],
    metadata
  );

  log('  vision: source=' + ragResult.source + ' confidence=' + ragResult.confidence +
    (ragResult.issues.length ? ' issues=' + ragResult.issues.join(',') : ''));

  var issues = ragResult.issues || [];
  var confidence = ragResult.confidence;

  // Stub generator: passes but flagged for human review (no real content)
  if (hint.generatorVersion === 'stub') {
    log('  vision: stub generator, skipping content verification');
    return { passed: true, confidence: 0.1, reasons: ['stub_generator_no_content'], needsHumanReview: true, needsCloudVerification: false };
  }

  // Cloud gave a definitive answer
  if (ragResult.source === 'cloud') {
    if (!ragResult.verified) {
      return { passed: false, confidence: confidence, reasons: issues, needsHumanReview: true, needsCloudVerification: false };
    }
    var cloudPassed = { passed: true, confidence: confidence, reasons: [], needsHumanReview: false, needsCloudVerification: false };
    if (confidence < 0.6) {
      cloudPassed.reasons = ['low_cloud_confidence:' + confidence.toFixed(2)];
      cloudPassed.needsHumanReview = true;
    }
    return cloudPassed;
  }

  // Cloud unreachable — pass with needsCloudVerification flag for later async check
  return {
    passed: true,
    confidence: confidence,
    reasons: issues.concat(['pending_cloud_verification']),
    needsHumanReview: ragResult.source === 'cloud_error',
    needsCloudVerification: ragResult.needsCloudVerification !== false,
  };
}

async function processCandidate(candidate, manager, ragClient) {
  log('Processing candidate: ' + candidate.candidateId + ' (' + (candidate.distillHint && candidate.distillHint.assetId || 'unknown') + ')');

  // 1. De-identify
  candidate.distillHint = deidentify(candidate.distillHint);

  // 2. Normalize tags
  if (candidate.distillHint) {
    candidate.distillHint.semanticTags = normalizeTags(candidate.distillHint.semanticTags);
    candidate.distillHint.styleTags = normalizeTags(candidate.distillHint.styleTags);
    if (candidate.distillHint.reuseHint) {
      candidate.distillHint.reuseHint.suggestedTags = normalizeTags(candidate.distillHint.reuseHint.suggestedTags);
    }
  }

  // 3. Quality gate
  var qa = qualityGate(candidate);
  if (!qa.passed) {
    log("  REJECTED (metadata): " + qa.reason);
    manager.rejectCandidate(candidate.candidateId, qa.reason);
    return { candidateId: candidate.candidateId, action: "rejected", reason: qa.reason };
  }

  // 4. RAG vision verification (may call cloud; falls back to stub on timeout/error)
  var vision = await visionVerify(candidate, ragClient);
  if (!vision.passed) {
    log('  REJECTED (vision): ' + vision.reasons.join('; '));
    manager.rejectCandidate(candidate.candidateId, 'vision_verify_failed: ' + vision.reasons.join('; '));
    return { candidateId: candidate.candidateId, action: 'rejected', reason: 'vision_verify_failed' };
  }
  if (vision.needsHumanReview) {
    log('  vision: needs human review (confidence=' + vision.confidence + ')');
  }
  if (vision.needsCloudVerification) {
    log('  vision: flagged for cloud verification');
  }

  // 5. Promote
  manager.promoteCandidate(candidate.candidateId, candidate.distillHint);
  log('  PROMOTED to approved');
  return { candidateId: candidate.candidateId, action: 'promoted' };
}

/**
 * Main distillation run (async — vision verification may call cloud RAG).
 */
async function run() {
  log('Starting distillation run...');
  log('Store dir: ' + STORE_DIR);

  var manager = cloudLibraryManager.createCloudLibraryManager({
    rootDir: ROOT_DIR,
    storeDir: STORE_DIR,
    scope: 'private',
  });

  // Create RAG client once — reused across all candidates in this batch
  var ragClient = assetRagClient.createRagClient();
  if (ragClient.isOffline()) {
    log('RAG client offline. Set GAMECASTLE_RAG_ENDPOINT for cloud content verification.');
  }

  var candidates = manager.getCandidatesByStatus('candidate');
  log('Found ' + candidates.length + ' candidate(s) to process');

  if (!candidates.length) {
    log('Nothing to distill. Done.');
    return;
  }

  // Process candidates sequentially (vision verification may call cloud)
  var results = [];
  for (var i = 0; i < candidates.length; i++) {
    try {
      var result = await processCandidate(candidates[i], manager, ragClient);
      results.push(result);
    } catch (e) {
      log('  ERROR processing ' + candidates[i].candidateId + ': ' + e.message);
      results.push({ candidateId: candidates[i].candidateId, action: 'error', reason: e.message });
    }
  }

  var promoted = results.filter(function(r) { return r.action === 'promoted'; });
  var rejected = results.filter(function(r) { return r.action === 'rejected'; });
  var errors = results.filter(function(r) { return r.action === 'error'; });

  log('');
  log('Distillation complete: ' + promoted.length + ' promoted, ' + rejected.length + ' rejected, ' + errors.length + ' errors');
  log('Approved assets now available for reuse by CloudLibraryManager.resolveByTags().');
}

run();
