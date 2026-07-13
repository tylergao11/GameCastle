var crypto = require('crypto');
var registry = require('../shared/wp2-mechanic-registry.json');
function stable(value) { if (value === null || typeof value !== 'object') return JSON.stringify(value); if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']'; return '{' + Object.keys(value).sort().map(function(key) { return JSON.stringify(key) + ':' + stable(value[key]); }).join(',') + '}'; }
function hash(value) { return crypto.createHash('sha256').update(stable(value)).digest('hex'); }
function resolve(ref) {
  if (!ref || !ref.mechanicId || ref.revision === undefined || !ref.contentHash) throw new Error('Mechanic revision ref requires mechanicId, revision, and contentHash.');
  var record = registry.approvedRevisions[ref.mechanicId] && registry.approvedRevisions[ref.mechanicId][String(ref.revision)];
  if (!record || record.status !== 'approved') throw new Error('Unapproved mechanic revision: ' + ref.mechanicId + '@' + ref.revision);
  var source = registry.mechanics[record.sourceMechanicId];
  if (!source || hash(source) !== record.contentHash || record.contentHash !== ref.contentHash) throw new Error('Mechanic revision hash mismatch: ' + ref.mechanicId + '@' + ref.revision);
  return Object.assign({}, record, { mechanic: source });
}
function approvedRef(mechanicId, revision) { var record = registry.approvedRevisions[mechanicId] && registry.approvedRevisions[mechanicId][String(revision || 1)]; if (!record) throw new Error('No approved mechanic revision: ' + mechanicId); return { mechanicId: record.mechanicId, revision: record.revision, contentHash: record.contentHash }; }
module.exports = { registry: registry, resolve: resolve, approvedRef: approvedRef, hash: hash };
