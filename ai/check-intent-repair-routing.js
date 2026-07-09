var assert = require('assert');
var path = require('path');

var dslAgent = require('./dsl-agent');
var intentCompiler = require('./intent-compiler');
var moduleCompiler = require('./module-compiler');

var productModuleCatalog = moduleCompiler.loadProductModuleCatalog(path.join(__dirname, 'product-modules'));

async function testSystemOwnerDiagnosticDoesNotCallLlmRepair() {
  var calls = 0;
  try {
    await dslAgent.compileIntentPatchWithRepair({
      intentDslText: 'add dash button controls Player near screen bottom-right',
      intentCompiler: intentCompiler,
      productModuleCatalog: productModuleCatalog,
      maxRepairRounds: 2,
      allowLlmRepair: true,
      callModel: async function() {
        calls++;
        return 'add jump button controls Player near screen bottom-right';
      }
    });
  } catch (error) {
    assert.strictEqual(error.name, 'IntentCompileDiagnosticsError');
    assert.strictEqual(error.nonRepairableByLlm, true);
    assert.strictEqual(error.diagnosticDecision.nextAction, 'route-to-owner');
    assert.strictEqual(error.intentDiagnostics[0].routeId, 'new-reusable-game-system');
    assert.strictEqual(error.intentDiagnostics[0].owner, 'component-catalog');
    assert.strictEqual(calls, 0, 'system-owner diagnostic must not call LLM repair');
    return;
  }
  throw new Error('system-owner diagnostic should fail before LLM repair');
}

async function testParserErrorCanUseLlmRepair() {
  var calls = 0;
  var result = await dslAgent.compileIntentPatchWithRepair({
    intentDslText: 'add component id=input.jump_button target=Player near=screen direction=bottom-right',
    intentCompiler: intentCompiler,
    productModuleCatalog: productModuleCatalog,
    maxRepairRounds: 1,
    allowLlmRepair: true,
    callModel: async function() {
      calls++;
      return 'add jump button controls Player near screen bottom-right';
    }
  });

  assert.strictEqual(calls, 1, 'parser/surface error should allow one LLM repair');
  assert(result.compiled.graph.components.some(function(component) {
    return component.componentId === 'input.jump_button';
  }), 'repaired intent should compile jump button component');
}

async function main() {
  await testSystemOwnerDiagnosticDoesNotCallLlmRepair();
  await testParserErrorCanUseLlmRepair();
  console.log('[IntentRepairRouting] owner-routed diagnostics do not leak into LLM repair');
}

main().catch(function(error) {
  console.error(error);
  process.exit(1);
});
