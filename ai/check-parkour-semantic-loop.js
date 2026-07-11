var assert = require('assert');

var intentCompiler = require('./intent-compiler');
var pipeline = require('./pipeline');
var projectWorld = require('./project-world');
var semanticFeedback = require('./semantic-feedback');

function makeObjectBounds(project) {
  var bounds = {};
  (project.layouts || []).forEach(function(scene) {
    (scene.instances || []).forEach(function(instance) {
      if (!instance.name) return;
      bounds[instance.name] = {
        x: Number(instance.x || 0),
        y: Number(instance.y || 0),
        width: Number(instance.width || 0),
        height: Number(instance.height || 0),
      };
    });
  });
  return bounds;
}

async function executeBridgePlan(project, bridgePlan, batchLabel) {
  var results = [];
  var ops = pipeline.parseTargetPlan(bridgePlan.targetPlanText);
  for (var i = 0; i < ops.length; i++) {
    var result = await pipeline.execute(project, ops[i]);
    results.push({
      index: i,
      commandId: batchLabel + '_' + String(i + 1).padStart(3, '0'),
      ok: !!result.ok,
      label: bridgePlan.targetPlanLines[i],
      message: result.msg,
    });
    assert(result.ok, batchLabel + ' command should execute: ' + bridgePlan.targetPlanLines[i] + ' -> ' + result.msg);
  }
  return results;
}

function countInstances(project, objectName) {
  var count = 0;
  (project.layouts || []).forEach(function(scene) {
    (scene.instances || []).forEach(function(instance) {
      if (instance.name === objectName) count++;
    });
  });
  return count;
}

function extractTrailCount(line) {
  var match = String(line || '').match(/count (\d+)$/);
  return match ? Number(match[1]) : null;
}

