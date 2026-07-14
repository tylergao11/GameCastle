/*
 * Synchronous boundary around GDevelop's official libGD code generator.
 *
 * The compiler runs in a child process because libGD is initialized
 * asynchronously, while the semantic runtime linker is
 * intentionally synchronous.
 */
var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');

var ROOT_DIR = path.resolve(__dirname, '..');
var WORKER_PATH = path.join(__dirname, 'runtime-codegen-worker.js');

function resolveLibGdPath() {
  return path.resolve(
    process.env.GAMECASTLE_LIBGD_PATH ||
    path.join(ROOT_DIR, 'engine', 'gdevelop-codegen', 'libGD.js')
  );
}

function generateProjectCodeFiles(project) {
  if (!project || !Array.isArray(project.layouts)) {
    throw new Error('[OfficialGDevelopCodegen] project.layouts must be an array.');
  }

  var libGdPath = resolveLibGdPath();
  if (!fs.existsSync(libGdPath)) {
    throw new Error(
      '[OfficialGDevelopCodegen] Missing official libGD compiler at ' + libGdPath +
      '. Run `npm run runtime:prepare`.'
    );
  }

  var result = childProcess.spawnSync(process.execPath, [WORKER_PATH, libGdPath], {
    cwd: ROOT_DIR,
    input: JSON.stringify(project),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      '[OfficialGDevelopCodegen] Compilation failed.\n' +
      String(result.stderr || result.stdout || ('worker exited with status ' + result.status)).trim()
    );
  }

  var payload;
  try {
    payload = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error('[OfficialGDevelopCodegen] Worker returned invalid JSON: ' + error.message);
  }
  if (!payload || !Array.isArray(payload.files)) {
    throw new Error('[OfficialGDevelopCodegen] Worker did not return generated files.');
  }
  return payload.files;
}

module.exports = {
  generateProjectCodeFiles: generateProjectCodeFiles,
  resolveLibGdPath: resolveLibGdPath,
};
