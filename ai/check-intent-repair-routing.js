var assert = require('assert');
var path = require('path');

var intentAgent = require('./intent-agent');
var intentCompiler = require('./intent-compiler');
var moduleCompiler = require('./module-compiler');

var productModuleCatalog = moduleCompiler.loadProductModuleCatalog(path.join(__dirname, 'product-modules'));

async function testSystemOwnerDiagnosticDoesNotCallLlmRepair() {
  var calls = 0;
  try {
    await intentAgent.compileIntentDslWithRepair({
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
  var repairPrompt = '';
  var result = await intentAgent.compileIntentDslWithRepair({
    intentDslText: [
      'add component id=input.jump_button target=Player near=screen direction=bottom-right',
      'set placement object=JumpButton x=640 y=500 scene=Game'
    ].join('\n'),
    intentCompiler: intentCompiler,
    productModuleCatalog: productModuleCatalog,
    userPrompt: [
      'move jump button a bit',
      'set placement object=JumpButton x=640 y=500 scene=Game',
      'use runtime adapter gdjs.virtual_joystick'
    ].join('\n'),
    designBrief: {
      theme: 'mobile platformer',
      objects: [{ name: 'JumpButton', kind: 'ui', width: 80, height: 80 }],
      layout: { placements: [{ object: 'JumpButton', x: 680, y: 520 }] },
      variables: [{ name: 'Score', value: 0 }]
    },
    maxRepairRounds: 1,
    allowLlmRepair: true,
    callModel: async function(prompt) {
      calls++;
      repairPrompt = prompt;
      return 'add jump button controls Player near screen bottom-right';
    }
  });

  assert.strictEqual(calls, 1, 'parser/surface error should allow one LLM repair');
  assert(repairPrompt.indexOf('input.jump_button') < 0, 'repair prompt must not repeat prohibited component id syntax');
  assert(repairPrompt.indexOf('component id=') < 0, 'repair prompt must not repeat prohibited component-id command shape');
  assert(repairPrompt.indexOf('set placement object=JumpButton') < 0, 'repair prompt must not repeat bridge target placement update syntax');
  assert(repairPrompt.indexOf('gdjs.virtual_joystick') < 0, 'repair prompt must not leak original user request runtime adapter syntax');
  assert(repairPrompt.indexOf('project.json') < 0, 'repair prompt must not name engine files');
  assert(repairPrompt.indexOf('bridge/runtime') < 0, 'repair prompt must not name bridge/runtime internals');
  assert(repairPrompt.indexOf('bridge compilation') < 0, 'repair prompt must not name bridge compilation');
  assert(repairPrompt.indexOf('Bridge') < 0, 'repair prompt must not name Bridge internals');
  assert(repairPrompt.indexOf('GDJS') < 0, 'repair prompt must not name target engine');
  assert(repairPrompt.indexOf('move jump button a bit') >= 0, 'repair prompt should keep safe natural user wording');
  assert(repairPrompt.indexOf('"x"') < 0, 'repair prompt must not leak design brief x coordinate');
  assert(repairPrompt.indexOf('"width"') < 0, 'repair prompt must not leak design brief sizing defaults');
  assert(repairPrompt.indexOf('"value"') < 0, 'repair prompt must not leak variable implementation values');
  assert(repairPrompt.indexOf('bottom-right') >= 0, 'repair prompt should keep semantic placement from sanitized design brief');
  assert(repairPrompt.indexOf('previous Intent DSL omitted') >= 0, 'repair prompt should explain omitted machine syntax');
  assert(result.compiled.graph.components.some(function(component) {
    return component.componentId === 'input.jump_button';
  }), 'repaired intent should compile jump button component');
}

function testCompilerErrorSanitizerDoesNotLeakMachineSyntax() {
  var sanitized = intentAgent.sanitizeErrorForIntentPrompt(new Error([
    'Unsupported command: set placement object=JumpButton x=640 y=500 scene=Game',
    'Use component id=input.jump_button for this action',
    'safe natural issue: jump button needs a semantic placement'
  ].join('\n')));

  assert(sanitized.indexOf('set placement object=JumpButton') < 0, 'sanitized compiler error must not leak bridge placement syntax');
  assert(sanitized.indexOf('x=640') < 0, 'sanitized compiler error must not leak concrete x coordinate');
  assert(sanitized.indexOf('input.jump_button') < 0, 'sanitized compiler error must not leak component id');
  assert(sanitized.indexOf('compiler error detail omitted') >= 0, 'sanitized compiler error should explain omitted machine syntax');
  assert(sanitized.indexOf('safe natural issue') >= 0, 'sanitized compiler error should keep safe natural diagnostics');
}

async function main() {
  await testSystemOwnerDiagnosticDoesNotCallLlmRepair();
  await testParserErrorCanUseLlmRepair();
  testCompilerErrorSanitizerDoesNotLeakMachineSyntax();
  console.log('[IntentRepairRouting] owner-routed diagnostics do not leak into LLM repair');
}

main().catch(function(error) {
  console.error(error);
  process.exit(1);
});
