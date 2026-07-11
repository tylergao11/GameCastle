var childProcess = require('child_process');
var path = require('path');

var root = path.resolve(__dirname, '..');
var children = [];
var stopping = false;

function stopProcessTree(child) {
  if (!child || child.killed) return;
  if (process.platform === 'win32') {
    childProcess.spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

function spawnProcess(command, args) {
  var child = childProcess.spawn(command, args, {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  });
  children.push(child);
  child.on('exit', function(code) {
    if (stopping) return;
    stopping = true;
    children.forEach(function(other) { if (other !== child) stopProcessTree(other); });
    process.exitCode = code || 0;
  });
}

if (!process.env.npm_execpath) {
  throw new Error('GameCastle development must be started with `npm run dev` so the npm CLI path is explicit.');
}
spawnProcess(process.execPath, [path.join(root, 'server', 'local-game-runtime.js')]);
spawnProcess(process.execPath, [process.env.npm_execpath, '--prefix', 'platform', 'run', 'dev', '--', '--host', '127.0.0.1']);

function shutdown() {
  if (stopping) return;
  stopping = true;
  children.forEach(stopProcessTree);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
