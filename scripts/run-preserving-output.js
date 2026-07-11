var childProcess = require('child_process');
var fs = require('fs');
var os = require('os');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var OUTPUT_DIR = path.join(ROOT, 'output');
var scriptName = String(process.argv[2] || '').trim();

if (!scriptName || !/:raw$/.test(scriptName)) {
  console.error('Usage: node scripts/run-preserving-output.js <npm-script:raw>');
  process.exit(1);
}

var backupRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-output-'));
var backupOutput = path.join(backupRoot, 'output');
var hadOutput = fs.existsSync(OUTPUT_DIR);
var result = null;

try {
  if (hadOutput) fs.cpSync(OUTPUT_DIR, backupOutput, { recursive: true });
  var npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('npm_execpath is required to run the preserved test command.');
  result = childProcess.spawnSync(process.execPath, [npmCli, 'run', scriptName], {
    cwd: ROOT,
    env: process.env,
    stdio: 'inherit',
  });
} finally {
  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  if (hadOutput) fs.cpSync(backupOutput, OUTPUT_DIR, { recursive: true });
  fs.rmSync(backupRoot, { recursive: true, force: true });
}

if (result && result.error) {
  console.error(result.error.message);
  process.exit(1);
}
if (result && result.signal) {
  console.error('Test command ended with signal ' + result.signal);
  process.exit(1);
}
process.exit(result && Number.isInteger(result.status) ? result.status : 1);
