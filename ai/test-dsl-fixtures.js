var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var PIPELINE = path.join(__dirname, 'pipeline.js');
var OUTPUT_DIR = path.join(ROOT, 'output');
var WORLD_PATH = path.join(OUTPUT_DIR, 'project-world.json');
var LEDGER_PATH = path.join(OUTPUT_DIR, 'execution-ledger.json');
var PROJECT_PATH = path.join(OUTPUT_DIR, 'project.json');
var HTML_EXPORT_MANIFEST_PATH = path.join(OUTPUT_DIR, 'html-export-manifest.json');
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
    maxBuffer: 1024 * 1024 * 5,
  });
  var elapsed = Date.now() - started;
  if (result.error) {
    throw new Error(label + ' failed to run: ' + result.error.message);
  }
  if (elapsed >= TIMEOUT_MS) {
    throw new Error(label + ' reached timeout guard');
  }
  if (expectFailure) {
    if (result.status === 0) throw new Error(label + ' should have failed but exited 0');
    return result;
  }
  if (result.status !== 0) {
    throw new Error(label + ' exited ' + result.status + '\nSTDOUT:\n' + result.stdout + '\nSTDERR:\n' + result.stderr);
  }
  return result;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertLedger(maxRuns, expectedLastLabel, expectedNextAction) {
  var ledger = readJson(LEDGER_PATH);
  assert(ledger.runs.length <= maxRuns, 'ledger exceeded run guard: ' + ledger.runs.length + ' > ' + maxRuns);
  var last = ledger.runs[ledger.runs.length - 1];
  assert(last.batchLabel === expectedLastLabel, 'expected last batchLabel ' + expectedLastLabel + ', got ' + last.batchLabel);
  assert(last.summary.nextAction === expectedNextAction, 'expected nextAction ' + expectedNextAction + ', got ' + last.summary.nextAction);
  return { ledger: ledger, last: last };
}

// ── 1. Cache hit across equivalent new runs ──────────────────────────────────
function testValidNewProjectCacheHit() {
  runPipeline(['--dsl-file', fixture('valid-platformer.dsl'), 'fixture-valid'], 'valid fixture first run');
  var firstWorld = readJson(WORLD_PATH);
  var firstProject = fs.readFileSync(PROJECT_PATH, 'utf8');
  var firstLedger = assertLedger(1, 'apply', 'done').ledger;

  runPipeline(['--dsl-file', fixture('valid-platformer.dsl'), 'fixture-valid'], 'valid fixture second run');
  var secondWorld = readJson(WORLD_PATH);
  var secondProject = fs.readFileSync(PROJECT_PATH, 'utf8');
  var secondLedger = assertLedger(1, 'apply', 'done').ledger;

  assert(firstWorld.worldVersion === 1, 'first new project worldVersion should be 1');
  assert(secondWorld.worldVersion === 1, 'second new project worldVersion should reset to 1');
  assert(firstWorld.semanticHash === secondWorld.semanticHash, 'semanticHash should hit cache across equivalent new runs');
  assert(firstProject === secondProject, 'project.json should be byte-stable across equivalent new runs');
  assert(firstLedger.runs.length === 1 && secondLedger.runs.length === 1, 'new project should reset ledger to one run');
  return secondWorld.semanticHash;
}

// ── 2. Failure → repair batch ───────────────────────────────────────────────
function testFailureThenRepairBatch() {
  runPipeline(['--dsl-file', fixture('repair-missing-scene.initial.dsl'), 'fixture-repair-initial'], 'failure fixture');
  var failed = assertLedger(1, 'apply', 'repair').last;
  assert(failed.summary.failed === 1, 'failure fixture should have exactly one failed command');
  assert(failed.failed[0].message.indexOf('scene not found') >= 0, 'failure reason should mention scene not found');

  runPipeline(['--continue', '--dsl-file', fixture('repair-missing-scene.patch.dsl'), '--batch-label', 'repair_01', 'fixture-repair-patch'], 'repair fixture');
  var repaired = assertLedger(2, 'repair_01', 'done');
  assert(repaired.ledger.runs[0].summary.nextAction === 'repair', 'first run should remain failed repair signal');
  assert(repaired.last.summary.completed === 3, 'repair patch should complete three commands');
  assert(repaired.last.summary.failed === 0, 'repair patch should have no failures');

  var world = readJson(WORLD_PATH);
  assert(world.scenes.length === 1, 'repaired world should have one scene');
  assert(world.scenes[0].objects.some(function(obj) { return obj.name === 'Coin'; }), 'repaired world should contain Coin');
}

