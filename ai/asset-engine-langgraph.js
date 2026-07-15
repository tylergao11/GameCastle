var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var assetWorld = require('./asset-world');
var engineContract = require('../shared/asset-engine-contract.json');
var assetLibraryModule = require('./asset-library');
var publicationOutbox = require('./asset-publication-outbox');
var modelPolicyGate = require('./model-policy-gate');
var providerRuntimeAdapters = require('./provider-runtime-adapters');
var productionPlanner = require('./asset-production-planner');
var productionResolver = require('./asset-production-resolver');
var productionPipeline = require('./asset-production-pipeline');
var frameSet = require('./frame-set');

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function sha256(value) { return crypto.createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex'); }
function append(trace, stage) { return (trace || []).concat([stage]); }
function loadLangGraph() { return import('@langchain/langgraph'); }
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'AssetEngineLangGraph'; throw error; }

function describeGraph() {
  var stages = engineContract.graph || [], definitions = engineContract.stageDefinitions || {}, definitionStages = Object.keys(definitions);
  if (!stages.length || stages.some(function(stage) { return definitionStages.indexOf(stage) < 0; }) || definitionStages.some(function(stage) { return stages.indexOf(stage) < 0; })) fail('ASSET_ENGINE_STAGE_DEFINITION_MISMATCH', 'AssetEngine graph and stageDefinitions must declare the same stage ids.');
  return {
    contractId: engineContract.contractId,
    schemaVersion: engineContract.schemaVersion,
    stages: stages.map(function(stage) {
      var dependencies = definitions[stage];
      if (!Array.isArray(dependencies) || !dependencies.length) fail('ASSET_ENGINE_STAGE_DEFINITION_MISSING', 'AssetEngine stage has no dependency definition: ' + stage);
      return {
        stage: stage,
        dependencies: dependencies.map(function(definition) {
          if (!definition || typeof definition.module !== 'string' || !Array.isArray(definition.exports) || !definition.exports.length) fail('ASSET_ENGINE_STAGE_DEFINITION_INVALID', 'AssetEngine stage dependency is incomplete: ' + stage);
          var file = path.resolve(__dirname, '..', definition.module), loaded;
          try { loaded = require(file); } catch (error) { fail('ASSET_ENGINE_STAGE_MODULE_MISSING', stage + ' cannot load ' + definition.module + ': ' + error.message); }
          definition.exports.forEach(function(name) { if (typeof loaded[name] !== 'function') fail('ASSET_ENGINE_STAGE_EXPORT_MISSING', stage + ' requires ' + definition.module + '#' + name); });
          return { module: definition.module, exports: definition.exports.slice() };
        })
      };
    })
  };
}

function assertLangGraphRuntime(lg) {
  if (!lg || !lg.Annotation || !lg.Annotation.Root || !lg.StateGraph || lg.START === undefined || lg.END === undefined) fail('ASSET_ENGINE_LANGGRAPH_RUNTIME_INVALID', 'Official @langchain/langgraph must expose Annotation.Root, StateGraph, START, and END.');
}

function compileSpecs(assetRequirementContract) {
  if (!assetRequirementContract || assetRequirementContract.documentKind !== 'semantic-asset-requirements' || !assetRequirementContract.sourceHash || !Array.isArray(assetRequirementContract.requirements)) throw new Error('AssetEngine requires SemanticAssetRequirements from GameSemanticSource.');
  return assetRequirementContract.requirements.map(function(requirement) {
    if (!requirement || !requirement.semanticId || !requirement.subject || !requirement.description || !requirement.productionFamily || !requirement.recipeId || !requirement.styleId) throw new Error('SemanticAssetRequirements contains an incomplete requirement.');
    return { semanticId: requirement.semanticId, slotId: requirement.semanticId, subject: requirement.subject, description: requirement.description, productionFamily: requirement.productionFamily, recipeId: requirement.recipeId, artifactKind: requirement.artifactKind, resourceKind: requirement.resourceKind || engineContract.defaults.imageResource.resourceKind, acceptedFormats: clone(requirement.acceptedFormats || engineContract.defaults.imageResource.acceptedFormats), gdjsAssetAdapterId: requirement.gdjsAssetAdapterId || null, semanticTags: (requirement.roles || []).slice(), gdjsBindings: (requirement.gdjsBindings || []).slice(), styleTags: [requirement.styleId], styleId: requirement.styleId, constraints: Object.assign({}, requirement.constraints || {}), animation: clone(requirement.animation || null) };
  });
}

