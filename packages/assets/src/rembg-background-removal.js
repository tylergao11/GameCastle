var childProcess = require('child_process');
var crypto = require('crypto');
var fs = require('fs');
var os = require('os');
var path = require('path');
var contract = require('../contracts/background-removal-contract.json');
var png = require('./local-derivation-port');

function fail(code, message) { var error = new Error(message); error.code = code; error.owner = contract.owner; throw error; }
function rasterHash(raster) { return crypto.createHash('sha256').update(Buffer.from(raster.data.buffer, raster.data.byteOffset, raster.data.byteLength)).update(String(raster.width) + 'x' + String(raster.height)).digest('hex'); }
function fileHash(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function alphaStats(raster) { var transparent = 0, visible = 0; for (var pixel = 3; pixel < raster.data.length; pixel += 4) { if (raster.data[pixel] < 250) transparent++; if (raster.data[pixel] > 0) visible++; } return { transparentRatio: transparent / (raster.width * raster.height), visibleRatio: visible / (raster.width * raster.height) }; }
function defaultExecute(python, args, options) { return new Promise(function(resolve, reject) { childProcess.execFile(python, args, { cwd: options.cwd, env: options.env, windowsHide: true, maxBuffer: 1024 * 1024, timeout: options.timeoutMs }, function(error, stdout, stderr) { if (error) { error.stdout = stdout; error.stderr = stderr; reject(error); } else resolve({ stdout: stdout, stderr: stderr }); }); }); }
function remaining(deadlineAt) { if (deadlineAt === undefined || deadlineAt === null) return undefined; var value = Math.floor(Number(deadlineAt) - Date.now()); if (!Number.isFinite(value) || value < 1) fail('ASSET_ENGINE_DEADLINE_EXCEEDED', 'AssetEngine execution profile deadline expired before background removal.'); return value; }

function createRembgBackgroundRemoval(options) {
  options = options || {};
  var root = path.resolve(options.root || path.join(__dirname, '..', '..', '..'));
  var python = path.resolve(root, options.python || contract.runtime.python);
  var entrypoint = path.resolve(root, options.entrypoint || contract.runtime.entrypoint);
  var modelFile = path.resolve(root, options.modelFile || contract.model.file);
  var modelSha256 = String(options.modelSha256 || contract.model.sha256).toLowerCase();
  var modelId = options.modelId || contract.model.id;
  var execute = options.execute || defaultExecute;
  var verified = false;
  function verify() {
    if (verified) return;
    if (!fs.existsSync(python)) fail('REMBG_RUNTIME_MISSING', 'BiRefNet runtime is missing. Run: ' + contract.runtime.setupCommand);
    if (!fs.existsSync(entrypoint)) fail('REMBG_ENTRYPOINT_MISSING', 'BiRefNet entrypoint is missing: ' + entrypoint);
    if (!fs.existsSync(modelFile)) fail('REMBG_MODEL_MISSING', 'Pinned BiRefNet model is missing. Run: ' + contract.runtime.setupCommand);
    var actual = fileHash(modelFile);
    if (actual !== modelSha256) fail('REMBG_MODEL_HASH_MISMATCH', 'BiRefNet model hash mismatch; refusing unowned model bytes.');
    verified = true;
  }
  return {
    contract: contract,
    remove: async function(raster, context) {
      verify();
      var inputHash = rasterHash(raster), directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-rembg-')), inputFile = path.join(directory, 'input.png'), outputFile = path.join(directory, 'output.png');
      try {
        fs.writeFileSync(inputFile, png.encodePng(raster));
        try { await execute(python, [entrypoint, '--input', inputFile, '--output', outputFile, '--model', modelId], { cwd: root, env: Object.assign({}, process.env, { U2NET_HOME: path.dirname(modelFile) }), timeoutMs: remaining(context && context.deadlineAt) }); }
        catch (error) { if (error && (error.killed || error.code === 'ETIMEDOUT')) fail('ASSET_ENGINE_DEADLINE_EXCEEDED', 'AssetEngine execution profile deadline expired during background removal.'); fail('REMBG_INFERENCE_FAILED', 'BiRefNet background removal failed: ' + String(error.stderr || error.message || error).trim()); }
        if (!fs.existsSync(outputFile)) fail('REMBG_OUTPUT_MISSING', 'BiRefNet completed without a PNG output.');
        var output; try { output = png.decodePng(fs.readFileSync(outputFile)); } catch (error) { fail('REMBG_OUTPUT_INVALID', 'BiRefNet output is not a valid PNG: ' + error.message); }
        var stats = alphaStats(output);
        if (stats.visibleRatio < 0.005) fail('REMBG_SUBJECT_EMPTY', 'BiRefNet removed the complete subject.');
        if (stats.transparentRatio < 0.05) fail('REMBG_BACKGROUND_REMAINS', 'BiRefNet output contains no meaningful transparent background.');
        return { raster: output, schemaVersion: contract.schemaVersion, owner: contract.owner, op: contract.operation, operationId: contract.operation + '.' + inputHash.slice(0, 24), inputHash: inputHash, outputHash: rasterHash(output), parentRevisionId: context && context.parentRevisionId, scriptVersion: 'rembg-' + contract.repositoryTag, repository: contract.repository, repositoryCommit: contract.repositoryCommit, modelId: modelId, modelSha256: modelSha256, alpha: stats };
      } finally { fs.rmSync(directory, { recursive: true, force: true }); }
    }
  };
}

module.exports = { createRembgBackgroundRemoval: createRembgBackgroundRemoval, alphaStats: alphaStats, rasterHash: rasterHash };
