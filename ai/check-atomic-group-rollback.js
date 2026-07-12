var assert = require('assert').strict;
var fs = require('fs');
var os = require('os');
var path = require('path');
var runtime = require('./project-weave-runtime');
var pipeline = require('./pipeline');

async function main() {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-atomic-'));
  var rollback = null;
  var planner = { plan: function(graph) {
    return { debt: null, plan: { schemaVersion: 1, planId: graph.requirementGraphId + ':atomic', mode: 'create', requirementGraphId: graph.requirementGraphId, catalogFingerprint: 'fixture', baseGuard: {}, coverage: { requiredSemanticRefs: [], satisfiedSemanticRefs: [], missingSemanticRefs: [], conflictingSemanticRefs: [] }, slotBindings: [], spatialRequirements: [], debt: null, determinism: { outputHash: 'atomic' }, operations: [
      { operationId: 'install.idle', op: 'install', atomicGroupId: 'all-or-nothing', parameters: {}, toModule: { moduleId: 'core.idle_clicker', revision: 'local-v1', manifestHash: 'fixture' } },
      { operationId: 'install.controls', op: 'install', atomicGroupId: 'all-or-nothing', parameters: {}, toModule: { moduleId: 'system.controls', revision: 'local-v1', manifestHash: 'fixture' } }
    ] } };
  } };
  try {
    await assert.rejects(function() {
      return runtime.create({ projectId: 'atomic', requestId: 'atomic-1', naturalIntent: 'make a mobile platformer', intentDslText: 'make a mobile platformer' }, { workspaceRoot: root, services: {
        productModulePlanner: planner,
        executeOperationLine: async function(project, op, line) {
          if (String(line).indexOf('create object name=ControlsHint') >= 0) return { ok: false, msg: 'injected group failure' };
          return pipeline.execute(project, op);
        },
        onAtomicRollback: function(receipt) { rollback = receipt; }
      } });
    }, /MODULE_OPERATION_FAILED/);
    assert(rollback, 'runtime must expose the committed rollback receipt to the test port');
    assert.equal(rollback.groupId, 'all-or-nothing');
    assert.equal((rollback.project.layouts || []).length, 0, 'second operation failure restores project before the successful first operation');
    assert.deepEqual(rollback.modules, [], 'second operation failure restores module ownership before the successful first operation');
    console.log('[AtomicGroupRollback] real ProjectWeave group failure restores project and modules');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
main().catch(function(error) { console.error(error); process.exit(1); });
