var intentSurfaceGuard = require('./intent-surface-guard');
var diagnosticRouter = require('./intent-diagnostic-router');
var rewriteContract = require('./intent-rewrite-contract');
var placementContract = require('./placement-resolution-contract');
var emissionContract = require('./gdjs-bridge-emission-contract');
var runtimeAdapterContract = require('./runtime-adapter-requirement-contract');

function assertRequiredResultCardFields(card, rules) {
  if (!card) throw new Error('Intent compile contract missing ResultCard');
  (rules.resultCard && rules.resultCard.requiredFields || []).forEach(function(field) {
    if (card[field] === undefined) throw new Error('ResultCard missing field: ' + field);
  });
  return true;
}

function assertInputSurface(card, rules) {
  (card.input || []).forEach(function(line) {
    intentSurfaceGuard.assertIntentSurfaceAllowed(line, { rules: rules });
  });
}

function collectDiagnostics(compiled) {
  return []
    .concat((compiled.graph && compiled.graph.diagnostics) || [])
    .concat((compiled.placementPlan && compiled.placementPlan.diagnostics) || [])
    .concat((compiled.bridgePlan && compiled.bridgePlan.diagnostics) || [])
    .concat((compiled.resultCard && compiled.resultCard.diagnostics) || []);
}

function assertCompiledIntent(compiled, options) {
  options = options || {};
  var rules = options.rules || intentSurfaceGuard.loadRules();
  if (!compiled || compiled.schemaVersion !== 1) throw new Error('Intent compile contract requires schemaVersion=1');
  if (!compiled.graph || compiled.graph.schemaVersion !== 1) throw new Error('Intent compile contract missing graph schema');
  if (!compiled.placementPlan || compiled.placementPlan.schemaVersion !== 1) throw new Error('Intent compile contract missing placement plan schema');
  if (!compiled.bridgePlan || compiled.bridgePlan.schemaVersion !== 1) throw new Error('Intent compile contract missing bridge plan schema');
  assertRequiredResultCardFields(compiled.resultCard, rules);
  assertInputSurface(compiled.resultCard, rules);
  diagnosticRouter.assertAllRouted(collectDiagnostics(compiled));
  rewriteContract.assertResultCardRewrites(compiled.resultCard, { rules: rules });
  placementContract.assertPlan(compiled.placementPlan);
  emissionContract.assertPlan(compiled.bridgePlan);
  runtimeAdapterContract.assertRequirements(compiled.bridgePlan.runtimeAdapterRequirements);
  if (!compiled.bridgePlan.contracts || compiled.bridgePlan.contracts.emission !== 'passed') {
    throw new Error('Intent compile contract requires bridge emission contract status');
  }
  if (!compiled.bridgePlan.contracts || compiled.bridgePlan.contracts.runtimeAdapters !== 'passed') {
    throw new Error('Intent compile contract requires runtime adapter contract status');
  }
  return makeContractSummary(compiled);
}

function makeContractSummary(compiled) {
  return {
    schemaVersion: 1,
    intentCompile: 'passed',
    resultCard: 'passed',
    diagnostics: 'passed',
    rewrites: 'passed',
    placement: 'passed',
    bridgeEmission: 'passed',
    runtimeAdapters: 'passed',
    graph: {
      things: (compiled.graph.things || []).length,
      components: (compiled.graph.components || []).length,
      relations: (compiled.graph.relations || []).length,
      placements: (compiled.graph.placements || []).length,
      bindings: (compiled.graph.bindings || []).length,
      diagnostics: (compiled.graph.diagnostics || []).length
    },
    placementPlan: {
      placements: (compiled.placementPlan.placements || []).length,
      diagnostics: (compiled.placementPlan.diagnostics || []).length
    },
    bridgePlan: {
      internalDslLines: (compiled.bridgePlan.dslLines || []).length,
      runtimeAdapterRequirements: (compiled.bridgePlan.runtimeAdapterRequirements || []).length,
      diagnostics: (compiled.bridgePlan.diagnostics || []).length
    }
  };
}

module.exports = {
  assertCompiledIntent: assertCompiledIntent,
  makeContractSummary: makeContractSummary
};
