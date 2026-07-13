/*
 * WP0 Project Weave Runtime.
 *
 * This module owns only orchestration: lifecycle, checkpointing and owner
 * routing. Semantic compilation, asset resolution, GDJS execution, export and
 * playtest remain owned by their existing modules.
 */
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');

var assetEngine = require('./asset-engine-langgraph');
var assetWorldStore = require('./asset-world');
var gdevelopTruth = require('./gdevelop-truth');
var htmlExporter = require('./html-exporter');
var intentCompiler = require('./intent-compiler');
var naturalIntentSemanticPort = require('./natural-intent-semantic-port');
var pipeline = require('./pipeline');
var projectWorldStore = require('./project-world');
var projectStoreModule = require('./project-store');
var productModulePlanner = require('./product-module-planner');
var funBlueprintSelector = require('./fun-blueprint-selector');
var productModuleCompiler = require('./module-compiler');
var placementResolver = require('./placement-resolver');
var spatialCompositionPlanner = require('./spatial-composition-planner');
var runtimeCodegen = require('./runtime-codegen');
var semanticFeedback = require('./semantic-feedback');
var semanticPlaytest = require('./semantic-playtest-agent');
var simulatedAssetPorts = require('./simulated-local-asset-ports');
var tickRuntimeCodegen = require('./network-runtime/codegen');
var langGraphRuntime = require('./langgraph-runtime');
var GDJS_RUNTIME_DIR = process.env.GAMECASTLE_GDJS_RUNTIME_DIR || path.join(__dirname, '..', 'engine', 'gdevelop-runtime');

var PROJECT_WEAVE_NODE_SEQUENCE = [
  'llm2-intent', 'intent-compiler', 'fun-blueprint-selector', 'product-module-planner', 'module-declaration', 'spatial-composition', 'resolver', 'asset-weave', 'bridge',
  'runtime-linker', 'runtime', 'project-world', 'tick-runtime',
  'server-runtime', 'html-export', 'runtime-validator', 'tick-playtest',
  'semantic-feedback'
];

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function now() { return new Date().toISOString(); }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.keys(value).forEach(function(key) { deepFreeze(value[key]); }); return Object.freeze(value); }
function writeJson(filePath, value) { fs.mkdirSync(path.dirname(filePath), { recursive: true }); fs.writeFileSync(filePath, JSON.stringify(value, null, 2)); }
function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
function safeId(value, fallback) { var id = String(value || fallback || '').replace(/[^A-Za-z0-9_.-]/g, '_'); if (!id) throw new Error('ProjectWeave requires a stable id'); return id; }

function runDirectory(workspaceRoot, projectId, runId) {
  return path.join(path.resolve(workspaceRoot), 'projects', safeId(projectId), 'runs', safeId(runId));
}
function checkpointPath(state) { return path.join(state.runDir, 'checkpoint.json'); }
function saveCheckpoint(state) { state.run.checkpointAt = now(); writeJson(checkpointPath(state), state); }

function makeGameplayRequirementGraph(request, compiled) {
  var refs = (request.requiredSemanticRefs || ['semantic-dictionary#/gameplayRoles/actor']).slice();
  return {
    schemaVersion: 1,
    requirementGraphId: request.requestId + ':requirements',
    mode: request.mode === 'continue' ? 'continue' : 'create',
    funBlueprintRef: request.funBlueprintRef || null,
    modulePreference: request.modulePreference || null,
    experience: { actorRoles: ['semantic-dictionary#/gameplayRoles/actor'], playGoals: refs.filter(function(ref) { return ref.indexOf('/playGoals/') >= 0; }), pressureRoles: [], rewardRoles: [], failureMeaning: refs.filter(function(ref) { return ref.indexOf('/eventMeanings/ActorFailed') >= 0; })[0] || null, recoveryMeaning: 'semantic-dictionary#/eventMeanings/ActorSpawned', progressionMeaning: null, controlMeaning: 'semantic-dictionary#/gameplayRoles/action_entry', cameraMeaning: null },
    requirements: refs.map(function(ref) { return { semanticRef: ref, kind: 'mechanic', required: true, providerCardinality: 'at-least-one', evidenceIds: ['intent:' + request.requestId] }; }),
    surfaces: ['hud', 'start', 'pause', 'game-over', 'score', 'controls'].map(function(slotRole) { return { semanticRef: 'semantic-dictionary#/gameplayRoles/feedback', required: slotRole !== 'pause', slotRole: slotRole }; }),
    constraints: { source: 'IntentAgent', compiledIntentPresent: !!compiled },
    semanticEvidence: [{ evidenceId: 'intent:' + request.requestId, source: 'natural-request' }]
  };
}

