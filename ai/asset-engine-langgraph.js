var crypto = require('crypto');
var fs = require('fs');
var assetWeave = require('./asset-weave-graph');
var assetWorld = require('./asset-world');
var modelPolicyGate = require('./model-policy-gate');
var styleDictionary = require('./asset-style-dictionary');

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function sha256(value) { return crypto.createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex'); }
function append(trace, stage) { return (trace || []).concat([stage]); }
function loadLangGraph() { return import('@langchain/langgraph'); }

function compileSpecs(buildContract) {
  var slots = ((buildContract || {}).assetContract || buildContract || {}).slots || [];
  return slots.map(function(slot) {
    if (!slot || !slot.slotId) throw new Error('BuildContract.assetSlots requires slotId');
    return Object.assign({}, slot, {
      kind: slot.kind || 'sprite',
      semanticTags: (slot.semanticTags || []).slice(),
      styleTags: (slot.styleTags || [styleDictionary.dictionary.defaultStyleId]).slice(),
      styleId: slot.styleId || styleDictionary.dictionary.defaultStyleId,
      constraints: Object.assign({}, slot.constraints || {}),
      bindingTarget: slot.bindingTarget || slot.slotId
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

function bindingManifest(runId, weaveResult) {
  var bindings = (weaveResult.assetBindings || []).map(function(binding) { return clone(binding); });
  return { schemaVersion: 1, buildContractId: runId, targetRuntime: 'gdevelop', bindings: bindings, manifestHash: sha256(bindings) };
}

function debtRecords(weaveResult) {
  return (weaveResult.slots || []).filter(function(slot) { return slot.candidate && slot.candidate.status === 'placeholder'; }).map(function(slot) {
    return { debtId: 'debt.' + sha256([slot.slot.slotId, slot.debt]).slice(0, 16), slotId: slot.slot.slotId, code: slot.debt || 'NO_CANDIDATE', owner: 'AssetDebtManager', blocksExport: true, recoveryStage: 'asset-resolve' };
  });
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
    modelPolicy: input.modelPolicy || {},
    projectAssetDir: input.projectAssetDir || null,
    ledger: input.ledger || {},
    ledgerPath: input.ledgerPath || null,
    maxAttempts: input.maxAttempts,
    maxCost: input.maxCost,
    promotionMode: input.promotionMode || 'none',
    shareConsent: input.shareConsent === true,
    trace: []
  };
  function node(stage, work) { return async function(wire) { var state = Object.assign({}, wire.state); await work(state); state.trace = append(state.trace, stage); return { state: state }; }; }
  var graph = new lg.StateGraph(A)
    .addNode('asset-intake', node('asset-intake', function(state) { state.assetSpecs = compileSpecs(state.buildContract); }))
    .addNode('local-input-archive', node('local-input-archive', function(state) { state.localInputRecords = archiveLocalInputs(state.localInputs); }))
    .addNode('model-authorize', node('model-authorize', function(state) { var authorized = modelPolicyGate.authorizeModelPorts(state.ports, state.modelPolicy); state.authorizedPorts = authorized.ports; state.modelPolicyReceipt = authorized.receipt; var requestedMaxCost = state.maxCost === undefined ? Infinity : Number(state.maxCost); state.maxCost = Math.min(requestedMaxCost, authorized.receipt.maxCost); }))
    .addNode('asset-resolve', node('asset-resolve', async function(state) {
      state.weaveResult = await assetWeave.runAssetWeave({
        runId: state.runId,
        projectId: state.projectId,
        buildContract: { assetContract: { slots: state.assetSpecs } },
        localAssets: state.localAssets,
        sources: state.sources,
        cloudAssetEngine: state.cloudAssetEngine,
        visualIntents: state.visualIntents,
        ports: state.authorizedPorts,
        modelPolicy: state.modelPolicyReceipt,
        projectAssetDir: state.projectAssetDir,
        ledger: state.ledger,
        ledgerPath: state.ledgerPath,
        maxAttempts: state.maxAttempts,
        maxCost: state.maxCost
      });
    }))
    .addNode('asset-finalize', node('asset-finalize', function(state) {
      state.assetManifest = state.weaveResult.assetManifest;
      state.runtimeBindingManifest = bindingManifest(state.runId, state.weaveResult);
      state.assetWorld = assetWorld.buildAssetWorld(state.assetManifest, state.previousAssetWorld || null);
      state.debts = debtRecords(state.weaveResult);
      state.accepted = state.debts.length === 0;
    }))
    .addNode('cloud-promotion', node('cloud-promotion', function(state) {
      var queue = state.weaveResult.cloudPromotionQueue || [];
      queue = queue.map(function(entry) { var binding = (state.runtimeBindingManifest.bindings || []).find(function(item) { return item.slotId === entry.slotId; }) || null; return Object.assign({}, entry, { shareConsent: state.shareConsent === true, runtimeBindingReceipt: binding ? Object.assign({}, binding, { status: 'bound', boundAssetStatus: binding.status }) : null }); });
      state.cloudPromotion = { mode: state.promotionMode, queue: clone(queue), entries: [] };
      if (state.promotionMode === 'none' || !queue.length) return;
      if (!state.cloudAssetEngine) throw new Error('Cloud promotion was requested without CloudAssetEngine');
      state.cloudPromotion.entries = state.cloudAssetEngine.enqueuePromotion({ cloudPromotionQueue: queue });
      if (state.promotionMode === 'sync') state.cloudPromotion.entries = state.cloudAssetEngine.sync();
    }));
  graph.addEdge(lg.START, 'asset-intake').addEdge('asset-intake', 'local-input-archive').addEdge('local-input-archive', 'model-authorize').addEdge('model-authorize', 'asset-resolve').addEdge('asset-resolve', 'asset-finalize').addEdge('asset-finalize', 'cloud-promotion').addEdge('cloud-promotion', lg.END);
  var output = await graph.compile().invoke({ state: initial });
  return output.state;
}

module.exports = { runAssetEngine: runAssetEngine, compileSpecs: compileSpecs, archiveLocalInputs: archiveLocalInputs, bindingManifest: bindingManifest };