function libraryRequirementForWorkItem(workItem) {
  var spec = workItem && workItem.assetSpec || {};
  return {
    semanticId: workItem.semanticId,
    description: spec.description,
    semanticTags: (spec.semanticTags || []).slice(),
    productionFamily: workItem.productionFamily,
    recipeId: workItem.recipeId,
    styleId: spec.styleId,
    constraints: clone(spec.constraints || {}),
    animation: clone(spec.animation || null),
    resourceKind: spec.resourceKind,
    acceptedFormats: clone(spec.acceptedFormats || []),
    gdjsAssetAdapterId: spec.gdjsAssetAdapterId || null
  };
}

function archiveLocalInputs(localInputs) {
  return Object.keys(localInputs || {}).sort().map(function(slotId) {
    var input = localInputs[slotId] || {};
    var contentHash = input.contentHash || null;
    if (!contentHash && input.path && fs.existsSync(input.path)) contentHash = sha256(fs.readFileSync(input.path));
    return { slotId: slotId, path: input.path || null, contentHash: contentHash, scope: input.scope || 'private-local', source: input.source || 'user-input' };
  });
}

function bindingManifest(sourceHash, bindings, productionReceipt) {
  bindings = (bindings || []).map(function(binding) { return clone(binding); });
  return { schemaVersion: 2, sourceHash: sourceHash, targetRuntime: 'gdevelop', productionSetId: productionReceipt.productionSetId, productionSetDecision: productionReceipt.decision, bindings: bindings, manifestHash: sha256([productionReceipt.productionSetId, sourceHash, bindings]) };
}

function debtRecords(productionResult, resolutionDebts) {
  return (resolutionDebts || []).concat(productionResult.debts || []).map(function(debt, index) { return { debtId: 'debt.' + sha256([index, debt]).slice(0, 16), slotId: debt.slotId || null, code: debt.code || 'ASSET_PRODUCTION_FAILED', owner: debt.owner || 'AssetDebtManager', blocksExport: true, recoveryStage: debt.recoveryPhase || 'asset-production' }; });
}
function productionProjection(runId, sourceHash, productionResult) {
  var accepted = productionResult.workItems.filter(function(item) { return item.accepted; });
  var assets = accepted.map(function(item) { return frameSet.isFrameSet(item.candidate) ? { slotId: item.workItem.slotId, targetVisualSlotId: item.workItem.targetVisualSlotId, assetId: item.currentRevision.revisionId, revisionId: item.currentRevision.revisionId, frameSet: item.candidate, source: item.candidate.source } : Object.assign({}, item.candidate, { slotId: item.workItem.slotId, revisionId: item.currentRevision.revisionId, targetVisualSlotId: item.workItem.targetVisualSlotId, resourceKind: item.workItem.assetSpec.resourceKind || 'image' }); });
  var manifest = { meta: { schemaVersion: 2, contractId: runId + ':asset-manifest', createdAt: new Date().toISOString(), owner: 'AssetEngine', status: productionResult.pass ? 'ready' : 'partial' }, sourceHash: sourceHash, runId: runId, productionSetId: productionResult.plan.productionSetId, assets: assets, summary: { resolved: assets.length, generated: assets.filter(function(asset) { return asset.status === 'generated' || asset.status === 'variant'; }).length, reused: assets.filter(function(asset) { return asset.status === 'reused'; }).length, placeholders: 0, failed: productionResult.workItems.length - accepted.length, cacheHit: false, publishable: productionResult.pass } };
  var bindings = productionResult.pass ? accepted.map(function(item) { var candidate = item.candidate; return frameSet.isFrameSet(candidate) ? { slotId: item.workItem.slotId, targetVisualSlotId: item.workItem.targetVisualSlotId, assetRevisionId: item.currentRevision.revisionId, bindingMode: 'frame-set', required: true, preserve: (item.workItem.assetSpec.preserve || []).slice(), status: 'accepted', asset: { revisionId: candidate.revisionId, contentHash: candidate.contentHash, source: candidate.source } } : { slotId: item.workItem.slotId, targetVisualSlotId: item.workItem.targetVisualSlotId, assetRevisionId: item.currentRevision.revisionId, bindingMode: 'object-resource', required: true, preserve: (item.workItem.assetSpec.preserve || []).slice(), status: 'accepted', asset: { assetId: candidate.assetId, revisionId: item.currentRevision.revisionId, path: candidate.path, format: candidate.format, width: candidate.width, height: candidate.height, transparent: candidate.transparent, source: candidate.source, sha256: candidate.sha256 } }; }) : [];
  return { assetManifest: manifest, bindings: bindings };
}

