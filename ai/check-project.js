var childProcess = require('child_process');
var path = require('path');

[
  'check-project-pipeline-graph.js',
  'check-project-weave-runtime.js'
  ,'check-project-store.js'
].forEach(function(file) {
  var result = childProcess.spawnSync(process.execPath, [path.join(__dirname, file)], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
});

var npmCommand = process.env.npm_execpath ? process.execPath : (process.platform === 'win32' ? process.env.ComSpec : 'npm');
var npmArgs = process.env.npm_execpath ? [process.env.npm_execpath, 'run', 'check:wp2'] : (process.platform === 'win32' ? ['/d', '/s', '/c', 'npm run check:wp2'] : ['run', 'check:wp2']);
var wp2 = childProcess.spawnSync(npmCommand, npmArgs, { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
if (wp2.status !== 0) process.exit(wp2.status || 1);

console.log('[ProjectGate] WP0 Project Weave and WP2 product-module gates passed');
