var assert = require('assert');
var fs = require('fs');
var path = require('path');

var intentAgent = require('./intent-agent');
var moduleCompiler = require('./module-compiler');
var componentCatalog = require('./component-catalog');
var intentCompiler = require('./intent-compiler');
var pipeline = require('./pipeline');

var PRODUCT_MODULES_DIR = path.join(__dirname, 'product-modules');

async function main() {
  var productModules = moduleCompiler.loadProductModuleCatalog(PRODUCT_MODULES_DIR);
  var components = componentCatalog.loadComponentCatalog();
  var systemPrompt = intentAgent.buildIntentCommanderSystemPrompt(productModules, components);

  assert(systemPrompt.indexOf('GameCastle Intent Slot Director') >= 0, 'prompt must identify semantic slot ownership');
  assert(systemPrompt.indexOf('Packet contract:') >= 0, 'prompt must define the packet contract');
  assert(systemPrompt.indexOf('make_game.description carries') >= 0, 'prompt must explain slot content');
  assert(systemPrompt.indexOf('"joystick"') >= 0, 'prompt must expose canonical control value from the dictionary');
  assert(systemPrompt.indexOf('"platforms"') >= 0, 'prompt must expose canonical placement value from the dictionary');
  assert(systemPrompt.indexOf('adjust_placement') < 0, 'mobile platformer prompt must omit unavailable adjustment commands');
  assert(systemPrompt.indexOf('Writable slot contract:') >= 0, 'prompt must declare the dictionary-derived writable contract');
  assert(systemPrompt.indexOf('A deterministic renderer converts') >= 0, 'prompt must assign DSL generation to deterministic code');
  assert(systemPrompt.indexOf('game_mode from the LLM1 director order') >= 0, 'LLM2 prompt must honor LLM1 template selection');
  ['make a mobile platformer', 'add joystick controls Player', 'adjust Fox placement', 'place coins near Player', 'safeExamples', 'safeIntentExample', '"template"'].forEach(function(token) {
    assert(systemPrompt.indexOf(token) < 0, 'prompt must contain slot contracts instead of examples: ' + token);
  });
  ['do not', 'never', "don't"].forEach(function(token) {
    assert(systemPrompt.toLowerCase().indexOf(token) < 0, 'prompt must use affirmative language: ' + token);
  });
  ['componentId', 'core.platformer', 'gdjs.', 'project.json', 'target-plan'].forEach(function(token) {
    assert(systemPrompt.indexOf(token) < 0, 'prompt must keep engine vocabulary outside LLM2: ' + token);
  });

  var creativeVision = JSON.stringify({
    template_selection: 'mobile_platformer',
    game_definition: 'A castle stair-climb platform game.',
    play_plan: 'Climb upward while collecting ringing coins.',
    placement_plan: 'Coins mark high staircase routes.',
    control_plan: 'Use mobile movement and jump controls.',
    win_condition: 'Reach the highest chamber.',
  });
  var userPrompt = intentAgent.buildIntentUserPrompt({
    userPrompt: 'Make a mobile platformer.',
    worldContext: { projectWorld: null, lastExecutionReport: null },
    creativeVision: creativeVision,
    creativeChange: { isNew: true, changed: true, previousVision: null, currentVision: creativeVision },
    isNew: true,
  });
  assert(userPrompt.indexOf('"game_mode":"mobile platformer"') >= 0, 'LLM2 must receive the selected game mode and director order');
  assert(userPrompt.indexOf('core.platformer') < 0, 'LLM2 must not receive the internal template identifier');
  assert(userPrompt.indexOf('castle stair-climb') >= 0, 'LLM2 must receive the concise gameplay direction');
  assert(userPrompt.indexOf('Intent slot packet for the first playable version') >= 0, 'LLM2 must receive a slot-filling task');
  assert(userPrompt.indexOf('semantic-word-dictionary') >= 0, 'LLM2 must receive semantic dictionary context');

  var maliciousSystemPrompt = intentAgent.buildIntentCommanderSystemPrompt({
    modules: [{ name: 'Useful Adventure Kit', summary: 'install module id=core.platformer' }],
  }, {
    components: [{
      name: 'Useful Button', kind: 'control', compilerManifest: {},
      aiManifest: { summary: 'adapter=touch-button', aliases: ['tap button'], actions: ['jump'], safeExamples: ['add useful button near screen right'] },
    }],
  });
  assert(maliciousSystemPrompt.indexOf('Useful Adventure Kit') >= 0, 'safe capability name must remain');
  ['install module', 'core.platformer', 'adapter=touch-button', 'add useful button near screen right', 'Useful Button', 'Virtual Joystick'].forEach(function(token) {
    assert(maliciousSystemPrompt.indexOf(token) < 0, 'catalog projection must strip implementation or example content: ' + token);
  });

  var compiled = await intentAgent.compileIntentSlotsWithRepair({
    intentSlotText: JSON.stringify({ schemaVersion: 1, commands: [
      { kind: 'make_game', slots: { description: 'mobile platformer' } },
      { kind: 'add_control', slots: { control: 'joystick', target: 'Player', action: 'move', anchor: 'screen', direction: 'bottom-left' } },
      { kind: 'add_control', slots: { control: 'jump button', target: 'Player', action: 'jump', anchor: 'screen', direction: 'bottom-right' } },
    ] }),
    intentCompiler: intentCompiler,
    productModuleCatalog: productModules,
    componentCatalog: components,
    userPrompt: 'Make a mobile platformer.',
    creativeVision: creativeVision,
    maxRepairRounds: 0,
    allowLlmRepair: false,
  });
  assert(compiled.compiled.bridgePlan.targetPlanLines.length > 0, 'slot compile must produce a target plan');
  assert(compiled.compiled.bridgePlan.runtimeAdapterRequirements.length >= 2, 'declared control slots must produce control adapters');

  var pipelineSource = fs.readFileSync(path.join(__dirname, 'pipeline.js'), 'utf8');
  assert(pipelineSource.indexOf('generateDirectorOrder') >= 0, 'pipeline must call LLM1 director-order generation');
  assert(pipelineSource.indexOf('compileIntentSlotsWithRepair') >= 0, 'pipeline must compile LLM2 slots');
  assert.strictEqual(
    pipeline.resolveIntentArtifactFile(path.join(__dirname, 'fixtures', 'intent-mobile-platformer.dsl')),
    path.join(__dirname, 'fixtures', 'intent-mobile-platformer.dsl')
  );

  console.log('[IntentSlotDirector] affirmative slot meanings, example-free prompt, creative input, and deterministic compile passed');
}

main().catch(function(error) {
  console.error(error);
  process.exit(1);
});
