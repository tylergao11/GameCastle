var childProcess = require('child_process');
var readline = require('readline');

var STAGES = [
  { id: 'understanding', label: 'Understanding the idea', match: /^\[Stage1\]/ },
  { id: 'directing', label: 'Directing the game', match: /^\[Stage2\]/ },
  { id: 'compiling', label: 'Compiling intent', match: /^\[IntentCompiler\]/ },
  { id: 'building', label: 'Building the world', match: /^\[(Parse|Done):/ },
  { id: 'runtime', label: 'Linking the runtime', match: /^\[(RuntimeCode|TickRuntime|IntentRuntime)\]/ },
  { id: 'packaging', label: 'Packaging the game', match: /^\[(HtmlExport|Output)\]/ },
  { id: 'playtesting', label: 'Playtesting the result', match: /^\[SemanticPlaytest\]/ },
];

function stageForLine(line) {
  for (var index = 0; index < STAGES.length; index++) {
    if (STAGES[index].match.test(line)) return { id: STAGES[index].id, label: STAGES[index].label };
  }
  return null;
}

function createPipelineRunner(options) {
  var cwd = options.cwd;
  var scriptPath = options.scriptPath;
  var nodePath = options.nodePath || process.execPath;
  var spawn = options.spawn || childProcess.spawn;

  function start(request) {
    var args = [scriptPath];
    if (request.mode === 'continue') args.push('--continue');
    if (request.intentFixtureFile) args.push('--intent-fixture-file', request.intentFixtureFile); else args.push(request.intent);
    var child = spawn(nodePath, args, {
      cwd: cwd,
      env: Object.assign({}, process.env, options.env || {}, { FORCE_COLOR: '0' }),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    var tail = [];
    var noChange = false;
    var forcedError = null;
    var timeoutMs = Number(options.timeoutMs || process.env.GAMECASTLE_RUNTIME_TIMEOUT_MS || 600000);

    function consume(stream, channel) {
      var lines = readline.createInterface({ input: stream });
      lines.on('line', function(rawLine) {
        var line = String(rawLine || '').trim();
        if (!line) return;
        tail.push('[' + channel + '] ' + line);
        if (tail.length > 80) tail.shift();
        if (line === '[Done] No DSL changes to apply') noChange = true;
        request.onLine(line, channel);
        var stage = stageForLine(line);
        if (stage) request.onStage(stage, line);
      });
    }

    consume(child.stdout, 'stdout');
    consume(child.stderr, 'stderr');

    var timeout = setTimeout(function() {
      forcedError = new Error('The game pipeline exceeded its ' + Math.round(timeoutMs / 1000) + ' second limit.');
      forcedError.code = 'RUN_TIMEOUT';
      cancelProcess();
    }, timeoutMs);

    function cancelProcess() {
      if (child.killed) return;
      if (process.platform === 'win32') {
        childProcess.spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      } else {
        child.kill('SIGKILL');
      }
    }

    var promise = new Promise(function(resolve, reject) {
      child.on('error', function(error) {
        clearTimeout(timeout);
        reject(error);
      });
      child.on('close', function(code, signal) {
        clearTimeout(timeout);
        if (forcedError) {
          forcedError.detail = tail.join('\n').slice(-12000);
          reject(forcedError);
          return;
        }
        if (code === 0) {
          resolve({ code: code, signal: signal, tail: tail.slice(), noChange: noChange });
          return;
        }
        var error = new Error('Game pipeline exited with code ' + code + (signal ? ' (' + signal + ')' : ''));
        error.code = 'PIPELINE_FAILED';
        error.detail = tail.join('\n').slice(-12000);
        reject(error);
      });
    });

    return {
      processId: child.pid,
      promise: promise,
      cancel: function() {
        forcedError = new Error('The game pipeline was cancelled.');
        forcedError.code = 'RUN_CANCELLED';
        cancelProcess();
      },
    };
  }

  return { start: start };
}

module.exports = {
  STAGES: STAGES,
  createPipelineRunner: createPipelineRunner,
  stageForLine: stageForLine,
};
