var assert = require('assert');
var fs = require('fs');
var path = require('path');
var intentCompiler = require('./intent-compiler');
var intentRuntimeCodegen = require('./intent-runtime-codegen');
var runtimeAdapterContract = require('./runtime-adapter-requirement-contract');
var htmlExporter = require('./html-exporter');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertContractFails(requirement, expected) {
  try {
    runtimeAdapterContract.assertRequirement(requirement);
  } catch (error) {
    assert(error.message.indexOf(expected) >= 0, 'expected error to mention ' + expected + ', got: ' + error.message);
    return;
  }
  throw new Error('runtime adapter contract should fail: ' + expected);
}

function main() {
  var compiled = intentCompiler.compileIntentDsl([
    'make a mobile platformer',
    'add joystick controls Player near screen bottom-left',
    'add jump button controls Player near screen bottom-right',
    'add attack button controls Player near jump button left',
    'add inventory owned by Player with 24 slots near screen right'
  ].join('\n'));

  var requirements = compiled.bridgePlan.runtimeAdapterRequirements;
  runtimeAdapterContract.assertRequirements(requirements);
  var config = intentRuntimeCodegen.buildRuntimeConfig(requirements);
  assert.strictEqual(config.schemaVersion, 1, 'runtime config schema should be 1');
  assert(config.requirements.some(function(req) {
    return req.adapter === 'virtual-joystick' && req.inputs.indexOf('move_left') >= 0;
  }), 'virtual joystick should declare movement inputs');
  assert(config.requirements.some(function(req) {
    return req.componentId === 'input.jump_button' && req.key === 'Space' && req.config.controlLabel === 'J';
  }), 'jump button should carry key and label from component config');
  assert(config.requirements.some(function(req) {
    return req.componentId === 'input.attack_button' && req.key === 'KeyZ' && req.config.controlLabel === 'A';
  }), 'attack button should carry key and label from component config');
  assert(config.requirements.some(function(req) {
    return req.adapter === 'inventory-panel' && req.config.slots === 24 && req.config.panelTitle === 'Inventory' && req.config.width === 160 && req.config.height === 220;
  }), 'inventory panel should keep inherited panel config');
  assert(config.requirements.some(function(req) {
    return req.adapter === 'virtual-joystick' && req.routeId === 'touch-multitouch-state' && req.routeOwner === 'runtime-adapter' && req.mechanism === 'touch-axis-adapter';
  }), 'runtime config should preserve joystick route evidence');

  var missingButtonKey = clone(requirements.find(function(req) { return req.adapter === 'touch-button'; }));
  delete missingButtonKey.config.keyboardKey;
  assertContractFails(missingButtonKey, 'config.keyboardKey');

  var missingJoystickInputs = clone(requirements.find(function(req) { return req.adapter === 'virtual-joystick'; }));
  delete missingJoystickInputs.config.inputs;
  assertContractFails(missingJoystickInputs, 'config.inputs');

  var missingPanelTitle = clone(requirements.find(function(req) { return req.adapter === 'inventory-panel'; }));
  delete missingPanelTitle.config.panelTitle;
  assertContractFails(missingPanelTitle, 'config.panelTitle');

  var js = intentRuntimeCodegen.generate(requirements);
  assert(js.indexOf('window.GameCastleIntentRuntime') >= 0, 'runtime script should expose attach hook');
  assert(js.indexOf('bindJoystick') >= 0, 'runtime script should include joystick adapter');
  assert(js.indexOf('bindButton') >= 0, 'runtime script should include button adapter');
  assert(js.indexOf('bindInventory') >= 0, 'runtime script should include inventory panel adapter');
  assert(js.indexOf('runtime adapter') < 0, 'generated runtime should not contain LLM-facing adapter instruction text');
  assert(js.indexOf('componentId.indexOf("attack")') < 0, 'generated runtime should not infer labels from component ids');
  var source = fs.readFileSync(path.join(__dirname, 'intent-runtime-codegen.js'), 'utf8');
  assert(source.indexOf("componentId === 'input.jump_button'") < 0, 'runtime codegen should not hard-code jump button id for key mapping');
  assert(source.indexOf("componentId === 'input.attack_button'") < 0, 'runtime codegen should not hard-code attack button id for key mapping');
  assert(source.indexOf('componentId.indexOf("attack")') < 0, 'runtime codegen should not infer button labels from component ids');
  assert(source.indexOf("action === 'jump'") < 0, 'runtime codegen should not infer keyboard keys from action names');
  assert(source.indexOf("requirement.adapter === 'virtual-joystick'") < 0, 'runtime codegen should not infer joystick inputs from adapter ids');

  var htmlManifest = htmlExporter.buildHtmlExportManifest({ layouts: [], objects: [] }, {
    codeFiles: [{ fileName: 'code0.js' }],
    hasIntentRuntime: true
  });
  assert(htmlManifest.scriptFiles.indexOf('intent-runtime.js') >= 0, 'HTML manifest should include intent runtime script');
  assert(htmlManifest.scriptFiles.indexOf('data.js') < htmlManifest.scriptFiles.indexOf('intent-runtime.js'), 'intent runtime should load after data.js');
  var html = htmlExporter.renderHtml(htmlManifest, { hasNetwork: false });
  assert(html.indexOf('window.GameCastleIntentRuntime.attach(game)') >= 0, 'HTML should attach intent runtime after game creation');

  console.log('[IntentRuntimeCodegen] runtime adapter script passed');
}

main();
