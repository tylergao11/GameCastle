var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var runtimeCodegen = require('../ai/runtime-codegen');
var extensionLoader = require('../ai/gdevelop-extension-loader');

var ROOT = path.resolve(__dirname, '..');
var BINDINGS = path.join(ROOT, 'ai', 'gdevelop-truth', 'official-capability-bindings.json');
var OUT = path.join(ROOT, 'ai', 'gdevelop-truth', 'object-configuration-truth.json');
var CHECK = process.argv.indexOf('--check') >= 0;
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, {}); return value; }
function methods(value) { return Object.getOwnPropertyNames(Object.getPrototypeOf(value)).filter(function(name) { return name !== 'constructor' && name !== '__class__' && name !== '__destroy__' && name !== 'delete'; }).sort(); }

(async function() {
  var libGdPath = runtimeCodegen.resolveLibGdPath();
  var gd = await require(libGdPath)({ locateFile: function(fileName) { return path.join(path.dirname(libGdPath), fileName); } });
  var extensionEvidence = extensionLoader.loadOfficialExtensions(gd, path.join(path.dirname(libGdPath), 'extensions'));
  var bindings = JSON.parse(fs.readFileSync(BINDINGS, 'utf8'));
  var typeMap = {};
  (bindings.objectTypes || []).forEach(function(type) { typeMap[type.extension + '|' + type.runtimeType] = type; });
  Object.keys(bindings.bindings || {}).forEach(function(capabilityId) {
    if (capabilityId.indexOf('::object::') < 0) return;
    var binding = bindings.bindings[capabilityId];
    if (binding.metadataExtension && binding.metadataOwnerId) typeMap[binding.metadataExtension + '|' + binding.metadataOwnerId] = { extension: binding.metadataExtension, runtimeType: binding.metadataOwnerId };
  });
  var records = Object.keys(typeMap).sort().map(function(key) { var type = typeMap[key];
    var project = gd.ProjectHelper.createNewGDJSProject();
    try {
      var object = project.getObjects().insertNewObject(project, type.runtimeType, 'ObjectProbe', 0);
      if (!object) throw new Error('Official runtime returned no object declaration.');
      var configuration = object.getConfiguration(), element = new gd.SerializerElement();
      configuration.serializeTo(element);
      var value = { extension: type.extension, runtimeType: type.runtimeType, status: 'executable', configurationType: configuration.getType(), methods: methods(configuration), defaultData: JSON.parse(gd.Serializer.toJSON(element)) };
      element.delete();
      return value;
    } catch (error) {
      return { extension: type.extension, runtimeType: type.runtimeType, status: 'unavailable', reason: String(error && error.message || error) };
    } finally { project.delete(); }
  }).sort(function(left, right) { return (left.extension + '|' + left.runtimeType).localeCompare(right.extension + '|' + right.runtimeType); });
  var output = stable({ schemaVersion: 1, kind: 'gdevelop-object-configuration-truth', source: { libGD: sha256(libGdPath), extensionCommit: extensionEvidence.commit }, objects: records });
  var serialized = JSON.stringify(output, null, 2) + '\n';
  if (CHECK) { if (!fs.existsSync(OUT) || fs.readFileSync(OUT, 'utf8') !== serialized) throw new Error('GDevelop object configuration truth drifted. Run node scripts/extract-gdevelop-object-configuration-truth.js'); console.log('[GDevelopObjectConfigurationTruth] snapshot OK: ' + records.length + ' official object types'); return; }
  fs.writeFileSync(OUT, serialized, 'utf8');
  console.log('[GDevelopObjectConfigurationTruth] wrote ' + OUT + ': ' + records.length + ' official object types');
})().catch(function(error) { console.error(error); process.exit(1); });
