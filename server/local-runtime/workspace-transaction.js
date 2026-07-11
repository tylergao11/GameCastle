var fs = require('fs');
var path = require('path');

function removeIfExists(targetPath) {
  if (fs.existsSync(targetPath)) fs.rmSync(targetPath, { recursive: true, force: true });
}

function createWorkspaceTransaction(options) {
  var outputDir = options.outputDir;
  var transactionDir = options.transactionDir;
  var backupDir = path.join(transactionDir, 'output');
  var manifestPath = path.join(transactionDir, 'transaction.json');

  function begin(runId) {
    removeIfExists(transactionDir);
    fs.mkdirSync(transactionDir, { recursive: true });
    var hadOutput = fs.existsSync(outputDir);
    if (hadOutput) fs.cpSync(outputDir, backupDir, { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify({ runId: runId, hadOutput: hadOutput, processId: null }, null, 2), 'utf8');
  }

  function markProcess(processId) {
    if (!fs.existsSync(manifestPath)) throw new Error('Cannot attach a process to a missing workspace transaction.');
    var manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.processId = processId || null;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  }

  function stopProcessTree(processId) {
    if (!processId) return true;
    try {
      if (process.platform === 'win32') {
        require('child_process').spawnSync('taskkill.exe', ['/PID', String(processId), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      } else {
        process.kill(processId, 'SIGKILL');
      }
    } catch (_error) {
      // Verify below: a process that already exited is the normal rollback case.
    }
    try {
      process.kill(processId, 0);
      return false;
    } catch (_error) {
      return true;
    }
  }

  function commit() {
    removeIfExists(transactionDir);
  }

  function rollback() {
    if (!fs.existsSync(manifestPath)) return false;
    var manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!stopProcessTree(manifest.processId)) {
      throw new Error('Cannot restore output while pipeline process ' + manifest.processId + ' is still running.');
    }
    removeIfExists(outputDir);
    if (manifest.hadOutput && fs.existsSync(backupDir)) {
      fs.mkdirSync(path.dirname(outputDir), { recursive: true });
      fs.renameSync(backupDir, outputDir);
    }
    removeIfExists(transactionDir);
    return true;
  }

  return {
    begin: begin,
    markProcess: markProcess,
    commit: commit,
    rollback: rollback,
    hasPending: function() { return fs.existsSync(manifestPath); },
  };
}

module.exports = {
  createWorkspaceTransaction: createWorkspaceTransaction,
};
