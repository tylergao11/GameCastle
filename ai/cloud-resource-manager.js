var fs = require('fs');
var path = require('path');

function readJson(filePath, fallback) { return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : fallback; }
function writeJson(filePath, value) { fs.mkdirSync(path.dirname(filePath), { recursive: true }); fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8'); }
function createCloudResourceManager(options) {
  options = options || {};
  if (!options.cloudRepository || typeof options.cloudRepository.publishAccepted !== 'function') throw new Error('CloudResourceManager requires cloud repository');
  var queuePath = options.queuePath || path.join(process.cwd(), 'output', 'cloud-resource-queue.json');
  function load() { return readJson(queuePath, { schemaVersion: 1, entries: [] }); }
  function save(value) { writeJson(queuePath, value); }
  function enqueue(assetWeaveResult) {
    if (!assetWeaveResult || !Array.isArray(assetWeaveResult.cloudPromotionQueue)) throw new Error('CloudResourceManager requires Asset Weave promotion queue');
    var queue = load();
    assetWeaveResult.cloudPromotionQueue.forEach(function(entry) {
      if (!entry.asset || !entry.receipt || entry.receipt.accepted !== true) throw new Error('Cloud resource entry requires accepted asset and receipt');
      if (!queue.entries.some(function(saved) { return saved.asset.assetId === entry.asset.assetId; })) queue.entries.push({ status: 'pending', queuedAt: new Date().toISOString(), asset: entry.asset, receipt: entry.receipt });
    });
    save(queue); return queue.entries.slice();
  }
  function sync() {
    var queue = load();
    queue.entries.forEach(function(entry) { if (entry.status === 'pending') { var published = options.cloudRepository.publishAccepted(entry.asset, entry.receipt); entry.status = 'published'; entry.publishedAssetId = published.assetId; entry.syncedAt = new Date().toISOString(); } });
    save(queue); return queue.entries.slice();
  }
  return { enqueue: enqueue, sync: sync, search: function(tags) { return options.cloudRepository.findByTags(tags); }, findExactForSpec: function(spec) { return options.cloudRepository.findExactForSpec(spec); }, findNearForSpec: function(spec) { return options.cloudRepository.findNearForSpec(spec); }, materialize: function(assetId, projectAssetDir) { return options.cloudRepository.materialize(assetId, projectAssetDir); }, listQueue: function() { return load().entries.slice(); } };
}
module.exports = { createCloudResourceManager: createCloudResourceManager };