function makeBuildContract(request, compiled, previousWorld) {
  if (request.buildContract) return clone(request.buildContract);
  return {
    meta: { schemaVersion: 1, contractId: request.requestId + ':build', createdAt: now(), owner: 'IntentAgent', status: 'ready' },
    request: { rawUserPrompt: request.naturalIntent, projectMode: request.mode === 'continue' ? 'continue' : 'new', iterationIntent: request.naturalIntent },
    world: { projectWorldHash: previousWorld ? previousWorld.semanticHash : null, knownScenes: (previousWorld && previousWorld.scenes || []).map(function(scene) { return scene.name; }), knownModules: (previousWorld && previousWorld.modules || []).map(function(module) { return module.moduleId || module.id || module; }) },
    styleGuide: { visualStyle: 'gamecastle.style-1', tone: 'playful', palette: [], assetReuse: 'generateMissingOnly' },
    moduleContract: { gameplayRequirementGraph: makeGameplayRequirementGraph(request, compiled), networkPolicy: { sync: 'local', authority: 'runtime', tickRate: 0, seed: request.requestId, deterministic: true } },
    assetContract: { slots: clone(request.assetSlots || []), globalConstraints: { allowTextInImages: false, allowedFormats: ['png'] }, resolutionDefaults: { allowPlaceholder: true } },
    parallelPlan: { canRunInParallel: false, tasks: [], joinStrategy: 'all' },
    acceptance: { checks: [] }, cachePolicy: { reuse: true }, repairPolicy: { maxRounds: 0, routeByOwner: true, retryOwners: [] },
    intentArtifact: compiled ? { intentGraphHash: hash(compiled.graph || {}) } : null
  };
}

function defaultSemanticPort(request, previousWorld) {
  if (!request.intentDslText) {
    return naturalIntentSemanticPort.compile(request, previousWorld).then(function(natural) {
      return {
        buildContract: makeBuildContract(request, { graph: natural.intentGraph }, previousWorld),
        intent: natural
      };
    });
  }
  var compiled = intentCompiler.compileIntentDsl(request.intentDslText, { baseWorld: previousWorld || null });
  return {
    buildContract: makeBuildContract(request, compiled, previousWorld),
    intent: {
      artifactKind: 'intent', intentDslText: request.intentDslText, intentGraph: compiled.graph,
      placementPlan: compiled.placementPlan, bridgePlan: compiled.bridgePlan,
      intentContracts: compiled.contracts, compileResultCard: compiled.resultCard,
      runtimeAdapterRequirements: compiled.bridgePlan.runtimeAdapterRequirements
    }
  };
}

function normalizeRequest(input) {
  input = input || {};
  if (!input.projectId || !input.requestId || !input.naturalIntent) throw new Error('ProjectRequest requires projectId, requestId, and naturalIntent');
  var mode = input.mode || 'create';
  if (['create', 'continue'].indexOf(mode) < 0) throw new Error('ProjectRequest mode must be create or continue');
  return Object.assign({}, clone(input), { projectId: safeId(input.projectId), requestId: safeId(input.requestId), mode: mode });
}

