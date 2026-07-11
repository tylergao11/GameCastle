var fs = require('fs');
var path = require('path');

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function createStateStore(filePath) {
  var saveNumber = 0;

  function replaceFile(temporaryPath) {
    var lastError = null;
    for (var attempt = 0; attempt < 8; attempt++) {
      try {
        fs.renameSync(temporaryPath, filePath);
        return;
      } catch (error) {
        lastError = error;
        if (error.code !== 'EPERM' && error.code !== 'EBUSY' && error.code !== 'EACCES') throw error;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15 * (attempt + 1));
      }
    }
    throw lastError;
  }

  return {
    load: function() {
      if (!fs.existsSync(filePath)) return null;
      try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch (error) {
        throw new Error('Local runtime state is unreadable: ' + error.message);
      }
    },
    save: function(state) {
      ensureParent(filePath);
      saveNumber += 1;
      var temporaryPath = filePath + '.' + process.pid + '-' + saveNumber + '.tmp';
      try {
        fs.writeFileSync(temporaryPath, JSON.stringify(state, null, 2), 'utf8');
        replaceFile(temporaryPath);
      } finally {
        if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
      }
    },
    path: filePath,
  };
}

module.exports = {
  createStateStore: createStateStore,
};
