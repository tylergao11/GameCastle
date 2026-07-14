var crypto = require('crypto');

function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, {}); return value; }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }
function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'SemanticAssetCache'; throw error; }

function key(sourceHash, requirement) {
  if (typeof sourceHash !== 'string' || !sourceHash) fail('SEMANTIC_ASSET_CACHE_SOURCE_INVALID', 'SemanticAssetCache key requires sourceHash.');
  if (!requirement || typeof requirement !== 'object' || typeof requirement.semanticId !== 'string' || !requirement.semanticId) fail('SEMANTIC_ASSET_CACHE_REQUIREMENT_INVALID', 'SemanticAssetCache key requires a semantic asset requirement.');
  return 'semantic-asset.' + hash({ sourceHash: sourceHash, requirement: requirement });
}
function create(port) {
  if (!port || typeof port.get !== 'function' || typeof port.put !== 'function') fail('SEMANTIC_ASSET_CACHE_PORT_INVALID', 'SemanticAssetCache requires get and put port operations.');
  function lookup(sourceHash, requirement) {
    var cacheKey = key(sourceHash, requirement), record = port.get(cacheKey);
    if (record === null || record === undefined) return null;
    if (!record || record.cacheKey !== cacheKey || record.sourceHash !== sourceHash || !record.requirement || record.requirement.semanticId !== requirement.semanticId || !record.acceptedRevision || !record.acceptedRevision.path || !record.acceptedRevision.sha256) fail('SEMANTIC_ASSET_CACHE_RECORD_INVALID', 'SemanticAssetCache contains an invalid record for ' + cacheKey);
    return clone(record);
  }
  function put(sourceHash, requirement, acceptedRevision) {
    var cacheKey = key(sourceHash, requirement);
    if (!acceptedRevision || typeof acceptedRevision !== 'object' || !acceptedRevision.path || !acceptedRevision.sha256 || !acceptedRevision.revisionId) fail('SEMANTIC_ASSET_CACHE_REVISION_INVALID', 'SemanticAssetCache accepts only a complete accepted revision.');
    var record = { schemaVersion: 1, cacheKey: cacheKey, sourceHash: sourceHash, requirement: clone(requirement), acceptedRevision: clone(acceptedRevision) };
    port.put(cacheKey, clone(record));
    return record;
  }
  return { lookup: lookup, put: put, key: key };
}

module.exports = { key: key, create: create };
