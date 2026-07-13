var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');

var projectWeave = require('./project-weave-runtime');

function request(projectId, requestId) {
  return {
    projectId: projectId,
    requestId: requestId,
    mode: 'create',
    naturalIntent: 'make a compact mobile platformer with coins',
    intentDslText: fs.readFileSync(path.join(__dirname, 'fixtures', 'intent-mobile-platformer.dsl'), 'utf8'),
    assetSlots: []
  };
}

function assetSlot(id) {
  return { slotId: id, kind: 'sprite', semanticTags: ['hero'], styleTags: ['gamecastle.style-1'], styleId: 'gamecastle.style-1', constraints: { width: 32, height: 32, transparent: true } };
}

async function main() {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-wp0-'));
  try {
    var first = await projectWeave.create(request('wp0-project', 'first'), { workspaceRoot: root });
    assert.strictEqual(first.lifecycle, 'playable', 'a clean create must become playable');
    assert.strictEqual(first.artifacts.validationReport.pass, true, 'create must pass the aggregate validation gate');
    assert(fs.existsSync(path.join(first.runtimeDir, 'project.json')), 'create must write an isolated GDJS project');
    assert(fs.existsSync(path.join(first.runtimeDir, 'index.html')), 'create must write a playable HTML entry');
    assert(fs.existsSync(path.join(first.runDir, 'asset-world.json')), 'create must persist AssetWorld beside ProjectWorld');
    assert(fs.existsSync(path.join(first.runDir, 'project-world.json')), 'create must persist ProjectWorld');
    assert.deepStrictEqual(first.run.graphTrace.map(function(entry) { return entry.node; }), projectWeave.PROJECT_WEAVE_NODE_SEQUENCE, 'all project owners must run through the one official graph');

    var continueRequest = request('wp0-project', 'continue');
    continueRequest.intentDslText = 'adjust Player placement above slightly';
    var continued = await projectWeave.continue(continueRequest, { workspaceRoot: root, previous: { project: first.project, projectWorld: first.artifacts.projectWorld, assetWorld: first.artifacts.assetEngine.assetWorld } });
    assert.strictEqual(continued.lifecycle, 'playable', 'continue must use the same graph and remain playable');
    assert.deepStrictEqual(continued.run.graphTrace.map(function(entry) { return entry.node; }), projectWeave.PROJECT_WEAVE_NODE_SEQUENCE, 'continue must not use a shadow pipeline');

    await assert.rejects(async function() {
      await projectWeave.create(request('resume-project', 'resume'), { workspaceRoot: root, runId: 'resume-run', failAfter: 'asset-weave' });
    }, /Injected interruption/, 'failure injection must interrupt after a durable checkpoint');
    var resumed = await projectWeave.resume('resume-run', { workspaceRoot: root, projectId: 'resume-project' });
    assert.strictEqual(resumed.lifecycle, 'playable', 'resume must continue the same run to playable');
    assert.strictEqual(resumed.run.graphTrace.filter(function(entry) { return entry.node === 'asset-weave'; }).length, 1, 'resume must not repeat a checkpointed asset resolution');

    var debtRequest = request('debt-project', 'asset-debt');
    debtRequest.assetSlots = [assetSlot('asset.required')];
    debtRequest.assetOptions = { sources: { 'asset.required': { kind: 'generation_required' } }, ports: {} };
    var debt = await projectWeave.create(debtRequest, { workspaceRoot: root, runId: 'asset-debt-run' });
    assert.strictEqual(debt.lifecycle, 'debt', 'asset failure must end in recoverable debt, never a false playable result');
    assert.strictEqual(debt.ownerRoute.owner, 'RuntimeAssetResolver', 'asset failure must retain its owning route');

    var persistenceBypass = request('persistence-bypass-project', 'persistence-bypass');
    persistenceBypass.assetOptions = { persistAcceptedGeneratedAssets: true };
    await assert.rejects(function() { return projectWeave.create(persistenceBypass, { workspaceRoot: root }); }, /ProjectWeave cannot write cloud verification staging or shared-library records/, 'ProjectWeave must not bypass explicit CloudPromotion with a persistence bridge');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log('[ProjectWeaveRuntime] create, isolated artifacts, and all-owner LangGraph passed');
}

main().catch(function(error) { console.error(error); process.exit(1); });