// ── 3. All command types success ─────────────────────────────────────────────
function testAllCommandsSuccess() {
  runPipeline(['--dsl-file', fixture('dsl-all-commands.dsl'), 'fixture-all-cmds'], 'all commands fixture');
  var world = readJson(WORLD_PATH);
  var project = readJson(PROJECT_PATH);
  var ledger = readJson(LEDGER_PATH);

  assert(world.scenes.length === 1, 'should have one scene');
  var scene = world.scenes[0];
  assert(scene.name === 'Game', 'scene should be named Game');
  assert(scene.objects.some(function(o) { return o.name === 'Player'; }), 'should have Player object');
  assert(scene.objects.some(function(o) { return o.name === 'ScoreLabel'; }), 'should have Text object');
  assert(scene.objects.some(function(o) { return o.kind === 'Text'; }), 'ScoreLabel should be described as Text kind');
  assert(scene.layers.some(function(l) { return l.name === 'HUD'; }), 'should have HUD layer');
  assert(world.globalVariables.some(function(v) { return v.name === 'Score'; }), 'should have Score variable');

  var projectScene = project.layouts[0];
  var playerObj = projectScene.objects.find(function(o) { return o.name === 'Player'; });
  assert(playerObj.fillColor.r === 255 && playerObj.fillColor.g === 136 && playerObj.fillColor.b === 68,
    'Player fillColor should be updated to #FF8844 via set object command');

  assert(projectScene.events.length >= 3, 'should have at least 3 events');
  assert(project.firstLayout === 'Game', 'firstLayout should be Game');

  var ledgerReport = ledger.runs[0].summary;
  assert(ledgerReport.completed === ledgerReport.total, 'all commands should complete');
  assert(ledgerReport.nextAction === 'done', 'nextAction should be done');

  // verify core output artifacts (HTML export is optional / requires GDJS runtime)
  assert(fs.existsSync(HTML_EXPORT_MANIFEST_PATH), 'should write html-export-manifest.json');
  assert(fs.existsSync(PROJECT_PATH), 'should write project.json');
  assert(fs.existsSync(path.join(OUTPUT_DIR, 'data.js')), 'should write data.js');
}

// ── 4. Duplicate scene fails recorded in ledger ──────────────────────────────
function testDuplicateSceneFails() {
  runPipeline(['--dsl-file', fixture('dsl-fail-duplicate-scene.dsl'), 'fixture-dup-scene'], 'duplicate scene');
  var last = assertLedger(1, 'apply', 'repair').last;
  assert(last.summary.failed >= 1, 'duplicate scene should record failures');
  var allMessages = last.failed.map(function(f) { return f.message; }).join(' ');
  assert(allMessages.indexOf('exists') >= 0, 'duplicate scene should report existence error');
}

// ── 5. Missing scene fails recorded in ledger ────────────────────────────────
function testMissingSceneFails() {
  runPipeline(['--dsl-file', fixture('dsl-fail-missing-scene.dsl'), 'fixture-missing-scene'], 'missing scene');
  var last = assertLedger(1, 'apply', 'repair').last;
  assert(last.summary.failed >= 1, 'missing scene should record failures');
  assert(last.failed[0].message.indexOf('scene not found') >= 0, 'missing scene should report scene not found');
}

