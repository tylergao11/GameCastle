var crypto = require('crypto');
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var SOURCE_ROOT = path.resolve(process.env.GDEVELOP_SOURCE_DIR || 'D:/GDevelop-master');
var OUT = path.join(ROOT, 'ai', 'gdevelop-truth', 'gdevelop-codegen-source.json');
var SOURCE_COMMIT = 'a8c4ad81802ff35eef64c0f68ef01445556eb0ba';

function walk(directory, result) {
  fs.readdirSync(directory, { withFileTypes: true }).forEach(function(entry) {
    var filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(filePath, result);
    else if (entry.name === 'JsExtension.js') result.push(filePath);
  });
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

var files = [];
walk(path.join(SOURCE_ROOT, 'Extensions'), files);
var manifest = {
  schemaVersion: 1,
  repository: '4ian/GDevelop',
  commit: SOURCE_COMMIT,
  files: files.sort().map(function(filePath) {
    return { path: path.relative(SOURCE_ROOT, filePath).replace(/\\/g, '/'), sha256: sha256(filePath) };
  })
};
fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log('[GDevelopCodegenSource] ' + manifest.files.length + ' extension declarations -> ' + OUT);
