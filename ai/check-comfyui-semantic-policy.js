var assert = require('assert');
var styleDNA = require('./style-dna');
var comfy = require('./comfyui-local-provider');

var policy = styleDNA.reviewPolicy('gamecastle.style-dna.v1', ['hero'], { transparent: true, productionFamily: 'character' });
var contaminated = comfy._semanticDecision('A cartoon hero standing on a stone platform against a painted background.', policy);
assert.equal(contaminated.pass, false);
assert.equal(contaminated.repairable, true);
assert.deepStrictEqual(contaminated.evidence.matchedTags, ['hero']);
assert.deepStrictEqual(contaminated.evidence.forbiddenGroups, ['background_contamination']);

var isolated = comfy._semanticDecision('A single cartoon hero character with a red cape.', policy);
assert.equal(isolated.pass, true);
assert.deepStrictEqual(isolated.issues, []);
console.log('[ComfyUISemanticPolicy] Style-DNA-owned semantic groups reject contaminated transparent subjects and accept isolated requested subjects');
