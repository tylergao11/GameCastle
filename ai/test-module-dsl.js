var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var PIPELINE = path.join(__dirname, 'pipeline.js');
var OUTPUT_DIR = path.join(ROOT, 'output');
var WORLD_PATH = path.join(OUTPUT_DIR, 'project-world.json');
var LEDGER_PATH = path.join(OUTPUT_DIR, 'execution-ledger.json');
var NETWORK_PATH = path.join(OUTPUT_DIR, 'network-manifest.json');
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

function testModuleCompileCacheHit() {
  runPipeline(['--module-dsl-file', fixture('module-platformer.dsl'), 'module-platformer'], 'module platformer first run');
  var firstWorld = readJson(WORLD_PATH);
  var firstProject = fs.readFileSync(PROJECT_PATH, 'utf8');
  var firstNetwork = readJson(NETWORK_PATH);

  runPipeline(['--module-dsl-file', fixture('module-platformer.dsl'), 'module-platformer'], 'module platformer second run');
  var secondWorld = readJson(WORLD_PATH);
  var secondProject = fs.readFileSync(PROJECT_PATH, 'utf8');
  var secondNetwork = readJson(NETWORK_PATH);
  var ledger = readJson(LEDGER_PATH);

  assert(firstWorld.worldVersion === 1, 'first module new project worldVersion should be 1');
  assert(secondWorld.worldVersion === 1, 'second module new project worldVersion should reset to 1');
  assert(firstWorld.semanticHash === secondWorld.semanticHash, 'module semanticHash should be stable');
  assert(firstProject === secondProject, 'module project.json should be byte-stable');
  assert(JSON.stringify(firstNetwork) === JSON.stringify(secondNetwork), 'network manifest should be stable');
  assert(ledger.runs.length === 1, 'new module run should reset ledger');
  assert(secondWorld.modules.length === 1, 'world should record one installed module');
  assert(secondWorld.modules[0].id === 'core.platformer', 'world should record core.platformer');
  assert(secondWorld.modules[0].syncPolicy.sync === 'lockstep', 'world should record lockstep sync policy');
}

function testShellComposition() {
  runPipeline(['--module-dsl-file', fixture('module-platformer-shells.dsl'), 'module-shells'], 'module shells run');
  var world = readJson(WORLD_PATH);
  var project = readJson(PROJECT_PATH);
  var network = readJson(NETWORK_PATH);
  assert(world.modules.length === 3, 'world should record three installed modules');
  assert(project.firstLayout === 'Start', 'start screen should become first scene');
  assert(project.layouts.some(function(scene) { return scene.name === 'GameOver'; }), 'game over scene should exist');
  var game = project.layouts.find(function(scene) { return scene.name === 'Game'; });
  assert(JSON.stringify(game.events).indexOf('ChangeScene') >= 0, 'platformer fail rule should link to game over scene');
  assert(network.modules.length === 3, 'network manifest should record three modules');
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
  var network = readJson(NETWORK_PATH);
  assert(world.modules.length === 3, 'continue patch should merge base and new modules');
  assert(project.firstLayout === 'Start', 'continue patch should make start screen first');
  assert(project.layouts.some(function(scene) { return scene.name === 'GameOver'; }), 'continue patch should add game over scene');
  var game = project.layouts.find(function(scene) { return scene.name === 'Game'; });
  assert(JSON.stringify(game.events).indexOf('ChangeScene') >= 0, 'continue patch should replace core fail action');
  assert(ledger.runs.length === 2, 'continue patch should append ledger run');
  assert(ledger.runs[1].batchLabel === 'module_patch_01', 'continue patch should use requested batch label');
  assert(network.modules.length === 3, 'continue patch should rewrite full network manifest');
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
  var network = readJson(NETWORK_PATH);
  var startModule = world.modules.find(function(module) { return module.id === 'shell.start_screen'; });
  var networkStart = network.modules.find(function(module) { return module.id === 'shell.start_screen'; });
  assert(startModule.syncPolicy.sync === 'event', 'sync-only configure should update ProjectWorld module sync');
  assert(startModule.syncPolicy.authority === 'host', 'sync-only configure should update ProjectWorld module authority');
  assert(networkStart.syncPolicy.sync === 'event', 'sync-only configure should update network manifest sync');
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

function main() {
  console.log('[ModuleDslTest] timeout guard ' + TIMEOUT_MS + 'ms per pipeline run');
  testModuleCompileCacheHit();
  console.log('[ModuleDslTest] cache hit passed');
  testShellComposition();
  console.log('[ModuleDslTest] shell composition passed');
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
