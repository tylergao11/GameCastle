var assert = require('assert').strict;
var repository = require('./cloud-library-repository');
var calls = [], releaseEvents = [];
var client = { query: async function(sql, values) { calls.push({ sql: sql, values: values }); if (sql.indexOf('pg_extension') >= 0) return { rows: [{ extversion: '0.test' }] }; if (sql.indexOf('FROM module_revision') >= 0) return { rows: [{ module_id: values[0], revision: values[1], status: 'approved-local' }] }; if (sql.indexOf('INSERT INTO module_release_event') >= 0) { releaseEvents.push({ release_event_id: values[0], channel: values[1], module_id: values[2], revision: values[3] }); return { rows: [] }; } if (sql.indexOf('FROM module_release_event') >= 0) return { rows: releaseEvents.length ? [releaseEvents[releaseEvents.length - 1]] : [] }; if (sql.indexOf('FROM asset_revision') >= 0) return { rows: [{ sha256: values[0], revision_id: 'revision.test' }] }; return { rows: [] }; } };
async function main() {
  var repo = repository.createCloudLibraryRepository({ client: client });
  assert.deepEqual(await repo.health(), { postgres: true, pgvector: true, pgvectorVersion: '0.test' });
  var asset = await repo.putAssetRevision({ familyId: 'family.test', revisionId: 'revision.test', bytesSha256: 'a'.repeat(64), objectKey: 'assets/a.png', kind: 'raster', styleId: 'gamecastle.style-dna.v1', semanticTags: ['character'], provenanceReceipt: { source: 'internal' } });
  assert.equal(asset.revisionId, 'revision.test');
  var module = await repo.putModuleRevision({ moduleId: 'core.route_dash', revision: 'local-v1', manifest: { id: 'core.route_dash' }, originReceipt: { authorization: 'internal-original-module' }, promotionReceipt: { decision: 'approved-local' } });
  assert.equal(module.manifestSha256, repository.sha256({ id: 'core.route_dash' }));
  assert((await repo.audit('promotion', 'core.route_dash', { decision: 'approved-local' })).indexOf('audit.') === 0);
  assert.equal((await repo.getAssetRevisionByHash('a'.repeat(64))).revision_id, 'revision.test');
  var release = await repo.selectModuleRelease({ channel: 'approved-local', moduleId: 'core.route_dash', revision: 'local-v1', reason: 'initial-local-approval', actor: 'GameCastle' });
  assert.equal(release.action, 'promote');
  var rollback = await repo.selectModuleRelease({ channel: 'approved-local', moduleId: 'core.route_dash', revision: 'local-v0', reason: 'known-good-rollback', actor: 'GameCastle' });
  assert.equal(rollback.action, 'rollback'); assert.equal(rollback.previousReleaseEventId, release.releaseEventId); assert.equal((await repo.getSelectedModuleRelease('approved-local', 'core.route_dash')).revision, 'local-v0');
  assert(calls.some(function(call) { return call.sql.indexOf('asset_revision') >= 0; }));
  assert(calls.some(function(call) { return call.sql.indexOf('module_revision') >= 0; }));
  assert(calls.some(function(call) { return call.sql.indexOf('module_release_event') >= 0; }));
  console.log('[CloudLibraryRepository] Postgres persistence contract and immutable hashes passed');
}
main().catch(function(error) { console.error(error); process.exit(1); });
