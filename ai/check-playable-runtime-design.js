var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..');
var contract = JSON.parse(fs.readFileSync(path.join(root, 'shared', 'playable-runtime-contract.json'), 'utf8'));
var production = JSON.parse(fs.readFileSync(path.join(root, 'shared', 'asset-production-pipeline-contract.json'), 'utf8'));
var completion = JSON.parse(fs.readFileSync(path.join(root, 'shared', 'project-completion-contract.json'), 'utf8'));

assert.strictEqual(contract.contractId, 'gamecastle.playable-runtime');
assert.strictEqual(contract.status, 'designed', 'runtime contract stays designed until Terra evidence is complete');
Object.keys(contract.truthSources).forEach(function(key) {
  assert(fs.existsSync(path.join(root, contract.truthSources[key])), 'missing playable runtime truth source: ' + key);
});
assert.strictEqual(production.contractId, 'gamecastle.asset-production-pipeline');
assert.strictEqual(production.status, 'designed', 'asset production contract stays designed until Terra evidence is complete');
Object.keys(production.truthSources).forEach(function(key) {
  assert(fs.existsSync(path.join(root, production.truthSources[key])), 'missing asset production truth source: ' + key);
});
['productionSetId', 'templateId', 'templateVersion', 'styleId', 'workItems', 'dependencyGraph', 'coveragePolicy', 'contentHash'].forEach(function(field) {
  assert(production.artifacts.AssetProductionSetPlan.required.indexOf(field) >= 0, 'production set plan missing ' + field);
});
['workItemPlanId', 'slotId', 'targetVisualSlotId', 'productionFamily', 'recipeId', 'assetSpec', 'stageSequence', 'stylePromptRef', 'retryBudget'].forEach(function(field) {
  assert(production.artifacts.AssetWorkItemPlan.required.indexOf(field) >= 0, 'work item plan missing ' + field);
});
['currentRevisionId', 'phase', 'attempt', 'budgets', 'observationReceiptIds', 'pendingAction', 'historyHash'].forEach(function(field) {
  assert(production.artifacts.AssetProductionLoopState.required.indexOf(field) >= 0, 'loop state missing ' + field);
});
assert(production.closedLoop.invariants.indexOf('every pixel-changing output invalidates prior visual and deterministic acceptance evidence') >= 0);
assert(production.playableVersionGate.forbidden.indexOf('partially generated game presented as playable') >= 0);
assert(production.forbidden.indexOf('mixed character platform prop background or UI roles generated as one parent sheet') >= 0);
assert.strictEqual(contract.tickPolicyContract.profiles['local-interactive'].simulationHz, 60);
assert(contract.tickPolicyContract.globalMinimums.realtimeNetworkHz >= 30);
assert(contract.tickPolicyContract.globalMinimums.interactiveSimulationHz >= 30);
assert(contract.tickPolicyContract.forbidden.indexOf('20 Hz interactive default') >= 0);
assert(contract.assetBindingContract.forbidden.indexOf('generic asset overlay injector') >= 0);
assert.strictEqual(contract.assetBindingContract.slotIdentity.indexOf('targetVisualSlotId') >= 0, true);
assert(contract.viewportContract.requiredViewportMatrix.length >= 6);
assert(contract.viewportContract.invariants.indexOf('controls never anchor to document.body') >= 0);
['viewportMatrixReport', 'assetProductionReport', 'assetBindingReport', 'tickPerformanceReport', 'tickReplayReceipt', 'browserPlaytestReport'].forEach(function(field) {
  assert(contract.artifacts.PlayableRuntimeEvidence.required.indexOf(field) >= 0, 'aggregate evidence missing ' + field);
});
['PRT-1', 'PRT-2', 'PRT-3', 'PRT-4', 'PRT-5', 'PRT-6'].forEach(function(id) {
  assert(contract.terraImplementationOrder.some(function(step) { return step.indexOf(id) === 0; }), 'Terra order missing ' + id);
});
assert.strictEqual(completion.truthSources.playableRuntime, 'shared/playable-runtime-contract.json');
[
  'no-playable-release-without-playable-runtime-evidence',
  'no-local-interactive-runtime-below-60hz',
  'no-realtime-runtime-or-network-cadence-below-30hz',
  'no-required-generated-asset-without-real-target-binding',
  'no-required-asset-production-set-without-complete-work-item-acceptance-and-binding',
  'no-runtime-control-outside-canvas-safe-viewport'
].forEach(function(gate) {
  assert(completion.hardGates.indexOf(gate) >= 0, 'project completion hard gate missing ' + gate);
});

console.log('[PlayableRuntimeDesign] asset production loop, complete-before-playable gate, viewport, binding, tick policy, migration and aggregate gates passed');
