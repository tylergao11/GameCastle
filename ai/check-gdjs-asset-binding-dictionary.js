var assert = require('assert');
var crypto = require('crypto');
var fs = require('fs');
var os = require('os');
var path = require('path');
var defaults = require('./gdevelop-truth/project-defaults.json');
var configurationTruth = require('./gdevelop-truth/object-configuration-truth.json');
var adapterDictionary = require('./gdjs-asset-binding-dictionary');
var binder = require('./gdjs-project-asset-binder');
var png = require('./local-derivation-port');
var spatialEngine = require('../runtime/spatial');
var layoutDictionary = require('../shared/semantic-layout-dictionary.json');

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function digest(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, Object.create(null)); return value; }
function seal(value, prefix) { var core = clone(value); delete core.contentHash; value.contentHash = prefix + crypto.createHash('sha256').update(JSON.stringify(stable(core))).digest('hex').slice(0, 24); return value; }

var truthByConfiguration = {};
configurationTruth.objects.forEach(function(record) { truthByConfiguration[record.configurationType] = record; });
assert.deepStrictEqual(Object.keys(adapterDictionary.dictionary.adapters).sort(), Object.keys(truthByConfiguration).sort(), 'The asset binding dictionary must explicitly cover every official executable object configuration.');

var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-asset-adapter-'));
try {
  var image = png.encodePng({ width: 1, height: 1, data: Buffer.from([255, 255, 255, 255]) });
  var files = {};
  function fixtureFile(format) {
    if (files[format]) return files[format];
    var bytes = format === 'png' ? image : Buffer.from('gamecastle official adapter fixture\n', 'utf8');
    var value = { path: path.join(root, 'fixture.' + format), sha256: digest(bytes), format: format };
    fs.writeFileSync(value.path, bytes);
    files[format] = value;
    return value;
  }

  var project = clone(defaults.project);
  var declarations = [];
  var requirements = [];
  var slots = [];
  project.objects = [];
  configurationTruth.objects.forEach(function(record, index) {
    var adapter = adapterDictionary.resolve(record.configurationType);
    var semanticId = 'official_' + index;
    var objectName = 'Official_' + index;
    declarations.push({ semanticId: semanticId, objectName: objectName, typeRef: 'gdjs://object/' + record.runtimeType, type: record.runtimeType, configuration: { configurationType: record.configurationType }, variables: [], behaviors: [] });
    project.objects.push({ name: objectName, type: record.runtimeType, variables: [], behaviors: [], effects: [] });
    if (adapter.mode === 'none') return;
    assert.strictEqual(adapter.mode, 'single-resource', record.configurationType + ' adapter mode must be explicit');
    assert(adapter.resourceKind && Array.isArray(adapter.acceptedFormats) && adapter.acceptedFormats.length && Array.isArray(adapter.operations) && adapter.operations.length, record.configurationType + ' adapter must describe one executable external resource binding');
    var file = fixtureFile(adapter.acceptedFormats[0]);
    var assetId = 'asset_' + index;
    requirements.push({ semanticId: assetId, subject: semanticId });
    slots.push({ semanticId: assetId, path: file.path, sha256: file.sha256, format: file.format, resourceKind: adapter.resourceKind });
  });

  var layoutPlan = { schemaVersion: 5, documentKind: 'semantic-layout-plan', compilerKind: 'semantic-source-to-layout-plan', sourceHash: 'semantic.official-adapter-coverage', realizedSourceHash: 'semantic.official-adapter-coverage', dictionarySource: { layoutDictionaryHash: digest(Buffer.from(JSON.stringify(stable(layoutDictionary)))) }, coordinateContract: clone(layoutDictionary.coordinateContract), intents: [], contentHash: '' };
  seal(layoutPlan, 'layout.');
  var seed = { schemaVersion: 2, documentKind: 'gdjs-project-seed', sourceHash: 'semantic.official-adapter-coverage', dictionarySource: layoutPlan.dictionarySource, project: project, objectDeclarations: declarations, assetBindingRequirements: requirements, layoutPlan: layoutPlan, spatialAssemblyRequest: spatialEngine.createAssemblyRequest(layoutPlan), contentHash: 'project-seed.fixture' };
  var world = { schemaVersion: 2, documentKind: 'semantic-asset-world', sourceHash: seed.sourceHash, contentHash: 'fixture.asset-world', slots: slots };
  var bound = binder.bindResources(seed, world);
  assert.strictEqual(bound.resources.length, requirements.length, 'Every external-resource adapter must materialize exactly one GDevelop resource.');
  assert.strictEqual(bound.generatedCode.length, project.layouts.length, 'All official adapter configurations must compile through libGD.');
  console.log('[GDJSAssetBindingDictionary] ' + Object.keys(truthByConfiguration).length + ' official configurations explicitly covered and compiled');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
