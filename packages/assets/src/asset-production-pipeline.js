var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var derivation = require('./asset-derivation-pipeline');
var frameSet = require('./frame-set');
var styleDNA = require('./style-dna');
var styleCohesion = require('./style-cohesion');
var validator = require('./asset-production-contract-validator');

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function hash(value) { return crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex'); }
function fail(code, message, owner) { var error = new Error(message); error.code = code; error.owner = owner || 'AssetProductionPipeline'; throw error; }
function assertDeadline(deadlineAt) { if (deadlineAt !== undefined && Date.now() >= Number(deadlineAt)) fail('ASSET_ENGINE_DEADLINE_EXCEEDED', 'AssetEngine execution profile deadline expired.'); }
function verifyFile(file, expectedHash) { if (!file || !fs.existsSync(file)) fail('ASSET_REVISION_MISSING', 'Accepted asset file is unavailable.'); var bytes = fs.readFileSync(file), actual = hash(bytes); if (expectedHash && actual !== expectedHash) fail('ASSET_REVISION_HASH_MISMATCH', 'Accepted asset file hash changed.'); return actual; }
function removeDerived(candidate, projectAssetDir) { if (!candidate || !projectAssetDir) return; var root = path.resolve(projectAssetDir), files = frameSet.isFrameSet(candidate) ? candidate.frames.map(function(frame) { return frame.path; }) : [candidate.path]; files.forEach(function(file) { if (!file) return; var resolved = path.resolve(file); if (resolved.startsWith(root + path.sep) && fs.existsSync(resolved)) fs.rmSync(resolved, { force: true }); }); }
function revisionId(candidate) { return candidate.revisionId || candidate.assetId || 'asset-revision.' + candidate.sha256; }
function loopState(workItem, phase, currentRevisionId, attempt) { return { loopId: 'production.' + workItem.workItemPlanId, workItemPlanId: workItem.workItemPlanId, currentRevisionId: currentRevisionId || null, phase: phase, attempt: Number(attempt || (phase === 'accepted' ? 1 : 0)), budgets: clone(workItem.retryBudget), observationReceiptIds: [], historyHash: hash([workItem.workItemPlanId, phase, currentRevisionId || null, Number(attempt || 0)]) }; }
function acceptance(workItem, candidate, reviewReceipt) { var id = frameSet.isFrameSet(candidate) ? candidate.revisionId : revisionId(candidate), evidence = frameSet.isFrameSet(candidate) ? [candidate.contentHash, candidate.acceptanceReceiptId] : (candidate.derivationReceipts || []).map(function(item) { return item.outputHash; }).concat([candidate.sha256]); var value = { workItemPlanId: workItem.workItemPlanId, finalRevisionId: id, targetVisualSlotId: workItem.targetVisualSlotId, deterministicEvidenceIds: evidence, reviewReceiptId: reviewReceipt.receiptId, styleId: workItem.assetSpec.styleId, decision: 'accepted' }; validator.validateArtifact('WorkItemAcceptanceReceipt', value); return value; }
function reusableSemanticReview(candidate, workItem) { if (!candidate || candidate.source !== 'assetLibrary') return { receipt: null, error: null }; var receipt = candidate.semanticReviewReceipt, hashes = frameSet.isFrameSet(candidate) ? candidate.frames.map(function(frame) { return frame.sha256; }) : [candidate.sha256]; try { return { receipt: validator.validateSemanticReview(receipt, hashes, { workItem: workItem }), error: null }; } catch (error) { return { receipt: null, error: error }; } }
async function acceptedResult(workItem, candidate, masterImage, ports, deadlineAt) { assertDeadline(deadlineAt); var current = frameSet.isFrameSet(candidate) ? candidate : Object.assign({}, candidate, { revisionId: revisionId(candidate), resourceKind: candidate.resourceKind || workItem.assetSpec.resourceKind || 'image', format: candidate.format || path.extname(candidate.path).slice(1).toLowerCase(), status: 'accepted' }), hashes = frameSet.isFrameSet(current) ? current.frames.map(function(frame) { return frame.sha256; }) : [current.sha256], reusable = reusableSemanticReview(current, workItem), semanticReviewReceipt = reusable.receipt; if (!semanticReviewReceipt) { if (!ports || typeof ports.reviewCandidate !== 'function') { if (reusable.error) throw reusable.error; fail('ASSET_FINAL_REVIEW_UNAVAILABLE', 'Image assets require a final semantic and style review before acceptance.', 'CLIPImageReviewer'); } semanticReviewReceipt = await ports.reviewCandidate({ slot: workItem.assetSpec, workItem: workItem, candidate: current, phase: 'final-derived-asset', deadlineAt: deadlineAt }); } assertDeadline(deadlineAt); semanticReviewReceipt = validator.validateSemanticReview(semanticReviewReceipt, hashes, { workItem: workItem }); return { workItem: workItem, accepted: true, candidate: Object.assign({}, candidate, { revisionId: current.revisionId, semanticReviewReceipt: semanticReviewReceipt }), currentRevision: Object.assign({}, current, { semanticReviewReceipt: semanticReviewReceipt }), masterImage: masterImage || null, semanticReviewReceipt: semanticReviewReceipt, integrityReceipt: null, acceptanceReceipt: acceptance(workItem, current, semanticReviewReceipt), debt: null, loopState: loopState(workItem, 'accepted', current.revisionId) }; }
function validateResolved(workItem, candidate) {
  if (frameSet.isFrameSet(candidate)) { var accepted = frameSet.validate(candidate); accepted.frames.forEach(function(frame) { verifyFile(frame.path, frame.sha256); }); return Object.assign({}, accepted, { source: candidate.source || 'assetLibrary' }); }
  if (!candidate || !candidate.path) fail('ASSET_PRODUCTION_CANDIDATE_INVALID', 'Resolved asset is incomplete.');
  var actual = verifyFile(candidate.path, candidate.sha256), format = String(candidate.format || path.extname(candidate.path).slice(1)).toLowerCase();
  if ((workItem.assetSpec.acceptedFormats || []).indexOf(format) < 0) fail('ASSET_PRODUCTION_FORMAT_INVALID', 'Resolved asset format is not accepted by the semantic requirement.');
  return Object.assign({}, candidate, { sha256: actual, format: format, source: candidate.source || 'localExplicit' });
}
async function createFromMaster(input) {
  assertDeadline(input.deadlineAt);
  var ports = input.ports || {}; if (typeof ports.generateMaster !== 'function') fail('MASTER_IMAGE_PROVIDER_UNAVAILABLE', 'Asset creation requires a master-image provider.', 'ComfyUIMasterImageProvider');
  var state = { runId: input.runId, projectId: input.projectId, slot: input.workItem.assetSpec, workItem: input.workItem, projectAssetDir: input.projectAssetDir, productionAttempt: input.productionAttempt || 1, deadlineAt: input.deadlineAt }, master = await ports.generateMaster(state);
  assertDeadline(input.deadlineAt);
  if (master && master.assetBlobRef) { if (typeof ports.materializeCandidate !== 'function') fail('MASTER_IMAGE_MATERIALIZATION_UNAVAILABLE', 'Master image provider did not expose materialization.'); master = await ports.materializeCandidate(Object.assign({}, state, { candidate: master })); }
  if (!master || !master.path) fail('MASTER_IMAGE_INVALID', 'Master image provider returned no materialized PNG.');
  var inspected = derivation.inspectFile(master.path, master.sha256), masterRevision = Object.assign({}, master, { revisionId: master.revisionId || 'master-image.' + inspected.sha256, sha256: inspected.sha256, width: inspected.raster.width, height: inspected.raster.height, providerReceipt: master.providerReceipt || { receiptId: 'provider.' + inspected.sha256.slice(0, 24) } });
  validator.validateArtifact('MasterImageRevision', masterRevision);
  var derivationInput = { master: masterRevision, slot: input.workItem.assetSpec, projectAssetDir: input.projectAssetDir, backgroundRemoval: ports.backgroundRemoval, deadlineAt: input.deadlineAt };
  var candidate;
  try { candidate = input.workItem.artifactKind === 'frame-set' ? await derivation.deriveFrameSet(derivationInput) : await derivation.deriveStatic(derivationInput); assertDeadline(input.deadlineAt); var accepted = await acceptedResult(input.workItem, Object.assign({}, candidate, { source: input.workItem.artifactKind === 'frame-set' ? 'frameSetProduction' : 'deterministicDerivation' }), masterRevision, ports, input.deadlineAt); if (typeof ports.discardCandidate === 'function') await ports.discardCandidate(Object.assign({}, state, { candidate: master })); return accepted; }
  catch (error) { removeDerived(candidate, input.projectAssetDir); if (typeof ports.discardCandidate === 'function') await ports.discardCandidate(Object.assign({}, state, { candidate: master })); throw error; }
}
async function runWorkItem(input) {
  var attempt = 1, attemptDiagnostics = [];
  try {
    assertDeadline(input.deadlineAt);
    if (input.candidate) { if ((input.workItem.assetSpec.resourceKind || 'image') !== 'image') { var resolved = validateResolved(input.workItem, input.candidate), current = Object.assign({}, resolved, { revisionId: revisionId(resolved), status: 'accepted' }), integrityReceipt = { receiptId: 'resource-integrity.' + hash([input.workItem.workItemPlanId, input.workItem.targetVisualSlotId, current.sha256, current.format]).slice(0, 24), owner: 'AssetProductionPipeline', phase: 'resource-integrity', workItemPlanId: input.workItem.workItemPlanId, targetVisualSlotId: input.workItem.targetVisualSlotId, format: current.format, sha256: current.sha256, decision: 'accepted' }; return { workItem: input.workItem, accepted: true, candidate: current, currentRevision: current, masterImage: null, semanticReviewReceipt: null, integrityReceipt: integrityReceipt, acceptanceReceipt: acceptance(input.workItem, current, integrityReceipt), debt: null, loopState: loopState(input.workItem, 'accepted', current.revisionId, attempt) }; } return await acceptedResult(input.workItem, validateResolved(input.workItem, input.candidate), null, input.ports, input.deadlineAt); }
    if ((input.workItem.assetSpec.resourceKind || 'image') !== 'image') fail('ASSET_PRODUCTION_EXTERNAL_RESOURCE_REQUIRED', 'Non-image semantic assets require an explicit accepted local resource.');
    if (!input.ports || typeof input.ports.productionFingerprint !== 'function') fail('ASSET_PRODUCTION_FINGERPRINT_UNAVAILABLE', 'Generated assets require a provider production fingerprint.');
    var budget = input.workItem.retryBudget, maximum = Number(budget && budget.generation), runtimeMaximum = input.maxAttempts === undefined ? maximum : Number(input.maxAttempts), retryable = budget && budget.retryableCodes;
    if (!Number.isInteger(maximum) || maximum < 1 || !Array.isArray(retryable)) fail('ASSET_PRODUCTION_RETRY_POLICY_INVALID', 'Generated image work requires the pinned retry policy.');
    if (!Number.isInteger(runtimeMaximum) || runtimeMaximum < 1) fail('ASSET_PRODUCTION_RETRY_LIMIT_INVALID', 'Runtime generation-attempt limit must be a positive integer.');
    maximum = Math.min(maximum, runtimeMaximum);
    for (attempt = 1; attempt <= maximum; attempt++) {
      assertDeadline(input.deadlineAt);
      try { var generated = await createFromMaster(Object.assign({}, input, { productionAttempt: attempt })); generated.loopState = loopState(input.workItem, 'accepted', generated.currentRevision.revisionId, attempt); generated.attemptDiagnostics = clone(attemptDiagnostics); return generated; }
      catch (error) { attemptDiagnostics.push({ productionAttempt: attempt, code: error.code || 'ASSET_PRODUCTION_FAILED', owner: error.owner || 'AssetProductionPipeline', message: error.message, diagnostics: error.diagnostics ? clone(error.diagnostics) : [], candidateRoundDiagnostics: error.attemptDiagnostics ? clone(error.attemptDiagnostics) : [] }); if (attempt >= maximum || retryable.indexOf(error.code) < 0) throw error; }
    }
  } catch (error) { var debt = { slotId: input.workItem.slotId, code: error.code || 'ASSET_PRODUCTION_FAILED', owner: error.owner || 'AssetProductionPipeline', message: error.message }; if (error.diagnostics) debt.diagnostics = clone(error.diagnostics); if (attemptDiagnostics.length) debt.attemptDiagnostics = clone(attemptDiagnostics); return { workItem: input.workItem, accepted: false, candidate: null, currentRevision: null, masterImage: null, semanticReviewReceipt: null, integrityReceipt: null, acceptanceReceipt: null, debt: debt, loopState: loopState(input.workItem, 'debt', null, attempt) }; }
}
function restoredUsable(result) { try { if (!result || !result.accepted || !result.candidate) return false; var image = (result.workItem.assetSpec.resourceKind || 'image') === 'image'; if (image) { var hashes = frameSet.isFrameSet(result.candidate) ? frameSet.validate(result.candidate).frames.map(function(frame) { return frame.sha256; }) : [result.candidate.sha256]; validator.validateSemanticReview(result.semanticReviewReceipt, hashes, { workItem: result.workItem }); } else if (!result.integrityReceipt || result.integrityReceipt.phase !== 'resource-integrity' || result.integrityReceipt.workItemPlanId !== result.workItem.workItemPlanId || result.integrityReceipt.targetVisualSlotId !== result.workItem.targetVisualSlotId || result.integrityReceipt.sha256 !== result.candidate.sha256 || result.integrityReceipt.format !== result.candidate.format || result.integrityReceipt.decision !== 'accepted') return false; if (frameSet.isFrameSet(result.candidate)) { frameSet.validate(result.candidate).frames.forEach(function(frame) { verifyFile(frame.path, frame.sha256); }); return true; } verifyFile(result.candidate.path, result.candidate.sha256); return true; } catch (_error) { return false; } }
function emptyLedger(plan, productionContextHash) { return { schemaVersion: 4, productionSetId: plan.productionSetId, planContentHash: plan.contentHash, productionContextHash: productionContextHash, workItems: {} }; }
function readLedger(file, plan, productionContextHash) { if (!file || !fs.existsSync(file)) return emptyLedger(plan, productionContextHash); try { var value = JSON.parse(fs.readFileSync(file, 'utf8')); if (value.schemaVersion === 4 && value.productionSetId === plan.productionSetId && value.planContentHash === plan.contentHash && value.productionContextHash === productionContextHash) return value; } catch (_error) {} return emptyLedger(plan, productionContextHash); }
function writeLedger(file, ledger) { if (!file) return; fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true }); fs.writeFileSync(file, JSON.stringify(ledger, null, 2)); }
function withStyleAnchorPorts(ports, styleSession) {
  if (!ports || typeof ports.generateMaster !== 'function') return ports || {};
  return Object.assign({}, ports, {
    generateMaster: async function(state) {
      var slot = Object.assign({}, state.slot || {});
      var constraints = slot.constraints || {};
      var subject = slot.description || slot.subject || (slot.semanticTags || []).join(', ');
      var promptOptions = {
        transparent: constraints.transparent === true,
        productionFamily: slot.productionFamily,
        styleAnchor: !!(styleSession && styleSession.anchor)
      };
      if (!slot.generationPrompt) slot.generationPrompt = styleDNA.generationPrompt(slot.styleId, subject, promptOptions);
      else if (styleSession && styleSession.anchor && slot.generationPrompt.indexOf('same cohesive full-color mobile-game raster-toon art family') < 0 && slot.generationPrompt.indexOf('same cohesive GameCastle') < 0) {
        // Avoid the product name "GameCastle" in SDXL text (the word "castle" poisons props).
        slot.generationPrompt = slot.generationPrompt + ', same cohesive full-color mobile-game raster-toon art family as the established cast, matching chunky silhouette language and limited color ramps';
      }
      return ports.generateMaster(Object.assign({}, state, { slot: slot, styleSession: styleSession }));
    }
  });
}

