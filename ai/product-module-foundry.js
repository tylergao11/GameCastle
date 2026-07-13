var crypto = require('crypto');
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16); }
function lineageProjection(input, candidateId) {
  var ir = input.templateIR;
  if (!ir || ir.artifactKind !== 'TemplateIR' || !ir.normalizationHash) throw new Error('Foundry requires a normalized TemplateIR');
  if (!input.templateSourceRecord || input.templateSourceRecord.contentHash !== ir.sourceContentHash) throw new Error('Foundry source record and TemplateIR lineage mismatch');
  return { schemaVersion: 1, artifactKind: 'ModuleLineageProjection', projectionId: 'lineage.' + candidateId, candidateId: candidateId, source: { sourceId: input.templateSourceRecord.sourceId, contentHash: input.templateSourceRecord.contentHash, intakeStatus: input.templateSourceRecord.intakeStatus }, templateIR: { irId: ir.irId, normalizationHash: ir.normalizationHash, lossAccounting: ir.lossAccounting || {} }, blueprintRef: input.funBlueprintSelection && input.funBlueprintSelection.blueprintRef || null, generatedAt: new Date().toISOString() };
}
function candidateFromTemplateIR(input) {
  if (!input || !input.debt || !input.debt.blocking) throw new Error('Foundry requires explicit blocking ModuleDebt');
  if (!input.funBlueprintSelection || !input.funBlueprintSelection.blueprintRef) throw new Error('Foundry requires an approved FunBlueprint selection');
  var source = input.templateSourceRecord || {};
  if (source.intakeStatus !== 'accepted' && source.intakeStatus !== 'quarantined') throw new Error('Foundry requires an accepted or quarantined template source');
  var candidateId = 'candidate.' + hash([input.debt.debtId, source.contentHash, input.templateIR && input.templateIR.normalizationHash, input.funBlueprintSelection.blueprintRef]);
  return { schemaVersion: 1, candidateId: candidateId, status: 'draft', sourceDebtIds: [input.debt.debtId], semanticBindings: input.semanticBindings || input.funBlueprintSelection.requiredSemanticRefs || [], templateSourceRecord: source, templateIRRef: { irId: input.templateIR.irId, normalizationHash: input.templateIR.normalizationHash }, funBlueprintSelection: input.funBlueprintSelection, draftManifest: input.draftManifest || {}, ownershipModel: input.ownershipModel || {}, verificationPlan: input.verificationPlan || {}, lineageProjection: lineageProjection(input, candidateId), provenance: { owner: 'ProductModuleFoundry', offlineOnly: true, sourceBinaryReuseAllowed: false } };
}
function candidate(input) {
  if (!input || !input.debt || !input.debt.blocking) throw new Error('Foundry requires explicit blocking ModuleDebt');
  if (!input.referenceFixture || !input.referenceFixture.hash || !input.referenceFixture.license) throw new Error('Foundry requires licensed hashed reference fixture');
  return { schemaVersion: 1, candidateId: 'candidate.' + hash([input.debt.debtId, input.referenceFixture.hash]), status: 'draft', sourceDebtIds: [input.debt.debtId], semanticBindings: input.semanticBindings || [], referenceFixture: input.referenceFixture, draftManifest: input.draftManifest || {}, ownershipModel: input.ownershipModel || {}, verificationPlan: input.verificationPlan || {}, provenance: { owner: 'ProductModuleFoundry', offlineOnly: true } };
}
function promote(item, evidence) {
  var result = require('./module-promotion-validator').validate(item, evidence);
  return result.ok ? result.receipt : { decision: 'rejected', reason: result.code, message: result.message };
}
module.exports = { candidate: candidate, candidateFromTemplateIR: candidateFromTemplateIR, lineageProjection: lineageProjection, promote: promote };
