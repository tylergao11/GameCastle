var fs = require('fs');
var path = require('path');
var dictionary = require('../../packages/semantic/src/capability-semantic-dictionary');
var benchmark = require('../../tests/benchmarks/snake-semantic-benchmark');
var replaySuite = require('./replay-semantic-live-suite');
var repositoryPath = require('../shared/repository-path');

function fail(message) { throw new Error(message); }
function argument(name) { var prefix = '--' + name + '='; var found = process.argv.filter(function(item) { return item.indexOf(prefix) === 0; })[0]; return found ? found.slice(prefix.length) : null; }
async function main() {
  var files = process.argv.slice(2).filter(function(item) { return item.indexOf('--') !== 0; }).map(function(item) { return repositoryPath.fromCommandLine(item, 'run file'); });
  if (!files.length) fail('Usage: node scripts/semantic/evaluate-snake-semantic-benchmark.js [--output=report.json] [--min-task-pass-rate=0..1] <run.json> [...]');
  if (files.length !== benchmark.tasks.length) fail('Benchmark requires exactly ' + benchmark.tasks.length + ' canonical task artifacts; received ' + files.length + '.');
  var index = dictionary.loadIndex(), runs = [];
  var seen = Object.create(null);
  for (var i = 0; i < files.length; i++) {
    var execution = await replaySuite.replay(files[i], index);
    var probe = execution.record.probe || {};
    if (probe.benchmarkId !== benchmark.contract.benchmarkId) fail(files[i].locator + ' does not identify benchmark ' + benchmark.contract.benchmarkId + '.');
    var task = benchmark.taskById(probe.benchmarkTaskId);
    if (!task) fail(files[i].locator + ' does not identify one canonical benchmark task.');
    if (seen[task.id]) fail('Benchmark task artifact is duplicated: ' + task.id + '.');
    seen[task.id] = true;
    if (probe.task !== task.task || (probe.seedFile || null) !== task.seedFile) fail(files[i].locator + ' task or seed differs from contract task ' + task.id + '.');
    runs.push(Object.assign({ file: files[i].locator, runtime: execution.report }, benchmark.evaluate(task, execution)));
  }
  benchmark.tasks.forEach(function(task) { if (!seen[task.id]) fail('Benchmark task artifact is missing: ' + task.id + '.'); });
  runs.sort(function(left, right) { return benchmark.tasks.findIndex(function(task) { return task.id === left.taskId; }) - benchmark.tasks.findIndex(function(task) { return task.id === right.taskId; }); });
  var passed = runs.filter(function(run) { return run.passed; }).length;
  var semanticPassed = runs.filter(function(run) { return run.semanticPassed; }).length, runtimePassed = runs.filter(function(run) { return run.runtimePassed; }).length;
  var report = { schemaVersion: 2, reportKind: 'snake-semantic-task-benchmark', benchmarkId: benchmark.contract.benchmarkId, generatedAt: new Date().toISOString(), summary: { taskCount: runs.length, semanticPassedTasks: semanticPassed, semanticPassRate: semanticPassed / runs.length, runtimePassedTasks: runtimePassed, runtimePassRate: runtimePassed / runs.length, passedTasks: passed, taskPassRate: passed / runs.length }, runs: runs };
  var output = argument('output');
  if (output) { var outputFile = repositoryPath.fromCommandLine(output, '--output'); fs.mkdirSync(path.dirname(outputFile.absolutePath), { recursive: true }); fs.writeFileSync(outputFile.absolutePath, JSON.stringify(report, null, 2), 'utf8'); report.outputFile = outputFile.locator; }
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  var minimum = argument('min-task-pass-rate');
  if (minimum !== null) { minimum = Number(minimum); if (!Number.isFinite(minimum) || minimum < 0 || minimum > 1) fail('--min-task-pass-rate must be between 0 and 1.'); if (report.summary.taskPassRate < minimum) process.exitCode = 1; }
}

main().catch(function(error) { process.stderr.write('[SnakeSemanticBenchmark] ' + error.message + '\n'); process.exit(1); });
