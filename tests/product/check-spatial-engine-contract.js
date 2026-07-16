var assert = require('assert');
var crypto = require('crypto');
var fs = require('fs');
var os = require('os');
var path = require('path');
var dictionary = require('../../packages/semantic/src/capability-semantic-dictionary');
var sourceContract = require('../../packages/semantic/src/game-semantic-source');
var linker = require('../../packages/semantic/src/semantic-runtime-linker');
var assemblyStage = require('../../packages/spatial/src/spatial-assembly-stage');
var plannerDsl = require('../../packages/spatial/src/spatial-planner-dsl');
var semanticDsl = require('../../packages/semantic/src/semantic-dsl-parser');
var semanticRun = require('../../packages/semantic/src/semantic-run-pipeline');
var plannerGraph = require('../../packages/spatial/src/spatial-planner-langgraph');
var spatialProduct = require('../../packages/product/src/spatial-product-pipeline');
var semanticAssetProduct = require('../../packages/product/src/semantic-asset-product-pipeline');
var geometryProducer = require('../../packages/spatial/src/spatial-geometry-fact-producer');
var assetEnginePorts = require('../fixtures/test-asset-engine-ports');
var spatialEngine = require('../../packages/spatial/src/runtime');
var layoutDictionary = require('../../packages/semantic/contracts/semantic-layout-dictionary.json');

function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, Object.create(null)); return value; }
function seal(value, prefix) { var core = JSON.parse(JSON.stringify(value)); delete core.contentHash; value.contentHash = prefix + crypto.createHash('sha256').update(JSON.stringify(stable(core))).digest('hex').slice(0, 24); return value; }
function noRawCoordinates(value) { if (Array.isArray(value)) return value.some(noRawCoordinates); if (!value || typeof value !== 'object') return false; return Object.keys(value).some(function(key) { return ['x', 'y', 'xFraction', 'yFraction', 'rect', 'point'].indexOf(key) >= 0 || noRawCoordinates(value[key]); }); }

