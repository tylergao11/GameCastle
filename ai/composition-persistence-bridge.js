/* Stores a Blueprint-pinned composition only after every selected module revision is approved and hash-matched. */
var crypto = require('crypto');
function sha256(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function required(value, name) { if (!value) throw new Error(name + ' is required'); return value; }
function createCompositionPersistenceBridge(options) {
  options = options || {};
  var repository = required(options.repository, 'repository');
  ['getModuleRevision', 'putModuleCompositionPlan', 'audit'].forEach(function(method) { if (typeof repository[method] !== 'function') throw new Error('repository.' + method + ' is required'); });
  async function persistPlannedComposition(plan) {
    required(plan, 'composition plan'); required(plan.planId, 'plan.planId');
    if (!plan.funBlueprintSelection || !plan.funBlueprintSelection.blueprintRef) throw new Error('composition plan requires a pinned FunBlueprint selection');
    var refs = (plan.operations || []).filter(function(operation) { return operation.toModule; }).map(function(operation) { return operation.toModule; });
    if (!refs.length) throw new Error('composition plan requires module revisions');
    for (var i = 0; i < refs.length; i++) {
      var revision = await repository.getModuleRevision(refs[i].moduleId, refs[i].revision);
      if (!revision || (revision.status !== 'approved-local' && revision.status !== 'approved-cloud')) throw new Error('composition references unapproved module revision: ' + refs[i].moduleId + '@' + refs[i].revision);
      if (revision.manifest_sha256 !== refs[i].manifestHash) throw new Error('composition module manifest hash mismatch: ' + refs[i].moduleId + '@' + refs[i].revision);
    }
    var persisted = await repository.putModuleCompositionPlan({ plan: plan, status: 'planned' });
    var auditReceiptId = await repository.audit('composition-planned', plan.planId, { planSha256: persisted.planSha256, blueprintRef: plan.funBlueprintSelection.blueprintRef, moduleRevisionRefs: persisted.moduleRevisionRefs });
    return { planId: persisted.planId, planSha256: persisted.planSha256, auditReceiptId: auditReceiptId };
  }
  return { persistPlannedComposition: persistPlannedComposition };
}
module.exports = { createCompositionPersistenceBridge: createCompositionPersistenceBridge, sha256: sha256 };
