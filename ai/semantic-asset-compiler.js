var crypto = require('crypto');
var sourceContract = require('./game-semantic-source');
var assetProductionTruth = require('../shared/asset-production-pipeline-contract.json');
var dictionary = require('./capability-semantic-dictionary');
var assetBindings = require('./gdjs-asset-binding-dictionary');

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, {}); return value; }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0, 24); }

function compile(source, options) {
  var valid = sourceContract.validateSource(source, options);
  var index = options && options.index || dictionary.buildIndex();
  var entities = {};
  valid.entities.forEach(function(entity) { entities[entity.semanticId] = entity; });
  var requirements = valid.assetIntents.map(function(intent) {
    var family = assetProductionTruth.productionFamilies[intent.productionFamily];
    if (!family || !family.defaultRecipeId) throw new Error('Pinned asset production truth has no default recipe for: ' + intent.productionFamily);
    var subject = entities[intent.subject];
    var objectType = subject && subject.objectTypeRef && dictionary.resolveObjectType(index, subject.objectTypeRef);
    var adapter = objectType && objectType.configuration && assetBindings.resolve(objectType.configuration.configurationType);
    if (objectType && !adapter) throw new Error('SEMANTIC_ASSET_BINDING_UNSUPPORTED: ' + intent.subject + ' has no official asset adapter.');
    if (adapter && adapter.mode !== 'single-resource') throw new Error('SEMANTIC_ASSET_BINDING_NOT_APPLICABLE: ' + intent.subject + ' does not consume one external resource.');
    return {
      semanticId: intent.semanticId,
      subject: intent.subject,
      description: intent.description,
      roles: clone(intent.roles),
      gdjsBindings: clone(intent.bindings),
      productionFamily: intent.productionFamily,
      recipeId: family.defaultRecipeId,
      styleId: intent.styleId,
      constraints: clone(intent.constraints),
      resourceKind: adapter && adapter.resourceKind || null,
      acceptedFormats: adapter ? clone(adapter.acceptedFormats) : [],
      gdjsAssetAdapterId: adapter && adapter.adapterId || null
    };
  });
  var document = {
    schemaVersion: 2,
    documentKind: 'semantic-asset-requirements',
    compilerKind: 'semantic-source-to-asset-requirements',
    sourceHash: sourceContract.sourceHash(valid),
    dictionarySource: clone(valid.dictionarySource),
    assetProductionTruth: { contractId: assetProductionTruth.contractId, schemaVersion: assetProductionTruth.schemaVersion },
    requirements: requirements
  };
  document.contentHash = 'asset.' + hash(document);
  return document;
}

module.exports = { compile: compile };
