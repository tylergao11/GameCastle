var REQUIRED = {
  'runner-platformer': ['linear', 'branching-route'],
  'top-down-collector': ['arena', 'rooms'],
  'lightweight-shooter': ['arena', 'lanes'],
  'interaction-puzzle': ['rooms', 'grid'],
  'idle-clicker': ['single-screen', 'staged-zones']
};
function list() { return Object.keys(REQUIRED).reduce(function(all, archetype) { return all.concat(REQUIRED[archetype].map(function(topology) { return { id: archetype + '.' + topology, archetype: archetype, topology: topology, mode: 'create' }; })).concat([{ id: archetype + '.continue', archetype: archetype, mode: 'continue' }]); }, []); }
function coverage(results) { var expected = list().map(function(item) { return item.id; }); var actual = (results || []).filter(function(item) { return item && item.pass; }).map(function(item) { return item.id; }); return { expected: expected, passed: actual, missing: expected.filter(function(id) { return actual.indexOf(id) < 0; }) }; }
module.exports = { list: list, coverage: coverage };
