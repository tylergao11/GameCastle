var fs = require('fs');
var path = require('path');
var projectWeave = require('../../ai/project-weave-runtime');

function copyDirectory(source, target) {
  fs.mkdirSync(target, { recursive: true });
  fs.readdirSync(source, { withFileTypes: true }).forEach(function(entry) {
    var from = path.join(source, entry.name), to = path.join(target, entry.name);
    if (entry.isDirectory()) copyDirectory(from, to);
    else if (entry.isFile()) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); }
  });
}

function materializeCanonicalRun(state, outputDir) {
  fs.rmSync(outputDir, { recursive: true, force: true });
  copyDirectory(state.runtimeDir, outputDir);
  ['project-world.json', 'asset-world.json', 'execution-ledger.json'].forEach(function(name) {
    fs.copyFileSync(path.join(state.runDir, name), path.join(outputDir, name));
  });
  fs.copyFileSync(path.join(state.runDir, 'project-run.json'), path.join(outputDir, 'project-run.json'));
}

function createProjectWeaveRunner(options) {
  options = options || {};
  function start(request) {
    var cancelled = false;
    request.onStage({ id: 'understanding', label: 'Understanding the idea' }, '[ProjectWeave]');
    var promise = (async function() {
      var input = { projectId: request.projectId, requestId: request.runId, projectName: request.projectName, naturalIntent: request.intent, mode: request.mode };
      if (request.intentFixtureFile) throw Object.assign(new Error('Intent fixture requests are not available from the product runtime.'), { code: 'FIXTURE_RUNTIME_FORBIDDEN' });
      var state = request.mode === 'continue'
        ? await projectWeave.continue(input, { workspaceRoot: options.workspaceRoot, commitPlayableVersion: false, services: options.services || {} })
        : await projectWeave.create(input, { workspaceRoot: options.workspaceRoot, commitPlayableVersion: false, services: options.services || {} });
      if (cancelled) throw Object.assign(new Error('The ProjectWeave build was cancelled.'), { code: 'RUN_CANCELLED' });
      if (state.lifecycle !== 'playable') throw Object.assign(new Error('ProjectWeave did not reach playable state.'), { code: 'PROJECT_WEAVE_NOT_PLAYABLE' });
      request.onStage({ id: 'packaging', label: 'Packaging the game' }, '[ProjectWeave]');
      materializeCanonicalRun(state, options.outputDir);
      request.onStage({ id: 'playtesting', label: 'Playtesting the result' }, '[ProjectWeave]');
      return { code: 0, noChange: false, tail: [], run: state.run };
    })();
    return { processId: null, promise: promise, cancel: function() { cancelled = true; } };
  }
  return { start: start };
}

module.exports = { createProjectWeaveRunner: createProjectWeaveRunner, materializeCanonicalRun: materializeCanonicalRun };
