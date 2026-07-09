var assert = require('assert');
var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');

var semanticFeedback = require('./semantic-feedback');

var ROOT = path.join(__dirname, '..');
var OUTPUT_DIR = path.join(ROOT, 'output');

function run(args, label) {
  var result = childProcess.spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(label + ' failed\nSTDOUT:\n' + result.stdout + '\nSTDERR:\n' + result.stderr);
  }
  return result.stdout;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function scene() {
  return readJson('output/project.json').layouts[0];
}

function countInstances(objectName) {
  return (scene().instances || []).filter(function(instance) {
    return instance.name === objectName;
  }).length;
}

function findInstance(objectName) {
  return (scene().instances || []).find(function(instance) {
    return instance.name === objectName;
  });
}

function lastRun() {
  var ledger = readJson('output/execution-ledger.json');
  return ledger.runs[ledger.runs.length - 1];
}

function assertHtmlRuntimeScripts() {
  var html = readText('output/game.html');
  assert(html.indexOf('intent-runtime.js') >= 0, 'real output game.html should load intent-runtime.js');
  assert(html.indexOf('tick-runtime.js') >= 0, 'real output game.html should load tick-runtime.js');
}

function main() {
  run([
    'ai/pipeline.js',
    '--intent-dsl-file',
    'ai/fixtures/intent-parkour-real.dsl',
    '--batch-label',
    'parkour_create_real_check',
  ], 'real parkour create');

  var createRun = lastRun();
  assert.strictEqual(createRun.summary.nextAction, 'done', 'real create should be done');
  assert.strictEqual(createRun.summary.completed, 31, 'real create should execute semantic trail commands');
  assert.strictEqual(countInstances('Coin'), 6, 'real create should include module coins plus semantic coin trail');
  assertHtmlRuntimeScripts();
  var initialJumpButton = findInstance('JumpButton');
  assert(initialJumpButton, 'real create should place JumpButton');

  var feedback = semanticFeedback.analyzeSemanticFeedback({
    projectWorld: readJson('output/project-world.json'),
    executionReport: createRun,
    probeReport: {
      summary: { mode: 'single-player-real-output', ticks: 600 },
      issues: [
        { kind: 'probe_reachability', severity: 'high', repair: { action: 'increase-count', subject: 'coins', anchor: 'Player', direction: 'front', pattern: 'trail', delta: 2 } },
        { kind: 'probe_control_layout', severity: 'medium', repair: { action: 'placement-adjust', subject: 'jump button', direction: 'above', amount: 'slightly' } },
      ],
    },
  });
  assert.strictEqual(feedback.summary.nextAction, 'repair-intent', 'real feedback should request repair intent');
  assert(feedback.repairIntentDslText.indexOf('x=') < 0, 'real feedback repair should not contain coordinates');
  fs.writeFileSync(path.join(OUTPUT_DIR, 'parkour-semantic-feedback.json'), JSON.stringify(feedback, null, 2));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'parkour-repair.intent.dsl'), feedback.repairIntentDslText);

  run([
    'ai/pipeline.js',
    '--continue',
    '--intent-dsl-file',
    'output/parkour-repair.intent.dsl',
    '--batch-label',
    'parkour_repair_real_check',
  ], 'real parkour repair');

  var repairRun = lastRun();
  assert.strictEqual(repairRun.summary.nextAction, 'done', 'real repair should be done');
  assert.strictEqual(repairRun.summary.completed, 6, 'real repair should execute five coin placements plus one placement edit');
  assert.strictEqual(countInstances('Coin'), 11, 'real repair should increase actual coin instances');
  var repairedJumpButton = findInstance('JumpButton');
  assert(repairedJumpButton.y < initialJumpButton.y, 'real repair should move JumpButton upward');
  assert.notStrictEqual(repairRun.targetSemanticHash, createRun.targetSemanticHash, 'real repair should change semantic hash');
  assertHtmlRuntimeScripts();

  console.log('[ParkourRealSemanticLoop] real pipeline create -> feedback -> repair passed');
}

main();
