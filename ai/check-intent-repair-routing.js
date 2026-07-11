var assert = require('assert');
var path = require('path');

var intentAgent = require('./intent-agent');
var intentCompiler = require('./intent-compiler');
var moduleCompiler = require('./module-compiler');

var productModuleCatalog = moduleCompiler.loadProductModuleCatalog(path.join(__dirname, 'product-modules'));

async function testSystemOwnerDiagnosticDoesNotCallLlmRepair() {
  var calls = 0;
  try {
    await intentAgent.compileIntentSlotsWithRepair({
      intentSlotText: JSON.stringify({ schemaVersion: 1, commands: [{ kind: 'give_ability', slots: { target: 'Player', ability: 'dash' } }] }),
      intentCompiler: intentCompiler,
      productModuleCatalog: productModuleCatalog,
      maxRepairRounds: 2,
      allowLlmRepair: true,
      callModel: async function() {
        calls++;
        return JSON.stringify({ schemaVersion: 1, commands: [{ kind: 'add_control', slots: { control: 'jump button', target: 'Player', anchor: 'screen', direction: 'bottom-right' } }] });
      }
    });
  } catch (error) {
    assert.strictEqual(error.nonRepairableByLlm, true);
    assert(error.message.indexOf('component-catalog') >= 0, 'unknown ability must route to the component catalog');
    assert.strictEqual(calls, 0, 'system-owner diagnostic must not call LLM repair');
    return;
  }
  throw new Error('system-owner diagnostic should fail before LLM repair');
}

async function testParserErrorCanUseLlmRepair() {
  var calls = 0;
  var repairPrompt = '';
  var result = await intentAgent.compileIntentSlotsWithRepair({
    intentSlotText: '{"schemaVersion":1,"commands":[{"kind":"unknown_command","slots":{"component":"input.jump_button"}}]}',
    intentCompiler: intentCompiler,
    productModuleCatalog: productModuleCatalog,
    userPrompt: [
      'move jump button a bit',
      'set placement object=JumpButton x=640 y=500 scene=Game',
      'use runtime adapter gdjs.virtual_joystick'
    ].join('\n'),
    creativeVision: JSON.stringify({
      template_selection: 'mobile_platformer',
      game_definition: 'A mobile platformer.',
      play_plan: 'Climb short routes and collect rewards.',
      placement_plan: 'Keep controls clear of the play route.',
      control_plan: 'Keep the jump control easy to reach.',
      win_condition: 'Reach the final platform.',
    }),
    maxRepairRounds: 1,
    allowLlmRepair: true,
    callModel: async function(prompt) {
      calls++;
      repairPrompt = prompt;
      return JSON.stringify({ schemaVersion: 1, commands: [{ kind: 'add_control', slots: { control: 'jump button', target: 'Player', anchor: 'screen', direction: 'bottom-right' } }] });
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
  assert(repairPrompt.indexOf('jump control easy to reach') >= 0, 'repair prompt should keep the LLM1 director order');
  assert(repairPrompt.indexOf('invalid previous slot packet omitted') >= 0, 'repair prompt should omit invalid slot packets');
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
