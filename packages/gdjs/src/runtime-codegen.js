/*
 * Synchronous boundary around GDevelop's official libGD code generator.
 *
 * The compiler runs in a child process because libGD is initialized
 * asynchronously, while the semantic runtime linker is
 * intentionally synchronous.
 */
var childProcess = require('child_process');
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var binaryContract = require('../contracts/gdevelop-codegen-binary-contract.json');

var ROOT_DIR = path.resolve(__dirname, '..', '..', '..');
var WORKER_PATH = path.join(__dirname, 'runtime-codegen-worker.js');

function fail(code, message) {
  var error = new Error(message);
  error.code = code;
  error.owner = 'OfficialGDevelopCodegen';
  throw error;
}
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function expectedBinaryHash(fileName) {
  var expected = binaryContract.files || {};
  var value = expected[fileName];
  if (binaryContract.schemaVersion !== 1 || typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    fail('GDEVELOP_CODEGEN_CONTRACT_INVALID', 'Pinned libGD binary contract is incomplete or malformed.');
  }
  return value;
}
function resolveLibGdPath() {
  var libGdPath = path.resolve(
    process.env.GAMECASTLE_LIBGD_PATH ||
    path.join(ROOT_DIR, '.gamecastle', 'cache', 'gdevelop', 'codegen', 'libGD.js')
  );
  assertPinnedLibGd(libGdPath);
  return libGdPath;
}
function assertPinnedLibGd(libGdPath) {
  libGdPath = path.resolve(libGdPath || '');
  var wasmPath = path.join(path.dirname(libGdPath), 'libGD.wasm');
  var expectedJs = expectedBinaryHash('libGD.js');
  var expectedWasm = expectedBinaryHash('libGD.wasm');
  if (!fs.existsSync(libGdPath)) fail('GDEVELOP_CODEGEN_MISSING', 'Missing official libGD compiler at ' + libGdPath + '. Run `npm run runtime:prepare`.');
  if (!fs.existsSync(wasmPath)) fail('GDEVELOP_CODEGEN_WASM_MISSING', 'Missing matching libGD.wasm beside ' + libGdPath + '. Run `npm run runtime:prepare`.');
  if (sha256(libGdPath) !== expectedJs || sha256(wasmPath) !== expectedWasm) {
    fail('GDEVELOP_CODEGEN_HASH_MISMATCH', 'libGD.js and libGD.wasm must match the pinned GDevelop codegen binary contract.');
  }
  return { libGdPath: libGdPath, wasmPath: wasmPath };
}

function generateProjectCodeFiles(project) {
  if (!project || !Array.isArray(project.layouts)) {
    throw new Error('[OfficialGDevelopCodegen] project.layouts must be an array.');
  }

  var libGdPath = resolveLibGdPath();

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
  assertPinnedLibGd: assertPinnedLibGd,
};