function makeInitialState(request, options) {
  var runId = safeId(options.runId || ('run.' + request.requestId + '.' + hash([request.projectId, request.requestId, now()])));
  var runDir = runDirectory(options.workspaceRoot || path.join(__dirname, '..', '.gamecastle'), request.projectId, runId);
  return {
    schemaVersion: 1,
    request: request,
    run: { runId: runId, projectId: request.projectId, state: 'understanding', startedAt: now(), graphTrace: [] },
    runDir: runDir,
    runtimeDir: path.join(runDir, 'runtime'),
    completed: {},
    artifacts: {},
    previous: clone(options.previous || {}),
    ownerRoute: null,
    lifecycle: 'understanding'
  };
}

function appendTrace(state, nodeName) {
  state.run.graphTrace.push({ node: nodeName, at: now() });
}

function node(owner, nodeName, work, options) {
  return async function(state) {
    if (state.completed[nodeName]) return state;
    state.run.state = nodeName;
    try {
      await work(state);
      state.completed[nodeName] = { owner: owner, status: 'completed', at: now() };
      appendTrace(state, nodeName);
      saveCheckpoint(state);
      if (options.failAfter === nodeName) throw new Error('Injected interruption after ' + nodeName);
      return state;
    } catch (error) {
      state.ownerRoute = { owner: owner, stage: nodeName, code: error.code || 'PROJECT_WEAVE_NODE_FAILED', message: error.message, nextAction: 'route-to-owner' };
      state.lifecycle = 'debt';
      state.run.state = 'debt';
      saveCheckpoint(state);
      throw error;
    }
  };
}

function materializeBindings(state) {
  var bindings = clone((state.artifacts.assetEngine.runtimeBindingManifest || {}).bindings || []);
  var assetDir = path.join(state.runtimeDir, 'assets', 'generated');
  fs.mkdirSync(assetDir, { recursive: true });
  bindings.forEach(function(binding) {
    var source = binding && binding.asset && binding.asset.path;
    if (!source || !fs.existsSync(source)) return;
    var file = safeId(path.basename(source), 'asset.png');
    var target = path.join(assetDir, file);
    fs.copyFileSync(source, target);
    binding.asset.path = path.join('assets', 'generated', file).replace(/\\/g, '/');
  });
  writeJson(path.join(state.runtimeDir, 'asset-runtime-bindings.json'), { schemaVersion: 1, buildContractId: state.run.runId, bindings: bindings });
  return bindings;
}

function writeRuntime(state) {
  var project = state.project;
  gdevelopTruth.syncProjectExtensions(project);
  gdevelopTruth.validateProject(project);
  fs.mkdirSync(state.runtimeDir, { recursive: true });
  writeJson(path.join(state.runtimeDir, 'project.json'), project);
  writeJson(path.join(state.runtimeDir, 'semantic-session.json'), state.artifacts.intent.semanticSession || null);
  fs.writeFileSync(path.join(state.runtimeDir, 'data.js'), 'gdjs.projectData = ' + JSON.stringify(project) + ';\ngdjs.runtimeGameOptions = {};\n', 'utf8');
  var files = runtimeCodegen.generateProjectCodeFiles(project);
  files.forEach(function(file) { fs.writeFileSync(path.join(state.runtimeDir, file.fileName), file.code, 'utf8'); });
  var bindings = materializeBindings(state);
  if (bindings.length) {
    var overlay = require('./asset-runtime-overlay-codegen').generate({ bindings: bindings });
    fs.writeFileSync(path.join(state.runtimeDir, 'asset-runtime.js'), overlay, 'utf8');
  }
  if (!fs.existsSync(path.join(state.runtimeDir, 'tick-runtime.js'))) fs.writeFileSync(path.join(state.runtimeDir, 'tick-runtime.js'), '(function(){})();\n', 'utf8');
  var assetFiles = bindings.filter(function(binding) { return binding && binding.asset && binding.asset.path; }).map(function(binding) { return binding.asset.path; });
  var manifest = htmlExporter.buildHtmlExportManifest(project, { codeFiles: files, modules: state.artifacts.compiledModulePlan.installedModules, hasAssetRuntime: assetFiles.length > 0, assetFiles: assetFiles });
  htmlExporter.syncHtmlRuntime(GDJS_RUNTIME_DIR, state.runtimeDir, manifest);
  writeJson(path.join(state.runtimeDir, 'html-export-manifest.json'), manifest);
  htmlExporter.writeHtmlExport(state.runtimeDir, manifest, { hasTickRuntime: false });
  return { files: files.map(function(file) { return file.fileName; }), manifest: manifest, bindings: bindings };
}