// ── 6. Missing object fails recorded in ledger ───────────────────────────────
function testMissingObjectFails() {
  runPipeline(['--dsl-file', fixture('dsl-fail-missing-object.dsl'), 'fixture-missing-obj'], 'missing object');
  var last = assertLedger(1, 'apply', 'repair').last;
  assert(last.summary.failed >= 1, 'missing object should record failures');
  var allMessages = last.failed.map(function(f) { return f.message; }).join(' ');
  assert(allMessages.indexOf('object not found') >= 0, 'missing object should report object not found');
}

// ── 7. Unknown command fails recorded in ledger ──────────────────────────────
function testUnknownCommandFails() {
  runPipeline(['--dsl-file', fixture('dsl-fail-unknown-cmd.dsl'), 'fixture-unknown-cmd'], 'unknown command');
  var last = assertLedger(1, 'apply', 'repair').last;
  assert(last.summary.failed >= 1, 'unknown command should record failures');
  var allMessages = last.failed.map(function(f) { return f.message; }).join(' ');
  assert(allMessages.indexOf('unknown') >= 0, 'unknown command should report unknown error');
}

// ── 8. Event index out of bounds fails recorded in ledger ────────────────────
function testEventOutOfBoundsFails() {
  runPipeline(['--dsl-file', fixture('dsl-fail-event-oob.dsl'), 'fixture-event-oob'], 'event oob');
  var last = assertLedger(1, 'apply', 'repair').last;
  assert(last.summary.failed >= 1, 'event oob should record failures');
  var allMessages = last.failed.map(function(f) { return f.message; }).join(' ');
  assert(allMessages.indexOf('out of range') >= 0, 'event oob should report out of range');
}

// ── 9. Continue mode appends to existing project ─────────────────────────────
function testContinuePatch() {
  runPipeline(['--dsl-file', fixture('valid-platformer.dsl'), 'fixture-continue-base'], 'continue base');
  var baseWorld = readJson(WORLD_PATH);
  var baseLedgerRuns = readJson(LEDGER_PATH).runs.length;

  runPipeline(['--continue', '--dsl-file', fixture('dsl-continue-patch.dsl'), '--batch-label', 'patch_01', 'fixture-continue-patch'], 'continue patch');
  var world = readJson(WORLD_PATH);
  var project = readJson(PROJECT_PATH);
  var ledger = readJson(LEDGER_PATH);

  assert(world.worldVersion > baseWorld.worldVersion, 'continue should increment worldVersion');
  assert(ledger.runs.length === baseLedgerRuns + 1, 'continue should append ledger run');
  assert(ledger.runs[ledger.runs.length - 1].batchLabel === 'patch_01', 'continue should use requested batch label');

  var gameScene = world.scenes[0];
  assert(gameScene.objects.some(function(o) { return o.name === 'PowerUp'; }), 'continue should add PowerUp object');
  assert(world.globalVariables.some(function(v) { return v.name === 'Lives'; }), 'continue should add Lives variable');

  var projectScene = project.layouts[0];
  assert(projectScene.objects.some(function(o) { return o.name === 'PowerUp'; }), 'project should contain PowerUp');
  assert(projectScene.instances.some(function(i) { return i.name === 'PowerUp'; }), 'should place PowerUp instance');
}

// ── 10. Multiple scenes ──────────────────────────────────────────────────────
function testMultiScene() {
  runPipeline(['--dsl-file', fixture('dsl-multi-scene.dsl'), 'fixture-multi-scene'], 'multi-scene');
  var world = readJson(WORLD_PATH);
  var project = readJson(PROJECT_PATH);

  assert(world.scenes.length === 2, 'should have two scenes');
  assert(project.layouts.length === 2, 'project should have two layouts');

  var menuScene = project.layouts.find(function(s) { return s.name === 'Menu'; });
  var gameScene = project.layouts.find(function(s) { return s.name === 'Game'; });
  assert(menuScene, 'should have Menu scene');
  assert(gameScene, 'should have Game scene');

  assert(project.firstLayout === 'Menu', 'firstLayout should be Menu (first=true)');
  assert(menuScene.objects.some(function(o) { return o.name === 'Title'; }), 'Menu should have Title');
  assert(gameScene.objects.some(function(o) { return o.name === 'Player'; }), 'Game should have Player');
  assert(gameScene.objects.some(function(o) { return o.name === 'Ground'; }), 'Game should have Ground');
}