(async function() {
  assert.strictEqual(typeof spatialEngine.createLayoutCandidate, 'function', 'Spatial Runtime validates direct planner candidates.');
  assert.strictEqual(typeof spatialEngine.acceptCandidate, 'function', 'Spatial Runtime owns the separate acceptance transition.');
  assert.strictEqual(spatialEngine.contract.activationGates.geometryFactProducer.status, 'implemented', 'Canonical native geometry production is active before planning.');
  assert.strictEqual(spatialEngine.contract.activationGates.acceptanceOrdering.status, 'implemented', 'Acceptance ordering is part of the Spatial Engine contract.');
  assert.strictEqual(noRawCoordinates(layoutDictionary), false, 'Spatial dictionary records relations and constraints, not resolved coordinates.');
  var previewSource = fs.readFileSync(path.join(__dirname, '..', '..', 'packages', 'gdjs', 'src', 'gdjs-spatial-preview.js'), 'utf8');
  assert.strictEqual(previewSource.indexOf('drawFallback'), -1, 'Spatial preview has no placeholder renderer when an accepted resource is missing.');
  assert(previewSource.indexOf('GDJS_SPATIAL_PREVIEW_RESOURCE_MISSING') >= 0, 'Missing accepted preview resources fail closed before Spatial Planner acceptance.');
  ['packages/spatial/src/runtime/assembly.js', 'packages/spatial/src/spatial-assembly-stage.js', 'packages/spatial/contracts/spatial-engine-contract.json'].forEach(function(file) { assert.strictEqual(fs.readFileSync(path.join(__dirname, '..', '..', file), 'utf8').indexOf('environment') < 0, true, file + ' contains no legacy environment path.'); });
  assert.throws(function() { plannerDsl.parseProgram('PLACE subject="player" x=1 y=1 width=1 height=1 angle=0 layer="" zOrder=0\nACCEPT'); }, function(error) { return error.code === 'SPATIAL_DSL_ACCEPTANCE_MIXED'; }, 'PLACE and ACCEPT cannot share a model response.');
  assert.notStrictEqual(plannerDsl.LANGUAGE_ID, semanticDsl.LANGUAGE_ID, 'Semantic and spatial model protocols have distinct language identities.');
  assert.throws(function() { plannerDsl.parseProgram('game(semanticId=demo, name="Demo")'); }, function(error) { return error.code === 'SPATIAL_DSL_INVALID'; }, 'Spatial parser rejects semantic-dsl-v1 commands.');
  var semanticParseOfSpatial = semanticDsl.parse('PLACE subject="player" x=1 y=1 width=1 height=1 angle=0 layer="" zOrder=0');
  assert.strictEqual(semanticRun.validate(semanticParseOfSpatial.commands, semanticParseOfSpatial.warnings).code, 'SEMANTIC_DSL_PARSE_INCOMPLETE', 'Semantic parser pipeline rejects spatial-dsl-v1 commands.');
  assert.deepStrictEqual(plannerGraph.describeGraph().stages.map(function(stage) { return stage.stage; }), spatialEngine.contract.graph, 'LangGraph stages are declared by the one Spatial Engine contract.');

  var index = dictionary.buildIndex();
  var source = {
    schemaVersion: sourceContract.SCHEMA_VERSION,
    documentKind: 'game-semantic-source',
    dictionarySource: index.source,
    game: { semanticId: 'spatial_planner_demo', name: 'Spatial Planner Demo' },
    entities: [
      { semanticId: 'player', roles: ['player'], objectTypeRef: 'gdjs://object/Sprite::Sprite', behaviorTypeRefs: [], members: [] },
      { semanticId: 'hud', roles: ['hud'], objectTypeRef: 'gdjs://object/Sprite::Sprite', behaviorTypeRefs: [], members: [] }
    ],
    components: [],
    events: [],
    assetIntents: [
      { semanticId: 'player_visual', roles: ['player', 'visual'], subject: 'player', description: 'A readable player sprite.', productionFamily: 'character', styleId: 'gamecastle.style-dna.v1', constraints: { transparent: true }, bindings: [] },
      { semanticId: 'hud_visual', roles: ['hud', 'visual'], subject: 'hud', description: 'A readable score panel sprite.', productionFamily: 'character', styleId: 'gamecastle.style-dna.v1', constraints: { transparent: true }, bindings: [] }
    ],
    layoutIntents: [
      { semanticId: 'player_layout', roles: ['world'], subject: 'player', bounds: { width: 64, height: 64 }, relations: [{ semanticId: 'player_anchor', layoutRef: 'gc-layout://world/center', subjects: ['player'] }], bindings: [] },
      { semanticId: 'hud_layout', roles: ['ui'], subject: 'hud', bounds: { width: 100, height: 24 }, relations: [{ semanticId: 'hud_anchor', layoutRef: 'gc-layout://screen/top-left', subjects: ['hud'] }], bindings: [] }
    ],
    tuningPolicies: { relativeChange: { slight: { mode: 'percentage', value: 0.1 } } }
  };
  var assembly = linker.assemble(source, { index: index });
  assert.strictEqual(assembly.projectSeed.project.layouts[0].instances.length, 0, 'Project seed contains no early materialized layout.');
  assert(assembly.projectSeed.project.layouts[0].layers.some(function(layer) { return layer.name === 'ui'; }), 'Dictionary-declared UI layer is materialized before planning without inventing coordinates.');
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-spatial-planner-'));
  try {
    var acceptedAssetProduct = await semanticAssetProduct.run({ runId: 'spatial-assets', projectId: 'spatial-assets', source: source, index: index, projectAssetDir: path.join(root, 'assets'), assetEngine: { ports: assetEnginePorts.createTestAssetEnginePorts({ outputDir: path.join(root, 'masters') }), modelPolicy: { provider: 'deepseek', simulated: true } } });
    var assetWorld = acceptedAssetProduct.assetState.assetWorld, assetBound = acceptedAssetProduct.artifact;
    var geometryFacts = geometryProducer.produce({ assetBoundSeed: assetBound, assetWorld: assetWorld });
    var playerPath = assetWorld.slots.filter(function(slot) { return slot.semanticId === 'player_visual'; })[0].path;
    var hudPath = assetWorld.slots.filter(function(slot) { return slot.semanticId === 'hud_visual'; })[0].path;
    assert(geometryFacts.facts.filter(function(fact) { return fact.kind === 'render-geometry'; }).every(function(fact) { return fact.assetSemanticId && fact.evidence.producerRevision === geometryProducer.PRODUCER_REVISION; }), 'Canonical geometry binds each render fact to one accepted AssetWorld slot.');
    var spatialInput = assemblyStage.prepare(assetBound, assetWorld, { componentExpansion: assembly.componentExpansion, geometryFacts: geometryFacts });
    assert.strictEqual(spatialInput.documentKind, 'spatial-assembly-input');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(spatialInput, 'environment'), false, 'Spatial Assembly Input derives a GDJS scene canvas instead of a screen-environment input.');
    assert.strictEqual(spatialInput.sceneCanvas.width, 800);
    assert(spatialInput.sceneCanvas.layers.some(function(layer) { return layer.name === 'ui'; }), 'Planner receives the real GDJS UI layer fact.');
    assert.strictEqual(spatialInput.sceneCanvas.layers[0].cameras[0].defaultViewport, true, 'Planner receives actual GDJS camera viewport facts instead of a camera count.');
    assert.deepStrictEqual(spatialInput.planningSpace.coordinateFrame.visibleRect, { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 }, 'Planning space resolves the pinned initial GDJS visible rectangle.');
    assert.deepStrictEqual(spatialInput.planningSpace.coordinateFrame.axes, { positiveX: 'right', positiveY: 'down' }, 'Planning space states the GDJS axis directions explicitly.');
    assert.strictEqual(spatialInput.planningSpace.layerStack.order, 'back-to-front');
    assert.strictEqual(spatialInput.planningSpace.layerStack.layers.filter(function(layer) { return layer.name === 'ui'; })[0].index, 1, 'Planning space preserves the GDJS project layer index.');
    assert.deepStrictEqual(spatialInput.planningSpace.subjects.filter(function(subject) { return subject.subject === 'hud'; })[0].legalRegion.rect, { left: 32, top: 24, right: 768, bottom: 576, width: 736, height: 552 }, 'Dictionary safe-area fractions resolve to the active GDJS canvas pixel region.');
    var forgedPlanningSpace = JSON.parse(JSON.stringify(spatialInput)); forgedPlanningSpace.planningSpace.coordinateFrame.origin.x = 10; seal(forgedPlanningSpace, 'spatial-assembly-input.');
    assert.throws(function() { spatialEngine.validateAssemblyInput(forgedPlanningSpace); }, function(error) { return error.code === 'SPATIAL_PLANNING_SPACE_INVALID'; }, 'Planning-space coordinates cannot become a caller-authored second truth.');
    var forgedCanvasInput = JSON.parse(JSON.stringify(spatialInput)); forgedCanvasInput.sceneCanvas.width = 1000; forgedCanvasInput.planningSpace = spatialEngine.createPlanningSpace(forgedCanvasInput.sceneCanvas, forgedCanvasInput.layoutIntentSnapshot); seal(forgedCanvasInput, 'spatial-assembly-input.');
    assert.doesNotThrow(function() { spatialEngine.validateAssemblyInput(forgedCanvasInput); }, 'The isolated assembly document is internally consistent before its seed ownership boundary is checked.');
    assert.throws(function() { spatialEngine.validateAssemblyInputAgainstSeed(forgedCanvasInput, assetBound); }, function(error) { return error.code === 'SPATIAL_ASSEMBLY_SEED_MISMATCH'; }, 'A re-signed sceneCanvas and planningSpace cannot replace the exact asset-bound GDJS scene truth.');
    var forgedRequestBinding = JSON.parse(JSON.stringify(spatialInput)); forgedRequestBinding.spatialAssemblyRequestHash = 'spatial-assembly-request.forged'; seal(forgedRequestBinding, 'spatial-assembly-input.');
    assert.doesNotThrow(function() { spatialEngine.validateAssemblyInput(forgedRequestBinding); }, 'The isolated assembly document cannot prove its external spatial request owner.');
    assert.throws(function() { spatialEngine.validateAssemblyInputAgainstSeed(forgedRequestBinding, assetBound); }, function(error) { return error.code === 'SPATIAL_ASSEMBLY_SEED_MISMATCH'; }, 'A re-signed assembly input cannot replace the seed-owned spatial request or layout intent.');
    var wrongCoordinateEvidence = JSON.parse(JSON.stringify(geometryFacts)); wrongCoordinateEvidence.facts[1].evidence.contentHash = 'gdevelop-spatial-coordinate-truth.forged'; seal(wrongCoordinateEvidence, 'spatial-geometry-fact-set.');
    assert.throws(function() { assemblyStage.prepare(assetBound, assetWorld, { componentExpansion: assembly.componentExpansion, geometryFacts: wrongCoordinateEvidence }); }, function(error) { return error.code === 'SPATIAL_ASSEMBLY_GEOMETRY_INVALID'; }, 'Spatial assembly rejects GDJS coordinate evidence not bound to the pinned generated truth.');
    var customCameraInput = JSON.parse(JSON.stringify(spatialInput)); customCameraInput.sceneCanvas.layers[0].cameras[0].defaultViewport = false;
    assert.throws(function() { spatialEngine.validateAssemblyInput(customCameraInput); }, function(error) { return error.code === 'SPATIAL_SCENE_CAMERA_UNSUPPORTED'; }, 'Custom camera framing fails before planning until its coordinate mapping is implemented.');
    assert.throws(function() { assemblyStage.prepare(assetBound, assetWorld, { componentExpansion: assembly.componentExpansion, geometryFacts: geometryFacts, environment: { viewport: { width: 800, height: 600 } } }); }, function(error) { return error.code === 'SPATIAL_ASSEMBLY_STAGE_INVALID'; }, 'Legacy environment injection is rejected instead of silently retained.');
    assert.throws(function() { spatialEngine.createLayoutCandidate(spatialInput, { round: 1, placements: [
      { subject: 'player', x: 362, y: 286, width: 1, height: 1, angle: 0, layer: '', zOrder: 31 },
      { subject: 'hud', x: 82, y: 46, width: 100, height: 24, angle: 0, layer: 'ui', zOrder: 106 }
    ] }); }, function(error) { return error.code === 'SPATIAL_CANDIDATE_RESERVATION_INVALID'; }, 'Runtime rejects a visual candidate that discards semantic reservation bounds.');
    assert.throws(function() { spatialEngine.createLayoutCandidate(spatialInput, { round: 1, placements: [
      { subject: 'player', x: 362, y: 286, width: 64, height: 64, angle: 0, layer: '', zOrder: 120 },
      { subject: 'hud', x: 82, y: 46, width: 100, height: 24, angle: 0, layer: 'ui', zOrder: 106 }
    ] }); }, function(error) { return error.code === 'SPATIAL_CANDIDATE_ZORDER_INVALID'; }, 'Runtime validates dictionary z-order ranges without selecting the model value.');
    var plannerCalls = [], observedDsl = [], outputs = [
      'PLACE subject="player" x=362 y=286 width=64 height=64 angle=0 layer="" zOrder=31\nPLACE subject="hud" x=82 y=46 width=100 height=24 angle=0 layer="ui" zOrder=106',
      'ACCEPT'
    ];
    var run = await plannerGraph.runSpatialPlanner({
      runId: 'spatial-planner-check',
      projectId: 'spatial-planner-check',
      spatialInput: spatialInput,
      assetBoundSeed: assetBound,
      assetWorld: assetWorld,
      semanticSource: source,
      previewDir: path.join(root, 'preview'),
      maxRounds: 2,
      onSpatialRound: function(entry) { observedDsl.push(entry.dsl); },
      plannerPort: { invoke: async function(request) { plannerCalls.push(request); return { ok: true, output: { text: outputs.shift() }, receipt: { receiptId: 'fixture.' + plannerCalls.length, provider: 'fixture', model: 'fixture-vision', status: 'succeeded', provenance: { simulated: false } } }; } }
    });
    assert.strictEqual(run.status, 'accepted', 'The visual planner completes after a previewed candidate is accepted in a later round: ' + JSON.stringify(run.trace));
    assert.strictEqual(run.resolution.acceptedAtRound, 2, 'Acceptance records the later model round.');
    assert.strictEqual(run.candidate.round, 1, 'Acceptance binds the preceding candidate rather than the same response.');
    assert.strictEqual(run.candidateProjection.basis.documentKind, 'spatial-layout-candidate', 'Preview uses the exact provisional GDJS projection.');
    assert.strictEqual(run.acceptedProjection.basis.documentKind, 'spatial-layout-resolution', 'Final GDJS project derives only from the accepted spatial truth.');
    assert(fs.existsSync(run.preview.imagePath), 'Candidate projection emits a concrete preview image.');
    assert(fs.existsSync(run.traceArtifact.run.path), 'Spatial Planner persists one hash-bound run trace artifact.');
    assert.strictEqual(JSON.parse(fs.readFileSync(run.traceArtifact.modelOutputs[0].path, 'utf8')).entry.dsl, observedDsl[0], 'Raw model DSL is persisted immediately as round evidence.');
    var firstRoundTrace = JSON.parse(fs.readFileSync(run.traceArtifact.rounds[0].path, 'utf8'));
    assert(firstRoundTrace.entries.some(function(entry) { return entry.stage === 'dsl-parse' && entry.program && entry.program.kind === 'candidate'; }), 'Round trace persists the parsed DSL program.');
    assert(firstRoundTrace.entries.some(function(entry) { return entry.stage === 'candidate-validate' && entry.candidate && entry.candidate.contentHash === run.candidate.contentHash; }), 'Round trace persists the Runtime execution result.');
    assert(firstRoundTrace.entries.some(function(entry) { return entry.stage === 'preview'; }) && firstRoundTrace.entries.some(function(entry) { return entry.stage === 'planner-feedback'; }), 'Round trace persists projection, preview, and feedback stages.');
    assert.strictEqual(plannerCalls.length, 2);
    assert.deepStrictEqual(plannerCalls[0].imagePaths, [hudPath, playerPath], 'Accepted images are sent in the same semanticId order declared by imageRefs.');
    assert(plannerCalls[0].prompt.indexOf('accepted-asset:hud_visual') >= 0 && plannerCalls[0].prompt.indexOf('accepted-asset:player_visual') >= 0, 'Prompt maps each accepted image to an explicit imageRef.');
    assert(plannerCalls[1].prompt.indexOf('orderedImageInputs (provider image order):') >= 0 && plannerCalls[1].prompt.indexOf('candidate-preview:' + run.preview.contentHash) >= 0, 'Every visual-planner round declares the complete ordered imageRef list, including the candidate preview.');
    assert(plannerCalls[0].prompt.indexOf('A readable score panel sprite.') >= 0 && plannerCalls[0].prompt.indexOf(assembly.componentExpansion.contentHash) >= 0, 'Planner receives the frozen semantic design and component-expansion identity.');
    assert(plannerCalls[0].prompt.indexOf('"positiveX":"right"') >= 0 && plannerCalls[0].prompt.indexOf('"left":32,"top":24,"right":768,"bottom":576') >= 0, 'Planner prompt receives the explicit coordinate frame and dictionary-derived legal pixel region.');
    assert(plannerCalls[1].imagePaths.indexOf(run.preview.imagePath) >= 0, 'The later visual-planner call receives the exact candidate preview.');
    assert.deepStrictEqual(run.trace.filter(function(entry) { return entry.stage === 'planner-invoke'; }).map(function(entry) { return entry.dsl; }), [
      'PLACE subject="player" x=362 y=286 width=64 height=64 angle=0 layer="" zOrder=31\nPLACE subject="hud" x=82 y=46 width=100 height=24 angle=0 layer="ui" zOrder=106',
      'ACCEPT'
    ], 'Every model DSL response is preserved in the visible run trace.');
    assert.deepStrictEqual(observedDsl, ['PLACE subject="player" x=362 y=286 width=64 height=64 angle=0 layer="" zOrder=31\nPLACE subject="hud" x=82 y=46 width=100 height=24 angle=0 layer="ui" zOrder=106', 'ACCEPT'], 'Caller receives each DSL output immediately through onSpatialRound.');
    var instances = run.acceptedProjection.project.layouts.filter(function(layout) { return layout.name === spatialInput.sceneCanvas.sceneName; })[0].instances;
    assert.deepStrictEqual(instances.map(function(instance) { return { name: instance.name, x: instance.x, y: instance.y, width: instance.width, height: instance.height, layer: instance.layer, zOrder: instance.zOrder }; }), [
      { name: assetBound.objectDeclarations.filter(function(item) { return item.semanticId === 'player'; })[0].objectName, x: 362, y: 286, width: 64, height: 64, layer: '', zOrder: 31 },
      { name: assetBound.objectDeclarations.filter(function(item) { return item.semanticId === 'hud'; })[0].objectName, x: 82, y: 46, width: 100, height: 24, layer: 'ui', zOrder: 106 }
    ], 'Accepted GDJS instances exactly match canonical accepted resolution coordinates.');
    var wrongPreview = JSON.parse(JSON.stringify(run.preview)); wrongPreview.candidateProjectionHash = 'gdjs-spatial-projection.wrong'; seal(wrongPreview, 'gdjs-spatial-preview.');
    assert.throws(function() { spatialEngine.acceptCandidate(spatialInput, run.candidate, { acceptanceRound: 2, assetBoundSeed: assetBound, candidateProjection: run.candidateProjection, preview: wrongPreview }); }, function(error) { return error.code === 'SPATIAL_ACCEPTANCE_PREVIEW_INVALID'; }, 'Public Runtime acceptance rejects a self-hashed preview for another projection.');
    var wrongProjection = JSON.parse(JSON.stringify(run.candidateProjection)); wrongProjection.basis.contentHash = 'spatial-layout-candidate.wrong'; seal(wrongProjection, 'gdjs-spatial-projection.');
    assert.throws(function() { spatialEngine.acceptCandidate(spatialInput, run.candidate, { acceptanceRound: 2, assetBoundSeed: assetBound, candidateProjection: wrongProjection, preview: run.preview }); }, function(error) { return error.code === 'SPATIAL_ACCEPTANCE_PROJECTION_INVALID'; }, 'Public Runtime acceptance rejects a projection that does not derive from the promoted candidate.');
    assert.throws(function() { spatialEngine.acceptCandidate(spatialInput, run.candidate, { acceptanceRound: 2, candidateProjectionHash: 'fake', previewHash: 'fake' }); }, function(error) { return error.code === 'SPATIAL_ACCEPTANCE_INVALID'; }, 'Legacy hash-only acceptance is rejected instead of retained as a compatibility path.');
    var forgedResolution = JSON.parse(JSON.stringify(run.resolution)); forgedResolution.acceptedCandidateHash = 'spatial-layout-candidate.forged'; seal(forgedResolution, 'spatial-layout-resolution.');
    assert.throws(function() { spatialEngine.createAcceptedProjection(spatialInput, assetBound, forgedResolution, { candidate: run.candidate, candidateProjection: run.candidateProjection, preview: run.preview }); }, function(error) { return error.code === 'GDJS_SPATIAL_ACCEPTANCE_EVIDENCE_INVALID'; }, 'Final projection rejects a self-hashed resolution that is not bound to the exact accepted evidence.');
    assert.throws(function() { spatialEngine.createAcceptedProjection(spatialInput, assetBound, run.resolution); }, function(error) { return error.code === 'GDJS_SPATIAL_ACCEPTANCE_EVIDENCE_INVALID'; }, 'Final projection cannot bypass acceptance by omitting its evidence bundle.');
    var failedRun = await plannerGraph.runSpatialPlanner({
      runId: 'spatial-provider-failure-check', projectId: 'spatial-provider-failure-check', spatialInput: spatialInput, assetBoundSeed: assetBound, assetWorld: assetWorld, semanticSource: source,
      previewDir: path.join(root, 'provider-failure-preview'), maxRounds: 1,
      plannerPort: { invoke: async function() { throw Object.assign(new Error('fixture provider failure'), { code: 'FIXTURE_PROVIDER_FAILED', owner: 'FixtureProvider' }); } }
    });
    assert.strictEqual(failedRun.status, 'provider-failed');
    assert.strictEqual(failedRun.traceArtifact.rounds.length, 1, 'Provider failure still persists the exact failed external round.');
    var failedRoundTrace = JSON.parse(fs.readFileSync(failedRun.traceArtifact.rounds[0].path, 'utf8'));
    assert(failedRoundTrace.entries[0].input.systemPrompt && failedRoundTrace.entries[0].input.prompt && failedRoundTrace.entries[0].input.imageInputs.length === 2, 'Provider failure round preserves exact prompt and ordered image inputs for diagnosis.');
    var productOutputs = [
      'PLACE subject="player" x=362 y=286 width=64 height=64 angle=0 layer="" zOrder=31\nPLACE subject="hud" x=82 y=46 width=100 height=24 angle=0 layer="ui" zOrder=106',
      'ACCEPT'
    ];
    var product = await spatialProduct.run({
      runId: 'spatial-product-check',
      projectId: 'spatial-product-check',
      assetProduct: acceptedAssetProduct,
      previewDir: path.join(root, 'product-preview'),
      maxRounds: 2,
      plannerPort: { invoke: async function() { return { ok: true, output: { text: productOutputs.shift() }, receipt: { receiptId: 'product.fixture', provider: 'fixture', model: 'fixture-vision', status: 'succeeded', provenance: { simulated: false } } }; } }
    });
    assert.strictEqual(product.plannerRun.status, 'accepted', 'Asset-bound semantic product enters the same Spatial Planner graph rather than a parallel assembly path.');
    assert.strictEqual(product.geometryFacts.contentHash, geometryFacts.contentHash, 'Spatial product uses the one canonical geometry producer instead of caller-authored facts.');
    assert.strictEqual(product.resolution.contentHash, product.plannerRun.resolution.contentHash, 'Spatial product success always exposes a non-null accepted resolution.');
    assert.strictEqual(product.traceArtifact.run.contentHash, product.plannerRun.traceArtifact.run.contentHash, 'Spatial product exposes the same persisted external-round trace artifact.');
    assert.strictEqual(product.acceptedProjection.basis.documentKind, 'spatial-layout-resolution', 'Spatial product exposes only the final accepted GDJS projection.');
    await assert.rejects(function() { return spatialProduct.run({ runId: 'spatial-product-provider-failure', projectId: 'spatial-product-provider-failure', assetProduct: acceptedAssetProduct, previewDir: path.join(root, 'product-provider-failure'), maxRounds: 1, plannerPort: { invoke: async function() { throw Object.assign(new Error('fixture provider failure'), { code: 'FIXTURE_PROVIDER_FAILED', owner: 'FixtureProvider' }); } } }); }, function(error) { return error.code === 'SPATIAL_PRODUCT_BLOCKED' && error.plannerRun && error.plannerRun.status === 'provider-failed'; }, 'Non-accepted planner terminal states never return a nullable-success spatial product.');
    await assert.rejects(function() { return spatialProduct.run({ runId: 'spatial-product-injected-geometry', projectId: 'spatial-product-injected-geometry', assetProduct: acceptedAssetProduct, geometryFacts: geometryFacts, previewDir: path.join(root, 'product-injected-geometry') }); }, function(error) { return error.code === 'SPATIAL_PRODUCT_GEOMETRY_INJECTION_FORBIDDEN'; }, 'Caller-authored geometry injection is deleted rather than retained as a compatibility path.');
    console.log('[SpatialEngineContract] visual LLM candidate, Runtime validation, same-path GDJS preview, later acceptance, and final GDJS projection passed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(function(error) { console.error(error); process.exit(1); });