async function runAssetEngine(input) {
  input = input || {};
  if (!input.runId) throw new Error('Asset engine requires runId');
  if (!input.assetRequirementContract || input.assetRequirementContract.documentKind !== 'semantic-asset-requirements' || !input.assetRequirementContract.sourceHash) throw new Error('AssetEngine requires SemanticAssetRequirements.sourceHash.');
  var assetLibrary = input.assetLibraryPort ? assetLibraryModule.create(input.assetLibraryPort) : null;
  var lg = await loadLangGraph();
  assertLangGraphRuntime(lg);
  var graphDefinition = describeGraph();
  var A = lg.Annotation.Root({ state: lg.Annotation({ reducer: function(_left, right) { return right; }, default: function() { return null; } }) });
  var initial = {
    runId: input.runId,
    sourceHash: input.assetRequirementContract.sourceHash,
    projectId: input.projectId || input.runId,
    assetRequirementContract: clone(input.assetRequirementContract || null),
    localInputs: clone(input.localInputs || {}),
    localAssets: input.localAssets || {},
    frameSets: input.frameSets || {},
    previousAssetWorld: clone(input.previousAssetWorld || null),
    sources: input.sources || {},
    assetLibrary: assetLibrary,
    libraryMatches: {},
    assetLibraryAccelerationEvents: [],
    ports: input.ports || {},
    providerRuntime: input.providerRuntime || null,
    providerOptions: input.providerOptions || {},
    modelPolicy: input.modelPolicy || {},
    productionRequest: null,
    projectAssetDir: input.projectAssetDir || null,
    revisionInputs: {},
    ledger: input.ledger || {},
    ledgerPath: input.ledgerPath || null,
    maxAttempts: input.maxAttempts,
    maxCost: input.maxCost,
    assetLibraryPublication: clone(input.assetLibraryPublication || {}),
    assetPublicationOutboxPath: input.assetPublicationOutboxPath || null,
    trace: []
  };
  function node(stage, work) { return async function(wire) { var state = Object.assign({}, wire.state); await work(state); state.trace = append(state.trace, stage); return { state: state }; }; }
  var handlers = {
    'asset-intake': function(state) { state.assetSpecs = compileSpecs(state.assetRequirementContract); state.productionRequest = { requestId: state.runId + ':asset-production', projectId: state.projectId, sourceHash: state.sourceHash, requirements: clone(state.assetSpecs) }; },
    'local-input-archive': function(state) { state.localInputRecords = archiveLocalInputs(state.localInputs); },
    'asset-library-search': async function(state) {
      for (var index = 0; index < state.assetSpecs.length; index++) {
        var spec = state.assetSpecs[index];
        if (!state.assetLibrary) { state.assetLibraryAccelerationEvents.push({ slotId: spec.slotId, outcome: 'unconfigured' }); continue; }
        try {
          var record = await state.assetLibrary.lookup(spec);
          state.libraryMatches[spec.slotId] = record;
          state.assetLibraryAccelerationEvents.push({ slotId: spec.slotId, outcome: record ? 'hit' : 'miss', recordId: record && record.recordId || null });
        } catch (error) {
          state.assetLibraryAccelerationEvents.push({ slotId: spec.slotId, outcome: 'unavailable', code: error.code || 'ASSET_LIBRARY_LOOKUP_FAILED', owner: error.owner || 'AssetLibrary', message: error.message });
        }
      }
    },
    'model-authorize': function(state) { var candidatePorts = state.providerRuntime ? providerRuntimeAdapters.createAssetProviderPorts(state.providerRuntime, state.providerOptions) : state.ports; var authorized = modelPolicyGate.authorizeModelPorts(candidatePorts, state.modelPolicy); state.authorizedPorts = authorized.ports; state.modelPolicyReceipt = authorized.receipt; var requestedMaxCost = state.maxCost === undefined ? Infinity : Number(state.maxCost); state.maxCost = Math.min(requestedMaxCost, authorized.receipt.maxCost); if (state.maxCost <= 0) { delete state.authorizedPorts.generateMaster; state.modelPolicyReceipt = Object.assign({}, state.modelPolicyReceipt, { allowed: false, code: 'MODEL_BUDGET_EXHAUSTED' }); } },
    'asset-production-plan': function(state) {
      state.productionPlan = productionPlanner.compile({ request: state.productionRequest });
    },
    'asset-resolve': async function(state) { state.resolution = await productionResolver.resolveProductionSet({ runId: state.runId, projectId: state.projectId, sourceHash: state.sourceHash, plan: state.productionPlan, localInputs: state.localInputs, localAssets: state.localAssets, frameSets: state.frameSets, sources: state.sources, assetLibrary: state.assetLibrary, libraryMatches: state.libraryMatches, ports: state.authorizedPorts, projectAssetDir: state.projectAssetDir }); },
    'asset-production': async function(state) {
      state.assetProduction = await productionPipeline.runProductionSet({ runId: state.runId, projectId: state.projectId, plan: state.productionPlan, candidates: state.resolution.candidates, ports: state.authorizedPorts, projectAssetDir: state.projectAssetDir, ledgerPath: state.ledgerPath });
    },
    'asset-finalize': function(state) {
      var projection = productionProjection(state.runId, state.sourceHash, state.assetProduction);
      state.assetManifest = projection.assetManifest;
      state.runtimeBindingManifest = bindingManifest(state.sourceHash, projection.bindings, state.assetProduction.acceptanceReceipt);
      state.assetWorld = assetWorld.buildAssetWorld(state.assetManifest, state.previousAssetWorld || null);
      state.debts = debtRecords(state.assetProduction, state.resolution.debts);
      state.accepted = state.assetProduction.pass && state.debts.length === 0;
      state.assetLibraryAccelerationReport = { configured: !!state.assetLibrary, events: state.assetLibraryAccelerationEvents.concat(state.resolution.libraryFailures || []) };
      state.assetProductionReport = { pass: state.accepted, productionSetAcceptanceReceipt: state.assetProduction.acceptanceReceipt, workItemReports: state.assetProduction.workItems.map(function(item) { return { workItemPlanId: item.workItem.workItemPlanId, targetVisualSlotId: item.workItem.targetVisualSlotId, loopState: item.loopState, acceptanceReceipt: item.acceptanceReceipt || null, debt: item.debt || null }; }) };
    },
    'asset-publication-enqueue': function(state) {
      state.assetPublicationOutboxEntries = [];
      if (!state.accepted) return;
      var newItems = state.assetProduction.workItems.filter(function(item) { return item.accepted && item.candidate.source !== 'assetLibrary'; });
      if (!newItems.length) return;
      var outbox = publicationOutbox.create({ path: state.assetPublicationOutboxPath, projectAssetDir: state.projectAssetDir });
      for (var index = 0; index < newItems.length; index++) {
        var item = newItems[index], revision = frameSet.isFrameSet(item.candidate) ? item.candidate : Object.assign({}, item.candidate, { revisionId: item.currentRevision.revisionId, path: item.currentRevision.path, sha256: item.currentRevision.sha256, resourceKind: item.currentRevision.resourceKind || item.candidate.resourceKind, format: item.currentRevision.format || item.candidate.format, status: 'accepted' });
        var requirement = libraryRequirementForWorkItem(item.workItem);
        state.assetPublicationOutboxEntries.push(outbox.enqueue({ requirementFingerprint: assetLibraryModule.requirementFingerprint(requirement), requirement: requirement, revision: revision, provenance: { projectId: state.projectId, sourceHash: state.sourceHash, productionSetId: state.assetProduction.plan.productionSetId, acceptanceReceipt: item.acceptanceReceipt, publication: state.assetLibraryPublication } }));
      }
      state.assetPublicationOutbox = { path: outbox.path, pending: outbox.pending().length };
    }
  };
  var stages = graphDefinition.stages.map(function(definition) { return definition.stage; });
  if (!stages.length || stages.some(function(stage) { return typeof handlers[stage] !== 'function'; }) || Object.keys(handlers).some(function(stage) { return stages.indexOf(stage) < 0; })) throw new Error('AssetEngine stage handlers must exactly match shared/asset-engine-contract.json.');
  var graph = new lg.StateGraph(A);
  stages.forEach(function(stage) { graph.addNode(stage, node(stage, handlers[stage])); });
  graph.addEdge(lg.START, stages[0]);
  for (var stageIndex = 0; stageIndex + 1 < stages.length; stageIndex++) graph.addEdge(stages[stageIndex], stages[stageIndex + 1]);
  graph.addEdge(stages[stages.length - 1], lg.END);
  var output = await graph.compile().invoke({ state: initial });
  return output.state;
}

module.exports = { runAssetEngine: runAssetEngine, describeGraph: describeGraph, assertLangGraphRuntime: assertLangGraphRuntime, compileSpecs: compileSpecs, libraryRequirementForWorkItem: libraryRequirementForWorkItem, archiveLocalInputs: archiveLocalInputs, bindingManifest: bindingManifest, productionProjection: productionProjection };
