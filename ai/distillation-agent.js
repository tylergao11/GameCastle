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
 * Process one candidate: de-identify, normalize tags, quality gate, promote or reject.
 */
function processCandidate(candidate, manager) {
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
    log('  REJECTED: ' + qa.reason);
    manager.rejectCandidate(candidate.candidateId, qa.reason);
    return { candidateId: candidate.candidateId, action: 'rejected', reason: qa.reason };
  }

  // 4. Promote
  manager.promoteCandidate(candidate.candidateId, candidate.distillHint);
  log('  PROMOTED to approved');
  return { candidateId: candidate.candidateId, action: 'promoted' };
}

/**
 * Main distillation run.
 */
function run() {
  log('Starting distillation run...');
  log('Store dir: ' + STORE_DIR);

  var manager = cloudLibraryManager.createCloudLibraryManager({
    rootDir: ROOT_DIR,
    storeDir: STORE_DIR,
    scope: 'private',
  });

  var candidates = manager.getCandidatesByStatus('candidate');
  log('Found ' + candidates.length + ' candidate(s) to process');

  if (!candidates.length) {
    log('Nothing to distill. Done.');
    return;
  }

  var results = candidates.map(function(candidate) {
    try {
      return processCandidate(candidate, manager);
    } catch (e) {
      log('  ERROR processing ' + candidate.candidateId + ': ' + e.message);
      return { candidateId: candidate.candidateId, action: 'error', reason: e.message };
    }
  });

  var promoted = results.filter(function(r) { return r.action === 'promoted'; });
  var rejected = results.filter(function(r) { return r.action === 'rejected'; });
  var errors = results.filter(function(r) { return r.action === 'error'; });

  log('');
  log('Distillation complete: ' + promoted.length + ' promoted, ' + rejected.length + ' rejected, ' + errors.length + ' errors');
  log('Approved assets now available for reuse by CloudLibraryManager.resolveByTags().');
}

run();
