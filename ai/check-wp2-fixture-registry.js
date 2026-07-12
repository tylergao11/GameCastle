var assert = require('assert').strict; var registry = require('./wp2-fixture-registry');
var fixtures = registry.list(); assert.equal(fixtures.filter(function(item) { return item.mode === 'create'; }).length, 10); assert.equal(fixtures.filter(function(item) { return item.mode === 'continue'; }).length, 5);
assert.equal(registry.coverage(fixtures.map(function(item) { return { id: item.id, pass: true }; })).missing.length, 0);
console.log('[WP2FixtureRegistry] ten create and five continue acceptance identities passed');
