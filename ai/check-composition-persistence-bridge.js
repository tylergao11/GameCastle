var assert = require('assert').strict;
var bridgeModule = require('./composition-persistence-bridge');

async function main() {
  var manifestHash = 'a'.repeat(64), stored = [], audits = [];
  var repository = { getModuleRevision: async function(moduleId, revision) { return { module_id: moduleId, revision: revision, status: 'approved-local', manifest_sha256: manifestHash }; }, putModuleCompositionPlan: async function(input) { stored.push(input); return { planId: input.plan.planId, planSha256: bridgeModule.sha256(input.plan), moduleRevisionRefs: input.plan.operations.map(function(item) { return item.toModule; }) }; }, audit: async function(kind, subjectId, payload) { audits.push({ kind: kind, subjectId: subjectId, payload: payload }); return 'audit.composition'; } };
  var plan = { planId: 'requirement.demo:composition', funBlueprintSelection: { blueprintRef: { blueprintId: 'route-mastery', revision: 1, contentHash: 'blueprint-hash' } }, operations: [{ toModule: { moduleId: 'core.route_dash', revision: 'local-v1', manifestHash: manifestHash } }] };
  var bridge = bridgeModule.createCompositionPersistenceBridge({ repository: repository });
  var persisted = await bridge.persistPlannedComposition(plan);
  assert.equal(stored[0].status, 'planned'); assert.equal(persisted.planSha256.length, 64); assert.equal(audits[0].payload.blueprintRef.blueprintId, 'route-mastery');
  await assert.rejects(function() { return bridge.persistPlannedComposition(Object.assign({}, plan, { operations: [{ toModule: { moduleId: 'core.route_dash', revision: 'local-v1', manifestHash: 'b'.repeat(64) } }] })); }, /manifest hash mismatch/);
  console.log('[CompositionPersistenceBridge] Blueprint pin, approved module revision, manifest hash, immutable plan, audit, and hash rejection passed');
}
main().catch(function(error) { console.error(error); process.exit(1); });
