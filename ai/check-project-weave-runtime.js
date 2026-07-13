var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');

var projectWeave = require('./project-weave-runtime');
var testAssetPorts = require('./test-asset-engine-ports');

function request(projectId, requestId) {
  return {
    projectId: projectId,
    requestId: requestId,
    mode: 'create',
    naturalIntent: 'make a compact mobile platformer with coins',
    intentDslText: fs.readFileSync(path.join(__dirname, 'fixtures', 'intent-mobile-platformer.dsl'), 'utf8'),
    assetSlots: [],
    assetOptions: { modelPolicy: { provider: 'deepseek', allowExternal: true } }
  };
}

function assetSlot(id) {
  return { slotId: id, kind: 'sprite', targetVisualSlotId: 'game.player.visual', semanticTags: ['hero'], styleTags: ['gamecastle.style-dna.v1'], styleId: 'gamecastle.style-dna.v1', constraints: { width: 32, height: 32, transparent: true } };
}

async function main() {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-wp0-'));
  var services = { assetPorts: testAssetPorts.createTestAssetEnginePorts({ outputDir: path.join(root, 'test-assets') }) };
  try {
    var first = await projectWeave.create(request('wp0-project', 'first'), { workspaceRoot: root, services: services });
    assert.strictEqual(first.lifecycle, 'debt', 'a create without physical runtime evidence must remain debt');
    assert.strictEqual(first.artifacts.validationReport.pass, false, 'aggregate validation must fail closed without real runtime evidence');
    assert.strictEqual(first.artifacts.validationReport.ownerRoute.owner, 'RuntimeViewportCoordinator');
    assert(fs.existsSync(path.join(first.runtimeDir, 'project.json')), 'create must write an isolated GDJS project');
    assert(fs.existsSync(path.join(first.runtimeDir, 'index.html')), 'create must write a playable HTML entry');
    assert(fs.existsSync(path.join(first.runDir, 'asset-world.json')), 'create must persist AssetWorld beside ProjectWorld');
    assert(fs.existsSync(path.join(first.runDir, 'project-world.json')), 'create must persist ProjectWorld');
    var gameLayout = first.project.layouts.find(function(layout) { return layout.name === 'Game'; });
    assert.strictEqual(gameLayout.objects.find(function(object) { return object.name === 'Player'; }).type, 'Sprite', 'accepted hero must replace the real Player renderer');
    assert.strictEqual(JSON.stringify(gameLayout.events).indexOf('PrimitiveDrawing::Drawer::ClearShapes","parameters":["Player"'), -1, 'stale renderer events must be deleted after Sprite binding');
    assert.deepStrictEqual(first.run.graphTrace.map(function(entry) { return entry.node; }), projectWeave.PROJECT_WEAVE_NODE_SEQUENCE, 'all project owners must run through the one official graph');

    var continueRequest = request('wp0-project', 'continue');
    continueRequest.intentDslText = 'adjust Player placement above slightly';
    var continued = await projectWeave.continue(continueRequest, { workspaceRoot: root, services: services, previous: { project: first.project, projectWorld: first.artifacts.projectWorld, assetWorld: first.artifacts.assetEngine.assetWorld } });
    assert.strictEqual(continued.lifecycle, 'debt', 'continue must not bypass missing physical runtime evidence');
    assert.deepStrictEqual(continued.run.graphTrace.map(function(entry) { return entry.node; }), projectWeave.PROJECT_WEAVE_NODE_SEQUENCE, 'continue must not use a shadow pipeline');

    await assert.rejects(async function() {
      await projectWeave.create(request('resume-project', 'resume'), { workspaceRoot: root, services: services, runId: 'resume-run', failAfter: 'asset-production' });
    }, /Injected interruption/, 'failure injection must interrupt after a durable checkpoint');
    var resumed = await projectWeave.resume('resume-run', { workspaceRoot: root, services: services, projectId: 'resume-project' });
    assert.strictEqual(resumed.lifecycle, 'debt', 'resume must not bypass missing physical runtime evidence');
    assert.strictEqual(resumed.run.graphTrace.filter(function(entry) { return entry.node === 'asset-production'; }).length, 1, 'resume must not repeat a checkpointed asset production set');

    var debtRequest = request('debt-project', 'asset-debt');
    debtRequest.assetSlots = [assetSlot('asset.required')];
    debtRequest.assetOptions = { sources: { hero: { kind: 'generation_required' }, enemy: { kind: 'generation_required' }, collectible: { kind: 'generation_required' } }, ports: {}, modelPolicy: { provider: 'external-provider', simulated: false } };
    var debt = await projectWeave.create(debtRequest, { workspaceRoot: root, runId: 'asset-debt-run' });
    assert.strictEqual(debt.lifecycle, 'debt', 'asset failure must end in recoverable debt, never a false playable result');
    assert.strictEqual(debt.ownerRoute.owner, 'AssetAcceptanceGate', 'asset failure must retain its owning route');

    var persistenceBypass = request('persistence-bypass-project', 'persistence-bypass');
    persistenceBypass.assetOptions = { persistAcceptedGeneratedAssets: true };
    await assert.rejects(function() { return projectWeave.create(persistenceBypass, { workspaceRoot: root, services: services }); }, /ProjectWeave cannot write cloud verification staging or shared-library records/, 'ProjectWeave must not bypass explicit CloudPromotion with a persistence bridge');

    var releaseServices = Object.assign({}, services, { runtimeEvidence: { collect: async function() { return {
      viewportMatrixReport: { pass: true, simulated: false },
      tickPerformanceReport: { pass: true, simulated: false, profile: 'local-interactive', observedSimulationHz: 60 },
      tickReplayReceipt: { pass: true, simulated: false, finalStateHash: 'fixture-final-state' },
      browserPlaytestReport: { pass: true, simulated: false, origin: 'http://127.0.0.1:4193' }
    }; } } });
    var releasable = await projectWeave.create(request('release-gate-project', 'release-gate'), { workspaceRoot: root, services: releaseServices, runId: 'release-gate-run' });
    assert.strictEqual(releasable.lifecycle, 'playable', 'aggregate evidence must be the only path to playable');
    assert(releasable.artifacts.projectVersion, 'a complete aggregate pass must atomically commit an immutable ProjectVersion');
    assert.strictEqual(releasable.artifacts.playableRuntimeEvidence.assetProductionReport.pass, true);
    assert.strictEqual(releasable.artifacts.playableRuntimeEvidence.assetBindingReport.pass, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log('[ProjectWeaveRuntime] create, isolated artifacts, and all-owner LangGraph passed');
}

main().catch(function(error) { console.error(error); process.exit(1); });
