var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');
var sourceRoot = require('./gdevelop-source-root');

var rootDir = require('../shared/repository-path').root;

function getArgValue(name) {
  var index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) return null;
  return process.argv[index + 1];
}

function resolveGdjsDir(sourceDir) {
  var direct = path.join(sourceDir, 'package.json');
  if (fs.existsSync(direct) && path.basename(sourceDir).toLowerCase() === 'gdjs') {
    return sourceDir;
  }
  return path.join(sourceDir, 'GDJS');
}

function run(command, args, cwd) {
  var executable = command;
  var spawnArgs = args;
  if (command === 'npm' && process.env.npm_execpath) {
    executable = process.execPath;
    spawnArgs = [process.env.npm_execpath].concat(args);
  }
  console.log('[GDJSRuntime] ' + command + ' ' + args.join(' ') + ' (cwd=' + cwd + ')');
  var result = childProcess.spawnSync(executable, spawnArgs, {
    cwd: cwd,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(command + ' exited with status ' + result.status);
  }
}

var sourceDir = path.resolve(
  getArgValue('--source') ||
  sourceRoot.resolveSourceRoot()
);
var gdjsDir = resolveGdjsDir(sourceDir);
var outDir = path.resolve(
  getArgValue('--out') ||
  process.env.GAMECASTLE_GDJS_RUNTIME_DIR ||
  path.join(rootDir, '.gamecastle', 'cache', 'gdevelop', 'runtime')
);

if (!fs.existsSync(path.join(gdjsDir, 'package.json'))) {
  console.error('[GDJSRuntime] Missing GDJS package.json: ' + gdjsDir);
  console.error('[GDJSRuntime] Pass --source <GDevelop repo> or set GAMECASTLE_GDEVELOP_SOURCE_DIR.');
  process.exit(1);
}

if (!fs.existsSync(path.join(gdjsDir, 'node_modules'))) {
  run('npm', ['ci'], gdjsDir);
}

fs.mkdirSync(path.dirname(outDir), { recursive: true });
run('npm', ['run', 'build', '--', '--out', outDir], gdjsDir);
console.log('[GDJSRuntime] Ready: ' + outDir);
