/* Produces a hash-addressable, source-auditable module catalog artifact for CI and GHCR. */
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var compiler = require('../ai/module-compiler');
var origin = require('../ai/internal-module-origin');

function sha256(value) { return crypto.createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex'); }
function argument(name, fallback) { var index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : fallback; }
var outputDir = path.resolve(argument('--out', path.join(__dirname, '..', 'dist', 'module-artifact')));
var catalog = compiler.loadProductModuleCatalog(path.join(__dirname, '..', 'ai', 'product-modules'));
var unpublishedModules = [];
var modules = catalog.modules.reduce(function(approved, manifest) {
  var receipt = origin.forModule(manifest.id, manifest.revision);
  if (!receipt) { unpublishedModules.push({ moduleId: manifest.id, revision: manifest.revision, reason: 'origin-receipt-missing' }); return approved; }
  approved.push({ moduleId: manifest.id, revision: manifest.revision, manifestSha256: sha256(manifest), originReceipt: receipt, manifest: manifest });
  return approved;
}, []);
if (!modules.length) throw new Error('Module artifact has no publishable approved modules');
var artifact = { schemaVersion: 1, artifactKind: 'GameCastleModuleCatalog', createdAt: new Date().toISOString(), catalogSchemaVersion: catalog.schemaVersion, modules: modules, unpublishedModules: unpublishedModules };
artifact.artifactSha256 = sha256(Object.assign({}, artifact, { createdAt: null, artifactSha256: null }));
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'module-catalog.json'), JSON.stringify(artifact, null, 2), 'utf8');
fs.writeFileSync(path.join(outputDir, 'module-catalog.sha256'), artifact.artifactSha256 + '  module-catalog.json\n', 'utf8');
console.log('[ModuleArtifact] ' + modules.length + ' authorized immutable module revisions; ' + unpublishedModules.length + ' excluded for missing origin receipt -> ' + outputDir + ' (' + artifact.artifactSha256 + ')');
