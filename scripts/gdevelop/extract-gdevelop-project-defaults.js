var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var runtimeCodegen = require('../../packages/gdjs/src/runtime-codegen');
var extensionLoader = require('../../packages/gdjs/src/gdevelop-extension-loader');

var ROOT = require('../shared/repository-path').root;
var OUT = path.join(ROOT, 'packages', 'gdjs', 'generated', 'project-defaults.json');
var CHECK = process.argv.indexOf('--check') >= 0;
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, {}); return value; }

(async function() {
  var libGdPath = runtimeCodegen.resolveLibGdPath();
  if (!fs.existsSync(libGdPath)) throw new Error('Missing pinned libGD compiler: ' + libGdPath);
  var gd = await require(libGdPath)({ locateFile: function(fileName) { return path.join(path.dirname(libGdPath), fileName); } });
  var extensionEvidence = extensionLoader.loadOfficialExtensions(gd, path.join(path.dirname(libGdPath), 'extensions'));
  var project = gd.ProjectHelper.createNewGDJSProject();
  project.insertNewLayout('Scene', 0);
  var element = new gd.SerializerElement();
  project.serializeTo(element);
  var projectData = JSON.parse(gd.Serializer.toJSON(element));
  element.delete();
  project.delete();
  var output = stable({ schemaVersion: 1, kind: 'gdevelop-project-defaults', source: { libGD: sha256(libGdPath), extensionCommit: extensionEvidence.commit }, project: projectData });
  var serialized = JSON.stringify(output, null, 2) + '\n';
  if (CHECK) {
    if (!fs.existsSync(OUT) || fs.readFileSync(OUT, 'utf8') !== serialized) throw new Error('GDevelop project defaults drifted. Run node scripts/gdevelop/extract-gdevelop-project-defaults.js');
    console.log('[GDevelopProjectDefaults] snapshot OK');
    return;
  }
  fs.writeFileSync(OUT, serialized, 'utf8');
  console.log('[GDevelopProjectDefaults] wrote ' + OUT);
})().catch(function(error) { console.error(error); process.exit(1); });
