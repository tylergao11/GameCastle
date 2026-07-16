var fs = require('fs');
var crypto = require('crypto');
var https = require('https');
var path = require('path');

var ROOT_DIR = require('../shared/repository-path').root;
var SOURCE_MANIFEST = require(path.join(ROOT_DIR, 'packages', 'gdjs', 'generated', 'gdevelop-codegen-source.json'));
var BINARY_CONTRACT = require(path.join(ROOT_DIR, 'packages', 'gdjs', 'contracts', 'gdevelop-codegen-binary-contract.json'));
var BASE_URL = BINARY_CONTRACT.fallbackDownloadBaseUrl;
var EXPECTED_SHA256 = BINARY_CONTRACT.files;
var OUT_DIR = path.resolve(
  process.env.GAMECASTLE_GDEVELOP_CODEGEN_DIR ||
  path.join(ROOT_DIR, '.gamecastle', 'cache', 'gdevelop', 'codegen')
);
var LOCAL_BINARY_SOURCE_DIR = process.env.GAMECASTLE_LIBGD_SOURCE_DIR
  ? path.resolve(process.env.GAMECASTLE_LIBGD_SOURCE_DIR)
  : null;

function assertBinaryContract() {
  if (BINARY_CONTRACT.schemaVersion !== 1 || typeof BASE_URL !== 'string' || !/^https:\/\//.test(BASE_URL)) {
    throw new Error('Pinned libGD binary contract is malformed.');
  }
  ['libGD.js', 'libGD.wasm'].forEach(function(fileName) {
    if (typeof EXPECTED_SHA256[fileName] !== 'string' || !/^[a-f0-9]{64}$/.test(EXPECTED_SHA256[fileName])) {
      throw new Error('Pinned libGD binary contract is missing a SHA-256 for ' + fileName + '.');
    }
  });
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function download(url, destination, redirectsLeft, expectedHash) {
  return new Promise(function(resolve, reject) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    https.get(url, function(response) {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        if (redirectsLeft <= 0) return reject(new Error('Too many redirects for ' + url));
        return download(new URL(response.headers.location, url).toString(), destination, redirectsLeft - 1, expectedHash)
          .then(resolve, reject);
      }
      if (response.statusCode !== 200) {
        response.resume();
        return reject(new Error('Download failed (' + response.statusCode + '): ' + url));
      }
      // Parallel preparation processes must never share a partial-download path.
      var temporary = destination + '.download.' + process.pid + '.' + crypto.randomBytes(8).toString('hex');
      var output = fs.createWriteStream(temporary);
      response.pipe(output);
      output.on('finish', function() {
        output.close(function() {
          var actualHash = sha256(temporary);
          if (actualHash !== expectedHash) {
            fs.unlinkSync(temporary);
            return reject(new Error('Pinned libGD checksum mismatch for ' + url + ': expected ' + expectedHash + ', received ' + actualHash + '. Supply a checksum-verified binary pair with GAMECASTLE_LIBGD_SOURCE_DIR instead of accepting a mutable download.'));
          }
          fs.renameSync(temporary, destination);
          resolve();
        });
      });
      output.on('error', reject);
    }).on('error', reject);
  });
}

async function ensureDownload(url, destination, expectedHash) {
  if (fs.existsSync(destination) && sha256(destination) === expectedHash) {
    console.log('[GDevelopCodegen] Verified pinned ' + path.relative(OUT_DIR, destination));
    return;
  }
  await download(url, destination, 5, expectedHash);
}

function copyVerifiedLocalBinary(fileName, destination, expectedHash) {
  var source = path.join(LOCAL_BINARY_SOURCE_DIR, fileName);
  if (!fs.existsSync(source)) throw new Error('Pinned local libGD source is missing ' + fileName + ': ' + source);
  if (sha256(source) !== expectedHash) throw new Error('Pinned local libGD checksum mismatch for ' + source + '.');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  var temporary = destination + '.copy.' + process.pid;
  fs.copyFileSync(source, temporary);
  if (sha256(temporary) !== expectedHash) {
    fs.rmSync(temporary, { force: true });
    throw new Error('Pinned local libGD copy checksum mismatch for ' + source + '.');
  }
  fs.renameSync(temporary, destination);
}

async function ensureBinary(fileName, destination, expectedHash) {
  if (fs.existsSync(destination) && sha256(destination) === expectedHash) {
    console.log('[GDevelopCodegen] Verified pinned ' + path.relative(OUT_DIR, destination));
    return;
  }
  if (LOCAL_BINARY_SOURCE_DIR) {
    console.log('[GDevelopCodegen] Copying verified local ' + fileName + ' from ' + LOCAL_BINARY_SOURCE_DIR);
    copyVerifiedLocalBinary(fileName, destination, expectedHash);
    return;
  }
  await download(BASE_URL + '/' + fileName, destination, 5, expectedHash);
}

async function main() {
  assertBinaryContract();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (var fileName of ['libGD.js', 'libGD.wasm']) {
    var destination = path.join(OUT_DIR, fileName);
    if (!LOCAL_BINARY_SOURCE_DIR) console.log('[GDevelopCodegen] Downloading ' + BASE_URL + '/' + fileName);
    await ensureBinary(fileName, destination, EXPECTED_SHA256[fileName]);
  }
  await Promise.all(SOURCE_MANIFEST.files.map(function(sourceFile) {
    var relative = sourceFile.path.replace(/^Extensions\//, '');
    var extensionDestination = path.join(OUT_DIR, 'extensions', relative);
    var extensionUrl = 'https://raw.githubusercontent.com/' + SOURCE_MANIFEST.repository + '/' + SOURCE_MANIFEST.commit + '/' + sourceFile.path;
    console.log('[GDevelopCodegen] Downloading pinned ' + sourceFile.path);
    return ensureDownload(extensionUrl, extensionDestination, sourceFile.sha256);
  }));
  console.log('[GDevelopCodegen] Ready: ' + OUT_DIR);
}

main().catch(function(error) {
  console.error('[GDevelopCodegen] ' + (error && error.stack ? error.stack : error));
  process.exitCode = 1;
});
