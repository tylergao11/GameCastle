/* Loads the untracked local tuning surface before starting a GameCastle process. */
var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..');
var target = process.argv[2];
if (!target) throw new Error('Usage: node scripts/run-with-local-env.js <node-script> [...args]');
var env = Object.assign({}, process.env);
var localEnv = path.join(root, '.env.local');
if (fs.existsSync(localEnv)) {
  fs.readFileSync(localEnv, 'utf8').split(/\r?\n/).forEach(function(line) {
    var text = line.trim();
    if (!text || text[0] === '#') return;
    var index = text.indexOf('=');
    if (index < 1) throw new Error('Invalid .env.local entry: ' + line);
    var key = text.slice(0, index).trim(), value = text.slice(index + 1).trim();
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new Error('Invalid .env.local key: ' + key);
    if (value.indexOf('${') >= 0) throw new Error('Variable expansion is not supported in .env.local: ' + key);
    if (value.length >= 2 && value[0] === '"' && value[value.length - 1] === '"') value = value.slice(1, -1);
    env[key] = value;
  });
}
var child = childProcess.spawn(process.execPath, [path.resolve(root, target)].concat(process.argv.slice(3)), { cwd: root, env: env, stdio: 'inherit', windowsHide: true });
child.on('exit', function(code, signal) { process.exitCode = code === null ? 1 : code; if (signal) process.kill(process.pid, signal); });
