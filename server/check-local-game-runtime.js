var assert = require('assert');
var crypto = require('crypto');
var fs = require('fs');
var os = require('os');
var path = require('path');
var net = require('net');

var runtimeModule = require('./local-runtime');
var pipelineRunnerModule = require('./local-runtime/pipeline-runner');

function sha1(filePath) {
  return crypto.createHash('sha1').update(fs.readFileSync(filePath)).digest('hex');
}

function writePlayableOutput(outputDir, marker, runNumber) {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'game.html'), '<!doctype html><script src="data.js"></script><p>' + marker + '</p>', 'utf8');
  fs.writeFileSync(path.join(outputDir, 'data.js'), 'window.__gamecastleMarker=' + JSON.stringify(marker) + ';', 'utf8');
  fs.writeFileSync(path.join(outputDir, 'project.json'), JSON.stringify({ marker: marker }), 'utf8');
  fs.writeFileSync(path.join(outputDir, 'project-world.json'), JSON.stringify({ worldVersion: runNumber, semanticHash: 'semantic-' + runNumber }), 'utf8');
  fs.writeFileSync(path.join(outputDir, 'execution-ledger.json'), JSON.stringify({ runs: [{ runId: 'fake-' + runNumber, summary: { nextAction: 'done' } }] }), 'utf8');
  fs.writeFileSync(path.join(outputDir, 'html-export-manifest.json'), JSON.stringify({ schemaVersion: 1, target: 'html', scriptFiles: ['data.js'], assetFiles: [] }), 'utf8');
}

function createFakeRunner(outputDir) {
  var runNumber = 0;
  return {
    start: function(request) {
      var cancelled = false;
      var promise = new Promise(function(resolve, reject) {
        setTimeout(function() {
          if (cancelled) {
            var cancelledError = new Error('cancelled');
            cancelledError.code = 'RUN_CANCELLED';
            reject(cancelledError);
            return;
          }
          request.onStage({ id: 'understanding', label: 'Understanding the idea' }, '[Stage1]');
          if (request.intent === 'fail this build') {
            fs.writeFileSync(path.join(outputDir, 'game.html'), 'partial', 'utf8');
            var error = new Error('Synthetic pipeline failure');
            error.code = 'PIPELINE_FAILED';
            reject(error);
            return;
          }
          if (request.intent === 'no change') {
            resolve({ code: 0, noChange: true, tail: [] });
            return;
          }
          runNumber += 1;
          writePlayableOutput(outputDir, request.intent, runNumber);
          request.onStage({ id: 'playtesting', label: 'Playtesting the result' }, '[SemanticPlaytest]');
          resolve({ code: 0, noChange: false, tail: [] });
        }, request.intent === 'slow build' ? 240 : 80);
      });
      return {
        processId: null,
        promise: promise,
        cancel: function() { cancelled = true; },
      };
    },
  };
}

async function waitFor(baseUrl, predicate) {
  var deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    var response = await fetch(baseUrl + '/api/runtime');
    var snapshot = await response.json();
    if (predicate(snapshot)) return snapshot;
    await new Promise(function(resolve) { setTimeout(resolve, 20); });
  }
  throw new Error('Timed out waiting for runtime state.');
}

async function postRun(baseUrl, intent, mode) {
  return fetch(baseUrl + '/api/runtime/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:5173' },
    body: JSON.stringify({ intent: intent, mode: mode }),
  });
}

