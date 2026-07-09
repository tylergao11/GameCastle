var assert = require('assert');
var fs = require('fs');
var path = require('path');

var dslAgent = require('./dsl-agent');
var moduleCompiler = require('./module-compiler');
var componentCatalog = require('./component-catalog');
var intentCompiler = require('./intent-compiler');

var PRODUCT_MODULES_DIR = path.join(__dirname, 'product-modules');

async function main() {
  var productModules = moduleCompiler.loadProductModuleCatalog(PRODUCT_MODULES_DIR);
  var components = componentCatalog.loadComponentCatalog();
  var systemPrompt = dslAgent.buildIntentCommanderSystemPrompt(productModules, components);

  assert(systemPrompt.indexOf('GameCastle Intent Commander') >= 0, 'prompt should identify Intent Commander');
  assert(systemPrompt.indexOf('make a mobile platformer') >= 0, 'prompt should include natural make example');
  assert(systemPrompt.indexOf('add joystick controls Player near screen bottom-left') >= 0, 'prompt should include natural joystick example');
  assert(systemPrompt.indexOf('install module id=') < 0, 'prompt must not expose Module DSL');
  assert(systemPrompt.indexOf('componentId') < 0, 'prompt must not expose compiler component ids');
  assert(systemPrompt.indexOf('runtime adapter') < 0, 'prompt must not expose runtime adapter command concepts');
  assert(systemPrompt.indexOf('Touch Button Base') < 0, 'prompt must not expose abstract component base classes');
  assert(systemPrompt.indexOf('Storage Base') < 0, 'prompt must not expose abstract storage base class');
  assert(systemPrompt.indexOf('Panel Base') < 0, 'prompt must not expose abstract panel base class');
  assert(systemPrompt.indexOf('key=value') >= 0, 'prompt should explicitly forbid key=value fields');

  var userPrompt = dslAgent.buildIntentPatchUserPrompt({
    userPrompt: '做一个手机平台跳跃游戏，加摇杆和跳跃按钮',
    worldContext: { projectWorld: null, lastExecutionReport: null },
    designBrief: {
      theme: 'mobile platformer',
      objects: [],
      rules: [],
      layout: { placements: [] },
      difficulty: 'easy',
      controls: 'joystick and jump'
    },
    diff: { isNew: true },
    isNew: true
  });
  assert(userPrompt.indexOf('Intent DSL patch') >= 0, 'user prompt should request Intent DSL');
  assert(userPrompt.indexOf('module ids') >= 0, 'user prompt should forbid machine ids');

  var compiled = await dslAgent.compileIntentPatchWithRepair({
    intentDslText: [
      'make a mobile platformer',
      'add joystick controls Player near screen bottom-left',
      'add jump button controls Player near screen bottom-right'
    ].join('\n'),
    intentCompiler: intentCompiler,
    productModuleCatalog: productModules,
    componentCatalog: components,
    maxRepairRounds: 0,
    allowLlmRepair: false
  });

  assert(compiled.compiled.bridgePlan.dslLines.length > 0, 'Intent compile helper should produce bridge DSL');
  assert(compiled.compiled.bridgePlan.runtimeAdapterRequirements.length >= 2, 'Intent compile helper should produce runtime adapter requirements');

  var pipelineSource = fs.readFileSync(path.join(__dirname, 'pipeline.js'), 'utf8');
  assert(pipelineSource.indexOf('[Stage2] Intent Commander translating...') >= 0, 'live Stage2 should use Intent Commander');
  assert(pipelineSource.indexOf('[Stage2] Module Patch Commander translating...') < 0, 'live Stage2 should not use Module Patch Commander');
  assert(pipelineSource.indexOf('buildIntentPatchUserPrompt') >= 0, 'pipeline should build Intent user prompt');
  assert(pipelineSource.indexOf('compileIntentPatchWithRepair') >= 0, 'pipeline should compile Intent patch with repair');
  console.log('[IntentCommander] prompt and compile helper passed');
}

main().catch(function(error) {
  console.error(error);
  process.exit(1);
});
