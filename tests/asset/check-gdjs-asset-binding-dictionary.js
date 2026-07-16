var assert = require('assert');
var crypto = require('crypto');
var fs = require('fs');
var os = require('os');
var path = require('path');
var defaults = require('../../packages/gdjs/generated/project-defaults.json');
var configurationTruth = require('../../packages/gdjs/generated/object-configuration-truth.json');
var adapterDictionary = require('../../packages/gdjs/src/gdjs-asset-binding-dictionary');
var binder = require('../../packages/gdjs/src/gdjs-project-asset-binder');
var assetWorldContract = require('../../packages/assets/src/asset-world');
var png = require('../../packages/assets/src/local-derivation-port');
var spatialEngine = require('../../packages/spatial/src/runtime');
var layoutDictionary = require('../../packages/semantic/contracts/semantic-layout-dictionary.json');

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
  var manifestAssets = [], workReceipts = [], reviewReceiptsById = {}, acceptedRevisionByTarget = {};
  slots.forEach(function(slot, index) {
    var requirement = requirements[index], target = 'semantic.' + requirement.subject + '.' + slot.semanticId, revisionId = 'asset-revision.' + digest(Buffer.from(slot.semanticId + ':' + slot.sha256)), reviewReceipt;
    var workItemPlanId = 'work.' + slot.semanticId;
    if (slot.resourceKind === 'image') reviewReceipt = { receiptId: 'asset-review.fixture.' + slot.semanticId, owner: 'FixtureReview', phase: 'final-derived-asset', workItemPlanId: workItemPlanId, targetVisualSlotId: target, modelFingerprint: 'fixture-model.v1', imageSha256s: [slot.sha256], semanticMargin: 1, styleMargin: 1, decision: 'accepted' };
    else reviewReceipt = { receiptId: 'resource-integrity.' + digest(Buffer.from(JSON.stringify([workItemPlanId, target, slot.sha256, slot.format]))).slice(0, 24), owner: 'AssetProductionPipeline', phase: 'resource-integrity', workItemPlanId: workItemPlanId, targetVisualSlotId: target, format: slot.format, sha256: slot.sha256, decision: 'accepted' };
    if (reviewReceiptsById[reviewReceipt.receiptId]) assert.deepStrictEqual(reviewReceiptsById[reviewReceipt.receiptId], reviewReceipt, 'one integrity receipt id cannot describe different resource evidence');
    else reviewReceiptsById[reviewReceipt.receiptId] = reviewReceipt;
    var workReceipt = { workItemPlanId: workItemPlanId, finalRevisionId: revisionId, targetVisualSlotId: target, deterministicEvidenceIds: [slot.sha256], reviewReceiptId: reviewReceipt.receiptId, styleId: 'gamecastle.style-dna.v1', decision: 'accepted' };
    workReceipts.push(workReceipt);
    acceptedRevisionByTarget[target] = revisionId;
    manifestAssets.push(Object.assign({}, slot, { slotId: slot.semanticId, targetVisualSlotId: target, assetId: 'asset.' + slot.semanticId, revisionId: revisionId, source: 'fixture', derivationReceipts: [] }));
  });
  var targets = manifestAssets.map(function(asset) { return asset.targetVisualSlotId; }).sort(), setReceipt = { productionSetId: 'production.official-adapter-coverage', workItemAcceptanceReceiptIds: workReceipts.map(function(receipt) { return 'work-acceptance.' + digest(Buffer.from(JSON.stringify(receipt))).slice(0, 24); }), requiredSlotCoverage: { expectedTargetVisualSlotIds: targets, acceptedTargetVisualSlotIds: targets, missingTargetVisualSlotIds: [], complete: true }, acceptedRevisionByTargetVisualSlotId: acceptedRevisionByTarget, decision: 'accepted' };
  var world = assetWorldContract.buildAcceptedAssetWorld({ assetManifest: { meta: { status: 'ready' }, summary: { publishable: true }, sourceHash: seed.sourceHash, productionSetId: setReceipt.productionSetId, assets: manifestAssets }, productionSetAcceptanceReceipt: setReceipt, workItemAcceptanceReceipts: workReceipts, reviewReceipts: Object.keys(reviewReceiptsById).sort().map(function(id) { return reviewReceiptsById[id]; }) });
  var bound = binder.bindResources(seed, world);
  assert.strictEqual(bound.resources.length, requirements.length, 'Every external-resource adapter must materialize exactly one GDevelop resource.');
  assert.strictEqual(bound.generatedCode.length, project.layouts.length, 'All official adapter configurations must compile through libGD.');
  console.log('[GDJSAssetBindingDictionary] ' + Object.keys(truthByConfiguration).length + ' official configurations explicitly covered and compiled');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