async function main() {
  var createIntent = [
    'make a mobile platformer',
    'add joystick controls Player near screen bottom-left',
    'add jump button controls Player near screen bottom-right',
    'place coins near Player front as trail count 3',
    'place enemies near Player far front as guard count 3',
  ].join('\n');

  var createCompiled = intentCompiler.compileIntentDsl(createIntent, {
    placementContext: {
      objectBounds: {
        Player: { x: 100, y: 400, width: 32, height: 48 },
      },
    },
  });
  var project = pipeline.emptyProject('ParkourSemanticLoop');
  var createResults = await executeBridgePlan(project, createCompiled.bridgePlan, 'parkour_create');
  var createWorld = projectWorld.buildProjectWorld(project, null, {
    intentDslText: createIntent,
    intentGraph: createCompiled.graph,
    placementPlan: createCompiled.placementPlan,
    bridgePlan: createCompiled.bridgePlan,
    contracts: createCompiled.contracts,
    compileResultCard: createCompiled.resultCard,
  });
  var createReport = projectWorld.makeExecutionReport({
    previousWorld: null,
    world: createWorld,
    intent: {
      intentDslText: createIntent,
      intentGraph: createCompiled.graph,
      placementPlan: createCompiled.placementPlan,
      bridgePlan: createCompiled.bridgePlan,
      contracts: createCompiled.contracts,
      compileResultCard: createCompiled.resultCard,
    },
    targetPlanLines: createCompiled.bridgePlan.targetPlanLines,
    commandResults: createResults,
    runIndex: 1,
    batchLabel: 'parkour_create',
  });

  assert.strictEqual(createReport.summary.nextAction, 'done', 'create should finish before probe feedback');
  assert.strictEqual(countInstances(project, 'Coin'), 6, 'create should include module coins plus semantic coin trail');
  assert.strictEqual(countInstances(project, 'Enemy'), 4, 'create should include the base enemy and the requested guard group');

  var feedback = semanticFeedback.analyzeSemanticFeedback({
    projectWorld: createWorld,
    executionReport: createReport,
    probeReport: {
      summary: {
        mode: 'single-player',
        ticks: 600,
        averageDeathSeconds: 8,
      },
      issues: [
        {
          kind: 'probe_reachability',
          severity: 'high',
          repairVerb: 'increase_presence',
          repair: { subject: 'coins', anchor: 'Player', direction: 'front', pattern: 'trail', delta: 2 },
        },
        {
          kind: 'probe_control_layout',
          severity: 'medium',
          repairVerb: 'increase_feedback',
          repair: { subject: 'jump button', direction: 'above', amount: 'slightly' },
        },
      ],
    },
  });

  assert.strictEqual(feedback.summary.nextAction, 'repair-intent', 'feedback should produce repair intent');
  var coinRepairLine = feedback.repairIntentDslLines.find(function(line) {
    return /^place coins near Player front as trail count \d+$/.test(line);
  });
  var coinRepairCount = extractTrailCount(coinRepairLine);
  assert(coinRepairCount > countInstances(project, 'Coin'), 'feedback should repair collectible density from current world instances');
  assert(feedback.repairIntentDslLines.indexOf('adjust JumpButton placement above slightly') >= 0, 'feedback should repair control placement semantically');
  assert(feedback.repairIntentDslText.indexOf('x=') < 0, 'feedback repair must not contain coordinates');

  var repairCompiled = intentCompiler.compileIntentDsl(feedback.repairIntentDslText, {
    baseWorld: createWorld,
    placementContext: {
      objectBounds: makeObjectBounds(project),
    },
  });
  assert.strictEqual(repairCompiled.graph.modules.length, 0, 'repair should be an incremental semantic patch, not a full game replay');
  assert(repairCompiled.graph.edits.some(function(edit) {
    return edit.subject === 'JumpButton' && edit.direction === 'above';
  }), 'repair graph should contain semantic placement edit');
  assert(repairCompiled.graph.placements.some(function(placement) {
    return placement.subject === 'CoinsGroup' && placement.count === coinRepairCount;
  }), 'repair graph should contain updated semantic coin trail count');

  var repairResults = await executeBridgePlan(project, repairCompiled.bridgePlan, 'parkour_repair');
  var repairWorld = projectWorld.buildProjectWorld(project, createWorld, {
    intentDslText: feedback.repairIntentDslText,
    intentGraph: repairCompiled.graph,
    placementPlan: repairCompiled.placementPlan,
    bridgePlan: repairCompiled.bridgePlan,
    contracts: repairCompiled.contracts,
    compileResultCard: repairCompiled.resultCard,
  });
  var repairReport = projectWorld.makeExecutionReport({
    previousWorld: createWorld,
    world: repairWorld,
    intent: {
      intentDslText: feedback.repairIntentDslText,
      intentGraph: repairCompiled.graph,
      placementPlan: repairCompiled.placementPlan,
      bridgePlan: repairCompiled.bridgePlan,
      contracts: repairCompiled.contracts,
      compileResultCard: repairCompiled.resultCard,
    },
    targetPlanLines: repairCompiled.bridgePlan.targetPlanLines,
    commandResults: repairResults,
    runIndex: 2,
    batchLabel: 'parkour_repair',
  });

  assert.strictEqual(repairReport.summary.nextAction, 'done', 'semantic repair should execute cleanly');
  assert.strictEqual(countInstances(project, 'Coin'), coinRepairCount, 'repair should merge reachable collectible trail instances to the target count');
  assert.notStrictEqual(repairWorld.semanticHash, createWorld.semanticHash, 'repair should change semantic world state');
  assert.strictEqual(repairWorld.worldVersion, createWorld.worldVersion + 1, 'repair should advance ProjectWorld version');
  assert(JSON.stringify(projectWorld.sanitizeProjectWorldForIntentPrompt(repairWorld)).indexOf('"x"') < 0, 'sanitized repaired world must hide coordinates');

  console.log('[ParkourSemanticLoop] create -> feedback -> repair semantic loop passed');
}

main().catch(function(error) {
  console.error(error);
  process.exit(1);
});