function validationReport(state) {
  var checks = [
    { checkId: 'target-plan', layer: 'runtimeSmoke', passed: state.artifacts.execution.failed.length === 0, ownerOnFailure: 'RuntimeExecutor', message: 'All target-plan operations executed.' },
    { checkId: 'project-json', layer: 'gdevelopTruth', passed: fs.existsSync(path.join(state.runtimeDir, 'project.json')), ownerOnFailure: 'RuntimeLinker', message: 'GDJS project artifact exists.' },
    { checkId: 'html-export', layer: 'htmlManifest', passed: fs.existsSync(path.join(state.runtimeDir, 'index.html')), ownerOnFailure: 'RuntimeLinker', message: 'HTML playable artifact exists.' },
    { checkId: 'asset-debt', layer: 'assetResolution', passed: state.artifacts.assetEngine.debts.length === 0, ownerOnFailure: 'RuntimeAssetResolver', message: 'Asset debt is empty.' }
  ];
  var failed = checks.filter(function(check) { return !check.passed; });
  return { meta: { schemaVersion: 1, contractId: state.run.runId + ':validation', createdAt: now(), owner: 'RuntimeValidator', status: failed.length ? 'blocked' : 'passed' }, buildContractId: state.run.runId, checks: checks, summary: { passed: checks.length - failed.length, failed: failed.length, blocked: failed.length, cacheHit: false }, nextAction: failed.length ? 'route-to-owner' : 'done', pass: failed.length === 0, ownerRoute: failed.length ? { owner: failed[0].ownerOnFailure, stage: failed[0].checkId } : null, blocksPublish: state.artifacts.assetEngine.debts.length > 0 };
}

