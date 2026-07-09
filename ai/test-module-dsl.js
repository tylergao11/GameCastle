var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');
var htmlExporter = require('./html-exporter');

var ROOT = path.join(__dirname, '..');
var PIPELINE = path.join(__dirname, 'pipeline.js');
var OUTPUT_DIR = path.join(ROOT, 'output');
var WORLD_PATH = path.join(OUTPUT_DIR, 'project-world.json');
var LEDGER_PATH = path.join(OUTPUT_DIR, 'execution-ledger.json');
var TICK_RUNTIME_MANIFEST_PATH = path.join(OUTPUT_DIR, 'tick-runtime-manifest.json');
var HTML_EXPORT_MANIFEST_PATH = path.join(OUTPUT_DIR, 'html-export-manifest.json');
var PROJECT_PATH = path.join(OUTPUT_DIR, 'project.json');
var PENDING_APPROVAL_PATH = path.join(OUTPUT_DIR, 'pending-approval.json');
var TIMEOUT_MS = 15000;

function fixture(name) {
  return path.join(__dirname, 'fixtures', name);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runPipeline(args, label, expectFailure) {
  var started = Date.now();
  var result = childProcess.spawnSync(process.execPath, [PIPELINE].concat(args), {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
    maxBuffer: 1024 * 1024 * 5
  });
  var elapsed = Date.now() - started;
  if (result.error) throw new Error(label + ' failed to run: ' + result.error.message);
  if (elapsed >= TIMEOUT_MS) throw new Error(label + ' reached timeout guard');
  if (expectFailure) {
    if (result.status === 0) throw new Error(label + ' should have failed');
  } else if (result.status !== 0) {
    throw new Error(label + ' exited ' + result.status + '\nSTDOUT:\n' + result.stdout + '\nSTDERR:\n' + result.stderr);
  }
  return result;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertRuntimeProjectShape(project) {
  assert(Array.isArray(project.eventsFunctionsExtensions), 'project should include eventsFunctionsExtensions array for GDJS RuntimeGame');
  assert(Array.isArray(project.usedResources), 'project should include usedResources array for GDJS ResourceLoader');
  assert(project.properties && project.properties.loadingScreen, 'project should include loadingScreen settings for GDJS loading');
  assert(project.properties && project.properties.watermark, 'project should include watermark settings for GDJS startup');
  assert(Array.isArray(project.properties.extensionProperties), 'project should include extensionProperties array');
  project.layouts.forEach(function(scene) {
    assert(Array.isArray(scene.usedResources), 'scene should include usedResources array: ' + scene.name);
    assert(scene.uiSettings, 'scene should include uiSettings: ' + scene.name);
    scene.layers.forEach(function(layer) {
      assert(layer.followBaseLayerCamera === false, 'layer should include followBaseLayerCamera: ' + scene.name);
      assert(layer.isLightingLayer === false, 'layer should include isLightingLayer: ' + scene.name);
    });
    scene.objects.forEach(function(object) {
      assert(Array.isArray(object.effects), 'object should include effects array: ' + scene.name + '/' + object.name);
      assert(object.type !== 'PrimitiveDrawing::ShapePainter', 'project must not emit non-GDevelop object type PrimitiveDrawing::ShapePainter');
      if (object.type === 'PrimitiveDrawing::Drawer') {
        assert(object.clearBetweenFrames === false, 'Drawer static shapes should persist between frames: ' + scene.name + '/' + object.name);
        assert(object.antialiasing === 'low', 'Drawer should include official antialiasing value: ' + scene.name + '/' + object.name);
        assert(object.fillColor && typeof object.fillColor.r === 'number', 'Drawer should use official fillColor object: ' + scene.name + '/' + object.name);
      }
    });
  });
}

function assertRuntimeExecutionFiles(project) {
  assert(fs.existsSync(path.join(OUTPUT_DIR, 'data.js')), 'runtime should emit data.js');
  var generatedCode = '';
  project.layouts.forEach(function(scene, index) {
    var codePath = path.join(OUTPUT_DIR, 'code' + index + '.js');
    assert(fs.existsSync(codePath), 'runtime should emit scene code: code' + index + '.js');
    var code = fs.readFileSync(codePath, 'utf8');
    generatedCode += code + '\n';
    assert(code.indexOf('gdjs.' + scene.mangledName + 'Code.func') >= 0, 'scene code should export GDJS func for ' + scene.name);
  });
  var hasMouseObjectEvent = JSON.stringify(project.layouts.map(function(scene) {
    return scene.events || [];
  })).indexOf('SourisSurObjet') >= 0;
  if (hasMouseObjectEvent) {
    assert(generatedCode.indexOf('primaryPointerAction()') >= 0, 'mouse object events should use frame-safe pointer action helper');
    assert(generatedCode.indexOf('object.cursorOnObject()') >= 0, 'mouse object events should use GDJS cursorOnObject coordinates');
  }
  var projectJson = JSON.stringify(project);
  assert(projectJson.indexOf('PrimitiveDrawing::ShapePainter') < 0, 'project should never contain the stale ShapePainter runtime type');
  if (projectJson.indexOf('PrimitiveDrawing::Drawer') >= 0) {
    assert(projectJson.indexOf('PrimitiveDrawing::Rectangle') >= 0 || projectJson.indexOf('PrimitiveDrawing::Circle') >= 0, 'Drawer objects should be drawn by official PrimitiveDrawing actions');
    assert(projectJson.indexOf('PrimitiveDrawing::SetRectangularCollisionMask') >= 0, 'Drawer objects should receive an official collision mask action');
    assert(generatedCode.indexOf('drawRectangle(') >= 0 || generatedCode.indexOf('drawCircle(') >= 0, 'runtime code should execute official Drawer draw actions');
    assert(generatedCode.indexOf('setRectangularCollisionMask(') >= 0, 'runtime code should execute official Drawer collision masks');
  }
  assert(fs.existsSync(HTML_EXPORT_MANIFEST_PATH), 'runtime should emit html-export-manifest.json');
  var manifest = readJson(HTML_EXPORT_MANIFEST_PATH);
  assert(manifest.target === 'html', 'html export manifest should target html');
  assert(manifest.scriptFiles.indexOf('runtimegame.js') >= 0, 'html manifest should include official GDJS runtime');
  assert(manifest.scriptFiles.indexOf('Extensions/PrimitiveDrawing/shapepainterruntimeobject.js') >= 0, 'html manifest should include ShapePainter runtime when used');
  if (JSON.stringify(project).indexOf('PlatformBehavior::PlatformerObjectBehavior') >= 0) {
    assert(manifest.scriptFiles.indexOf('Extensions/PlatformBehavior/platformerobjectruntimebehavior.js') >= 0, 'html manifest should include platformer behavior runtime when used');
  }
  // HTML export requires GDJS runtime cache; skip these checks when not available.
  if (fs.existsSync(path.join(OUTPUT_DIR, 'game.html'))) {
    assert(fs.existsSync(path.join(OUTPUT_DIR, 'index.html')), 'runtime should emit index.html');
    var html = fs.readFileSync(path.join(OUTPUT_DIR, 'game.html'), 'utf8');
    assert(html.indexOf('data.js') >= 0, 'game.html should load data.js');
    assert(html.indexOf('code0.js') >= 0, 'game.html should load generated scene code');
    assert(!fs.existsSync(path.join(OUTPUT_DIR, 'Cordova')), 'html export should not copy Cordova runtime');
    assert(!fs.existsSync(path.join(OUTPUT_DIR, 'Electron')), 'html export should not copy Electron runtime');
    assert(!fs.existsSync(path.join(OUTPUT_DIR, 'types')), 'html export should not copy TypeScript declaration bundle');
    assert(!fs.existsSync(path.join(OUTPUT_DIR, 'debugger-client')), 'html export should not copy debugger client by default');
  }
}

function testModuleCompileCacheHit() {
  runPipeline(['--module-dsl-file', fixture('module-platformer.dsl'), 'module-platformer'], 'module platformer first run');
  var firstWorld = readJson(WORLD_PATH);
  var firstProject = fs.readFileSync(PROJECT_PATH, 'utf8');
  var firstNetwork = readJson(TICK_RUNTIME_MANIFEST_PATH);

  runPipeline(['--module-dsl-file', fixture('module-platformer.dsl'), 'module-platformer'], 'module platformer second run');
  var secondWorld = readJson(WORLD_PATH);
  var secondProject = fs.readFileSync(PROJECT_PATH, 'utf8');
  var secondNetwork = readJson(TICK_RUNTIME_MANIFEST_PATH);
  var ledger = readJson(LEDGER_PATH);

  assert(firstWorld.worldVersion === 1, 'first module new project worldVersion should be 1');
  assert(secondWorld.worldVersion === 1, 'second module new project worldVersion should reset to 1');
  assert(firstWorld.semanticHash === secondWorld.semanticHash, 'module semanticHash should be stable');
  assert(firstProject === secondProject, 'module project.json should be byte-stable');
  assert(JSON.stringify(firstNetwork) === JSON.stringify(secondNetwork), 'tick runtime manifest should be stable');
  assert(ledger.runs.length === 1, 'new module run should reset ledger');
  assert(secondWorld.modules.length === 1, 'world should record one installed module');
  assert(secondWorld.modules[0].id === 'core.platformer', 'world should record core.platformer');
  assert(secondWorld.modules[0].syncPolicy.sync === 'lockstep', 'world should record lockstep sync policy');
}

function testShellComposition() {
  runPipeline(['--module-dsl-file', fixture('module-platformer-shells.dsl'), 'module-shells'], 'module shells run');
  var world = readJson(WORLD_PATH);
  var project = readJson(PROJECT_PATH);
  var tickRuntime = readJson(TICK_RUNTIME_MANIFEST_PATH);
  assertRuntimeProjectShape(project);
  assertRuntimeExecutionFiles(project);
  assert(world.modules.length === 3, 'world should record three installed modules');
  assert(project.firstLayout === 'Start', 'start screen should become first scene');
  assert(project.layouts.some(function(scene) { return scene.name === 'GameOver'; }), 'game over scene should exist');
  var game = project.layouts.find(function(scene) { return scene.name === 'Game'; });
  assert(JSON.stringify(game.events).indexOf('ChangeScene') >= 0, 'platformer fail rule should link to game over scene');
  var ground = game.objects.find(function(object) { return object.name === 'Ground'; });
  var platform = game.objects.find(function(object) { return object.name === 'Platform'; });
  assert(ground.behaviors.some(function(behavior) { return behavior.type === 'PlatformBehavior::PlatformBehavior'; }), 'Ground should be registered as a platform obstacle');
  assert(platform.behaviors.some(function(behavior) { return behavior.type === 'PlatformBehavior::PlatformBehavior'; }), 'Platform should be registered as a platform obstacle');
  var player = game.objects.find(function(object) { return object.name === 'Player'; });
  var platformer = player.behaviors.find(function(behavior) { return behavior.type === 'PlatformBehavior::PlatformerObjectBehavior'; });
  assert(platformer && platformer.name === 'PlatformerObject', 'Player should use official PlatformerObject behavior name');
  assert(typeof platformer.gravity === 'number' && typeof platformer.jumpSpeed === 'number', 'PlatformerObject behavior should include official movement defaults');
  var platformBehavior = ground.behaviors.find(function(behavior) { return behavior.type === 'PlatformBehavior::PlatformBehavior'; });
  assert(platformBehavior.platformType === 'NormalPlatform', 'Platform behavior should include official platformType default');
  assert(tickRuntime.modules.length === 3, 'tick runtime manifest should record three modules');
  assert(tickRuntime.plan && tickRuntime.plan.realtime, 'tick runtime manifest should include compiler-owned realtime plan');
  assert(tickRuntime.plan.realtime.sync === 'lockstep', 'realtime plan should select lockstep from core module');
  assert(tickRuntime.plan.realtime.moduleIds.indexOf('core.platformer') >= 0, 'realtime plan should name owner modules');
  assert(tickRuntime.plan.channels.length === 1, 'tick runtime plan should keep shell event as side-channel');
  assert(tickRuntime.plan.channels[0].id === 'shell.game_over_screen', 'event side-channel should be owned by game over shell');
}

function testShooterTickRuntimeComposition() {
  runPipeline(['--module-dsl-file', fixture('module-shooter.dsl'), 'module-shooter-network'], 'module shooter network run');
  var world = readJson(WORLD_PATH);
  var project = readJson(PROJECT_PATH);
  var tickRuntime = readJson(TICK_RUNTIME_MANIFEST_PATH);
  assertRuntimeProjectShape(project);
  assertRuntimeExecutionFiles(project);
  assert(world.modules.length === 1, 'shooter world should record one installed module');
  assert(world.modules[0].id === 'core.shooter', 'world should record core.shooter');
  assert(tickRuntime.plan && tickRuntime.plan.realtime, 'shooter tick runtime manifest should include realtime plan');
  assert(tickRuntime.plan.realtime.sync === 'lockstep', 'shooter realtime plan should use lockstep');
  assert(tickRuntime.plan.realtime.moduleIds.indexOf('core.shooter') >= 0, 'shooter realtime plan should name core.shooter');
  ['move_up', 'move_down', 'move_left', 'move_right', 'shoot'].forEach(function(input) {
    assert(tickRuntime.plan.realtime.inputs.indexOf(input) >= 0, 'shooter realtime plan should include input: ' + input);
  });
  ['Score', 'Wave', 'Player1', 'Player2', 'Player1Health', 'Player2Health', 'Bullet1', 'Bullet2', 'Enemy', 'PowerUp'].forEach(function(state) {
    assert(tickRuntime.plan.realtime.state.indexOf(state) >= 0, 'shooter realtime plan should include state: ' + state);
  });
  assert(tickRuntime.plan.channels.length === 0, 'shooter lockstep-only module should not create side channels');
  var runtime = fs.readFileSync(path.join(OUTPUT_DIR, 'tick-runtime.js'), 'utf8');
  var code0 = fs.readFileSync(path.join(OUTPUT_DIR, 'code0.js'), 'utf8');
  assert(runtime.indexOf('new GameCastleTickIntentBridge') >= 0, 'shooter runtime should create bridge');
  assert(runtime.indexOf('new InputSyncStrategy') < 0, 'shooter runtime should not instantiate legacy lockstep strategy');
  assert(runtime.indexOf('inputs: ["move_up","move_down","move_left","move_right","shoot"]') >= 0, 'shooter bridge should receive declared input plan');
  assert(code0.indexOf('if (!op) return current;') >= 0, 'runtime should preserve unchanged movement axes');
  assert(code0.indexOf('applyObjectPosition("Player1", "", 0, "-", 4)') >= 0, 'shooter up input should move Player1 relatively on Y');
  assert(code0.indexOf('applyObjectPosition("Player1", "+", 4, "", 0)') >= 0, 'shooter right input should move Player1 relatively on X');
  assert(code0.indexOf('applyObjectPosition("Player2", "", 0, "-", 4)') >= 0, 'shooter W input should move Player2 relatively on Y');
  assert(code0.indexOf('input.isKeyPressed(87)') >= 0, 'shooter should compile KeyW for Player2 controls');
}

function testModuleOrderIsCompilerOwned() {
  runPipeline(['--module-dsl-file', fixture('module-platformer-shells-reordered.dsl'), 'module-shells-reordered'], 'module shells reordered run');
  var project = readJson(PROJECT_PATH);
  assert(project.firstLayout === 'Start', 'compiler should make start screen first regardless of install order');
  var game = project.layouts.find(function(scene) { return scene.name === 'Game'; });
  assert(JSON.stringify(game.events).indexOf('ChangeScene') >= 0, 'game over link should survive reordered install');
}

function testContinueAddsShellModulesFromProjectWorld() {
  runPipeline(['--module-dsl-file', fixture('module-platformer.dsl'), 'module-continue-base'], 'module continue base run');
  runPipeline(['--continue', '--module-dsl-file', fixture('module-add-shells.dsl'), '--batch-label', 'module_patch_01', 'module-continue-shells'], 'module continue shell patch');
  var world = readJson(WORLD_PATH);
  var project = readJson(PROJECT_PATH);
  var ledger = readJson(LEDGER_PATH);
  var tickRuntime = readJson(TICK_RUNTIME_MANIFEST_PATH);
  assert(world.modules.length === 3, 'continue patch should merge base and new modules');
  assert(project.firstLayout === 'Start', 'continue patch should make start screen first');
  assert(project.layouts.some(function(scene) { return scene.name === 'GameOver'; }), 'continue patch should add game over scene');
  var game = project.layouts.find(function(scene) { return scene.name === 'Game'; });
  assert(JSON.stringify(game.events).indexOf('ChangeScene') >= 0, 'continue patch should replace core fail action');
  assert(ledger.runs.length === 2, 'continue patch should append ledger run');
  assert(ledger.runs[1].batchLabel === 'module_patch_01', 'continue patch should use requested batch label');
  assert(tickRuntime.modules.length === 3, 'continue patch should rewrite full tick runtime manifest');
  assert(tickRuntime.plan && tickRuntime.plan.realtime && tickRuntime.plan.realtime.sync === 'lockstep', 'continue patch should preserve realtime plan');
}

function testInvalidSyncFailsFast() {
  var result = runPipeline(['--module-dsl-file', fixture('module-invalid-sync.dsl'), 'module-invalid'], 'invalid module sync', true);
  var text = (result.stderr || '') + (result.stdout || '');
  assert(text.indexOf('does not support sync=lockstep') >= 0, 'invalid sync should explain unsupported mode');
}

function testIncompatibleModulesFailFast() {
  var result = runPipeline(['--module-dsl-file', fixture('module-incompatible-score.dsl'), 'module-incompatible'], 'incompatible modules', true);
  var text = (result.stderr || '') + (result.stdout || '');
  assert(text.indexOf('incompatible') >= 0, 'incompatible module pair should fail fast');
}

function testContinueRejectsReinstall() {
  runPipeline(['--module-dsl-file', fixture('module-platformer.dsl'), 'module-reinstall-base'], 'module reinstall base run');
  var result = runPipeline(['--continue', '--module-dsl-file', fixture('module-reinstall-core.dsl'), 'module-reinstall-core'], 'module reinstall existing core', true);
  var text = (result.stderr || '') + (result.stdout || '');
  assert(text.indexOf('already installed') >= 0, 'continue reinstall should fail fast');
}

function testConfigureInstalledShellModules() {
  runPipeline(['--module-dsl-file', fixture('module-platformer-shells.dsl'), 'module-configure-base'], 'module configure base run');
  runPipeline(['--continue', '--module-dsl-file', fixture('module-configure-shells.dsl'), '--batch-label', 'module_configure_01', 'module-configure-shells'], 'module configure shell patch');
  var world = readJson(WORLD_PATH);
  var project = readJson(PROJECT_PATH);
  var ledger = readJson(LEDGER_PATH);
  var startModule = world.modules.find(function(module) { return module.id === 'shell.start_screen'; });
  var gameOverModule = world.modules.find(function(module) { return module.id === 'shell.game_over_screen'; });
  assert(startModule.params.title === 'Moon Runner', 'start screen title param should update');
  assert(startModule.params.button === 'Play Now', 'start screen button param should update');
  assert(gameOverModule.params.title === 'Try Again', 'game over title param should update');
  assert(gameOverModule.params.hint === 'Space To Retry', 'game over hint param should update');
  var eventText = JSON.stringify(project.layouts.map(function(scene) { return { name: scene.name, events: scene.events }; }));
  assert(eventText.indexOf('Moon Runner') >= 0, 'project should contain configured start title');
  assert(eventText.indexOf('Play Now') >= 0, 'project should contain configured start button');
  assert(eventText.indexOf('Try Again') >= 0, 'project should contain configured game over title');
  assert(eventText.indexOf('Space To Retry') >= 0, 'project should contain configured game over hint');
  assert(eventText.indexOf('Sky Runner') < 0, 'old start title event should be removed');
  assert(ledger.runs[1].batchLabel === 'module_configure_01', 'configure patch should append ledger batch');
}

function testConfigureSyncOnlyMetadataPatch() {
  runPipeline(['--module-dsl-file', fixture('module-platformer-shells.dsl'), 'module-configure-sync-base'], 'module configure sync base run');
  runPipeline(['--continue', '--module-dsl-file', fixture('module-configure-sync-only.dsl'), '--batch-label', 'module_configure_sync', 'module-configure-sync'], 'module configure sync-only patch');
  var world = readJson(WORLD_PATH);
  var ledger = readJson(LEDGER_PATH);
  var tickRuntime = readJson(TICK_RUNTIME_MANIFEST_PATH);
  var startModule = world.modules.find(function(module) { return module.id === 'shell.start_screen'; });
  var tickRuntimeStart = tickRuntime.modules.find(function(module) { return module.id === 'shell.start_screen'; });
  assert(startModule.syncPolicy.sync === 'event', 'sync-only configure should update ProjectWorld module sync');
  assert(startModule.syncPolicy.authority === 'host', 'sync-only configure should update ProjectWorld module authority');
  assert(tickRuntimeStart.syncPolicy.sync === 'event', 'sync-only configure should update tick runtime manifest sync');
  assert(tickRuntime.plan.channels.some(function(channel) { return channel.id === 'shell.start_screen' && channel.sync === 'event'; }), 'sync-only configure should update tick runtime plan side-channel');
  assert(ledger.runs.length === 2, 'sync-only configure should append a ledger run');
  assert(ledger.runs[1].summary.total === 0, 'sync-only configure should be metadata-only with zero internal commands');
  assert(ledger.runs[1].summary.nextAction === 'done', 'sync-only configure should finish cleanly');
}

function testUnsupportedConfigureFailsFast() {
  runPipeline(['--module-dsl-file', fixture('module-platformer-shells.dsl'), 'module-configure-unsupported-base'], 'module configure unsupported base run');
  var result = runPipeline(['--continue', '--module-dsl-file', fixture('module-configure-unsupported.dsl'), 'module-configure-unsupported'], 'module configure unsupported key', true);
  var text = (result.stderr || '') + (result.stdout || '');
  assert(text.indexOf('does not support configure key: scene') >= 0, 'unsupported configure key should fail fast');
}

function testLinkOwnedSlotIsNotConfigurable() {
  var result = runPipeline(['--module-dsl-file', fixture('module-invalid-core-fail-action.dsl'), 'module-invalid-core-fail-action'], 'invalid core failAction configure', true);
  var text = (result.stderr || '') + (result.stdout || '');
  assert(text.indexOf('configure key failAction is an internal compiler slot') >= 0, 'link-owned failAction slot should not be LLM2 configurable');

  var installResult = runPipeline(['--module-dsl-file', fixture('module-invalid-core-fail-action-install.dsl'), 'module-invalid-core-fail-action-install'], 'invalid core failAction install', true);
  var installText = (installResult.stderr || '') + (installResult.stdout || '');
  assert(installText.indexOf('install key failAction is an internal compiler slot') >= 0, 'link-owned failAction slot should not be install-configurable');
}

function testInteractionCopyContractFailsFast() {
  var startResult = runPipeline(['--module-dsl-file', fixture('module-invalid-start-enter.dsl'), 'module-invalid-start-enter'], 'invalid start interaction copy', true);
  var startText = (startResult.stderr || '') + (startResult.stdout || '');
  assert(startText.indexOf('unsupported interaction term') >= 0, 'start copy should reject unsupported key term');
  assert(startText.indexOf('mouse click on StartButton') >= 0, 'start copy error should name fixed mouse trigger');

  var gameOverResult = runPipeline(['--module-dsl-file', fixture('module-invalid-game-over-enter.dsl'), 'module-invalid-game-over-enter'], 'invalid game over interaction copy', true);
  var gameOverText = (gameOverResult.stderr || '') + (gameOverResult.stdout || '');
  assert(gameOverText.indexOf('must mention one of') >= 0 || gameOverText.indexOf('unsupported interaction term') >= 0, 'game over copy should reject unsupported restart key');
  assert(gameOverText.indexOf('key Space') >= 0, 'game over copy error should name fixed Space trigger');

  runPipeline(['--module-dsl-file', fixture('module-platformer-shells.dsl'), 'module-invalid-configure-base'], 'module invalid configure base run');
  var configureStartResult = runPipeline(['--continue', '--module-dsl-file', fixture('module-configure-invalid-start-enter.dsl'), 'module-configure-invalid-start-enter'], 'invalid configure start interaction copy', true);
  var configureStartText = (configureStartResult.stderr || '') + (configureStartResult.stdout || '');
  assert(configureStartText.indexOf('unsupported interaction term') >= 0, 'configure start copy should reject unsupported key term');

  var configureGameOverResult = runPipeline(['--continue', '--module-dsl-file', fixture('module-configure-invalid-game-over-enter.dsl'), 'module-configure-invalid-game-over-enter'], 'invalid configure game over interaction copy', true);
  var configureGameOverText = (configureGameOverResult.stderr || '') + (configureGameOverResult.stdout || '');
  assert(configureGameOverText.indexOf('key Space') >= 0, 'configure game over copy should name fixed Space trigger');
}

function testValidInteractionCopyPasses() {
  runPipeline(['--module-dsl-file', fixture('module-platformer-shells.dsl'), 'module-valid-interaction-base'], 'module valid interaction base run');
  runPipeline(['--continue', '--module-dsl-file', fixture('module-configure-valid-interaction-copy.dsl'), '--batch-label', 'module_interaction_copy', 'module-valid-interaction-copy'], 'module valid interaction copy');
  var world = readJson(WORLD_PATH);
  var project = readJson(PROJECT_PATH);
  var startModule = world.modules.find(function(module) { return module.id === 'shell.start_screen'; });
  var gameOverModule = world.modules.find(function(module) { return module.id === 'shell.game_over_screen'; });
  var eventText = JSON.stringify(project.layouts.map(function(scene) { return { name: scene.name, events: scene.events }; }));
  assert(startModule.params.button === '点击开始', 'start copy should accept click wording');
  assert(gameOverModule.params.hint === '按空格重试', 'game over copy should accept Space wording');
  assert(eventText.indexOf('点击开始') >= 0, 'project should contain valid start copy');
  assert(eventText.indexOf('按空格重试') >= 0, 'project should contain valid game over copy');
}

function testApprovalGateNewProject() {
  var beforeProject = fs.existsSync(PROJECT_PATH) ? fs.readFileSync(PROJECT_PATH, 'utf8') : null;
  runPipeline(['--approval-gate', '--module-dsl-file', fixture('module-platformer-shells.dsl'), 'module-approval-new'], 'module approval gate new project');
  assert(fs.existsSync(PENDING_APPROVAL_PATH), 'approval gate should write pending approval');
  var afterProject = fs.existsSync(PROJECT_PATH) ? fs.readFileSync(PROJECT_PATH, 'utf8') : null;
  assert(afterProject === beforeProject, 'approval gate new project should not mutate project before approval');
  var pending = readJson(PENDING_APPROVAL_PATH);
  assert(pending.patchKind === 'module', 'pending approval should record module patch kind');
  assert(pending.summary.internalDslLineCount > 0, 'pending approval should include compiled internal DSL');
  assert(pending.preview.nextAction === 'done', 'pending approval preview should be executable');
  assert(pending.preview.cacheHit === false, 'new approval preview should not report cache hit');
  runPipeline(['--approve-pending'], 'approve pending new project');
  assert(!fs.existsSync(PENDING_APPROVAL_PATH), 'approved patch should remove pending approval');
  var world = readJson(WORLD_PATH);
  var ledger = readJson(LEDGER_PATH);
  assert(world.modules.length === 3, 'approved new patch should create module world state');
  assert(ledger.runs.length === 1 && ledger.runs[0].summary.nextAction === 'done', 'approved new patch should execute once');
}

function testApprovalGateClearsStalePendingOnFailure() {
  runPipeline(['--approval-gate', '--module-dsl-file', fixture('module-platformer-shells.dsl'), 'module-approval-stale-base'], 'module approval stale base');
  assert(fs.existsSync(PENDING_APPROVAL_PATH), 'stale guard setup should write pending approval');
  runPipeline(['--approval-gate', '--module-dsl-file', fixture('module-invalid-start-enter.dsl'), 'module-approval-invalid-start'], 'module approval invalid start copy', true);
  assert(!fs.existsSync(PENDING_APPROVAL_PATH), 'failed approval gate should remove stale pending approval');
}

function testApprovalGateContinueConfigure() {
  runPipeline(['--module-dsl-file', fixture('module-platformer-shells.dsl'), 'module-approval-continue-base'], 'module approval continue base run');
  var beforeProject = fs.readFileSync(PROJECT_PATH, 'utf8');
  var beforeLedger = fs.readFileSync(LEDGER_PATH, 'utf8');
  runPipeline(['--approval-gate', '--continue', '--module-dsl-file', fixture('module-configure-shells.dsl'), '--batch-label', 'approved_configure', 'module-approval-configure'], 'module approval gate configure');
  assert(fs.existsSync(PENDING_APPROVAL_PATH), 'continue approval gate should write pending approval');
  assert(fs.readFileSync(PROJECT_PATH, 'utf8') === beforeProject, 'continue approval gate should not mutate project before approval');
  assert(fs.readFileSync(LEDGER_PATH, 'utf8') === beforeLedger, 'continue approval gate should not mutate ledger before approval');
  var pending = readJson(PENDING_APPROVAL_PATH);
  assert(pending.requiresExistingProject === true, 'continue pending patch should require existing project');
  assert(pending.batchLabel === 'approved_configure', 'continue pending patch should preserve batch label');
  assert(pending.preview.nextAction === 'done', 'continue pending preview should be executable');
  assert(pending.preview.cacheHit === false, 'configure approval preview should change semantic hash');
  runPipeline(['--approve-pending'], 'approve pending configure patch');
  var world = readJson(WORLD_PATH);
  var ledger = readJson(LEDGER_PATH);
  var startModule = world.modules.find(function(module) { return module.id === 'shell.start_screen'; });
  assert(startModule.params.title === 'Moon Runner', 'approved configure should update module params');
  assert(ledger.runs.length === 2, 'approved configure should append ledger run');
  assert(ledger.runs[1].batchLabel === 'approved_configure', 'approved configure should use pending batch label');
}

function testHtmlManifestKeeps3DOwnedByRuntime() {
  var project = {
    objects: [],
    layouts: [{
      name: 'Game3D',
      objects: [{
        name: 'Cube',
        type: 'Scene3D::Cube3DObject',
        behaviors: [{ name: 'Base3D', type: 'Scene3D::Base3DBehavior' }],
      }],
    }],
  };
  var manifest = htmlExporter.buildHtmlExportManifest(project, {
    codeFiles: [{ fileName: 'code0.js' }],
  });
  assert(manifest.target === 'html', 'manifest should remain an HTML export');
  assert(manifest.scriptFiles.indexOf('pixi-renderers/three.js') >= 0, '3D project should include Three runtime');
  assert(manifest.scriptFiles.indexOf('Extensions/3D/Scene3DTools.js') >= 0, '3D project should include Scene3D tools');
  assert(manifest.scriptFiles.indexOf('Extensions/3D/Cube3DRuntimeObject.js') >= 0, '3D cube should include cube runtime');
  assert(manifest.assetFiles.indexOf('pixi-renderers/draco/gltf/draco_decoder.wasm') >= 0, '3D project should copy Draco wasm asset');
}

function main() {
  console.log('[ModuleDslTest] timeout guard ' + TIMEOUT_MS + 'ms per pipeline run');
  testHtmlManifestKeeps3DOwnedByRuntime();
  console.log('[ModuleDslTest] html 3D manifest passed');
  testModuleCompileCacheHit();
  console.log('[ModuleDslTest] cache hit passed');
  testShellComposition();
  console.log('[ModuleDslTest] shell composition passed');
  testShooterTickRuntimeComposition();
  console.log('[ModuleDslTest] shooter tick runtime composition passed');
  testModuleOrderIsCompilerOwned();
  console.log('[ModuleDslTest] compiler-owned ordering passed');
  testContinueAddsShellModulesFromProjectWorld();
  console.log('[ModuleDslTest] continue module patch passed');
  testInvalidSyncFailsFast();
  console.log('[ModuleDslTest] invalid sync guard passed');
  testIncompatibleModulesFailFast();
  console.log('[ModuleDslTest] incompatible module guard passed');
  testContinueRejectsReinstall();
  console.log('[ModuleDslTest] continue reinstall guard passed');
  testConfigureInstalledShellModules();
  console.log('[ModuleDslTest] configure installed modules passed');
  testConfigureSyncOnlyMetadataPatch();
  console.log('[ModuleDslTest] configure sync-only metadata patch passed');
  testUnsupportedConfigureFailsFast();
  console.log('[ModuleDslTest] unsupported configure guard passed');
  testLinkOwnedSlotIsNotConfigurable();
  console.log('[ModuleDslTest] link-owned slot guard passed');
  testInteractionCopyContractFailsFast();
  console.log('[ModuleDslTest] interaction copy contract guard passed');
  testValidInteractionCopyPasses();
  console.log('[ModuleDslTest] valid interaction copy passed');
  testApprovalGateNewProject();
  console.log('[ModuleDslTest] approval gate new project passed');
  testApprovalGateClearsStalePendingOnFailure();
  console.log('[ModuleDslTest] approval stale pending guard passed');
  testApprovalGateContinueConfigure();
  console.log('[ModuleDslTest] approval gate continue configure passed');
  console.log('[ModuleDslTest] all passed');
}

main();
