var assert = require('assert');
var childProcess = require('child_process');
var path = require('path');
var benchmark = require('../benchmarks/snake-semantic-benchmark');

var ids = benchmark.tasks.map(function(task) { return task.id; });
assert.strictEqual(ids.length, 6, 'benchmark owns exactly six canonical layered tasks');
assert.strictEqual(new Set(ids).size, ids.length, 'canonical benchmark task ids are unique');

// Source has objectTypeRef only; kind is derived once (no Draft-only kind dual truth).
assert.strictEqual(benchmark.entityKindOf({ objectTypeRef: 'gdjs://object/Sprite::Sprite' }), 'sprite');
assert.strictEqual(benchmark.entityKindOf({ objectTypeRef: null }), 'state');
assert.strictEqual(benchmark.entityKindOf({ kind: 'text', objectTypeRef: null }), 'text');
assert.strictEqual(
  benchmark.matchEntity(
    { semanticId: 'snakeBody', roles: ['body'], objectTypeRef: 'gdjs://object/Sprite::Sprite' },
    { semanticIdPattern: '^snake[-_. ]?body$', kind: 'sprite', count: 1 }
  ),
  true,
  'requiredEntities match Source entities via objectTypeRef-derived kind'
);
assert.strictEqual(benchmark.countPass(5, { minimum: 3, maximum: 8 }), true);
assert.strictEqual(benchmark.countPass(6, { exact: 6 }), true);
assert.strictEqual(benchmark.countPass(5, { exact: 6 }), false);
// loss-restart budget style: open composite uses min/max only
var loss = benchmark.taskById('loss-restart');
assert.strictEqual(loss.changeBudget.events.exact, undefined);
assert.ok(loss.changeBudget.events.minimum >= 3);
assert.ok(loss.changeBudget.events.maximum >= loss.changeBudget.events.minimum);

function call(kind, phase, protocolVersion, ok) { return { kind: kind, phase: phase, protocolVersion: protocolVersion, result: { ok: ok !== false } }; }
var valid = [
  call('task-plan', 'planner', benchmark.contract.requiredProtocolVersions.planner),
  call('draft-write', 'task', benchmark.contract.requiredProtocolVersions.executor)
];
assert.strictEqual(benchmark.closedLoopPhases(valid, benchmark.contract.requiredRuntimePhases), true, 'canonical planner-task loop passes with deterministic Runtime completion');
assert.strictEqual(benchmark.closedLoopPhases(valid.slice(1), benchmark.contract.requiredRuntimePhases), false, 'missing TaskPlan cannot pass');
assert.strictEqual(benchmark.closedLoopPhases([valid[0], call('task-retrieve', 'task', benchmark.contract.requiredProtocolVersions.executor), valid[1]], benchmark.contract.requiredRuntimePhases), false, 'model-driven retrieve phase cannot enter the closed loop');

var evaluator = path.join(__dirname, '..', '..', 'scripts', 'semantic', 'evaluate-snake-semantic-benchmark.js');
var partial = childProcess.spawnSync(process.execPath, [evaluator, 'only-one-artifact.json'], { cwd: path.join(__dirname, '..', '..'), encoding: 'utf8' });
assert.notStrictEqual(partial.status, 0, 'partial benchmark suite is rejected');
assert((partial.stderr || '').indexOf('requires exactly 6 canonical task artifacts') >= 0, 'partial suite failure names the six-task coverage gate');

console.log('[SnakeSemanticBenchmark] v2 closed-loop phases, six-task uniqueness, and partial-suite rejection passed');