async function main() {
  var tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-local-runtime-'));
  var outputDir = path.join(tempRoot, 'output');
  var dataDir = path.join(tempRoot, '.gamecastle');
  var port = await new Promise(function(resolve, reject) {
    var probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', function() {
      var selected = probe.address().port;
      probe.close(function() { resolve(selected); });
    });
  });
  var runtime = runtimeModule.createRuntime({
    root: tempRoot,
    outputDir: outputDir,
    dataDir: dataDir,
    runner: createFakeRunner(outputDir),
    playBaseUrl: 'http://localhost:' + port,
  });
  await new Promise(function(resolve) { runtime.server.listen(port, '127.0.0.1', resolve); });
  var baseUrl = 'http://127.0.0.1:' + port;

  try {
    var initial = await (await fetch(baseUrl + '/api/runtime')).json();
    assert.strictEqual(initial.status, 'idle');
    assert.strictEqual(initial.artifact, null);

    var rejectedOrigin = await fetch(baseUrl + '/api/runtime/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', Origin: 'http://localhost:' + port },
      body: JSON.stringify({ intent: 'must not enter coordinator', mode: 'create' }),
    });
    assert.strictEqual(rejectedOrigin.status, 403, 'play origin must not mutate Runtime API');
    var rejectedContentType = await fetch(baseUrl + '/api/runtime/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', Origin: 'http://127.0.0.1:5173' },
      body: JSON.stringify({ intent: 'must be json', mode: 'create' }),
    });
    assert.strictEqual(rejectedContentType.status, 415, 'Runtime mutations must require application/json');

    for (var malformedPath of ['/api/runtime/runs/%', '/api/runtime/runs/%/events']) {
      var malformed = await fetch(baseUrl + malformedPath);
      assert.strictEqual(malformed.status, 400, 'malformed encoded path must be rejected without crashing: ' + malformedPath);
    }
    assert.strictEqual((await fetch(baseUrl + '/api/runtime/health')).status, 200, 'runtime must stay alive after malformed paths');

    var invalidMode = await postRun(baseUrl, 'do something', 'legacy');
    assert.strictEqual(invalidMode.status, 400);
    assert.strictEqual((await invalidMode.json()).error.code, 'INVALID_MODE');

    var missingContinue = await postRun(baseUrl, 'change it', 'continue');
    assert.strictEqual(missingContinue.status, 409);
    assert.strictEqual((await missingContinue.json()).error.code, 'CONTINUE_STATE_MISSING');

    var accepted = await postRun(baseUrl, 'first real game', 'create');
    assert.strictEqual(accepted.status, 202);
    var active = await accepted.json();
    assert.strictEqual(active.status, 'running');

    var busy = await postRun(baseUrl, 'double submit', 'create');
    assert.strictEqual(busy.status, 409);
    assert.strictEqual((await busy.json()).error.code, 'RUN_BUSY');

    var events = await fetch(baseUrl + '/api/runtime/runs/' + active.runId + '/events');
    assert.strictEqual(events.status, 200);
    assert(String(events.headers.get('content-type')).indexOf('text/event-stream') >= 0);
    await events.body.cancel();

    var first = await waitFor(baseUrl, function(snapshot) { return snapshot.status === 'succeeded'; });
    assert.strictEqual(first.outcome, 'committed');
    assert(first.artifact.version.indexOf('run-') === 0);
    var firstUrl = first.artifact.playUrl;
    var firstHtml = await fetch(firstUrl);
    assert.strictEqual(firstHtml.status, 200);
    assert((await firstHtml.text()).indexOf('first real game') >= 0);
    var firstHead = await fetch(firstUrl, { method: 'HEAD' });
    assert.strictEqual(firstHead.status, 200);
    assert.strictEqual((await firstHead.text()).length, 0);
    var malformedPlay = await fetch('http://localhost:' + port + '/play/%/game.html');
    assert.strictEqual(malformedPlay.status, 400, 'malformed play version must be rejected without crashing');
    assert.strictEqual((await fetch(baseUrl + '/api/runtime/health')).status, 200, 'runtime must stay alive after malformed play path');

    var privateLedger = await fetch('http://localhost:' + port + '/play/' + first.artifact.version + '/execution-ledger.json');
    assert.strictEqual(privateLedger.status, 404);
    var traversal = await fetch('http://localhost:' + port + '/play/' + first.artifact.version + '/%2e%2e%2fexecution-ledger.json');
    assert.notStrictEqual(traversal.status, 200);

    var changedAccepted = await postRun(baseUrl, 'make coins denser', 'continue');
    assert.strictEqual(changedAccepted.status, 202);
    var changed = await waitFor(baseUrl, function(snapshot) { return snapshot.status === 'succeeded' && snapshot.intent === 'make coins denser'; });
    assert.strictEqual(changed.outcome, 'committed');
    assert.notStrictEqual(changed.artifact.version, first.artifact.version);
    assert.strictEqual((await fetch(firstUrl)).status, 200, 'previous immutable release should stay readable');

    var noChangeAccepted = await postRun(baseUrl, 'no change', 'continue');
    assert.strictEqual(noChangeAccepted.status, 202);
    var noChange = await waitFor(baseUrl, function(snapshot) { return snapshot.status === 'succeeded' && snapshot.intent === 'no change'; });
    assert.strictEqual(noChange.outcome, 'no_change');
    assert.strictEqual(noChange.artifact.version, changed.artifact.version);

    var failedAccepted = await postRun(baseUrl, 'fail this build', 'continue');
    assert.strictEqual(failedAccepted.status, 202);
    var workspaceHashBeforeFailure = sha1(path.join(outputDir, 'game.html'));
    var failed = await waitFor(baseUrl, function(snapshot) { return snapshot.status === 'failed' && snapshot.intent === 'fail this build'; });
    assert.strictEqual(failed.artifact.version, changed.artifact.version);
    assert.strictEqual(failed.error.detail, null, 'public RunState must not expose pipeline diagnostics');
    assert.strictEqual((await fetch(changed.artifact.playUrl)).status, 200);
    assert.strictEqual(sha1(path.join(outputDir, 'game.html')), workspaceHashBeforeFailure, 'failed run must restore the exact mutable workspace');
    assert(fs.readFileSync(path.join(dataDir, 'runtime-diagnostics.jsonl'), 'utf8').indexOf('Synthetic pipeline failure') >= 0, 'private diagnostic log must retain the failure detail');

    var slowAccepted = await postRun(baseUrl, 'slow build', 'continue');
    var slow = await slowAccepted.json();
    var cancelResponse = await fetch(baseUrl + '/api/runtime/runs/' + slow.runId + '/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:5173' },
      body: '{}',
    });
    assert.strictEqual(cancelResponse.status, 202);
    var cancelled = await cancelResponse.json();
    assert.strictEqual(cancelled.status, 'cancelled');
    assert.strictEqual(cancelled.artifact.version, changed.artifact.version);

    assert.strictEqual((await fetch(baseUrl + '/play/' + changed.artifact.version + '/game.html')).status, 403, 'API origin must not serve playable files');
    assert.strictEqual((await fetch('http://localhost:' + port + '/api/runtime')).status, 403, 'play origin must not serve Runtime API');

    var noChangeScript = path.join(tempRoot, 'no-change-pipeline.js');
    fs.writeFileSync(noChangeScript, "console.log('[Done] No DSL changes to apply');", 'utf8');
    var directRunner = pipelineRunnerModule.createPipelineRunner({ cwd: tempRoot, scriptPath: noChangeScript, timeoutMs: 1000 });
    var directNoChange = await directRunner.start({ intent: 'ignored', mode: 'continue', onLine: function() {}, onStage: function() {} }).promise;
    assert.strictEqual(directNoChange.noChange, true, 'PipelineRunner must classify the real no-change stdout contract');

    var timeoutScript = path.join(tempRoot, 'timeout-pipeline.js');
    fs.writeFileSync(timeoutScript, 'setTimeout(function(){}, 5000);', 'utf8');
    var timeoutRunner = pipelineRunnerModule.createPipelineRunner({ cwd: tempRoot, scriptPath: timeoutScript, timeoutMs: 80 });
    var timeoutError = null;
    try {
      await timeoutRunner.start({ intent: 'ignored', mode: 'create', onLine: function() {}, onStage: function() {} }).promise;
    } catch (error) {
      timeoutError = error;
    }
    assert(timeoutError, 'PipelineRunner timeout must reject');
    assert.strictEqual(timeoutError.code, 'RUN_TIMEOUT');

    var corruptRoot = path.join(tempRoot, 'corrupt-release-case');
    var corruptData = path.join(corruptRoot, '.gamecastle');
    var corruptRelease = path.join(corruptData, 'releases', 'broken');
    fs.mkdirSync(corruptRelease, { recursive: true });
    fs.writeFileSync(path.join(corruptRelease, 'release.json'), JSON.stringify({ schemaVersion: 1, version: 'broken', files: ['game.html'] }), 'utf8');
    fs.writeFileSync(path.join(corruptData, 'local-runtime-state.json'), JSON.stringify({
      schemaVersion: 1,
      sequence: 1,
      projectId: 'active-local-project',
      health: 'ready',
      runId: 'old-run',
      mode: 'create',
      intent: 'old intent',
      status: 'succeeded',
      outcome: 'committed',
      stage: { id: 'complete', label: 'Game ready', message: 'old' },
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      error: null,
      artifact: { version: 'broken', playUrl: '/play/broken/game.html', worldVersion: 1, semanticHash: 'old' },
    }), 'utf8');
    var corruptRuntime = runtimeModule.createRuntime({
      root: corruptRoot,
      outputDir: path.join(corruptRoot, 'output'),
      dataDir: corruptData,
      runner: createFakeRunner(path.join(corruptRoot, 'output')),
    });
    var corruptSnapshot = corruptRuntime.coordinator.snapshot();
    assert.strictEqual(corruptSnapshot.health, 'unhealthy');
    assert.strictEqual(corruptSnapshot.error.code, 'RELEASE_MISSING');

    var interruptedRoot = path.join(tempRoot, 'interrupted-case');
    var interruptedOutput = path.join(interruptedRoot, 'output');
    var interruptedData = path.join(interruptedRoot, '.gamecastle');
    var interruptedTransaction = path.join(interruptedData, 'active-transaction');
    fs.mkdirSync(path.join(interruptedTransaction, 'output'), { recursive: true });
    fs.mkdirSync(interruptedOutput, { recursive: true });
    fs.writeFileSync(path.join(interruptedOutput, 'marker.txt'), 'partial writer output', 'utf8');
    fs.writeFileSync(path.join(interruptedTransaction, 'output', 'marker.txt'), 'exact committed output', 'utf8');
    fs.writeFileSync(path.join(interruptedTransaction, 'transaction.json'), JSON.stringify({ runId: 'interrupted-run', hadOutput: true, processId: null }), 'utf8');
    fs.writeFileSync(path.join(interruptedData, 'local-runtime-state.json'), JSON.stringify({
      schemaVersion: 1, sequence: 4, projectId: 'active-local-project', health: 'ready', runId: 'interrupted-run', mode: 'create', intent: 'interrupted',
      status: 'running', outcome: null, stage: { id: 'building', label: 'Building', message: 'building' }, startedAt: new Date().toISOString(), finishedAt: null, error: null, artifact: null,
    }), 'utf8');
    var recoveredRuntime = runtimeModule.createRuntime({
      root: interruptedRoot,
      outputDir: interruptedOutput,
      dataDir: interruptedData,
      runner: createFakeRunner(interruptedOutput),
    });
    var recoveredSnapshot = recoveredRuntime.coordinator.snapshot();
    assert.strictEqual(recoveredSnapshot.health, 'ready');
    assert.strictEqual(recoveredSnapshot.status, 'failed');
    assert.strictEqual(recoveredSnapshot.error.code, 'SERVER_RESTARTED');
    assert.strictEqual(fs.readFileSync(path.join(interruptedOutput, 'marker.txt'), 'utf8'), 'exact committed output', 'interrupted run must restore exact workspace backup');
    assert(!fs.existsSync(interruptedTransaction), 'recovery journal must be consumed');

    var missingJournalRoot = path.join(tempRoot, 'missing-journal-case');
    var missingJournalData = path.join(missingJournalRoot, '.gamecastle');
    fs.mkdirSync(missingJournalData, { recursive: true });
    fs.writeFileSync(path.join(missingJournalData, 'local-runtime-state.json'), JSON.stringify({
      schemaVersion: 1, sequence: 1, projectId: 'active-local-project', health: 'ready', runId: 'orphan-run', mode: 'create', intent: 'orphan',
      status: 'running', outcome: null, stage: { id: 'building', label: 'Building', message: 'building' }, startedAt: new Date().toISOString(), finishedAt: null, error: null, artifact: null,
    }), 'utf8');
    var missingJournalRuntime = runtimeModule.createRuntime({ root: missingJournalRoot, dataDir: missingJournalData, runner: createFakeRunner(path.join(missingJournalRoot, 'output')) });
    var missingJournalSnapshot = missingJournalRuntime.coordinator.snapshot();
    assert.strictEqual(missingJournalSnapshot.health, 'unhealthy');
    assert.strictEqual(missingJournalSnapshot.error.code, 'RECOVERY_JOURNAL_MISSING');

    console.log('[LocalGameRuntime] origin, path safety, create, busy, SSE, immutable release, continue, no-change, exact rollback, privacy, cancel, timeout, and interrupted recovery gate passed');
  } finally {
    await new Promise(function(resolve) { runtime.server.close(resolve); });
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch(function(error) {
  console.error(error);
  process.exit(1);
});
