var assert = require('assert');
var dictionary = require('../shared/cloud-asset-dictionary.json');
var contract = require('../shared/cloud-asset-engine-contract.json');

assert.equal(dictionary.dictionaryId, 'gamecastle.cloud-asset-dictionary');
assert.equal(dictionary.governance.valuesAreClosed, true);
assert.equal(dictionary.governance.unknownIdsFailClosed, true);
assert.equal(dictionary.governance.runtimeAliasesForbidden, true);
['semanticTags', 'bundleKinds', 'qualityTiers', 'qualityFlags', 'provenanceTypes', 'licensePolicies'].forEach(function(section) { assert(Object.keys(dictionary[section]).length > 0, 'empty dictionary section: ' + section); });
Object.keys(dictionary.semanticTags).forEach(function(id) { assert(/^[a-z]+\.[a-z0-9-]+$/.test(id), 'invalid semantic tag id: ' + id); });
Object.keys(dictionary.licensePolicies).forEach(function(id) { var policy = dictionary.licensePolicies[id]; ['reuseAllowed', 'derivativeAllowed', 'redistributeInGameAllowed', 'publicPromotionAllowed', 'attributionRequired'].forEach(function(field) { assert.equal(typeof policy[field], 'boolean', id + ' missing ' + field); }); });
assert.equal(dictionary.licensePolicies['license.unknown'].publicPromotionAllowed, false);
assert.equal(dictionary.provenanceTypes['provenance.simulated'].publicPromotionAllowed, false);
assert(contract.hardGates.indexOf('no-free-form-public-classification-license-or-quality-id') >= 0);
console.log('[CloudAssetDictionary] classification, quality, provenance, bundle, and license IDs are closed and fail-closed');
