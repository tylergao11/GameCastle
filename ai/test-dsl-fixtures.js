var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var PIPELINE = path.join(__dirname, 'pipeline.js');
var OUTPUT_DIR = path.join(ROOT, 'output');
var WORLD_PATH = path.join(OUTPUT_DIR, 'project-world.json');
var LEDGER_PATH = path.join(OUTPUT_DIR, 'execution-ledger.json');
var PROJECT_PATH = path.join(OUTPUT_DIR, 'project.json');
var TIMEOUT_MS = 15000;

function fixture(name) {
  return path.join(__dirname, 'fixtures', name);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runPipeline(args, label) {
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
  if (result.status !== 0) {
    throw new Error(label + ' exited ' + result.status + '\nSTDOUT:\n' + result.stdout + '\nSTDERR:\n' + result.stderr);
  }
  if (elapsed >= TIMEOUT_MS) {
    throw new Error(label + ' reached timeout guard');
  }
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    elapsed: elapsed,
  };
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

function main() {
  console.log('[FixtureTest] timeout guard ' + TIMEOUT_MS + 'ms per pipeline run');
  var hash = testValidNewProjectCacheHit();
  console.log('[FixtureTest] cache hit semanticHash=' + hash);
  testFailureThenRepairBatch();
  console.log('[FixtureTest] repair batch guard passed');
  console.log('[FixtureTest] all passed');
}

main();
