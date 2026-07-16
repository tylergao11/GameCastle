var assert = require('assert');
var dsl = require('../../packages/product/src/assembly-review-dsl');

assert.strictEqual(dsl.LANGUAGE_ID, 'assembly-review-dsl-v1');
assert.deepStrictEqual(dsl.parseProgram('ACCEPT'), { decision: 'accepted', observations: [] });

var rejected = dsl.parseProgram([
  'REJECT',
  'OBSERVE code=ASSEMBLY_LEGIBILITY_FAILED description="Player \\"sprite\\" is too small."',
  'EVIDENCE visualFact="The player occupies fewer than 16 visible pixels."',
  'REGION x=390 y=290 width=12 height=12',
  'TARGET collection="layoutIntents" semanticId="player_layout"',
  'TARGET collection="entities" semanticId="player"',
  'END'
].join('\n'));
assert.strictEqual(rejected.decision, 'rejected');
assert.strictEqual(rejected.observations.length, 1);
assert.strictEqual(rejected.observations[0].description, 'Player "sprite" is too small.');
assert.deepStrictEqual(rejected.observations[0].evidence.screenshotRegion, { x: 390, y: 290, width: 12, height: 12 });
assert.deepStrictEqual(rejected.observations[0].targets, [{ collection: 'layoutIntents', semanticId: 'player_layout' }, { collection: 'entities', semanticId: 'player' }]);

var facts = dsl.renderFactRows('source', { game: { semanticId: 'demo' }, entities: [{ semanticId: 'player', visible: true }] }).join('\n');
assert(facts.indexOf('FACT scope="source" path="/game/semanticId" kind=text value="demo"') >= 0);
assert(facts.indexOf('FACT scope="source" path="/entities/0/visible" kind=boolean value=true') >= 0);
assert.strictEqual(facts.indexOf('{"'), -1, 'Context is emitted as FACT rows, not a serialized object document.');

assert.throws(function() { dsl.parseProgram('REJECT'); }, function(error) { return error.code === 'ASSEMBLY_REVIEW_DSL_INVALID'; }, 'REJECT requires factual observations.');
assert.throws(function() { dsl.parseProgram('ACCEPT\nREJECT'); }, function(error) { return error.code === 'ASSEMBLY_REVIEW_DSL_ACCEPTANCE_MIXED'; }, 'ACCEPT cannot share an output program.');
assert.throws(function() { dsl.parseProgram('REJECT\nOBSERVE code=ASSEMBLY_LEGIBILITY_FAILED description="Fact"\nEVIDENCE visualFact="Visible"\nREGION NONE\nEND'); }, function(error) { return error.code === 'ASSEMBLY_REVIEW_DSL_INVALID'; }, 'Every observation needs one semantic target.');
var syntacticallyValidRegion = dsl.parseProgram('REJECT\nOBSERVE code=ASSEMBLY_LEGIBILITY_FAILED description="Fact"\nEVIDENCE visualFact="Visible"\nREGION x=-1 y=0 width=1 height=1\nTARGET collection="layoutIntents" semanticId="player_layout"\nEND');
assert.strictEqual(syntacticallyValidRegion.observations[0].evidence.screenshotRegion.x, -1, 'DSL syntax preserves finite coordinates for the Reviewer owner to validate.');
assert.throws(function() { dsl.parseProgram('{ decision: accepted }'); }, function(error) { return error.code === 'ASSEMBLY_REVIEW_DSL_INVALID'; }, 'Object-document output is not Assembly Review DSL.');

console.log('[AssemblyReviewDSL] strict ACCEPT or REJECT/OBSERVE grammar and FACT-row context passed');
