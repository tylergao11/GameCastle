var crypto = require('crypto');
var { Client } = require('pg');

function sha256(value) { return crypto.createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex'); }
function required(value, name) { if (!value) throw new Error(name + ' is required'); return value; }
function createCloudLibraryRepository(options) {
  options = options || {};
  var client = options.client || new Client({ connectionString: options.connectionString || process.env.GAMECASTLE_DATABASE_URL });
  async function connect() { await client.connect(); return api; }
  async function close() { if (!options.client) await client.end(); }
  async function health() { var result = await client.query('SELECT extversion FROM pg_extension WHERE extname = $1', ['vector']); return { postgres: true, pgvector: result.rows.length === 1, pgvectorVersion: result.rows[0] && result.rows[0].extversion || null }; }
  async function putAssetRevision(input) {
    required(input, 'asset revision'); required(input.familyId, 'familyId'); required(input.revisionId, 'revisionId'); required(input.bytesSha256, 'bytesSha256'); required(input.objectKey, 'objectKey');
    await client.query('INSERT INTO asset_family(family_id,kind,style_id,semantic_tags,status) VALUES($1,$2,$3,$4,$5) ON CONFLICT(family_id) DO NOTHING', [input.familyId, input.kind, input.styleId, JSON.stringify(input.semanticTags || []), input.familyStatus || 'approved']);
    await client.query('INSERT INTO asset_revision(revision_id,family_id,sha256,object_key,metadata,provenance_receipt,status) VALUES($1,$2,$3,$4,$5,$6,$7)', [input.revisionId, input.familyId, input.bytesSha256, input.objectKey, JSON.stringify(input.metadata || {}), JSON.stringify(input.provenanceReceipt || {}), input.status || 'approved-local']);
    return { revisionId: input.revisionId, sha256: input.bytesSha256 };
  }
  async function putModuleRevision(input) {
    required(input, 'module revision'); required(input.moduleId, 'moduleId'); required(input.revision, 'revision'); required(input.manifest, 'manifest');
    var manifestHash = input.manifestSha256 || sha256(input.manifest);
    await client.query('INSERT INTO module_revision(module_id,revision,manifest_sha256,manifest,origin_receipt,promotion_receipt,status) VALUES($1,$2,$3,$4,$5,$6,$7)', [input.moduleId, input.revision, manifestHash, JSON.stringify(input.manifest), JSON.stringify(input.originReceipt || {}), JSON.stringify(input.promotionReceipt || {}), input.status || 'approved-local']);
    return { moduleId: input.moduleId, revision: input.revision, manifestSha256: manifestHash };
  }
  async function putModuleCandidate(input) {
    required(input, 'module candidate'); required(input.candidateId, 'candidateId'); required(input.candidate, 'candidate'); required(input.status, 'status');
    var candidateHash = input.candidateSha256 || sha256(input.candidate);
    await client.query('INSERT INTO module_candidate(candidate_id,status,source_debt_ids,candidate,candidate_sha256) VALUES($1,$2,$3,$4,$5) ON CONFLICT(candidate_id) DO NOTHING', [input.candidateId, input.status, JSON.stringify(input.sourceDebtIds || []), JSON.stringify(input.candidate), candidateHash]);
    return { candidateId: input.candidateId, candidateSha256: candidateHash };
  }
  async function putModulePromotionReceipt(input) {
    required(input, 'module promotion receipt'); required(input.receipt, 'receipt'); required(input.receipt.receiptId, 'receipt.receiptId'); required(input.receipt.candidateId, 'receipt.candidateId'); required(input.receipt.moduleId, 'receipt.moduleId'); required(input.receipt.revision, 'receipt.revision'); required(input.receipt.decision, 'receipt.decision');
    var receiptHash = input.receiptSha256 || sha256(input.receipt);
    await client.query('INSERT INTO module_promotion_receipt(receipt_id,candidate_id,module_id,revision,decision,receipt,receipt_sha256) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(receipt_id) DO NOTHING', [input.receipt.receiptId, input.receipt.candidateId, input.receipt.moduleId, input.receipt.revision, input.receipt.decision, JSON.stringify(input.receipt), receiptHash]);
    return { receiptId: input.receipt.receiptId, receiptSha256: receiptHash };
  }
  async function putModuleCompositionPlan(input) {
    required(input, 'module composition plan'); var plan = required(input.plan, 'plan'); required(plan.planId, 'plan.planId');
    var planHash = input.planSha256 || sha256(plan), moduleRevisionRefs = (plan.operations || []).filter(function(item) { return item.toModule; }).map(function(item) { return { moduleId: item.toModule.moduleId, revision: item.toModule.revision, manifestHash: item.toModule.manifestHash }; });
    await client.query('INSERT INTO module_composition_plan(plan_id,plan_sha256,fun_blueprint_selection,module_revision_refs,payload,status) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(plan_id) DO NOTHING', [plan.planId, planHash, JSON.stringify(plan.funBlueprintSelection || null), JSON.stringify(moduleRevisionRefs), JSON.stringify(plan), input.status || 'planned']);
    return { planId: plan.planId, planSha256: planHash, moduleRevisionRefs: moduleRevisionRefs };
  }
  async function putDerivationReceipt(input) {
    required(input, 'derivation receipt'); required(input.receiptId, 'receiptId'); required(input.outputRevisionId, 'outputRevisionId'); required(input.workflow, 'workflow'); required(input.model, 'model'); required(input.inputSha256, 'inputSha256');
    await client.query('INSERT INTO derivation_receipt(receipt_id,output_revision_id,parent_revision_ids,workflow,model,input_sha256) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(receipt_id) DO NOTHING', [input.receiptId, input.outputRevisionId, JSON.stringify(input.parentRevisionIds || []), JSON.stringify(input.workflow), JSON.stringify(input.model), JSON.stringify(input.inputSha256)]);
    return { receiptId: input.receiptId, outputRevisionId: input.outputRevisionId };
  }
  async function getAssetRevisionByHash(bytesSha256) {
    required(bytesSha256, 'bytesSha256');
    var result = await client.query('SELECT revision_id,family_id,sha256,object_key,metadata,provenance_receipt,status,created_at,withdrawn_at FROM asset_revision WHERE sha256 = $1', [bytesSha256]);
    return result.rows[0] || null;
  }
  async function getModuleRevision(moduleId, revision) {
    required(moduleId, 'moduleId'); required(revision, 'revision');
    var result = await client.query('SELECT module_id,revision,manifest_sha256,manifest,origin_receipt,promotion_receipt,status,created_at FROM module_revision WHERE module_id = $1 AND revision = $2', [moduleId, revision]);
    return result.rows[0] || null;
  }
  async function selectModuleRelease(input) {
    required(input, 'module release'); required(input.channel, 'channel'); required(input.moduleId, 'moduleId'); required(input.revision, 'revision'); required(input.reason, 'reason'); required(input.actor, 'actor');
    var revision = await getModuleRevision(input.moduleId, input.revision);
    if (!revision) throw new Error('module revision does not exist');
    if (revision.status !== 'approved-local' && revision.status !== 'approved-cloud') throw new Error('only approved module revisions can be released');
    var previous = await client.query('SELECT release_event_id,revision FROM module_release_event WHERE channel = $1 AND module_id = $2 ORDER BY created_at DESC, release_event_id DESC LIMIT 1', [input.channel, input.moduleId]);
    var previousEvent = previous.rows[0] || null, action = previousEvent ? 'rollback' : 'promote';
    var eventId = 'release.' + sha256([input.channel, input.moduleId, input.revision, previousEvent && previousEvent.release_event_id, input.reason, input.actor]).slice(0, 32);
    await client.query('INSERT INTO module_release_event(release_event_id,channel,module_id,revision,action,previous_release_event_id,reason,actor) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(release_event_id) DO NOTHING', [eventId, input.channel, input.moduleId, input.revision, action, previousEvent && previousEvent.release_event_id || null, input.reason, input.actor]);
    return { releaseEventId: eventId, channel: input.channel, moduleId: input.moduleId, revision: input.revision, action: action, previousReleaseEventId: previousEvent && previousEvent.release_event_id || null };
  }
  async function getSelectedModuleRelease(channel, moduleId) {
    required(channel, 'channel'); required(moduleId, 'moduleId');
    var result = await client.query('SELECT release_event_id,channel,module_id,revision,action,previous_release_event_id,reason,actor,created_at FROM module_release_event WHERE channel = $1 AND module_id = $2 ORDER BY created_at DESC, release_event_id DESC LIMIT 1', [channel, moduleId]);
    return result.rows[0] || null;
  }
  async function audit(kind, subjectId, payload) { var id = 'audit.' + sha256([kind, subjectId, payload]).slice(0, 24); await client.query('INSERT INTO audit_receipt(receipt_id,kind,subject_id,payload) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [id, kind, subjectId, JSON.stringify(payload || {})]); return id; }
  var api = { connect: connect, close: close, health: health, putAssetRevision: putAssetRevision, putModuleRevision: putModuleRevision, putModuleCandidate: putModuleCandidate, putModulePromotionReceipt: putModulePromotionReceipt, putModuleCompositionPlan: putModuleCompositionPlan, putDerivationReceipt: putDerivationReceipt, getAssetRevisionByHash: getAssetRevisionByHash, getModuleRevision: getModuleRevision, selectModuleRelease: selectModuleRelease, getSelectedModuleRelease: getSelectedModuleRelease, audit: audit };
  return api;
}
module.exports = { createCloudLibraryRepository: createCloudLibraryRepository, sha256: sha256 };
