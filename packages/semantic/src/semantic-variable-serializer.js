function fail(name) { var error = new Error('Semantic variable ' + name + ' has no official GDevelop variable representation.'); error.code = 'SEMANTIC_VARIABLE_UNMATERIALIZABLE'; error.owner = 'GDJSVariableSerializer'; throw error; }
function serialize(name, value) {
  if (typeof value === 'number' && isFinite(value)) return { name: name, type: 'number', value: value };
  if (typeof value === 'string') return { name: name, type: 'string', value: value };
  if (typeof value === 'boolean') return { name: name, type: 'boolean', value: value };
  if (Array.isArray(value)) return { name: name, type: 'array', children: value.map(function(child) { var serialized = serialize('', child); delete serialized.name; return serialized; }) };
  if (value && typeof value === 'object') return { name: name, type: 'structure', children: Object.keys(value).sort().map(function(childName) { return serialize(childName, value[childName]); }) };
  fail(name);
}
function serializeMap(values, nameForKey) {
  return Object.keys(values || {}).sort().map(function(key) { return serialize(nameForKey ? nameForKey(key) : key, values[key]); });
}
module.exports = { serialize: serialize, serializeMap: serializeMap };