// ── 11. Variable operations ──────────────────────────────────────────────────
function testVariableOperations() {
  runPipeline(['--dsl-file', fixture('dsl-variable-ops.dsl'), 'fixture-var-ops'], 'variable ops');
  var world = readJson(WORLD_PATH);
  var project = readJson(PROJECT_PATH);

  // Score should be 200 (set to 100 then updated to 200)
  var scoreVar = project.variables.find(function(v) { return v.name === 'Score'; });
  assert(scoreVar && scoreVar.value === '200', 'Score should be updated to 200');

  // Lives should be 3
  var livesVar = project.variables.find(function(v) { return v.name === 'Lives'; });
  assert(livesVar && livesVar.value === '3', 'Lives should be 3');

  // Health should be deleted
  var healthVar = project.variables.find(function(v) { return v.name === 'Health'; });
  assert(!healthVar, 'Health variable should be deleted');

  // World globalVariables should match
  assert(world.globalVariables.some(function(v) { return v.name === 'Score'; }), 'world should track Score');
  assert(world.globalVariables.some(function(v) { return v.name === 'Lives'; }), 'world should track Lives');
  assert(!world.globalVariables.some(function(v) { return v.name === 'Health'; }), 'world should not track deleted Health');
}

// ── 12. Object property mutations ────────────────────────────────────────────
function testObjectProperties() {
  runPipeline(['--dsl-file', fixture('dsl-object-props.dsl'), 'fixture-obj-props'], 'object properties');
  var project = readJson(PROJECT_PATH);
  var scene = project.layouts[0];

  var player = scene.objects.find(function(o) { return o.name === 'Player'; });
  assert(player.type === 'PrimitiveDrawing::Drawer', 'Player should be a Drawer');
  assert(player.fillColor.r === 255 && player.fillColor.g === 0 && player.fillColor.b === 0,
    'Player color should be #FF0000 after set object');
  assert(player.outlineSize === 3, 'Player outline should be 3 after set object');

  var hudText = scene.objects.find(function(o) { return o.name === 'HudText'; });
  assert(hudText.type === 'TextObject::Text', 'HudText should be a Text object');
  assert(hudText.content.characterSize === 24, 'HudText size should be 24');
}

// ── Runner ───────────────────────────────────────────────────────────────────
function main() {
  var passed = 0;
  var failed = 0;
  var tests = [];

  function run(testFn, name) {
    tests.push({ fn: testFn, name: name });
  }

  run(testValidNewProjectCacheHit, 'cache hit');
  run(testFailureThenRepairBatch, 'repair batch');
  run(testAllCommandsSuccess, 'all commands success');
  run(testDuplicateSceneFails, 'duplicate scene fails fast');
  run(testMissingSceneFails, 'missing scene fails fast');
  run(testMissingObjectFails, 'missing object fails fast');
  run(testUnknownCommandFails, 'unknown command fails fast');
  run(testEventOutOfBoundsFails, 'event oob fails fast');
  run(testContinuePatch, 'continue patch appends');
  run(testMultiScene, 'multi-scene');
  run(testVariableOperations, 'variable operations');
  run(testObjectProperties, 'object properties');

  console.log('[DslFixtureTest] timeout guard ' + TIMEOUT_MS + 'ms, ' + tests.length + ' tests');

  tests.forEach(function(t) {
    try {
      t.fn();
      console.log('  OK ' + t.name);
      passed++;
    } catch (e) {
      console.log('  FAIL ' + t.name + ': ' + e.message);
      failed++;
    }
  });

  console.log('[DslFixtureTest] ' + passed + '/' + tests.length + ' passed');
  if (failed > 0) {
    console.error('[DslFixtureTest] ' + failed + ' test(s) failed');
    process.exit(1);
  }
}

main();
