var crypto = require('crypto');
var fs = require('fs');
var assetWorld = require('./asset-world');
var modelPolicyGate = require('./model-policy-gate');
var styleDictionary = require('./asset-style-dictionary');
var providerRuntimeAdapters = require('./provider-runtime-adapters');
var productionPlanner = require('./asset-production-planner');
var productionResolver = require('./asset-production-resolver');
var productionLoop = require('./asset-production-loop-graph');

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function sha256(value) { return crypto.createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex'); }
function append(trace, stage) { return (trace || []).concat([stage]); }
function loadLangGraph() { return import('@langchain/langgraph'); }

function compileSpecs(buildContract) {
  var slots = ((buildContract || {}).assetContract || buildContract || {}).slots || [];
  return slots.map(function(slot) {
    if (!slot || !slot.slotId) throw new Error('BuildContract.assetSlots requires slotId');
    if (slot.bindingTarget !== undefined) throw new Error('AssetSpec.bindingTarget is stale input; use targetVisualSlotId.');
    if (!slot.targetVisualSlotId) throw new Error('AssetSpec requires targetVisualSlotId.');
    return Object.assign({}, slot, {
      kind: slot.kind || 'sprite',
      semanticTags: (slot.semanticTags || []).slice(),
      styleTags: (slot.styleTags || [styleDictionary.dictionary.defaultStyleId]).slice(),
      styleId: slot.styleId || styleDictionary.dictionary.defaultStyleId,
      constraints: Object.assign({}, slot.constraints || {}),
      targetVisualSlotId: slot.targetVisualSlotId || null
    });
  });
}

function archiveLocalInputs(localInputs) {
  return Object.keys(localInputs || {}).sort().map(function(slotId) {
    var input = localInputs[slotId] || {};
    var contentHash = input.contentHash || null;
    if (!contentHash && input.path && fs.existsSync(input.path)) contentHash = sha256(fs.readFileSync(input.path));
    return { slotId: slotId, path: input.path || null, contentHash: contentHash, scope: input.scope || 'private-local', source: input.source || 'user-input' };
  });
}

function bindingManifest(runId, bindings, productionReceipt) {
  bindings = (bindings || []).map(function(binding) { return clone(binding); });
  return { schemaVersion: 1, buildContractId: runId, targetRuntime: 'gdevelop', productionSetId: productionReceipt.productionSetId, productionSetDecision: productionReceipt.decision, bindings: bindings, manifestHash: sha256([productionReceipt.productionSetId, bindings]) };
}

function debtRecords(productionResult, resolutionDebts) {
  return (resolutionDebts || []).concat(productionResult.debts || []).map(function(debt, index) { return { debtId: 'debt.' + sha256([index, debt]).slice(0, 16), slotId: debt.slotId || null, code: debt.code || 'ASSET_PRODUCTION_FAILED', owner: debt.owner || 'AssetDebtManager', blocksExport: true, recoveryStage: debt.recoveryPhase || 'asset-production-loop' }; });
}
function productionProjection(runId, productionResult) {
  var accepted = productionResult.workItems.filter(function(item) { return item.accepted; });
  var assets = accepted.map(function(item) { return Object.assign({}, item.candidate, { slotId: item.workItem.slotId, revisionId: item.currentRevision.revisionId, targetVisualSlotId: item.workItem.targetVisualSlotId }); });
  var manifest = { meta: { schemaVersion: 1, contractId: runId + ':asset-manifest', createdAt: new Date().toISOString(), owner: 'AssetEngine', status: productionResult.pass ? 'ready' : 'partial' }, buildContractId: runId, productionSetId: productionResult.plan.productionSetId, assets: assets, summary: { resolved: assets.length, generated: assets.filter(function(asset) { return asset.status === 'generated' || asset.status === 'variant'; }).length, reused: assets.filter(function(asset) { return asset.status === 'reused'; }).length, placeholders: 0, failed: productionResult.workItems.length - accepted.length, cacheHit: false, publishable: productionResult.pass } };
  var bindings = productionResult.pass ? accepted.map(function(item) { var candidate = item.candidate; return { slotId: item.workItem.slotId, targetVisualSlotId: item.workItem.targetVisualSlotId, assetRevisionId: item.currentRevision.revisionId, bindingMode: 'object-resource', required: true, preserve: (item.workItem.assetSpec.preserve || []).slice(), status: 'accepted', asset: { assetId: candidate.assetId, revisionId: item.currentRevision.revisionId, path: candidate.path, format: candidate.format, width: candidate.width, height: candidate.height, transparent: candidate.transparent, source: candidate.source, sha256: candidate.sha256 } }; }) : [];
  return { assetManifest: manifest, bindings: bindings };
}

async function runAssetEngine(input) {
  input = input || {};
  if (!input.runId) throw new Error('Asset engine requires runId');
  var lg = await loadLangGraph();
  var A = lg.Annotation.Root({ state: lg.Annotation({ reducer: function(_left, right) { return right; }, default: function() { return null; } }) });
  var initial = {
    runId: input.runId,
    projectId: input.projectId || input.runId,
    buildContract: clone(input.buildContract || {}),
    localInputs: clone(input.localInputs || {}),
    localAssets: input.localAssets || {},
    sources: input.sources || {},
    cloudAssetEngine: input.cloudAssetEngine || null,
    visualIntents: input.visualIntents || {},
    ports: input.ports || {},
    providerRuntime: input.providerRuntime || null,
    providerOptions: input.providerOptions || {},
    modelPolicy: input.modelPolicy || {},
    productionRequest: clone(input.productionRequest || (((input.buildContract || {}).assetContract || {}).productionRequest) || null),
    projectAssetDir: input.projectAssetDir || null,
    revisionInputs: {},
    ledger: input.ledger || {},
    ledgerPath: input.ledgerPath || null,
    maxAttempts: input.maxAttempts,
    maxCost: input.maxCost,
    promotionMode: input.promotionMode || 'none',
    shareConsent: input.shareConsent === true,
    assetPersistenceBridge: input.assetPersistenceBridge || null,
    assetFamilyIds: input.assetFamilyIds || {},
    persistAcceptedGeneratedAssets: input.persistAcceptedGeneratedAssets === true,
    persistenceMode: input.persistenceMode || 'none',
    trace: []
  };
  function node(stage, work) { return async function(wire) { var state = Object.assign({}, wire.state); await work(state); state.trace = append(state.trace, stage); return { state: state }; }; }
  var graph = new lg.StateGraph(A)
    .addNode('asset-intake', node('asset-intake', function(state) { state.assetSpecs = compileSpecs(state.buildContract); }))
    .addNode('local-input-archive', node('local-input-archive', function(state) { state.localInputRecords = archiveLocalInputs(state.localInputs); }))
    .addNode('model-authorize', node('model-authorize', function(state) { var providerOptions = Object.assign({}, state.providerOptions, { resolveAssetInput: async function(query) { var record = state.revisionInputs[query.reference.refId]; if (!record || record.projectId !== query.projectId || !record.path || !fs.existsSync(record.path)) { var error = new Error('Asset production revision input is unavailable.'); error.code = 'ASSET_PRODUCTION_REVISION_INPUT_UNAVAILABLE'; throw error; } var bytes = fs.readFileSync(record.path); return { bytes: bytes, sha256: record.sha256, scope: record.scope, projectId: record.projectId, revisionId: record.revisionId, consent: true }; } }); var candidatePorts = state.providerRuntime ? providerRuntimeAdapters.createAssetProviderPorts(state.providerRuntime, providerOptions) : state.ports; var authorized = modelPolicyGate.authorizeModelPorts(candidatePorts, state.modelPolicy); state.authorizedPorts = authorized.ports; state.modelPolicyReceipt = authorized.receipt; var requestedMaxCost = state.maxCost === undefined ? Infinity : Number(state.maxCost); state.maxCost = Math.min(requestedMaxCost, authorized.receipt.maxCost); if (state.maxCost <= 0) { ['generate', 'edit', 'review', 'segment', 'colorize', 'variant'].forEach(function(name) { delete state.authorizedPorts[name]; }); state.modelPolicyReceipt = Object.assign({}, state.modelPolicyReceipt, { allowed: false, code: 'MODEL_BUDGET_EXHAUSTED' }); } }))
    .addNode('asset-production-plan', node('asset-production-plan', function(state) {
      if (!state.productionRequest) { var error = new Error('AssetEngine requires AssetProductionRequest; legacy slot-only execution is forbidden.'); error.code = 'ASSET_PRODUCTION_REQUEST_REQUIRED'; error.owner = 'AssetProductionPlanner'; throw error; }
      state.productionPlan = productionPlanner.compile({ request: state.productionRequest, assetSlots: state.assetSpecs, retryBudget: { generation: state.maxAttempts || 2, repair: state.maxAttempts || 2, segmentation: 1, color: 1, normalization: 1 } });
    }))
    .addNode('asset-resolve', node('asset-resolve', async function(state) {
      state.resolution = await productionResolver.resolveProductionSet({ runId: state.runId, projectId: state.projectId, plan: state.productionPlan, localInputs: state.localInputs, localAssets: state.localAssets, sources: state.sources, cloudAssetEngine: state.cloudAssetEngine, ports: state.authorizedPorts, projectAssetDir: state.projectAssetDir });
    }))
    .addNode('asset-production-loop', node('asset-production-loop', async function(state) {
      state.assetProduction = await productionLoop.runProductionSet({ runId: state.runId, projectId: state.projectId, plan: state.productionPlan, candidates: state.resolution.candidates, sources: state.sources, ports: state.authorizedPorts, revisionInputs: state.revisionInputs, projectAssetDir: state.projectAssetDir, ledgerPath: state.ledgerPath });
    }))
    .addNode('asset-finalize', node('asset-finalize', function(state) {
      var projection = productionProjection(state.runId, state.assetProduction);
      state.assetManifest = projection.assetManifest;
      state.runtimeBindingManifest = bindingManifest(state.runId, projection.bindings, state.assetProduction.acceptanceReceipt);
      state.assetWorld = assetWorld.buildAssetWorld(state.assetManifest, state.previousAssetWorld || null);
      state.debts = debtRecords(state.assetProduction, state.resolution.debts);
      state.accepted = state.assetProduction.pass && state.debts.length === 0;
      state.assetProductionReport = { pass: state.accepted, productionSetAcceptanceReceipt: state.assetProduction.acceptanceReceipt, workItemReports: state.assetProduction.workItems.map(function(item) { return { workItemPlanId: item.workItem.workItemPlanId, targetVisualSlotId: item.workItem.targetVisualSlotId, loopState: item.loopState, acceptanceReceipt: item.acceptanceReceipt || null, debt: item.debt || null }; }) };
    }))
    .addNode('cloud-promotion', node('cloud-promotion', async function(state) {
      var queue = [];
      queue = queue.map(function(entry) { var binding = (state.runtimeBindingManifest.bindings || []).find(function(item) { return item.slotId === entry.slotId; }) || null; return Object.assign({}, entry, { shareConsent: state.shareConsent === true, runtimeBindingReceipt: binding ? Object.assign({}, binding, { status: 'bound', boundAssetStatus: binding.status }) : null }); });
      state.cloudPromotion = { mode: state.promotionMode, queue: clone(queue), entries: [] };
      if (state.promotionMode !== 'none' && queue.length) {
        if (!state.cloudAssetEngine) throw new Error('Cloud promotion was requested without CloudAssetEngine');
        state.cloudPromotion.entries = state.cloudAssetEngine.enqueuePromotion({ cloudPromotionQueue: queue });
        if (state.promotionMode === 'sync') state.cloudPromotion.entries = state.cloudAssetEngine.sync();
      }
      if (state.persistAcceptedGeneratedAssets) {
        if (state.persistenceMode !== 'verification-staging') throw new Error('Accepted generated asset persistence requires persistenceMode=verification-staging; use CloudPromotion for shared publication');
        if (!state.assetPersistenceBridge || typeof state.assetPersistenceBridge.persistAcceptedGeneratedAsset !== 'function') throw new Error('Accepted generated asset persistence was requested without AssetPersistenceBridge');
        state.cloudLibraryAssets = [];
        for (var i = 0; i < (state.assetProduction.workItems || []).length; i++) {
          var slotResult = state.assetProduction.workItems[i], candidate = slotResult.candidate;
          if (!slotResult.accepted || slotResult.debt || !candidate || candidate.privacyScope === 'private-local' || (candidate.status !== 'generated' && candidate.status !== 'variant')) continue;
          state.cloudLibraryAssets.push(await state.assetPersistenceBridge.persistAcceptedGeneratedAsset({ candidate: candidate, familyId: state.assetFamilyIds[slotResult.workItem.slotId] || 'asset-family.' + candidate.assetId, persistenceMode: state.persistenceMode }));
        }
      }
    }));
  graph.addEdge(lg.START, 'asset-intake').addEdge('asset-intake', 'local-input-archive').addEdge('local-input-archive', 'model-authorize').addEdge('model-authorize', 'asset-production-plan').addEdge('asset-production-plan', 'asset-resolve').addEdge('asset-resolve', 'asset-production-loop').addEdge('asset-production-loop', 'asset-finalize').addEdge('asset-finalize', 'cloud-promotion').addEdge('cloud-promotion', lg.END);
  var output = await graph.compile().invoke({ state: initial });
  return output.state;
}

module.exports = { runAssetEngine: runAssetEngine, compileSpecs: compileSpecs, archiveLocalInputs: archiveLocalInputs, bindingManifest: bindingManifest, productionProjection: productionProjection };
