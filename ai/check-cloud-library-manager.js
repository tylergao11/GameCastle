var fs = require('fs');
var path = require('path');
var os = require('os');
var cloudLibraryManager = require('./cloud-library-manager');
var imageAgent = require('./image-agent');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-clm-'));
  var assetsDir = path.join(tmpDir, 'output', 'assets');
  var storeDir = path.join(tmpDir, 'output', '.cloud-library');
  fs.mkdirSync(assetsDir, { recursive: true });

  try {
    var manager = cloudLibraryManager.createCloudLibraryManager({
      rootDir: tmpDir,
      storeDir: storeDir,
      scope: 'private',
    });

    // Generate a pretend image
    var result = await imageAgent.generateImage({
      assetId: 'sprite.player.runner',
      kind: 'sprite',
      width: 32,
      height: 48,
      transparent: true,
      color: '#4488FF',
      semanticTags: ['player', 'hero'],
      styleTags: ['arcade'],
    }, assetsDir);

    // Store as candidate
    var stored = manager.storeCandidate({
      path: result.path,
      sha1: result.sha1,
      format: result.format,
      width: result.width,
      height: result.height,
      distillHint: result.distillHint,
    });

    assert(!stored.isDuplicate, 'first store must not be duplicate');
    assert(stored.status === 'candidate', 'new asset must be candidate status');
    assert(fs.existsSync(stored.storedPath), 'stored file must exist');
    assert(manager.getCandidateCount() === 1, 'candidate count must be 1');

    // Dedupe: store same asset again
    var stored2 = manager.storeCandidate({
      path: result.path,
      sha1: result.sha1,
      format: result.format,
      width: result.width,
      height: result.height,
      distillHint: result.distillHint,
    });

    assert(stored2.isDuplicate, 'same content hash must be deduped');
    assert(stored2.candidateId === stored.candidateId, 'dedupe must return same candidateId');
    assert(manager.getCandidateCount() === 1, 'candidate count must still be 1 after dedupe');

    // Semantic dedupe: different content but same kind+tags+size
    var result2 = await imageAgent.generateImage({
      assetId: 'sprite.player.runner.v2',
      kind: 'sprite',
      width: 32,
      height: 48,
      transparent: true,
      color: '#FF8844',
      semanticTags: ['player', 'hero'],
      styleTags: ['arcade'],
    }, assetsDir);

    var stored3 = manager.storeCandidate({
      path: result2.path,
      sha1: result2.sha1,
      format: result2.format,
      width: result2.width,
      height: result2.height,
      distillHint: result2.distillHint,
    });

    assert(stored3.isDuplicate, 'same semantic hash must be deduped');
    assert(manager.getCandidateCount() === 1, 'candidate count must still be 1 after semantic dedupe');

    // needsCloudVerification: new candidates must have the flag set
    var candidates = manager.getCandidatesByStatus('candidate');
    assert(candidates.length === 1, 'must have 1 candidate');
    assert(candidates[0].needsCloudVerification === true, 'new candidate must need cloud verification');
    assert(candidates[0].cloudVerifiedAt === null, 'cloudVerifiedAt must be null initially');

    // markCloudVerified: clears the flag
    var verified = manager.markCloudVerified(stored.candidateId, { score: 0.95 });
    assert(verified !== null, 'markCloudVerified must return entry');
    assert(verified.needsCloudVerification === false, 'needsCloudVerification must be cleared');
    assert(verified.cloudVerifiedAt !== null, 'cloudVerifiedAt must be set');
    assert(verified.cloudVerificationResult.score === 0.95, 'verification result must be saved');

    // getCandidatesNeedingCloudVerification: empty after markCloudVerified
    var needing = manager.getCandidatesNeedingCloudVerification();
    assert(needing.length === 0, 'no candidates should need cloud verification after markCloudVerified');

    // Resolve by tags (no approved/promoted candidates yet, so null)
    var resolved = manager.resolveByTags('sprite', ['player'], ['arcade'], { width: 32, height: 48 });
    assert(resolved === null, 'resolveByTags must return null when no approved candidates');

    console.log('[CloudLibraryManager] storeCandidate + dedupe + resolveByTags + needsCloudVerification passed');
    console.log('[CloudLibraryManager] all passed');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch(function(e) { console.error(e); process.exit(1); });
