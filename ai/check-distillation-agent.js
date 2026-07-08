var fs = require('fs');
var path = require('path');
var os = require('os');
var cloudLibraryManager = require('./cloud-library-manager');
var imageAgent = require('./image-agent');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-da-'));
  var assetsDir = path.join(tmpDir, 'output', 'assets');
  var storeDir = path.join(tmpDir, 'output', '.cloud-library');
  fs.mkdirSync(assetsDir, { recursive: true });

  try {
    var manager = cloudLibraryManager.createCloudLibraryManager({
      rootDir: tmpDir,
      storeDir: storeDir,
      scope: 'private',
    });

    // 1. Generate and store a candidate
    var result = await imageAgent.generateImage({
      assetId: 'sprite.enemy.boss',
      kind: 'sprite',
      width: 64,
      height: 64,
      transparent: true,
      color: '#DC3232',
      semanticTags: ['enemy', 'boss', 'dragon'],
      styleTags: ['dark', 'pixel'],
    }, assetsDir);

    var stored = manager.storeCandidate({
      path: result.path,
      sha1: result.sha1,
      format: result.format,
      width: result.width,
      height: result.height,
      distillHint: result.distillHint,
    });

    assert(!stored.isDuplicate, 'first store must not be duplicate');
    assert(stored.status === 'candidate', 'must be candidate');

    // 2. Verify candidate exists
    var candidates = manager.getCandidatesByStatus('candidate');
    assert(candidates.length === 1, 'must have 1 candidate');
    assert(candidates[0].distillHint.quality.needsDistillation === true, 'candidate must need distillation');

    // 3. Promote candidate (simulating DistillationAgent)
    var promoted = manager.promoteCandidate(stored.candidateId, {
      assetId: 'sprite.enemy.boss.distilled',
      kind: 'sprite',
      width: 64,
      height: 64,
      transparent: true,
      semanticTags: ['enemy', 'boss', 'dragon', 'distilled'],
      styleTags: ['dark', 'pixel', 'vetted'],
      reuseHint: { reusable: true, scope: 'private' },
    });
    assert(promoted.status === 'approved', 'must be approved after promotion');
    assert(promoted.distillHint.semanticTags.indexOf('distilled') >= 0, 'updatedDistillHint tags must be saved');
    assert(promoted.distillHint.quality.needsDistillation === false, 'approved must not need distillation');
    assert(promoted.distillHint.quality.confidence > 0.7, 'approved confidence must increase');
    assert(promoted.promotedAt !== null, 'must have promotedAt timestamp');

    // 4. Verify no more candidates
    var remaining = manager.getCandidatesByStatus('candidate');
    assert(remaining.length === 0, 'no candidates after promotion');

    // 5. Verify approved exists
    var approved = manager.getCandidatesByStatus('approved');
    assert(approved.length === 1, 'must have 1 approved');

    // 6. resolveByTags should now find the approved asset
    var resolved = manager.resolveByTags('sprite', ['enemy', 'boss'], ['dark'], { width: 64, height: 64 });
    assert(resolved !== null, 'resolveByTags must find approved asset');
    assert(resolved.status === 'approved', 'resolved asset must be approved');

    // 7. Reject test: create a fresh manager so dedupe doesn't interfere
    var manager2 = cloudLibraryManager.createCloudLibraryManager({
      rootDir: tmpDir + '_reject',
      storeDir: tmpDir + '_reject/output/.cloud-library',
      scope: 'private',
    });
    var assetsDir2 = tmpDir + '_reject/output/assets';
    fs.mkdirSync(assetsDir2, { recursive: true });

    var result2 = await imageAgent.generateImage({
      assetId: 'sprite.broken',
      kind: 'sprite',
      width: 16,
      height: 16,
      transparent: false,
      semanticTags: [],
      styleTags: [],
    }, assetsDir2);

    var stored2 = manager2.storeCandidate({
      path: result2.path,
      sha1: result2.sha1,
      format: result2.format,
      width: result2.width,
      height: result2.height,
      distillHint: result2.distillHint,
    });

    var rejected = manager2.rejectCandidate(stored2.candidateId, 'No semantic tags');
    assert(rejected.status === 'rejected', 'must be rejected');
    assert(rejected.rejectionReason === 'No semantic tags', 'must record rejection reason');

    // 8. Cannot promote rejected
    var threw = false;
    try { manager2.promoteCandidate(stored2.candidateId); } catch (e) { threw = true; }
    assert(threw, 'must throw when promoting rejected candidate');

    // 9. Cannot reject approved (use the first manager's promoted candidate)
    threw = false;
    try { manager.rejectCandidate(stored.candidateId, 'too late'); } catch (e) { threw = true; }
    assert(threw, 'must throw when rejecting approved candidate');

    console.log('[DistillationAgent] promoteCandidate + rejectCandidate + resolveByTags passed');
    console.log('[DistillationAgent] all passed');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch(function(e) { console.error(e); process.exit(1); });
