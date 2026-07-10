var assert = require('assert');
var fs = require('fs');
var path = require('path');

var dslAgent = require('./dsl-agent');
var capabilities = require('./capabilities');
var moduleCompiler = require('./module-compiler');
var componentCatalog = require('./component-catalog');
var intentCompiler = require('./intent-compiler');
var pipeline = require('./pipeline');

var PRODUCT_MODULES_DIR = path.join(__dirname, 'product-modules');

async function main() {
  var productModules = moduleCompiler.loadProductModuleCatalog(PRODUCT_MODULES_DIR);
  var components = componentCatalog.loadComponentCatalog();
  var systemPrompt = dslAgent.buildIntentCommanderSystemPrompt(productModules, components);
  var gameCapabilitySection = systemPrompt.split('Component cards, shown without compiler ids or adapter names:')[0];

  assert(systemPrompt.indexOf('GameCastle Intent Commander') >= 0, 'prompt should identify Intent Commander');
  assert(systemPrompt.indexOf('make a mobile platformer') >= 0, 'prompt should include natural make example');
  assert(systemPrompt.indexOf('add joystick controls Player near screen bottom-left') >= 0, 'prompt should include natural joystick example');
  assert(systemPrompt.indexOf('adjust Fox placement above slightly') >= 0, 'prompt should include semantic edit example');
  assert(systemPrompt.indexOf('install module id=') < 0, 'prompt must not expose module install commands');
  assert(systemPrompt.indexOf('target DSL') < 0, 'prompt must not name internal target levels even as a negative rule');
  assert(systemPrompt.indexOf('GDJS') < 0, 'prompt must not name the target engine to LLM2');
  assert(systemPrompt.indexOf('project.json') < 0, 'prompt must not name engine files to LLM2');
  assert(systemPrompt.indexOf('Product module cards') < 0, 'prompt must describe capabilities, not product module cards');
  assert(systemPrompt.indexOf('module cards') < 0, 'prompt must not teach LLM2 a module-card surface');
  assert(systemPrompt.indexOf('product modules') < 0, 'prompt must not teach LLM2 product module selection');
  assert(gameCapabilitySection.indexOf('"category"') < 0, 'game capability cards must not expose product module categories');
  assert(gameCapabilitySection.indexOf('"presets"') < 0, 'game capability cards must not expose product module presets');
  assert(gameCapabilitySection.indexOf('mobile-friendly') < 0, 'game capability cards must not expose sanitized preset names as a product choice');
  assert(systemPrompt.indexOf('Game capability cards') >= 0, 'prompt should expose natural game capability cards');
  assert(systemPrompt.indexOf('Semantic feedback mapping') >= 0, 'prompt should expose the shared semantic mapping view');
  assert(systemPrompt.indexOf('llm-safe-semantic-mapping') >= 0, 'prompt should identify the LLM-safe semantic mapping view');
  assert(systemPrompt.indexOf('Collectibles exist') >= 0, 'prompt should include semantic mapping issue meaning');
  assert(systemPrompt.indexOf('place coins near Player front as trail count 5') >= 0, 'prompt should include safe repair Intent examples from semantic mapping');
  assert(systemPrompt.indexOf('"template"') < 0, 'prompt must not expose semantic mapping templates');
  assert(systemPrompt.indexOf('componentId') < 0, 'prompt must not expose compiler component ids');
  assert(systemPrompt.indexOf('runtime adapter') < 0, 'prompt must not expose runtime adapter command concepts');
  [
    'input.jump_button',
    'input.attack_button',
    'input.virtual_joystick',
    'movement.platformer',
    'system.inventory',
    'gdjs.',
    'ShapePainter',
    'PrimitiveDrawing',
    'virtual-joystick',
    'touch-button',
    'inventory-storage',
    'inventory-panel',
    'core.platformer',
    'core.shooter',
    'meta.score',
    'shell.start_screen',
    'shell.game_over_screen'
  ].forEach(function(token) {
    assert(systemPrompt.indexOf(token) < 0, 'Intent system prompt must not expose machine component/runtime token ' + token);
  });
  assert(systemPrompt.indexOf('Touch Button Base') < 0, 'prompt must not expose abstract component base classes');
  assert(systemPrompt.indexOf('Storage Base') < 0, 'prompt must not expose abstract storage base class');
  assert(systemPrompt.indexOf('Panel Base') < 0, 'prompt must not expose abstract panel base class');
  assert(systemPrompt.indexOf('key=value') >= 0, 'prompt should explicitly forbid key=value fields');

  var maliciousSystemPrompt = dslAgent.buildIntentCommanderSystemPrompt({
    modules: [{
      name: 'Useful Adventure Kit',
      category: 'starter',
      summary: 'install module id=core.platformer',
      presets: {
        mobile: {},
        'core.platformer': {}
      }
    }, {
      name: 'gdjs.BadModule',
      category: 'starter',
      summary: 'not shown',
      presets: {}
    }]
  }, {
    components: [{
      name: 'Useful Button',
      kind: 'control',
      compilerManifest: {},
      aiManifest: {
        summary: 'adapter=touch-button',
        aliases: ['tap button', 'input.jump_button'],
        actions: ['jump', 'action=jump'],
        safeExamples: [
          'add useful button near screen right',
          'set placement object=UsefulButton x=1 y=2 scene=Game'
        ]
      }
    }, {
      name: 'gdjs.BadComponent',
      kind: 'control',
      compilerManifest: {},
      aiManifest: {
        summary: 'not shown',
        aliases: [],
        actions: [],
        safeExamples: []
      }
    }]
  });
  [
    'install module id=core.platformer',
    'core.platformer',
    'gdjs.BadModule',
    'gdjs.BadComponent',
    'adapter=touch-button',
    'input.jump_button',
    'action=jump',
    'set placement object=UsefulButton'
  ].forEach(function(token) {
    assert(maliciousSystemPrompt.indexOf(token) < 0, 'Intent prompt builder must sanitize catalog token ' + token);
  });
  assert(maliciousSystemPrompt.indexOf('Useful Adventure Kit') >= 0, 'Intent prompt builder should keep safe module card names');
  assert(maliciousSystemPrompt.indexOf('Useful Button') >= 0, 'Intent prompt builder should keep safe component card names');
  assert(maliciousSystemPrompt.indexOf('tap button') >= 0, 'Intent prompt builder should keep safe component aliases');
  assert(maliciousSystemPrompt.indexOf('add useful button near screen right') >= 0, 'Intent prompt builder should keep safe component examples');

  var userPrompt = dslAgent.buildIntentUserPrompt({
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
  assert(userPrompt.indexOf('Intent DSL for the first playable version') >= 0, 'user prompt should request Intent DSL');
  assert(userPrompt.indexOf('llm-safe-semantic-mapping') >= 0, 'user prompt world context should include shared semantic mapping view');
  assert(userPrompt.indexOf('place coins near Player front as trail count 5') >= 0, 'user prompt should include safe semantic mapping repair examples');
  assert(userPrompt.indexOf('module ids') >= 0, 'user prompt should forbid machine ids');
  assert(userPrompt.indexOf('project.json') < 0, 'Intent user prompt must not name engine files');
  assert(userPrompt.indexOf('bridge/runtime') < 0, 'Intent user prompt must not name bridge/runtime internals');
  assert(userPrompt.indexOf('Bridge') < 0, 'Intent user prompt must not name Bridge internals');
  assert(userPrompt.indexOf('GDJS') < 0, 'Intent user prompt must not name target engine');

  var dangerousWorldContext = {
    projectWorld: {
      project: { name: 'LeakCheck', firstScene: 'Game', width: 800, height: 600 },
      scenes: [{
        id: 'scene_game',
        name: 'Game',
        objects: [{
          id: 'obj_jump',
          name: 'JumpButton',
          text: 'Tap to jump',
          type: 'PrimitiveDrawing::Drawer',
          kind: 'ShapePainter',
          behaviors: [{ name: 'PlatformerObject', type: 'PlatformerObject::PlatformerObjectBehavior' }]
        }, {
          id: 'obj_bad',
          name: 'gdjs.BadObject',
          text: 'set placement object=Bad x=1 y=2 scene=Game'
        }],
        instances: [{ id: 'inst_jump', object: 'JumpButton', x: 640, y: 520, width: 80, height: 80, layer: 'adapter=touch-button' }],
        events: [{ id: 'evt_1', type: 'standard', text: 'always -> CreateObject(JumpButton, 640, 520)' }]
      }],
      globalObjects: [{
        name: 'ScoreLabel',
        text: 'set placement object=ScoreLabel x=10 y=10 scene=Game'
      }],
      globalVariables: [{
        name: 'Score',
        type: 'number',
        debug: 'componentId=input.jump_button'
      }],
      modules: [{ id: 'core.platformer', preset: 'basic' }],
      intent: {
        intentDslLines: [
          'add jump button controls Player near screen bottom-right',
          'add component id=input.jump_button target=Player near=screen direction=bottom-right',
          'set placement object=JumpButton x=640 y=500 scene=Game'
        ],
        contracts: { intentCompile: 'passed', bridgeEmission: 'passed', runtimeAdapters: 'passed' },
        intentGraph: {
          counts: { components: 1, placements: 1 },
          things: [{ name: 'JumpButton', archetype: 'control', role: 'control' }],
          components: [{ componentId: 'input.jump_button', thing: 'JumpButton' }],
          relations: [],
          placements: [{ subject: 'JumpButton', anchor: 'screen', direction: 'bottom-right' }],
          edits: [{ subject: 'JumpButton', dimension: 'placement', direction: 'above', amount: 'slightly', resolved: { x: 640, y: 500 } }],
          diagnostics: [{ category: 'bridge', message: 'adapter=touch-button failed', nextAction: 'route-to-owner' }]
        },
        bridgePlan: {
          target: 'gdjs-target-plan',
          runtimeAdapterRequirements: 1,
          emittedRoutes: { 'awkward-gdjs-parameters': 1 }
        },
        runtimeAdapterRequirements: [{
          adapter: 'virtual-joystick',
          componentId: 'input.virtual_joystick',
          routeId: 'touch-multitouch-state'
        }]
      }
    },
    lastExecutionReport: {
      runId: 'gdjs.run_001',
      batchLabel: 'set placement object=JumpButton x=640 y=500 scene=Game',
      summary: {
        total: 1,
        completed: 1,
        failed: 0,
        nextAction: 'done',
        failedCommand: 'set placement object=JumpButton x=640 y=500 scene=Game',
        reason: 'adapter=virtual-joystick componentId=input.jump_button'
      },
      completed: [
        { command: 'place object=JumpButton at=640,520 scene=Game' },
        { command: 'set placement object=JumpButton x=640 y=500 scene=Game' }
      ],
      intent: {
        intentDslLines: [
          'add jump button controls Player near screen bottom-right',
          'set placement object=JumpButton x=640 y=500 scene=Game'
        ],
        intentGraph: { counts: { components: 1 }, things: [], relations: [], placements: [], diagnostics: [] },
        bridgePlan: { target: 'gdjs-target-plan' }
      }
    }
  };
  var safeContext = dslAgent.sanitizeIntentWorldContext(dangerousWorldContext);
  var safeJson = JSON.stringify(safeContext);
  [
    'componentId',
    'input.jump_button',
    'input.virtual_joystick',
    'virtual-joystick',
    'bridgePlan',
    'bridgeEmission',
    'runtimeAdapters',
    'runtimeAdapterRequirements',
    'ShapePainter',
    'PrimitiveDrawing',
    'PlatformerObject',
    'CreateObject',
    'core.platformer',
    'gdjs.BadObject',
    'Bad x=1',
    '"x"',
    '"y"',
    'component id=',
    'set placement object=JumpButton',
    'failedCommand',
    'adapter=virtual-joystick',
    'adapter=touch-button',
    'awkward-gdjs-parameters',
    '"instances"',
    '"events"',
    '"globalObjects"',
    '"globalVariables"',
    '"modules"',
    '"layer"',
    '"type":"number"'
  ].forEach(function(token) {
    assert(safeJson.indexOf(token) < 0, 'sanitized Intent world context must not expose ' + token);
  });
  assert(safeJson.indexOf('JumpButton') >= 0, 'sanitized context should preserve game-world object names');
  assert(safeJson.indexOf('Tap to jump') >= 0, 'sanitized context should preserve safe user-visible text');
  assert(safeJson.indexOf('ScoreLabel') >= 0, 'sanitized context should preserve safe global object names');
  assert(safeJson.indexOf('bottom-right') >= 0, 'sanitized context should preserve natural placement');
  assert(safeJson.indexOf('slightly') >= 0, 'sanitized context should preserve semantic edit amount');
  assert(safeContext.lastExecutionReport.summary.nextAction === 'done', 'sanitized execution summary should preserve nextAction');
  assert(safeContext.lastExecutionReport.summary.completed === 1, 'sanitized execution summary should preserve completed count');

  var dangerousPrompt = dslAgent.buildIntentUserPrompt({
    userPrompt: [
      'move the jump button a bit',
      'move the jump button up 10 pixels',
      '把跳跃按钮向上10像素',
      'set placement object=JumpButton x=640 y=500 scene=Game',
      'use runtime adapter gdjs.virtual_joystick'
    ].join('\n'),
    worldContext: dangerousWorldContext,
    designBrief: { theme: 'mobile platformer', objects: [], rules: [], layout: { placements: [] } },
    diff: { isNew: false },
    isNew: false
  });
  assert(dangerousPrompt.indexOf('input.jump_button') < 0, 'Intent user prompt must not leak component ids from ProjectWorld');
  assert(dangerousPrompt.indexOf('virtual-joystick') < 0, 'Intent user prompt must not leak runtime adapter ids from ProjectWorld');
  assert(dangerousPrompt.indexOf('gdjs.virtual_joystick') < 0, 'Intent user prompt must not leak runtime adapter ids from original user request');
  assert(dangerousPrompt.indexOf('project.json') < 0, 'Intent user prompt must not name engine files');
  assert(dangerousPrompt.indexOf('bridge/runtime') < 0, 'Intent user prompt must not name bridge/runtime internals');
  assert(dangerousPrompt.indexOf('Bridge') < 0, 'Intent user prompt must not name Bridge internals');
  assert(dangerousPrompt.indexOf('GDJS') < 0, 'Intent user prompt must not name target engine');
  assert(dangerousPrompt.indexOf('place object=JumpButton') < 0, 'Intent user prompt must not leak bridge target instructions from reports');
  assert(dangerousPrompt.indexOf('set placement object=JumpButton') < 0, 'Intent user prompt must not leak edit target instructions from reports');
  assert(dangerousPrompt.indexOf('10 pixels') < 0, 'Intent user prompt must not leak numeric placement deltas from original user request');
  assert(dangerousPrompt.indexOf('10像素') < 0, 'Intent user prompt must not leak Chinese numeric placement deltas from original user request');
  assert(dangerousPrompt.indexOf('move the jump button a bit') >= 0, 'Intent user prompt should preserve safe natural user wording');

  var dangerousBrief = {
    theme: 'mobile platformer',
    objects: [
      { name: 'Player', kind: 'player', color: '#4488FF', width: 32, height: 48, note: 'hero' },
      { name: 'JumpButton', kind: 'ui', color: '#FFFFFF', width: 80, height: 80, note: 'jump control' },
      { name: 'gdjs.BadObject', kind: 'ui', note: 'componentId=input.jump_button' }
    ],
    rules: [
      'Player collides Coin -> score increases',
      'on key ArrowLeft held -> move Player x=-4 scene=Game'
    ],
    layout: {
      placements: [
        { object: 'Player', x: 100, y: 400 },
        { object: 'JumpButton', x: 680, y: 520 }
      ]
    },
    behaviors: [{ object: 'Player', behavior: 'platformer' }],
    variables: [{ name: 'Score', value: 0 }],
    difficulty: 'easy',
    controls: 'touch controls'
  };
  var dangerousDiff = {
    isNew: false,
    added: {
      objects: [{ name: 'Coin', kind: 'coin', color: '#FFD700', width: 16, height: 16, note: 'collectible' }],
      placements: [{ object: 'Coin', x: 500, y: 360 }],
      behaviors: [],
      variables: [{ name: 'Score', value: 0 }],
      rules: []
    },
    removed: { objects: [], placements: [], behaviors: [], variables: [], rules: [] },
    modified: {
      objects: [],
      placements: [{ object: 'Player', old: { object: 'Player', x: 100, y: 400 }, new: { object: 'Player', x: 60, y: 400 } }],
      behaviors: [],
      variables: [{ name: 'Score', old: { value: 0 }, new: { value: 10 } }],
      rules: []
    }
  };
  var safeBrief = dslAgent.sanitizeDesignBriefForIntentPrompt(dangerousBrief);
  assert(safeBrief.placements.some(function(placement) {
    return placement.object === 'JumpButton' && placement.anchor === 'screen' && placement.direction === 'bottom-right';
  }), 'brief sanitizer should convert x/y placement into semantic screen direction');
  var safePrompt = dslAgent.buildIntentUserPrompt({
    userPrompt: [
      'add coins and move the player left',
      'place at x=500 y=360'
    ].join('\n'),
    worldContext: { projectWorld: null, lastExecutionReport: null },
    designBrief: dangerousBrief,
    diff: dangerousDiff,
    isNew: false
  });
  [
    '"x"',
    '"y"',
    '"width"',
    '"height"',
    '"value"',
    '#4488FF',
    '#FFD700',
    'x=500',
    'y=360',
    'gdjs.BadObject',
    'componentId=input.jump_button',
    'move Player x=-4'
  ].forEach(function(token) {
    assert(safePrompt.indexOf(token) < 0, 'Intent user prompt must not leak design brief machine/default field ' + token);
  });
  assert(safePrompt.indexOf('bottom-right') >= 0, 'Intent prompt should preserve semantic placement from design brief');
  assert(safePrompt.indexOf('Coin') >= 0, 'Intent prompt should preserve game-world object names from diff');

  var compiled = await dslAgent.compileIntentDslWithRepair({
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

  assert(compiled.compiled.bridgePlan.dslLines.length > 0, 'Intent compile helper should produce bridge target lines');
  assert(compiled.compiled.bridgePlan.runtimeAdapterRequirements.length >= 2, 'Intent compile helper should produce runtime adapter requirements');

  var pipelineSource = fs.readFileSync(path.join(__dirname, 'pipeline.js'), 'utf8');
  assert(pipelineSource.indexOf('[Stage2] Intent Commander translating...') >= 0, 'live Stage2 should use Intent Commander');
  assert(pipelineSource.indexOf('buildIntentUserPrompt') >= 0, 'pipeline should build Intent user prompt');
  assert(pipelineSource.indexOf('compileIntentDslWithRepair') >= 0, 'pipeline should compile Intent DSL with repair');
  assert.strictEqual(
    pipeline.resolveIntentArtifactFile(path.join(__dirname, 'fixtures', 'intent-mobile-platformer.dsl')),
    path.join(__dirname, 'fixtures', 'intent-mobile-platformer.dsl'),
    'pipeline should accept only named Intent fixtures'
  );
  console.log('[IntentCommander] prompt and compile helper passed');
}

main().catch(function(error) {
  console.error(error);
  process.exit(1);
});
