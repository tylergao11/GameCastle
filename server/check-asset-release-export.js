var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var artifactStoreModule = require('./local-runtime/artifact-store');
var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-asset-release-')), output = path.join(root, 'output'), releases = path.join(root, 'releases');
function evidence() {
  var acceptance = { productionSetId: 'production.release', decision: 'accepted', requiredSlotCoverage: { complete: true }, workItemAcceptanceReceiptIds: ['work.hero'], acceptedRevisionByTargetVisualSlotId: { 'game.player.visual': 'revision.hero' } };
  return { viewportMatrixReport: { pass: true }, assetProductionReport: { pass: true, productionSetAcceptanceReceipt: acceptance }, assetBindingReport: { pass: true, productionSetId: 'production.release', receipts: [{ productionSetId: 'production.release', assetRevisionId: 'revision.hero', targetVisualSlotId: 'game.player.visual', boundInstanceCount: 1, preservationChecks: { behaviors: true, collisionMask: true, variables: true, instanceIdentity: true, layer: true, zOrderPolicy: true }, runtimeChecks: { resourceInstalled: true, targetObjectIsSprite: true, detachedOverlay: false } }] }, tickPerformanceReport: { pass: true, profile: 'local-interactive', observedSimulationHz: 60 }, tickReplayReceipt: { pass: true, finalStateHash: 'release-state' }, browserPlaytestReport: { pass: true, origin: 'http://127.0.0.1:4193' } };
}
try {
  fs.mkdirSync(path.join(output, 'assets', 'generated'), { recursive: true });
  fs.writeFileSync(path.join(output, 'game.html'), '<script src="data.js"></script>');
  fs.writeFileSync(path.join(output, 'project.json'), JSON.stringify({ resources: { resources: [{ name: 'hero', kind: 'image', file: 'assets/generated/hero.png' }] }, layouts: [{ name: 'Game', objects: [{ name: 'Player', type: 'Sprite' }], instances: [{ name: 'Player' }] }] }));
  fs.writeFileSync(path.join(output, 'project-world.json'), JSON.stringify({ worldVersion: 1, semanticHash: 'asset-export' }));
  fs.writeFileSync(path.join(output, 'execution-ledger.json'), JSON.stringify({ runs: [{ summary: { nextAction: 'done' } }] }));
  fs.writeFileSync(path.join(output, 'data.js'), 'gdjs.projectData = {};');
  fs.writeFileSync(path.join(output, 'assets', 'generated', 'hero.png'), Buffer.from([137,80,78,71,13,10,26,10]));
  fs.writeFileSync(path.join(output, 'html-export-manifest.json'), JSON.stringify({ schemaVersion: 1, target: 'html', scriptFiles: ['data.js'], assetFiles: ['assets/generated/hero.png'] }));
  fs.writeFileSync(path.join(output, 'project-run.json'), JSON.stringify({ lifecycle: 'playable', artifacts: { validationReport: { pass: true }, playableRuntimeEvidence: evidence() } }));
  var store = artifactStoreModule.createArtifactStore({ outputDir: output, releasesDir: releases }), release = store.commitRelease('asset-release', null);
  assert.equal(release.semanticHash, 'asset-export'); assert(fs.existsSync(path.join(releases, 'asset-release', 'assets/generated/hero.png'))); assert(!fs.existsSync(path.join(releases, 'asset-release', 'asset-runtime.js')), 'retired overlay runtime must not enter a release');
  var badRun = JSON.parse(fs.readFileSync(path.join(output, 'project-run.json'), 'utf8')); badRun.artifacts.playableRuntimeEvidence.assetBindingReport.receipts[0].assetRevisionId = 'revision.intermediate'; fs.writeFileSync(path.join(output, 'project-run.json'), JSON.stringify(badRun));
  assert.throws(function() { store.commitRelease('asset-release-bad', null); }, /PlayableRuntimeEvidence is incomplete/, 'release assembly must independently revalidate aggregate evidence');
  console.log('[AssetReleaseExport] accepted final revision, target binding and aggregate evidence enter immutable release without overlay runtime');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
