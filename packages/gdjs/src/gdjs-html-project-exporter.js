var childProcess = require('child_process');
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var runtimeCodegen = require('./runtime-codegen');

var ROOT_DIR = path.resolve(__dirname, '..', '..', '..');
var WORKER_PATH = path.join(__dirname, 'gdjs-html-export-worker.js');

function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'GDJSHTMLProjectExporter'; throw error; }
function text(value, label) { if (typeof value !== 'string' || !value.trim()) fail('GDJS_HTML_EXPORT_INPUT_INVALID', label + ' must be non-empty text.'); return value.trim(); }
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function resolveRuntimeDir(value) { return path.resolve(value || process.env.GAMECASTLE_GDJS_RUNTIME_DIR || path.join(ROOT_DIR, '.gamecastle', 'cache', 'gdevelop', 'runtime')); }

function walkFiles(root, current, output) {
  fs.readdirSync(current, { withFileTypes: true }).forEach(function(entry) {
    var absolute = path.join(current, entry.name);
    if (entry.isDirectory()) walkFiles(root, absolute, output);
    else if (entry.isFile()) { var bytes = fs.readFileSync(absolute); output.push({ path: path.relative(root, absolute).replace(/\\/g, '/'), size: bytes.length, sha256: sha256(bytes) }); }
  });
}
function buildHash(outputDir) {
  var files = [];
  walkFiles(outputDir, outputDir, files);
  files.sort(function(left, right) { return left.path.localeCompare(right.path); });
  return { runtimeBuildHash: 'gdjs-runtime-build.' + sha256(Buffer.from(JSON.stringify(files), 'utf8')), files: files };
}

function instrumentIndex(outputDir, marker) {
  var allowed = ['sourceHash', 'assetWorldHash', 'spatialResolutionHash', 'finalProjectionHash'];
  if (!marker || typeof marker !== 'object' || Array.isArray(marker)) fail('GDJS_HTML_EXPORT_MARKER_INVALID', 'Accepted projection marker is required.');
  Object.keys(marker).forEach(function(field) { if (allowed.indexOf(field) < 0) fail('GDJS_HTML_EXPORT_MARKER_INVALID', 'Accepted projection marker contains unknown field: ' + field); });
  allowed.forEach(function(field) { text(marker[field], 'marker.' + field); });
  var indexPath = path.join(outputDir, 'index.html'), html = fs.readFileSync(indexPath, 'utf8');
  var initialization = 'var game = new gdjs.RuntimeGame';
  if (html.split(initialization).length !== 2) fail('GDJS_HTML_EXPORT_INSTRUMENTATION_FAILED', 'Official HTML export has no unique RuntimeGame initialization boundary.');
  html = html.replace(initialization, 'var game = window.GameCastleRuntimeGame = new gdjs.RuntimeGame');
  var loadBoundary = 'game.loadAllAssets(function() {';
  if (html.split(loadBoundary).length !== 2) fail('GDJS_HTML_EXPORT_INSTRUMENTATION_FAILED', 'Official HTML export has no unique asset-ready boundary.');
  html = html.replace(loadBoundary, loadBoundary + '\n            window.GameCastleAssetsLoaded = true;');
  var markerScript = '<link rel="icon" href="data:,">\n<script>window.GameCastleAcceptedProjection = Object.freeze(' + JSON.stringify(marker).replace(/</g, '\\u003c') + ');</script>\n';
  if (html.indexOf('</head>') < 0) fail('GDJS_HTML_EXPORT_INSTRUMENTATION_FAILED', 'Official HTML export has no head boundary.');
  html = html.replace('</head>', markerScript + '</head>');
  fs.writeFileSync(indexPath, html, 'utf8');
}

function exportAcceptedProject(input) {
  input = input || {};
  if (!input.project || typeof input.project !== 'object' || Array.isArray(input.project)) fail('GDJS_HTML_EXPORT_INPUT_INVALID', 'An accepted GDJS projection project is required.');
  var outputRoot = path.resolve(text(input.outputDir, 'outputDir'));
  var projectionHash = text(input.projectionHash, 'projectionHash');
  var suffix = projectionHash.replace(/[^A-Za-z0-9]/g, '').slice(-24);
  if (!suffix) fail('GDJS_HTML_EXPORT_INPUT_INVALID', 'projectionHash cannot produce a safe build directory name.');
  fs.mkdirSync(outputRoot, { recursive: true });
  var outputDir = path.resolve(outputRoot, 'gdjs-build-' + suffix);
  if (path.dirname(outputDir) !== outputRoot) fail('GDJS_HTML_EXPORT_PATH_INVALID', 'GDJS build directory escaped its requested output root.');
  if (fs.existsSync(outputDir)) fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
  var runtimeDir = resolveRuntimeDir(input.runtimeDir);
  if (!fs.existsSync(runtimeDir)) fail('GDJS_HTML_EXPORT_RUNTIME_MISSING', 'Official GDJS runtime is missing: ' + runtimeDir + '. Run npm run runtime:prepare.');
  var libGdPath = runtimeCodegen.resolveLibGdPath();
  var result = childProcess.spawnSync(process.execPath, [WORKER_PATH, libGdPath, runtimeDir, outputDir], {
    cwd: ROOT_DIR,
    input: JSON.stringify(input.project),
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024
  });
  if (result.error) fail('GDJS_HTML_EXPORT_FAILED', result.error.message);
  if (result.status !== 0) fail('GDJS_HTML_EXPORT_FAILED', String(result.stderr || result.stdout || ('HTML export worker exited with status ' + result.status)).trim());
  if (!fs.existsSync(path.join(outputDir, 'index.html'))) fail('GDJS_HTML_EXPORT_INCOMPLETE', 'Official HTML export produced no index.html.');
  instrumentIndex(outputDir, input.marker);
  var hashed = buildHash(outputDir);
  return { outputDir: outputDir, runtimeBuildHash: hashed.runtimeBuildHash, buildManifestHash: 'gdjs-build-manifest.' + sha256(Buffer.from(JSON.stringify(hashed.files), 'utf8')), files: hashed.files };
}

module.exports = { exportAcceptedProject: exportAcceptedProject, buildHash: buildHash, resolveRuntimeDir: resolveRuntimeDir, instrumentIndex: instrumentIndex };