function makeHandlers(options) {
  var services = options.services || {};
  return {
    'llm2-intent': node('IntentAgent', 'llm2-intent', async function(state) {
      var result = services.semanticPort ? await services.semanticPort.compile(state.request, state.previous.projectWorld || null) : await defaultSemanticPort(state.request, state.previous.projectWorld || null);
      if (!result || !result.buildContract || !result.intent) throw new Error('SemanticPort must return BuildContract and intent artifact');
      state.artifacts.buildContract = deepFreeze(result.buildContract);
      state.artifacts.buildContractReceipt = { owner: 'IntentAgent', immutable: true, contentHash: hash(result.buildContract) };
      state.artifacts.intent = result.intent;
    }, options),
    'intent-compiler': node('IntentCompiler', 'intent-compiler', function(state) {
      if (!state.artifacts.intent.bridgePlan || !state.artifacts.intent.intentContracts || state.artifacts.intent.intentContracts.intentCompile !== 'passed') throw new Error('Intent artifact is not a passed compiler result');
    }, options),
    'fun-blueprint-selector': node('FunBlueprintSelector', 'fun-blueprint-selector', function(state) {
      var graph = state.artifacts.buildContract.moduleContract.gameplayRequirementGraph;
      if (!graph.funBlueprintRef) { state.artifacts.funBlueprintSelection = null; return; }
      state.artifacts.funBlueprintSelection = funBlueprintSelector.select(graph, { blueprintRef: graph.funBlueprintRef });
    }, options),
    'product-module-planner': node('ProductModulePlanner', 'product-module-planner', async function(state) {
      var plannerPort = services.productModulePlanner || productModulePlanner;
      var result = plannerPort.plan(state.artifacts.buildContract.moduleContract.gameplayRequirementGraph, { previousWorld: state.previous.projectWorld, funBlueprintSelection: state.artifacts.funBlueprintSelection, modulePreference: state.artifacts.buildContract.moduleContract.gameplayRequirementGraph.modulePreference });
      if (result.debt) { state.artifacts.moduleDebt = result.debt; throw new Error(result.debt.message); }
      state.artifacts.moduleCompositionPlan = result.plan;
      if (services.compositionPersistenceBridge) {
        if (typeof services.compositionPersistenceBridge.persistPlannedComposition !== 'function') throw new Error('CompositionPersistenceBridge must implement persistPlannedComposition');
        state.artifacts.moduleCompositionPersistence = await services.compositionPersistenceBridge.persistPlannedComposition(result.plan);
      }
    }, options),
    'module-declaration': node('ProductModuleCompiler', 'module-declaration', function(state) {
      state.artifacts.moduleDeclarationPlan = productModuleCompiler.declareModuleSubjects(state.artifacts.moduleCompositionPlan);
    }, options),
    'spatial-composition': node('SpatialCompositionPlanner', 'spatial-composition', function(state) {
      var catalog = productModuleCompiler.loadProductModuleCatalog(path.join(__dirname, 'product-modules'));
      var result = spatialCompositionPlanner.plan(state.artifacts.buildContract.moduleContract.gameplayRequirementGraph, state.artifacts.moduleCompositionPlan, state.artifacts.moduleDeclarationPlan, catalog);
      if (result.debt) { state.artifacts.moduleDebt = result.debt; throw new Error(result.debt.message); }
      state.artifacts.spatialCompositionPlan = result.plan;
    }, options),
    resolver: node('PlacementResolver', 'resolver', function(state) {
      state.artifacts.placementPlan = placementResolver.resolveSpatialComposition(state.artifacts.spatialCompositionPlan, state.artifacts.moduleDeclarationPlan, { scene: 'Game' });
    }, options),
    'asset-weave': node('RuntimeAssetResolver', 'asset-weave', async function(state) {
      var assetOptions = state.request.assetOptions || {};
      if (assetOptions.persistAcceptedGeneratedAssets === true || services.assetPersistenceBridge) throw new Error('ProjectWeave cannot write cloud verification staging or shared-library records; request explicit CloudPromotion after a bound local asset exists.');
      var ports = assetOptions.ports || services.assetPorts || simulatedAssetPorts.createSimulatedLocalAssetPorts({ outputDir: state.runtimeDir });
      state.artifacts.assetEngine = await assetEngine.runAssetEngine({ runId: state.run.runId, projectId: state.request.projectId, buildContract: state.artifacts.buildContract, localInputs: assetOptions.localInputs || {}, localAssets: assetOptions.localAssets || {}, sources: assetOptions.sources || {}, visualIntents: assetOptions.visualIntents || {}, ports: ports, providerRuntime: services.providerRuntime || null, providerOptions: assetOptions.providerOptions || {}, projectAssetDir: path.join(state.runtimeDir, 'asset-staging'), ledgerPath: path.join(state.runDir, 'asset-ledger.json'), maxAttempts: assetOptions.maxAttempts, maxCost: assetOptions.maxCost, modelPolicy: assetOptions.modelPolicy || { simulated: true } });
      assetWorldStore.saveAssetWorld(state.runDir, state.artifacts.assetEngine.assetWorld);
    }, options),
    bridge: node('ProductModuleCompiler', 'bridge', function(state) {
      state.artifacts.compiledModulePlan = productModuleCompiler.compileCompositionPlan(state.artifacts.moduleCompositionPlan, null, { previousWorld: state.previous.projectWorld, projectWorld: state.previous.projectWorld, placementPlan: state.artifacts.placementPlan });
      if (!state.artifacts.compiledModulePlan.provenance || state.artifacts.compiledModulePlan.provenance.owner !== 'ProductModuleCompiler') throw new Error('CompiledModulePlan provenance required');
    }, options),
    'runtime-linker': node('RuntimeLinker', 'runtime-linker', function(state) {
      state.artifacts.assembly = { meta: { owner: 'RuntimeLinker', status: 'ready' }, buildContractId: state.run.runId, targetPlanLines: pipeline.parseTargetPlan(state.artifacts.compiledModulePlan.targetPlanText).length, bindings: state.artifacts.assetEngine.runtimeBindingManifest.bindings || [] };
    }, options),
    runtime: node('RuntimeExecutor', 'runtime', async function(state) {
      var project = state.previous.project ? clone(state.previous.project) : pipeline.emptyProject(state.request.projectId);
      var results = [];
      var compiledPlan = state.artifacts.compiledModulePlan;
      var operationModules = clone((state.previous.projectWorld && state.previous.projectWorld.modules) || []);
      var runtimeOps = compiledPlan.runtimeOperations || [];
      async function executeLines(lines, operationId) {
        var ops = pipeline.parseTargetPlan((lines || []).join('\n'));
        for (var index = 0; index < ops.length; index++) {
          var result = await (services.executeOperationLine || pipeline.execute)(project, ops[index], lines[index], { operationId: operationId, runId: state.run.runId });
          results.push({ index: results.length, commandId: state.run.runId + ':' + operationId + ':line:' + index, ok: !!result.ok, command: lines[index], label: ops[index].verb, message: result.msg });
          if (!result.ok) throw new Error('MODULE_OPERATION_FAILED: ' + operationId + ': ' + result.msg);
        }
      }
      if (runtimeOps.length) {
        var groups = {};
        runtimeOps.forEach(function(operation) { var groupId = operation.atomicGroupId || operation.operationId; if (!groups[groupId]) groups[groupId] = []; groups[groupId].push(operation); });
        var groupIds = Object.keys(groups).sort();
        for (var groupIndex = 0; groupIndex < groupIds.length; groupIndex++) {
          var groupId = groupIds[groupIndex];
          var projectBeforeGroup = clone(project);
          var modulesBeforeGroup = clone(operationModules);
          try {
            for (var opIndex = 0; opIndex < groups[groupId].length; opIndex++) {
              var operation = groups[groupId][opIndex];
              var projectBeforeOperation = clone(project);
            if (operation.op === 'remove' || operation.op === 'replace') {
              var oldIndex = operationModules.findIndex(function(module) { return module.id === operation.fromModule.moduleId; });
              if (oldIndex < 0) throw new Error('MODULE_REMOVE_UNSAFE: module not installed');
              productModuleCompiler.removeOwnedArtifacts(project, operationModules[oldIndex], operation, operationModules);
              operationModules.splice(oldIndex, 1);
            }
            if (operation.op === 'install' || operation.op === 'replace') {
              var installBefore = clone(project);
              await executeLines(operation.targetPlanLines, operation.operationId);
              var target = operation.toModule.moduleId;
              var module = (compiledPlan.installedModules || []).find(function(item) { return item.id === target; });
              if (!module) throw new Error('MODULE_OPERATION_FAILED: installed module receipt missing ' + target);
              module = clone(module);
              module.ownedArtifacts = productModuleCompiler.captureOwnedArtifacts(installBefore, project);
              module.ownedArtifactIds = module.ownedArtifacts.map(function(item) { return item.artifactId; });
              module.ownershipHash = hash({ id: module.id, revision: module.revision, params: module.params, ownedArtifactIds: module.ownedArtifactIds });
              operationModules.push(module);
            }
            if (operation.op === 'replace') productModuleCompiler.migrateState(project, operation.stateMigration, projectBeforeOperation);
            if (operation.op === 'configure') await executeLines(operation.targetPlanLines, operation.operationId);
            }
          } catch (error) {
            project = projectBeforeGroup;
            operationModules = modulesBeforeGroup;
            if (services.onAtomicRollback) services.onAtomicRollback({ groupId: groupId, project: clone(project), modules: clone(operationModules), error: error.message });
            results.push({ index: results.length, commandId: state.run.runId + ':' + groupId + ':rollback', ok: false, command: null, label: 'rollback', message: error.message });
            throw error;
          }
        }
      } else {
        await executeLines(compiledPlan.targetPlanLines, 'compiled-plan');
      }
      state.project = project;
      state.artifacts.execution = { completed: results.filter(function(result) { return result.ok; }).length, failed: results.filter(function(result) { return !result.ok; }), results: results };
      state.artifacts.compiledModulePlan.installedModules = operationModules;
    }, options),
    'project-world': node('ProjectWorld', 'project-world', function(state) {
      var world = projectWorldStore.buildProjectWorld(state.project, state.previous.projectWorld || null, { modules: state.artifacts.compiledModulePlan.installedModules, intent: state.artifacts.intent });
      var report = projectWorldStore.makeExecutionReport({ previousWorld: state.previous.projectWorld || null, world: world, targetPlanLines: state.artifacts.compiledModulePlan.targetPlanLines, commandResults: state.artifacts.execution.results, runIndex: 1, batchLabel: state.request.mode, intent: state.artifacts.intent });
      state.artifacts.projectWorld = world;
      state.artifacts.executionReport = report;
      projectWorldStore.saveProjectWorld(state.runDir, world);
      projectWorldStore.appendExecutionReport(state.runDir, report);
    }, options),
    'tick-runtime': node('TickRuntimeCodegen', 'tick-runtime', function(state) {
      var manifest = state.artifacts.compiledModulePlan.tickRuntimeManifest || null;
      if (!manifest) { state.artifacts.tickRuntime = { status: 'not-required', owner: 'TickRuntimeCodegen' }; return; }
      var bundle = tickRuntimeCodegen.generate(manifest, { signalingUrl: state.request.signalingUrl });
      fs.mkdirSync(state.runtimeDir, { recursive: true }); fs.writeFileSync(path.join(state.runtimeDir, 'tick-runtime.js'), bundle, 'utf8');
      state.artifacts.tickRuntime = { status: 'ready', manifest: manifest, bytes: bundle.length };
    }, options),
    'server-runtime': node('ServerRuntime', 'server-runtime', function(state) {
      var network = ((state.artifacts.compiledModulePlan.tickRuntimeManifest || {}).plan || {}).realtime;
      state.artifacts.serverRuntime = network && network.sync !== 'local' ? { status: 'deferred-to-WP7', owner: 'ServerRuntime' } : { status: 'not-required', owner: 'ServerRuntime' };
    }, options),
    'html-export': node('HtmlExporter', 'html-export', function(state) { state.artifacts.htmlExport = writeRuntime(state); }, options),
    'runtime-validator': node('RuntimeValidator', 'runtime-validator', function(state) { state.artifacts.validationReport = validationReport(state); if (!state.artifacts.validationReport.pass) state.ownerRoute = state.artifacts.validationReport.ownerRoute; }, options),
    'tick-playtest': node('SemanticPlaytestAgent', 'tick-playtest', function(state) { state.artifacts.playtestReport = semanticPlaytest.runSemanticPlaytest({ projectWorld: state.artifacts.projectWorld, executionReport: state.artifacts.executionReport }); }, options),
    'semantic-feedback': node('SemanticFeedback', 'semantic-feedback', function(state) {
      state.artifacts.feedbackReport = semanticFeedback.analyzeSemanticFeedback({ projectWorld: state.artifacts.projectWorld, executionReport: state.artifacts.executionReport, probeReport: { summary: state.artifacts.playtestReport.llmReport.tickSummary, issues: state.artifacts.playtestReport.llmReport.tickIssues } });
      state.lifecycle = state.artifacts.validationReport.pass ? 'playable' : 'debt';
      state.run.state = state.lifecycle;
      writeJson(path.join(state.runDir, 'project-run.json'), { run: state.run, lifecycle: state.lifecycle, ownerRoute: state.ownerRoute, artifacts: state.artifacts, runtimeDir: state.runtimeDir });
    }, options)
  };
}

