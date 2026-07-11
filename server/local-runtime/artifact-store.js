var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var REQUIRED_ENGINE_ARTIFACTS = [
  'game.html',
  'project.json',
  'project-world.json',
  'execution-ledger.json',
  'html-export-manifest.json',
];

var CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function removeIfExists(targetPath) {
  if (fs.existsSync(targetPath)) fs.rmSync(targetPath, { recursive: true, force: true });
}

function safeRelativePath(value) {
  var normalized = String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.split('/').some(function(part) { return !part || part === '.' || part === '..'; })) {
    throw new Error('HTML export manifest contains an unsafe path: ' + value);
  }
  return normalized;
}

function isWithin(root, candidate) {
  return candidate === root || candidate.indexOf(root + path.sep) === 0;
}

function createArtifactStore(options) {
  var outputDir = path.resolve(options.outputDir);
  var releasesDir = path.resolve(options.releasesDir);
  var validatedReleases = new Set();

  function missingEngineArtifacts() {
    return REQUIRED_ENGINE_ARTIFACTS.filter(function(relativePath) {
      return !fs.existsSync(path.join(outputDir, relativePath));
    });
  }

  function readManifest() {
    var manifestPath = path.join(outputDir, 'html-export-manifest.json');
    var manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.schemaVersion !== 1 || manifest.target !== 'html' || !Array.isArray(manifest.scriptFiles) || !Array.isArray(manifest.assetFiles)) {
      throw new Error('HTML export manifest does not match the supported schema.');
    }
    return manifest;
  }

  function fileFingerprint(relativePath) {
    var filePath = path.join(outputDir, relativePath);
    if (!fs.existsSync(filePath)) return null;
    var stats = fs.statSync(filePath);
    return {
      mtimeMs: stats.mtimeMs,
      sha1: crypto.createHash('sha1').update(fs.readFileSync(filePath)).digest('hex'),
    };
  }

  function captureEngineBaseline() {
    return {
      game: fileFingerprint('game.html'),
      manifest: fileFingerprint('html-export-manifest.json'),
      ledger: fileFingerprint('execution-ledger.json'),
    };
  }

  function assertChanged(relativePath, before) {
    var after = fileFingerprint(relativePath);
    if (!after) throw new Error('Pipeline did not produce ' + relativePath + '.');
    if (before && after.mtimeMs <= before.mtimeMs && after.sha1 === before.sha1) {
      throw new Error('Pipeline returned stale output for ' + relativePath + '.');
    }
  }

  function commitRelease(version, baseline) {
    var missing = missingEngineArtifacts();
    if (missing.length) throw new Error('Pipeline succeeded without required artifacts: ' + missing.join(', '));
    assertChanged('game.html', baseline && baseline.game);
    assertChanged('html-export-manifest.json', baseline && baseline.manifest);
    assertChanged('execution-ledger.json', baseline && baseline.ledger);
    var ledger = JSON.parse(fs.readFileSync(path.join(outputDir, 'execution-ledger.json'), 'utf8'));
    var runs = Array.isArray(ledger.runs) ? ledger.runs : [];
    var lastRun = runs[runs.length - 1];
    if (!lastRun || !lastRun.summary || lastRun.summary.nextAction !== 'done') {
      throw new Error('ExecutionLedger does not prove a completed current run.');
    }
    var world = JSON.parse(fs.readFileSync(path.join(outputDir, 'project-world.json'), 'utf8'));
    if (!world.semanticHash || world.worldVersion === undefined) {
      throw new Error('ProjectWorld does not contain a semantic version proof.');
    }
    var manifest = readManifest();
    var files = ['game.html'].concat(manifest.scriptFiles, manifest.assetFiles).map(safeRelativePath);
    files = Array.from(new Set(files));
    var realOutputRoot = fs.realpathSync(outputDir);
    var stagingDir = path.join(releasesDir, '.staging-' + version);
    var releaseDir = path.join(releasesDir, version);
    removeIfExists(stagingDir);
    fs.mkdirSync(stagingDir, { recursive: true });
    try {
      files.forEach(function(relativePath) {
        var sourcePath = path.join(outputDir, relativePath);
        if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
          throw new Error('HTML export is missing published file: ' + relativePath);
        }
        var realSource = fs.realpathSync(sourcePath);
        if (!isWithin(realOutputRoot, realSource)) throw new Error('HTML export file escapes output/: ' + relativePath);
        var destinationPath = path.join(stagingDir, relativePath);
        fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
        fs.copyFileSync(realSource, destinationPath);
      });
      fs.writeFileSync(path.join(stagingDir, 'release.json'), JSON.stringify({
        schemaVersion: 1,
        version: version,
        files: files,
        committedAt: new Date().toISOString(),
      }, null, 2), 'utf8');
      removeIfExists(releaseDir);
      fs.renameSync(stagingDir, releaseDir);
      validatedReleases.add(version);
    } catch (error) {
      removeIfExists(stagingDir);
      throw error;
    }
    return {
      version: version,
      worldVersion: world.worldVersion,
      semanticHash: world.semanticHash,
    };
  }

  function hasRelease(version) {
    if (!version || !/^[a-zA-Z0-9._-]+$/.test(version)) return false;
    if (validatedReleases.has(version)) return true;
    var releaseDir = path.join(releasesDir, version);
    var releaseManifestPath = path.join(releaseDir, 'release.json');
    if (!fs.existsSync(releaseManifestPath)) return false;
    try {
      var manifest = JSON.parse(fs.readFileSync(releaseManifestPath, 'utf8'));
      if (manifest.schemaVersion !== 1 || manifest.version !== version || !Array.isArray(manifest.files) || manifest.files.indexOf('game.html') < 0) return false;
      var realReleaseRoot = fs.realpathSync(releaseDir);
      var valid = manifest.files.every(function(relativePath) {
        var normalized = safeRelativePath(relativePath);
        var filePath = path.join(releaseDir, normalized);
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
        return isWithin(realReleaseRoot, fs.realpathSync(filePath));
      });
      if (valid) validatedReleases.add(version);
      return valid;
    } catch (_error) {
      return false;
    }
  }

  function send(version, relativePath, res, headOnly) {
    if (!hasRelease(version)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Release not found');
      return;
    }
    var releaseRoot = fs.realpathSync(path.join(releasesDir, version));
    var manifest = JSON.parse(fs.readFileSync(path.join(releaseRoot, 'release.json'), 'utf8'));
    var allowed = new Set(manifest.files || []);
    var normalized;
    try {
      normalized = safeRelativePath(decodeURIComponent(String(relativePath || 'game.html')));
    } catch (_error) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Invalid artifact path');
      return;
    }
    if (!allowed.has(normalized)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Artifact not published');
      return;
    }
    var filePath = path.join(releaseRoot, normalized);
    var realFile;
    try {
      realFile = fs.realpathSync(filePath);
    } catch (_error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Artifact not found');
      return;
    }
    if (!isWithin(releaseRoot, realFile) || !fs.statSync(realFile).isFile()) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[path.extname(realFile).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Origin': '*',
    });
    if (headOnly) {
      res.end();
      return;
    }
    fs.createReadStream(realFile).pipe(res);
  }

  return {
    captureEngineBaseline: captureEngineBaseline,
    commitRelease: commitRelease,
    hasRelease: hasRelease,
    missingEngineArtifacts: missingEngineArtifacts,
    send: send,
  };
}

module.exports = {
  REQUIRED_ENGINE_ARTIFACTS: REQUIRED_ENGINE_ARTIFACTS,
  createArtifactStore: createArtifactStore,
};
