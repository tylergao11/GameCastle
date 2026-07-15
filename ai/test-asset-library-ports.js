/* Test-only deterministic AssetLibrary port. Runtime must inject a durable cloud implementation. */
function createTestAssetLibraryPort() {
  var records = {}, publications = [];
  return {
    state: { records: records, publications: publications },
    lookup: async function(query) { return records[query.requirementFingerprint] || null; },
    materialize: async function(query) {
      var record = Object.keys(records).map(function(key) { return records[key]; }).filter(function(value) { return value.recordId === query.recordId; })[0];
      if (!record || record.revision.revisionId !== query.revisionId) throw new Error('Test AssetLibrary record is unavailable.');
      return Object.assign({}, record.revision);
    },
    publish: async function(request) {
      var existing = records[request.requirementFingerprint];
      if (existing) {
        if (existing.revision.revisionId !== request.revision.revisionId) throw new Error('Test AssetLibrary rejects conflicting publication for one requirement fingerprint.');
        return { recordId: existing.recordId, revisionId: existing.revision.revisionId, published: true };
      }
      var record = { recordId: 'library.' + request.requirementFingerprint.slice(-24), requirementFingerprint: request.requirementFingerprint, revision: Object.assign({}, request.revision), status: 'published', provenance: Object.assign({}, request.provenance) };
      records[request.requirementFingerprint] = record;
      publications.push(record);
      return { recordId: record.recordId, revisionId: record.revision.revisionId, published: true };
    }
  };
}
module.exports = { createTestAssetLibraryPort: createTestAssetLibraryPort };