async function runProductionSet(input) {
  validator.validatePlan(input.plan); var context = [];
  assertDeadline(input.deadlineAt);
  for (var contextIndex = 0; contextIndex < input.plan.workItems.length; contextIndex++) {
    var contextItem = input.plan.workItems[contextIndex], resolved = (input.candidates || {})[contextItem.slotId];
    if (resolved) context.push({ slotId: contextItem.slotId, source: 'resolved', identity: resolved.contentHash || resolved.sha256 || resolved.revisionId || null });
    else if ((contextItem.assetSpec.resourceKind || 'image') !== 'image') context.push({ slotId: contextItem.slotId, source: 'external-resource-required', identity: 'external-resource-required.v1' });
    else if (!input.ports || typeof input.ports.productionFingerprint !== 'function') context.push({ slotId: contextItem.slotId, source: 'generated-blocked', identity: 'missing-production-fingerprint.v1' });
    else context.push({ slotId: contextItem.slotId, source: 'generated', identity: await input.ports.productionFingerprint({ runId: input.runId, projectId: input.projectId, slot: contextItem.assetSpec, workItem: contextItem }), maxAttempts: input.maxAttempts === undefined ? null : input.maxAttempts, executionProfileHash: input.executionPolicy && input.executionPolicy.profileHash || null });
  }
  var productionContextHash = hash(context), ledger = readLedger(input.ledgerPath, input.plan, productionContextHash), results = [];
  var styleSession = { anchor: null };
  var ports = withStyleAnchorPorts(input.ports, styleSession);
  for (var index = 0; index < input.plan.workItems.length; index++) {
    assertDeadline(input.deadlineAt);
    var workItem = input.plan.workItems[index], restored = ledger.workItems[workItem.workItemPlanId];
    var result = restoredUsable(restored) ? restored : await runWorkItem({ runId: input.runId, projectId: input.projectId, workItem: workItem, ports: ports, candidate: (input.candidates || {})[workItem.slotId], projectAssetDir: input.projectAssetDir, maxAttempts: input.maxAttempts, deadlineAt: input.deadlineAt });
    results.push(result);
    ledger.workItems[workItem.workItemPlanId] = result;
    writeLedger(input.ledgerPath, ledger);
    if (!styleSession.anchor) styleSession.anchor = styleCohesion.pickStyleAnchor([result]);
  }
  if (!styleSession.anchor) styleSession.anchor = styleCohesion.pickStyleAnchor(results);
  var accepted = results.filter(function(result) { return result.accepted; }), expected = input.plan.coveragePolicy.requiredTargetVisualSlotIds.slice().sort(), actual = accepted.map(function(result) { return result.workItem.targetVisualSlotId; }).sort(), complete = JSON.stringify(expected) === JSON.stringify(actual), byTarget = {}; accepted.forEach(function(result) { byTarget[result.workItem.targetVisualSlotId] = result.currentRevision.revisionId; });
  var styleId = (input.plan.workItems[0] && input.plan.workItems[0].assetSpec && input.plan.workItems[0].assetSpec.styleId) || 'gamecastle.style-dna.v1';
  var cohesionReceipt = null;
  var debts = results.filter(function(result) { return result.debt; }).map(function(result) { return result.debt; });
  if (complete) {
    cohesionReceipt = await styleCohesion.evaluateProductionSet(results, { styleId: styleId, styleAnchor: styleSession.anchor });
    if (cohesionReceipt.decision !== 'accepted') {
      complete = false;
      debts = debts.concat((cohesionReceipt.debts || []).map(function(debt) {
        return Object.assign({ slotId: debt.slotId || debt.leftSlotId || input.plan.productionSetId, owner: 'StyleCohesion', message: debt.code }, debt);
      }));
    }
  }
  var receipt = {
    productionSetId: input.plan.productionSetId,
    workItemAcceptanceReceiptIds: accepted.map(function(result) { return 'work-acceptance.' + hash(result.acceptanceReceipt).slice(0, 24); }),
    requiredSlotCoverage: { expectedTargetVisualSlotIds: expected, acceptedTargetVisualSlotIds: actual, missingTargetVisualSlotIds: expected.filter(function(target) { return actual.indexOf(target) < 0; }), complete: JSON.stringify(expected) === JSON.stringify(actual) },
    acceptedRevisionByTargetVisualSlotId: byTarget,
    styleCohesionReceipt: cohesionReceipt,
    styleAnchor: styleSession.anchor,
    decision: complete ? 'accepted' : 'debt'
  };
  validator.validateSetAcceptance(receipt);
  return { plan: input.plan, workItems: results, acceptanceReceipt: receipt, pass: complete, decision: complete ? 'pass' : 'blocked', debts: debts, styleCohesionReceipt: cohesionReceipt, styleAnchor: styleSession.anchor };
}

module.exports = { runWorkItem: runWorkItem, runProductionSet: runProductionSet };
