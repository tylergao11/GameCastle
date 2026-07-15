var assetLibrary = require('./asset-library');

async function drain(input) {
  input = input || {};
  var library = assetLibrary.create(input.assetLibraryPort), outbox = input.outbox, published = [], failed = [];
  if (!outbox || typeof outbox.pending !== 'function') { var error = new Error('AssetLibraryPublisher requires an outbox.'); error.code = 'ASSET_PUBLICATION_OUTBOX_REQUIRED'; throw error; }
  var entries = outbox.pending();
  for (var index = 0; index < entries.length; index++) {
    var entry = entries[index];
    try {
      var receipt = await library.publish(entry.requirement, entry.revision, entry.provenance);
      published.push(outbox.markPublished(entry.entryId, receipt));
    } catch (error) {
      failed.push(outbox.markFailed(entry.entryId, error));
    }
  }
  return { published: published, failed: failed, pending: outbox.pending() };
}

module.exports = { drain: drain };
