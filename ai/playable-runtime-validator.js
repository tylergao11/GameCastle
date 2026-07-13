var contract = require('../shared/playable-runtime-contract.json');

function fail(code, message, owner) { return { checkId: code, layer: 'playable-runtime', passed: false, ownerOnFailure: owner, message: message }; }
function passed(id, message) { return { checkId: id, layer: 'playable-runtime', passed: true, ownerOnFailure: null, message: message }; }
function hasPass(report) { return !!report && (report.pass === true || report.decision === 'pass') && report.simulated !== true; }
function hasAssetProductionPass(report) {
  var receipt = report && report.productionSetAcceptanceReceipt;
  var coverage = receipt && receipt.requiredSlotCoverage;
  return hasPass(report) && !!receipt && (receipt.decision === 'accepted' || receipt.decision === 'pass') && !!coverage && coverage.complete === true && Array.isArray(receipt.workItemAcceptanceReceiptIds) && receipt.workItemAcceptanceReceiptIds.length > 0;
}
function allTrue(value) { return !!value && Object.keys(value).length > 0 && Object.keys(value).every(function(key) { return value[key] === true; }); }
function hasBindingPass(report, productionReport) {
  if (!hasPass(report) || !productionReport || !productionReport.productionSetAcceptanceReceipt) return false;
  var acceptance = productionReport.productionSetAcceptanceReceipt, accepted = acceptance.acceptedRevisionByTargetVisualSlotId || {}, targets = Object.keys(accepted).sort(), receipts = report.receipts || [];
  if (report.productionSetId !== acceptance.productionSetId || receipts.length !== targets.length) return false;
  var receiptTargets = receipts.map(function(receipt) { return receipt.targetVisualSlotId; }).sort();
  if (JSON.stringify(receiptTargets) !== JSON.stringify(targets)) return false;
  return receipts.every(function(receipt) { return receipt.productionSetId === acceptance.productionSetId && receipt.assetRevisionId === accepted[receipt.targetVisualSlotId] && receipt.boundInstanceCount > 0 && allTrue(receipt.preservationChecks) && receipt.runtimeChecks && receipt.runtimeChecks.resourceInstalled === true && receipt.runtimeChecks.targetObjectIsSprite === true && receipt.runtimeChecks.detachedOverlay === false; });
}
function hasBrowserPass(report) { return hasPass(report) && typeof report.origin === 'string' && /^https?:\/\//.test(report.origin); }

function validate(evidence) {
  evidence = evidence || {};
  var reports = [
    ['viewportMatrixReport', 'viewport', 'RuntimeViewportCoordinator'],
    ['assetProductionReport', 'asset-production-loop', 'AssetEngine'],
    ['assetBindingReport', 'asset-target-binding', 'RuntimeAssetBinder'],
    ['tickPerformanceReport', 'tick-policy', 'TickPolicyResolver'],
    ['tickReplayReceipt', 'tick-replay-or-order', 'TickIntentRuntime'],
    ['browserPlaytestReport', 'aggregate-release', 'RuntimeValidator']
  ];
  var checks = reports.map(function(entry) { var ok = entry[0] === 'assetProductionReport' ? hasAssetProductionPass(evidence[entry[0]]) : entry[0] === 'assetBindingReport' ? hasBindingPass(evidence[entry[0]], evidence.assetProductionReport) : entry[0] === 'browserPlaytestReport' ? hasBrowserPass(evidence[entry[0]]) : hasPass(evidence[entry[0]]); return ok ? passed(entry[1], entry[0] + ' passed.') : fail(entry[1], entry[0] + ' is missing, incomplete, failed, incoherent, or simulated.', entry[2]); });
  var performance = evidence.tickPerformanceReport || {};
  if (hasPass(performance) && Number(performance.observedSimulationHz) < 60 && performance.profile === 'local-interactive') checks.push(fail('tick-local-cadence', 'Local interactive observed cadence is below 60 Hz.', 'TickPolicyResolver'));
  if (hasPass(performance) && performance.realtime === true && (Number(performance.observedSimulationHz) < 30 || Number(performance.observedNetworkHz) < 30)) checks.push(fail('tick-realtime-cadence', 'Realtime cadence is below 30 Hz.', 'TickPolicyResolver'));
  if (hasPass(evidence.tickReplayReceipt) && !evidence.tickReplayReceipt.finalStateHash) checks.push(fail('tick-replay-hash', 'Tick replay receipt lacks finalStateHash.', 'TickIntentRuntime'));
  var failed = checks.filter(function(check) { return !check.passed; });
  return { schemaVersion: 1, contractId: contract.contractId, owner: 'RuntimeValidator', required: contract.artifacts.PlayableRuntimeEvidence.required.slice(), checks: checks, pass: failed.length === 0, decision: failed.length ? 'blocked' : 'pass', ownerRoute: failed.length ? { owner: failed[0].ownerOnFailure, stage: failed[0].checkId } : null, blocksPublish: failed.length > 0 };
}

module.exports = { validate: validate };
