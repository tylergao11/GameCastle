var assert = require('assert').strict;
var resolver = require('./semantic-reference-resolver');
assert.equal(resolver.resolve('semantic-dictionary#/playGoals/solve').value.meaning.indexOf('solution') >= 0, true);
assert.equal(resolver.resolve('semantic-dictionary#/semantic_concepts/aim_and_fire').source, 'semantic-dictionary');
assert.throws(function() { resolver.resolve('solve'); }, /Non-canonical/);
assert.throws(function() { resolver.resolve('semantic-dictionary#/playGoals/missing'); }, /Unresolved/);
console.log('[SemanticReferenceResolver] canonical existing semantic references passed');
