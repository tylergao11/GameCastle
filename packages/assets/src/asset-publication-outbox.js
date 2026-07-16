var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var contract = require('../contracts/asset-library-contract.json');

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'AssetPublicationOutbox'; throw error; }
function resolveFile(options) {
  options = options || {};
  if (options.path) return path.resolve(options.path);
  if (!options.projectAssetDir) fail('ASSET_PUBLICATION_OUTBOX_PATH_REQUIRED', 'Asset publication outbox requires projectAssetDir or an explicit path.');
  return path.resolve(options.projectAssetDir, contract.accumulation.outbox.relativePath);
}
function emptyDocument() { return { schemaVersion: contract.schemaVersion, documentKind: contract.accumulation.outbox.documentKind, entries: [] }; }
function load(file) {
  if (!fs.existsSync(file)) return emptyDocument();
  var parsed; try { parsed = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_error) { fail('ASSET_PUBLICATION_OUTBOX_INVALID', 'Asset publication outbox is not valid JSON.'); }
  if (!parsed || parsed.schemaVersion !== contract.schemaVersion || parsed.documentKind !== contract.accumulation.outbox.documentKind || !Array.isArray(parsed.entries)) fail('ASSET_PUBLICATION_OUTBOX_INVALID', 'Asset publication outbox violates its contract.');
  return parsed;
}
function persist(file, document) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  var temporary = file + '.tmp-' + process.pid + '-' + crypto.randomUUID();
  fs.writeFileSync(temporary, JSON.stringify(document, null, 2) + '\n', 'utf8');
  fs.renameSync(temporary, file);
}
function create(options) {
  var file = resolveFile(options);
  function mutate(work) { var document = load(file), result = work(document); persist(file, document); return result; }
  function enqueue(request) {
    if (!request || !request.requirementFingerprint || !request.requirement || !request.revision || request.revision.status !== 'accepted') fail('ASSET_PUBLICATION_REQUEST_INVALID', 'Outbox accepts only complete accepted revision publication requests.');
    var entryId = 'publication.' + hash([request.requirementFingerprint, request.revision.revisionId]);
    return mutate(function(document) {
      var existing = document.entries.filter(function(entry) { return entry.entryId === entryId; })[0];
      if (existing) return clone(existing);
      var entry = { entryId: entryId, state: 'pending', attempts: 0, requirementFingerprint: request.requirementFingerprint, requirement: clone(request.requirement), revision: clone(request.revision), provenance: clone(request.provenance || {}), publicationReceipt: null, lastFailure: null };
      document.entries.push(entry);
      return clone(entry);
    });
  }
  function pending() { return load(file).entries.filter(function(entry) { return entry.state === 'pending'; }).map(clone); }
  function markPublished(entryId, receipt) { return mutate(function(document) { var entry = document.entries.filter(function(value) { return value.entryId === entryId; })[0]; if (!entry) fail('ASSET_PUBLICATION_ENTRY_MISSING', 'Outbox publication entry does not exist.'); entry.state = 'published'; entry.attempts += 1; entry.publicationReceipt = clone(receipt); entry.lastFailure = null; return clone(entry); }); }
  function markFailed(entryId, error) { return mutate(function(document) { var entry = document.entries.filter(function(value) { return value.entryId === entryId; })[0]; if (!entry) fail('ASSET_PUBLICATION_ENTRY_MISSING', 'Outbox publication entry does not exist.'); entry.state = 'pending'; entry.attempts += 1; entry.lastFailure = { code: error && error.code || 'ASSET_LIBRARY_PUBLISH_FAILED', owner: error && error.owner || 'AssetLibrary', message: error && error.message || String(error) }; return clone(entry); }); }
  return { path: file, enqueue: enqueue, pending: pending, markPublished: markPublished, markFailed: markFailed, snapshot: function() { return clone(load(file)); } };
}

module.exports = { create: create, resolveFile: resolveFile };