async function invoke(initialState, options) {
  var langGraph = await langGraphRuntime.loadLangGraphPackage();
  var State = langGraph.Annotation.Root({ state: langGraph.Annotation({ reducer: function(_left, right) { return right; }, default: function() { return null; } }) });
  var graph = new langGraph.StateGraph(State);
  var handlers = makeHandlers(options);
  PROJECT_WEAVE_NODE_SEQUENCE.forEach(function(nodeName) { graph.addNode(nodeName, async function(wire) { return { state: await handlers[nodeName](wire.state) }; }); });
  graph.addEdge(langGraph.START, PROJECT_WEAVE_NODE_SEQUENCE[0]);
  PROJECT_WEAVE_NODE_SEQUENCE.slice(1).forEach(function(nodeName, index) { graph.addEdge(PROJECT_WEAVE_NODE_SEQUENCE[index], nodeName); });
  graph.addEdge(PROJECT_WEAVE_NODE_SEQUENCE[PROJECT_WEAVE_NODE_SEQUENCE.length - 1], langGraph.END);
  var result = await graph.compile().invoke({ state: initialState });
  return result.state;
}

function getProjectStore(options) { return options.projectStore || projectStoreModule.createProjectStore({ rootDir: options.workspaceRoot || path.join(__dirname, '..', '.gamecastle') }); }
function commitPlayableVersion(state, store) {
  if (state.lifecycle !== 'playable' || state.artifacts.projectVersion) return state;
  var version = store.saveVersion({ projectId: state.request.projectId, runId: state.run.runId, runDir: state.runDir, parentVersionId: state.previous && state.previous.projectVersion ? state.previous.projectVersion.versionId : undefined });
  state.artifacts.projectVersion = version;
  state.run.projectVersionId = version.versionId;
  saveCheckpoint(state);
  writeJson(path.join(state.runDir, 'project-run.json'), { run: state.run, lifecycle: state.lifecycle, ownerRoute: state.ownerRoute, artifacts: state.artifacts, runtimeDir: state.runtimeDir });
  return state;
}
async function start(request, options, forceMode) {
  options = options || {}; var normalized = normalizeRequest(Object.assign({}, request, forceMode ? { mode: forceMode } : {})); var store = getProjectStore(options); store.createProject({ projectId: normalized.projectId, name: normalized.projectName || normalized.projectId });
  var previous = options.previous || null;
  if (normalized.mode === 'continue' && !previous) previous = store.getContinueContext(normalized.projectId);
  if (previous && previous.semanticSession && !normalized.previousSemanticSession) normalized.previousSemanticSession = clone(previous.semanticSession);
  if (previous && previous.executionLedger && !normalized.previousExecutionReport) {
    var runs = previous.executionLedger.runs || [];
    normalized.previousExecutionReport = runs.length ? clone(runs[runs.length - 1]) : null;
  }
  var state = makeInitialState(normalized, Object.assign({}, options, { previous: previous || {} })); saveCheckpoint(state); state = await invoke(state, options); return options.commitPlayableVersion === false ? state : commitPlayableVersion(state, store);
}
async function create(request, options) { return start(request, options, 'create'); }
async function continueProject(request, options) { return start(request, options, 'continue'); }
async function resume(runId, options) { options = options || {}; var runDir = runDirectory(options.workspaceRoot || path.join(__dirname, '..', '.gamecastle'), options.projectId, runId); var state = readJson(path.join(runDir, 'checkpoint.json')); state = await invoke(state, options); return commitPlayableVersion(state, getProjectStore(options)); }
function cancel(runId, options) { options = options || {}; var runDir = runDirectory(options.workspaceRoot || path.join(__dirname, '..', '.gamecastle'), options.projectId, runId); var state = readJson(path.join(runDir, 'checkpoint.json')); state.lifecycle = 'archived'; state.run.state = 'archived'; saveCheckpoint(state); return { runId: state.run.runId, state: state.run.state }; }

module.exports = { PROJECT_WEAVE_NODE_SEQUENCE: PROJECT_WEAVE_NODE_SEQUENCE.slice(), create: create, continue: continueProject, resume: resume, cancel: cancel, makeInitialState: makeInitialState, defaultSemanticPort: defaultSemanticPort };
