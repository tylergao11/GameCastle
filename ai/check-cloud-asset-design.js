var assert = require('assert');
var fs = require('fs');
var path = require('path');
var contract = require('../shared/cloud-asset-engine-contract.json');
var cloudDictionary = require('../shared/cloud-asset-dictionary.json');
var styleDictionary = require('../shared/asset-style-dictionary.json');
var templateDictionary = require('../shared/asset-template-dictionary.json');

var root = path.resolve(__dirname, '..');
var truthDoc = fs.readFileSync(path.join(root, 'docs', 'cloud-asset-truth-sources.md'), 'utf8');
var handoff = fs.readFileSync(path.join(root, 'docs', 'cloud-asset-engine-terra-handoff.md'), 'utf8');
var engineSource = fs.readFileSync(path.join(root, 'ai', 'cloud-asset-engine.js'), 'utf8');
var repositorySource = fs.readFileSync(path.join(root, 'ai', 'asset-repository.js'), 'utf8');

assert.equal(contract.truthSources.cloudDictionary, 'shared/cloud-asset-dictionary.json');
assert.equal(contract.truthSources.templateDictionary, 'shared/asset-template-dictionary.json');
assert.equal(styleDictionary.uiTemplates, undefined);
assert.equal(cloudDictionary.governance.styleIdsOwnedBy, styleDictionary.dictionaryId);
assert.equal(cloudDictionary.governance.templateIdsOwnedBy, templateDictionary.dictionaryId);
assert.equal(contract.truthModel.queryProjection.authoritative, false);
assert(contract.conflictRules.indexOf('projection-never-overrides-authoritative-facts') >= 0);
assert(contract.hardGates.indexOf('no-cloud-defined-template-or-style-token') >= 0);
assert.equal(engineSource.indexOf('registerTemplate'), -1, 'CloudAssetEngine must not define templates');
assert.equal(/asset\.license\b|asset\.provenance\b|asset\.quality\b|styleTags/.test(engineSource), false, 'CloudAssetEngine must not retain legacy public fields');
assert.equal(repositorySource.indexOf('publishAccepted'), -1, 'Project-local cache must not implement a second cloud publisher');
['CloudRelationIndexPort', 'CloudBlobStorePort', 'CloudPromotionQueuePort', 'CloudProjectionPort'].forEach(function(owner) { assert(truthDoc.indexOf(owner) >= 0, 'truth source doc missing ' + owner); });
['Dictionary Registry', 'Promotion Validator', 'Query / Rights / Ranking', 'Template Projection', 'Librarian Command Validator', 'Port 与线上适配器'].forEach(function(workPackage) { assert(handoff.indexOf(workPackage) >= 0, 'Terra handoff missing ' + workPackage); });
console.log('[CloudAssetDesign] truth precedence, isolated dictionaries, no cloud-defined templates, and Terra handoff passed');
