/* Test-only process-memory ports. They are deliberately non-durable and cannot be selected by runtime code. */
function createInMemoryCloudPorts() {
  var state = { graph: null, queue: null, blobs: {}, projections: [] };
  return {
    state: state,
    ports: {
      blobStore: {
        put: function(bytes, metadata) { var storageKey = 'memory://' + metadata.sha256; state.blobs[storageKey] = Buffer.from(bytes); return { storageKey: storageKey, sha256: metadata.sha256 }; },
        get: function(ref) { return Buffer.from(state.blobs[ref.storageKey]); }
      },
      relationIndex: { load: function() { return state.graph; }, save: function(value) { state.graph = value; } },
      promotionQueue: { load: function() { return state.queue; }, save: function(value) { state.queue = value; } },
      projectionIndex: { rebuild: function(value) { var projection = { approvedRevisionIds: value.revisions.filter(function(revision) { return revision.status === 'approved' && revision.scope === 'cloud-shared'; }).map(function(revision) { return revision.revisionId; }) }; state.projections.push(projection); return projection; } }
    }
  };
}
module.exports = { createInMemoryCloudPorts: createInMemoryCloudPorts };
