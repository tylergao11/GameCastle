var assert = require('assert');
var childProcess = require('child_process');
var path = require('path');
var benchmark = require('../../benchmarks/snake-semantic-benchmark');

var ids = benchmark.tasks.map(function(task) { return task.id; });
assert.strictEqual(ids.length, 6, 'benchmark owns exactly six canonical layered tasks');
assert.strictEqual(new Set(ids).size, ids.length, 'canonical benchmark task ids are unique');

function call(kind, phase, protocolVersion, ok) { return { kind: kind, phase: phase, protocolVersion: protocolVersion, result: { ok: ok !== false } }; }
var valid = [
  call('task-plan', 'planner', benchmark.contract.requiredProtocolVersions.planner),
  call('draft-write', 'task', benchmark.contract.requiredProtocolVersions.executor),
  call('completion', 'finalization', benchmark.contract.requiredProtocolVersions.executor)
];
assert.strictEqual(benchmark.closedLoopPhases(valid, benchmark.contract.requiredRuntimePhases), true, 'canonical planner-task-completion loop passes');
assert.strictEqual(benchmark.closedLoopPhases(valid.slice(1), benchmark.contract.requiredRuntimePhases), false, 'missing TaskPlan cannot pass');
assert.strictEqual(benchmark.closedLoopPhases([valid[0], call('task-retrieve', 'task', benchmark.contract.requiredProtocolVersions.executor), valid[1], valid[2]], benchmark.contract.requiredRuntimePhases), false, 'model-driven retrieve phase cannot enter the closed loop');

var evaluator = path.join(__dirname, '..', '..', 'scripts', 'evaluate-snake-semantic-benchmark.js');
var partial = childProcess.spawnSync(process.execPath, [evaluator, 'only-one-artifact.json'], { cwd: path.join(__dirname, '..', '..'), encoding: 'utf8' });
assert.notStrictEqual(partial.status, 0, 'partial benchmark suite is rejected');
assert((partial.stderr || '').indexOf('requires exactly 6 canonical task artifacts') >= 0, 'partial suite failure names the six-task coverage gate');

console.log('[SnakeSemanticBenchmark] v2 closed-loop phases, six-task uniqueness, and partial-suite rejection passed');
