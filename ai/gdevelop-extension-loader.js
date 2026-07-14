var crypto = require('crypto');
var fs = require('fs');
var path = require('path');

var MANIFEST_PATH = path.join(__dirname, 'gdevelop-truth', 'gdevelop-codegen-source.json');

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function loadOfficialExtensions(gd, extensionRoot) {
  var manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  var platform = gd.JsPlatform.get();
  var loaded = [];
  manifest.files.forEach(function(file) {
    var relative = file.path.replace(/^Extensions\//, '');
    var modulePath = path.join(extensionRoot, relative);
    if (!fs.existsSync(modulePath)) throw new Error('Missing pinned GDevelop extension declaration: ' + modulePath);
    var actualHash = sha256(modulePath);
    if (actualHash !== file.sha256) throw new Error('GDevelop extension checksum mismatch: ' + file.path);
    delete require.cache[require.resolve(modulePath)];
    var extensionModule = require(modulePath);
    if (!extensionModule || typeof extensionModule.createExtension !== 'function') throw new Error('Invalid GDevelop extension module: ' + file.path);
    var extension = extensionModule.createExtension(function(message) { return message; }, gd);
    if (!extension) throw new Error('GDevelop extension returned no metadata: ' + file.path);
    platform.addNewExtension(extension);
    loaded.push(extension.getName());
    extension.delete();
  });
  return { commit: manifest.commit, loaded: loaded };
}

module.exports = { MANIFEST_PATH: MANIFEST_PATH, loadOfficialExtensions: loadOfficialExtensions };
