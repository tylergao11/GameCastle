var fs = require('fs');
var crypto = require('crypto');
var https = require('https');
var path = require('path');

var ROOT_DIR = path.resolve(__dirname, '..');
var BASE_URL = 'https://s3.amazonaws.com/gdevelop-gdevelop.js/master/latest';
var SOURCE_MANIFEST = require(path.join(ROOT_DIR, 'ai', 'gdevelop-truth', 'gdevelop-codegen-source.json'));
var EXPECTED_SHA256 = {
  'libGD.js': 'a79feb4afb1b5ec64d288fb7f7847da2adced7533a538e98d52a5aa67e28ffde',
  'libGD.wasm': '5ae69ae0e2b09d559a6d3fea1187b6f4fc0481c8e898bf76e48d885b6294fef9'
};
var OUT_DIR = path.resolve(
  process.env.GAMECASTLE_GDEVELOP_CODEGEN_DIR ||
  path.join(ROOT_DIR, 'engine', 'gdevelop-codegen')
);

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
      var temporary = destination + '.download';
      var output = fs.createWriteStream(temporary);
      response.pipe(output);
      output.on('finish', function() {
        output.close(function() {
          var actualHash = sha256(temporary);
          if (actualHash !== expectedHash) {
            fs.unlinkSync(temporary);
            return reject(new Error('Pinned libGD checksum mismatch for ' + url + ': expected ' + expectedHash + ', received ' + actualHash));
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

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (var fileName of ['libGD.js', 'libGD.wasm']) {
    var destination = path.join(OUT_DIR, fileName);
    console.log('[GDevelopCodegen] Downloading ' + BASE_URL + '/' + fileName);
    await ensureDownload(BASE_URL + '/' + fileName, destination, EXPECTED_SHA256[fileName]);
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
