var assert = require('assert');

var intentCompiler = require('./intent-compiler');
var compileContract = require('./intent-compile-contract');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function compileFixture() {
  return intentCompiler.compileIntentDsl([
    'make a mobile platformer',
    'add joystick controls Player near screen bottom-left',
    'add jump button controls Player near screen bottom-right',
    'add attack button controls Player near jump button left',
    'add inventory owned by Player with 24 slots near screen right',
    'place coins near Player front as trail count 3'
  ].join('\n'), {
    placementContext: {
      objectBounds: {
        Player: { x: 100, y: 400, width: 32, height: 48 }
      }
    }
  });
}

function assertFails(mutated, expected) {
  try {
    compileContract.assertCompiledIntent(mutated);
  } catch (error) {
    assert(error.message.indexOf(expected) >= 0, 'expected error to mention ' + expected + ', got: ' + error.message);
    return;
  }
  throw new Error('mutated compiled intent should fail: ' + expected);
}

function main() {
  var compiled = compileFixture();
  assert(compiled.contracts, 'compiler should attach aggregate Intent contract summary');
  assert.strictEqual(compiled.contracts.intentCompile, 'passed', 'aggregate Intent contract should pass');
  assert.strictEqual(compiled.contracts.bridgePlan.targetPlanLines, compiled.bridgePlan.targetPlanLines.length, 'contract summary should count bridge target lines');
  var contractSummary = compileContract.assertCompiledIntent(compiled);
  assert.strictEqual(contractSummary.intentCompile, 'passed', 'contract validator should return aggregate summary');

  var editCompiled = intentCompiler.compileIntentDsl('adjust Fox placement above slightly', {
    placementContext: {
      objectBounds: {
        Fox: { x: 240, y: 320, width: 64, height: 64 }
      }
    }
  });
  assert.strictEqual(editCompiled.contracts.edits, 'passed', 'aggregate Intent contract should validate edit constraints');
  assert.strictEqual(editCompiled.contracts.graph.edits, 1, 'aggregate Intent contract should count graph edits');
  assert.strictEqual(editCompiled.contracts.placementPlan.edits, 1, 'aggregate Intent contract should count planned edits');

  var missingPlacementRoute = clone(compiled);
  missingPlacementRoute.placementPlan.placements[0].routeEvidence = [];
  assertFails(missingPlacementRoute, 'routeEvidence');

  var numericEdit = clone(editCompiled);
  numericEdit.graph.edits[0].amount = 8;
  assertFails(numericEdit, 'semantic');

  var missingBridgeContract = clone(compiled);
  delete missingBridgeContract.bridgePlan.contracts.emission;
  assertFails(missingBridgeContract, 'bridge emission contract status');

  var missingRuntimeEvidence = clone(compiled);
  delete missingRuntimeEvidence.bridgePlan.runtimeAdapterRequirements[0].routeOwner;
  assertFails(missingRuntimeEvidence, 'routeOwner');

  var missingRewriteMechanism = clone(compiled);
  delete missingRewriteMechanism.resultCard.rewrites[0].mechanism;
  assertFails(missingRewriteMechanism, 'missing mechanism');

  console.log('[IntentCompileContract] compiled Intent artifact is contract-complete');
}

main();
