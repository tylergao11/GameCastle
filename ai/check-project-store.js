var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var projectStoreModule = require('./project-store');
var projectWeave = require('./project-weave-runtime');

var fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'intent-mobile-platformer.dsl'), 'utf8');
function request(projectId, requestId, dsl) { return { projectId: projectId, requestId: requestId, naturalIntent: 'make a mobile platformer', intentDslText: dsl || fixture, assetSlots: [] }; }
function slot(id) { return { slotId: id, kind: 'sprite', styleId: 'gamecastle.style-1', semanticTags: ['hero'], styleTags: ['gamecastle.style-1'], constraints: { width: 32, height: 32, transparent: true } }; }

async function main() {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-project-store-'));
  try {
    var store = projectStoreModule.createProjectStore({ rootDir: root });
    var first = await projectWeave.create(request('alpha', 'first'), { workspaceRoot: root, projectStore: store });
    assert(first.artifacts.projectVersion, 'playable create must atomically commit a ProjectVersion');
    assert.strictEqual(store.listVersions('alpha').length, 1, 'first project must own one immutable version');
    var firstVersion = first.artifacts.projectVersion;
    assert(firstVersion.semanticHash && firstVersion.assetSemanticHash && firstVersion.contentHash, 'version must retain world and asset hash evidence');
    var version = store.loadVersion('alpha', firstVersion.versionId);
    assert(fs.existsSync(path.join(version.runtimeDir, 'index.html')), 'version must contain an immutable playable runtime snapshot');

    var continued = await projectWeave.continue(request('alpha', 'continue', 'make a mobile platformer'), { workspaceRoot: root, projectStore: store });
    assert.strictEqual(continued.lifecycle, 'playable', 'continue must load its own active version and remain playable');
    assert.strictEqual(store.listVersions('alpha').length, 2, 'continue must commit a second immutable version');
    assert.strictEqual(continued.artifacts.projectVersion.parentVersionId, firstVersion.versionId, 'continue version must retain parent lineage');

    var secondProject = await projectWeave.create(request('beta', 'first'), { workspaceRoot: root, projectStore: store });
    assert.strictEqual(store.listProjects().length, 2, 'two local projects must coexist');
    assert.notStrictEqual(secondProject.artifacts.projectVersion.projectId, firstVersion.projectId, 'project versions must remain isolated');
    assert.strictEqual(store.listVersions('beta').length, 1, 'second project must not inherit alpha versions');

    var beforeDebt = store.getContinueContext('alpha').projectVersion.versionId;
    var debt = request('alpha', 'failed'); debt.assetSlots = [slot('asset.required')]; debt.assetOptions = { sources: { 'asset.required': { kind: 'generation_required' } }, ports: {} };
    var failed = await projectWeave.create(debt, { workspaceRoot: root, projectStore: store });
    assert.strictEqual(failed.lifecycle, 'debt', 'failed run must remain recoverable debt');
    assert.strictEqual(store.getContinueContext('alpha').projectVersion.versionId, beforeDebt, 'failed run must not mutate active version');

    var receipt = store.rollback('alpha', firstVersion.versionId);
    assert.strictEqual(receipt.toVersionId, firstVersion.versionId, 'rollback must point active workspace at the requested immutable version');
    var recovered = projectStoreModule.createProjectStore({ rootDir: root }).recover('alpha');
    assert.strictEqual(recovered.recovered, true, 'fresh ProjectStore process must recover active workspace after restart');
    assert.strictEqual(recovered.versionId, firstVersion.versionId, 'restart recovery must use rolled-back active version');
    assert.strictEqual(recovered.context.projectWorld.semanticHash, firstVersion.semanticHash, 'recovered context must retain semantic hash');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
  console.log('[ProjectStore] multi-project isolation, immutable versions, continue, failure safety, rollback, and restart recovery passed');
}
main().catch(function(error) { console.error(error); process.exit(1); });
