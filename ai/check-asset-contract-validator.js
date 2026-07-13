var assert = require('assert');
var validator = require('./asset-contract-validator');
var slot = { slotId: 'asset.hero', styleId: 'gamecastle.style-dna.v1', semanticTags: ['hero'], styleTags: ['arcade'], constraints: { width: 32, height: 48, transparent: true } };
var valid = { path: 'memory://hero', format: 'png', width: 32, height: 48, transparent: true, styleId: 'gamecastle.style-dna.v1', semanticTags: ['hero'], styleTags: ['arcade'], publishability: { playable: true, blocksFinalExport: false } };
assert.equal(validator.validateAssetCandidate(slot, valid).pass, true);
var invalid = validator.validateAssetCandidate(slot, Object.assign({}, valid, { source: 'imageGeneration', status: 'reused', format: 'jpeg', width: 31, transparent: false, styleId: 'other.style', styleTags: [], publishability: { playable: false, blocksFinalExport: true } }));
assert.equal(invalid.pass, false);
['format_must_be_png', 'width_mismatch', 'transparent_png_required', 'style_tags_mismatch', 'style_id_mismatch', 'model_status_invalid', 'not_playable', 'blocks_final_export'].forEach(function(error) { assert(invalid.errors.indexOf(error) >= 0, error + ' must be reported'); });
console.log('[AssetContractValidator] deterministic asset constraints passed');
