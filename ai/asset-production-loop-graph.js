var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var assetValidator = require('./asset-contract-validator');
var png = require('./local-derivation-port');
var maskContract = require('./comfyui-mask-contract');
var styleDNA = require('./style-dna');
var validator = require('./asset-production-contract-validator');

function fail(code, message, owner) { var error = new Error(message); error.code = code; error.owner = owner || 'AssetEngine'; throw error; }
function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function digest(value) { return crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex'); }
function now() { return new Date().toISOString(); }
function receiptId(prefix, value) { return prefix + '.' + digest(value).slice(0, 24); }
function bytesOf(candidate) { if (!candidate || !candidate.path || !fs.existsSync(candidate.path)) fail('ASSET_PRODUCTION_PIXELS_UNAVAILABLE', 'Asset candidate must be materialized before revision or observation.', 'AssetEngine'); return fs.readFileSync(candidate.path); }
function rasterFacts(candidate) {
  var bytes = bytesOf(candidate), raster;
  try { raster = png.decodePng(bytes); } catch (error) { fail('ASSET_PRODUCTION_PNG_INVALID', error.message, 'LocalDerivationKernel'); }
  var pixels = raster.width * raster.height, visible = 0, transparent = 0, edgeVisible = 0;
  for (var y = 0; y < raster.height; y++) for (var x = 0; x < raster.width; x++) { var alpha = raster.data[(y * raster.width + x) * 4 + 3]; if (alpha > 8) visible++; else transparent++; if (alpha > 8 && (x === 0 || y === 0 || x === raster.width - 1 || y === raster.height - 1)) edgeVisible++; }
  return { bytes: bytes, raster: raster, sha256: digest(bytes), width: raster.width, height: raster.height, visiblePixels: visible, transparentPixels: transparent, coverage: pixels ? visible / pixels : 0, edgeVisiblePixels: edgeVisible, hasTransparency: transparent > 0 };
}
async function materialize(context, candidate) {
  if (!candidate) fail('ASSET_PRODUCTION_CANDIDATE_MISSING', 'Asset action did not return a candidate.');
  if (candidate.assetBlobRef && (!candidate.path || candidate.path.indexOf('blob://') === 0)) {
    if (!context.ports || typeof context.ports.materializeCandidate !== 'function') fail('ASSET_PRODUCTION_MATERIALIZER_UNAVAILABLE', 'Provider candidate requires materializeCandidate.', 'ComfyUIProviderAdapter');
    candidate = await context.ports.materializeCandidate(context.portState(candidate));
  }
  var facts = rasterFacts(candidate);
  if (candidate.sha256 && candidate.sha256 !== facts.sha256) fail('ASSET_PRODUCTION_OUTPUT_HASH_MISMATCH', 'Candidate hash does not match materialized PNG.', 'AssetEngine');
  return Object.assign({}, candidate, { sha256: facts.sha256, width: facts.width, height: facts.height, format: 'png', transparent: facts.hasTransparency });
}
function executionReceipts(candidate, fallback) {
  var values = [];
  if (candidate.providerReceipt) values.push(candidate.providerReceipt);
  if (candidate.derivationReceipt) values.push(candidate.derivationReceipt);
  if (candidate.operationReceipt) values.push(candidate.operationReceipt);
  if (!values.length) values.push(fallback);
  return values;
}
function revision(context, candidate, kind, parents, fallbackReceipt) {
  var item = context.workItem, value = {
    revisionId: 'revision.' + digest([item.workItemPlanId, kind, candidate.sha256, parents || []]).slice(0, 24),
    workItemPlanId: item.workItemPlanId,
    revisionKind: kind,
    parentRevisionIds: (parents || []).slice(),
    path: candidate.path,
    sha256: candidate.sha256,
    width: candidate.width,
    height: candidate.height,
    scope: candidate.privacyScope || 'project-local',
    executionReceipts: executionReceipts(candidate, fallbackReceipt)
  };
  validator.validateRevision(value);
  context.revisionInputs[value.revisionId] = { refId: value.revisionId, revisionId: value.revisionId, path: value.path, sha256: value.sha256, scope: value.scope, projectId: context.projectId, consent: true };
  return value;
}
function observation(context) {
  var candidate = context.candidate, facts = rasterFacts(candidate), validation = assetValidator.validateAssetCandidate(context.workItem.assetSpec, candidate), review = context.review || {}, defects = validation.errors.slice();
  if (context.workItem.assetSpec.constraints.transparent === true && !facts.hasTransparency) defects.push('opaque_background');
  if (!facts.visiblePixels) defects.push('empty_pixels');
  if (facts.edgeVisiblePixels) defects.push('edge_touch');
  if (review.pass !== true) (review.issues && review.issues.length ? review.issues : ['vision_rejected']).forEach(function(issue) { if (defects.indexOf(issue) < 0) defects.push(issue); });
  var vision = {
    receiptId: receiptId('vision', [context.currentRevision.revisionId, review]),
    sourceRevisionId: context.currentRevision.revisionId,
    detectedSubjects: clone((review.evidence && review.evidence.detectedSubjects) || []),
    semanticEvidence: clone(review.evidence || { pass: review.pass === true, issues: review.issues || [] }),
    regionEvidence: clone((review.evidence && review.evidence.regions) || []),
    artifactEvidence: clone(review.issues || []),
    confidence: Number((review.evidence && review.evidence.confidence) === undefined ? (review.pass === true ? 1 : 0) : review.evidence.confidence),
    workflowReceiptId: (review.providerReceipt && (review.providerReceipt.receiptId || review.providerReceipt.id)) || 'deterministic-review'
  };
  validator.validateArtifact('VisionInspectionReceipt', vision);
  var deterministic = { receiptId: receiptId('pixels', [context.currentRevision.revisionId, facts.sha256]), sourceRevisionId: context.currentRevision.revisionId, sha256: facts.sha256, width: facts.width, height: facts.height, hasTransparency: facts.hasTransparency, coverage: facts.coverage, edgeVisiblePixels: facts.edgeVisiblePixels, validation: validation };
  var result = {
    observationId: receiptId('observation', [context.currentRevision.revisionId, vision.receiptId, deterministic.receiptId]),
    sourceRevisionId: context.currentRevision.revisionId,
    visionInspectionReceiptId: vision.receiptId,
    deterministicEvidenceIds: [deterministic.receiptId],
    defects: defects,
    satisfiedChecks: defects.length ? [] : ['semantic-role', 'style', 'pixels', 'alpha-policy', 'dimensions', 'edge-policy', 'provenance'],
    contentHash: digest([vision, deterministic, defects])
  };
  validator.validateArtifact('AssetObservationReceipt', result);
  return { observation: result, vision: vision, deterministic: deterministic };
}
function includesAny(values, fragments) { return values.some(function(value) { var text = String(value).toLowerCase(); return fragments.some(function(fragment) { return text.indexOf(fragment) >= 0; }); }); }
function budgetAvailable(context, key) { return Number(context.attempts[key] || 0) < Number(context.workItem.retryBudget[key] || 0); }
function chooseAction(context) {
  var defects = context.observation.defects || [], action, reasons = defects.slice();
  if (!defects.length) action = 'FINAL_REVIEW';
  else if (includesAny(defects, ['empty_pixels', 'wrong_subject', 'unrecoverable', 'composition'])) action = budgetAvailable(context, 'generation') ? 'GENERATE_DRAFT' : 'DEBT';
  else if (includesAny(defects, ['background', 'multiple_subject'])) action = context.maskRevision ? 'APPLY_CUTOUT' : (budgetAvailable(context, 'segmentation') ? 'SEGMENT_SUBJECT' : 'DEBT');
  else if (includesAny(defects, ['palette', 'color'])) action = budgetAvailable(context, 'color') ? 'APPLY_DECLARED_COLOR' : 'DEBT';
  else if (includesAny(defects, ['edge_touch', 'alpha', 'dimension', 'anchor', 'outline', 'shadow'])) action = budgetAvailable(context, 'normalization') ? 'NORMALIZE_STYLE' : 'DEBT';
  else if (context.review && context.review.repairable === true) action = context.maskRevision ? (budgetAvailable(context, 'repair') ? 'REPAIR_MASKED_REGION' : 'DEBT') : (budgetAvailable(context, 'segmentation') ? 'SEGMENT_SUBJECT' : 'DEBT');
  else action = budgetAvailable(context, 'generation') ? 'GENERATE_DRAFT' : 'DEBT';
  var plan = {
    actionPlanId: receiptId('action', [context.observation.observationId, action, context.attempts]),
    observationId: context.observation.observationId,
    action: action,
    reasonCodes: reasons.length ? reasons : ['all-required-checks-satisfied'],
    inputRevisionIds: [context.currentRevision.revisionId].concat(context.maskRevision ? [context.maskRevision.maskRevisionId] : []),
    expectedChecks: context.workItem.familyChecks.slice(),
    returnPhase: action === 'FINAL_REVIEW' ? 'accepted-or-diagnosing' : action === 'DEBT' ? 'debt' : 'observing',
    budgetReservation: action
  };
  validator.validateArtifact('AssetActionPlan', plan); return plan;
}
function actionBudgetKey(action) { return { GENERATE_DRAFT: 'generation', SEGMENT_SUBJECT: 'segmentation', APPLY_CUTOUT: 'normalization', REPAIR_MASKED_REGION: 'repair', APPLY_DECLARED_COLOR: 'color', NORMALIZE_STYLE: 'normalization' }[action]; }
function increment(context, action) { var key = actionBudgetKey(action); if (key) context.attempts[key] = Number(context.attempts[key] || 0) + 1; }
function transition(context, next) { validator.assertTransition(context.phase, next); context.phase = next; }
function actionReceipt(context, actionPlan, outputs, executions, nextPhase) {
  var value = { loopId: context.loopId, attempt: context.attemptReceipts.length + 1, actionPlanId: actionPlan.actionPlanId, inputRevisionIds: actionPlan.inputRevisionIds.slice(), outputRevisionIds: outputs.slice(), executionReceiptIds: executions.map(function(item) { return item.receiptId || item.id || digest(item).slice(0, 16); }), observationId: actionPlan.observationId, decision: nextPhase === 'debt' ? 'debt' : 'continue', nextPhase: nextPhase };
  validator.validateArtifact('AssetLoopAttemptReceipt', value); context.attemptReceipts.push(value); return value;
}
function writeRaster(outputDir, prefix, raster) { var bytes = png.encodePng(raster), sha256 = digest(bytes), dir = path.resolve(outputDir); fs.mkdirSync(dir, { recursive: true }); var file = path.join(dir, prefix + '-' + sha256.slice(0, 16) + '.png'); if (!fs.existsSync(file)) fs.writeFileSync(file, bytes); return { path: file, sha256: sha256, width: raster.width, height: raster.height, format: 'png', transparent: true }; }
function checkpointSnapshot(state) {
  var value = clone(state); delete value.ports; delete value.portState; delete value.revisionInputs;
  return value;
}
function writeLedger(file, value) {
  if (!file) return; fs.mkdirSync(path.dirname(file), { recursive: true });
  var temp = file + '.tmp'; fs.writeFileSync(temp, JSON.stringify(value, null, 2)); fs.renameSync(temp, file);
}
function defaultCutout(context) {
  var source = png.decodePng(bytesOf(context.candidate)), mask = png.decodePng(fs.readFileSync(context.maskRevision.path));
  if (source.width !== mask.width || source.height !== mask.height) fail('ASSET_PRODUCTION_MASK_DIMENSIONS_INVALID', 'Cutout mask dimensions must equal source revision.', 'LocalDerivationKernel');
  for (var i = 0; i < source.width * source.height; i++) source.data[i * 4 + 3] = mask.data[i * 4 + 3];
  return Object.assign(writeRaster(context.projectAssetDir, 'cutout', source), { semanticTags: context.workItem.assetSpec.semanticTags.slice(), styleTags: context.workItem.assetSpec.styleTags.slice(), styleId: context.workItem.assetSpec.styleId, source: 'localDerivation', status: 'variant', publishability: { playable: true, publishable: true, blocksFinalExport: false }, operationReceipt: { receiptId: receiptId('cutout', [context.currentRevision.revisionId, context.maskRevision.maskRevisionId]), operation: 'apply-versioned-mask', parentRevisionId: context.currentRevision.revisionId, maskRevisionId: context.maskRevision.maskRevisionId } });
}
function createContext(input) {
  var workItem = validator.validateArtifact('AssetWorkItemPlan', clone(input.workItem));
  return {
    runId: input.runId, projectId: input.projectId, productionSetId: input.productionSetId, loopId: 'loop.' + digest([input.productionSetId, workItem.workItemPlanId]).slice(0, 24), workItem: workItem,
    ports: input.ports || {}, revisionInputs: input.revisionInputs || {}, source: clone(input.source || {}), projectAssetDir: path.resolve(input.projectAssetDir), phase: 'planned', attempts: { generation: 0, repair: 0, segmentation: 0, color: 0, normalization: 0 }, revisions: [], maskRevisions: [], repairPlans: [], colorPlans: [], observations: [], visionReceipts: [], deterministicReceipts: [], actionPlans: [], attemptReceipts: [], currentRevision: null, candidate: input.candidate || null, maskRevision: null, review: null, accepted: false, debt: null
  };
}
function portState(context, candidate) { return { runId: context.runId, projectId: context.projectId, slot: context.workItem.assetSpec, source: context.source, candidate: candidate || context.candidate, projectAssetDir: context.projectAssetDir, workItemPlan: context.workItem, productionSetId: context.productionSetId }; }
async function runWorkItem(input) {
  var lg = await import('@langchain/langgraph'), context = input.restored ? Object.assign(createContext(input), clone(input.restored)) : createContext(input);
  context.ports = input.ports || {}; context.revisionInputs = input.revisionInputs || {}; context.portState = function(candidate) { return portState(context, candidate); };
  (context.revisions || []).concat(context.maskRevisions || []).forEach(function(item) { if (item && item.revisionId || item && item.maskRevisionId) { var id = item.revisionId || item.maskRevisionId; context.revisionInputs[id] = { refId: id, revisionId: id, path: item.path, sha256: item.sha256, scope: item.scope || 'project-local', projectId: context.projectId, consent: true }; } });
  if (context.accepted || context.phase === 'debt') return context;
  var State = lg.Annotation.Root({ state: lg.Annotation({ reducer: function(_left, right) { return right; }, default: function() { return null; } }) });
  function node(name, fn) { return async function(wire) { var state = wire.state; try { await fn(state); } catch (error) { state.debt = { code: error.code || 'ASSET_PRODUCTION_ACTION_FAILED', owner: error.owner || 'AssetEngine', message: error.message, recoveryPhase: state.phase }; state.phase = 'debt'; } state.history = (state.history || []).concat([name]); if (input.onCheckpoint) input.onCheckpoint(checkpointSnapshot(state)); return { state: state }; }; }
  async function generate(state) {
    if (state.phase === 'planned') transition(state, state.candidate ? 'resolving' : 'generating'); else if (state.phase !== 'generating') transition(state, 'generating');
    var action = state.actionPlan || { actionPlanId: receiptId('action', [state.loopId, 'initial-generate']), observationId: 'initial', inputRevisionIds: state.currentRevision ? [state.currentRevision.revisionId] : [] };
    var candidate = state.actionPlan && state.actionPlan.action === 'GENERATE_DRAFT' ? null : state.candidate;
    if (!candidate) { if (typeof state.ports.generate !== 'function') fail('ASSET_PRODUCTION_GENERATE_UNAVAILABLE', 'Image generation port is unavailable.', 'ComfyUIProviderAdapter'); candidate = await state.ports.generate(portState(state)); increment(state, 'GENERATE_DRAFT'); }
    candidate = await materialize(state, candidate); var parent = state.currentRevision ? [state.currentRevision.revisionId] : [];
    var rev = revision(state, candidate, parent.length ? 'regenerated-draft' : (input.candidate ? 'resolved' : 'draft'), parent, { receiptId: receiptId('resolution', [candidate.sha256]), operation: input.candidate ? 'resolve' : 'generate' });
    state.candidate = candidate; state.currentRevision = rev; state.revisions.push(rev); state.review = null; state.observation = null;
    transition(state, 'observing');
    actionReceipt(state, action, [rev.revisionId], rev.executionReceipts, 'observing');
  }
  async function observe(state) {
    if (!state.currentRevision) fail('ASSET_PRODUCTION_REVISION_REQUIRED', 'Observation requires a current immutable revision.');
    if (state.phase !== 'observing') transition(state, 'observing');
    if (typeof state.ports.review !== 'function') fail('ASSET_PRODUCTION_VISION_UNAVAILABLE', 'Vision review port is unavailable.', 'VisionInspector');
    state.source.reviewPolicy = Object.assign(styleDNA.reviewPolicy(state.workItem.assetSpec.styleId, state.workItem.assetSpec.semanticTags), { familyChecks: state.workItem.familyChecks.slice() });
    state.review = await state.ports.review(portState(state));
    var observed = observation(state); state.observation = observed.observation; state.observations.push(observed.observation); state.visionReceipts.push(observed.vision); state.deterministicReceipts.push(observed.deterministic);
    transition(state, 'diagnosing');
  }
  async function diagnose(state) { state.actionPlan = chooseAction(state); state.actionPlans.push(state.actionPlan); if (state.actionPlan.action === 'FINAL_REVIEW') transition(state, 'final-reviewing'); else if (state.actionPlan.action === 'SEGMENT_SUBJECT') transition(state, 'segmenting'); else if (state.actionPlan.action === 'REPAIR_MASKED_REGION') transition(state, 'repairing'); else if (state.actionPlan.action === 'APPLY_DECLARED_COLOR') transition(state, 'color-planning'); else if (state.actionPlan.action === 'NORMALIZE_STYLE' || state.actionPlan.action === 'APPLY_CUTOUT') transition(state, 'normalizing'); else if (state.actionPlan.action === 'GENERATE_DRAFT') transition(state, 'generating'); else transition(state, 'debt'); }
  async function segment(state) {
    if (typeof state.ports.segment !== 'function') fail('ASSET_PRODUCTION_SEGMENT_UNAVAILABLE', 'Subject segmentation workflow is unavailable.', 'VisionInspector');
    var output = await state.ports.segment(portState(state)), candidate = output.candidate || output; candidate = await materialize(state, candidate); var facts = rasterFacts(candidate), sourceFacts = rasterFacts(state.candidate);
    if (facts.width !== sourceFacts.width || facts.height !== sourceFacts.height) fail('ASSET_PRODUCTION_MASK_DIMENSIONS_INVALID', 'Mask dimensions must equal source revision.', 'LocalDerivationKernel');
    var alpha = facts.raster.data.filter(function(_value, index) { return index % 4 === 3; }), hasZero = alpha.some(function(value) { return value < 128; }), hasOne = alpha.some(function(value) { return value >= 128; });
    if (!hasZero || !hasOne) fail('ASSET_PRODUCTION_MASK_EMPTY_OR_FULL', 'Mask must contain protected and selected pixels.', 'LocalDerivationKernel');
    var mask = { maskRevisionId: 'mask.' + digest([state.currentRevision.revisionId, candidate.sha256]).slice(0, 24), sourceRevisionId: state.currentRevision.revisionId, path: candidate.path, sha256: candidate.sha256, width: facts.width, height: facts.height, segmentationReceiptId: (candidate.providerReceipt && (candidate.providerReceipt.receiptId || candidate.providerReceipt.id)) || receiptId('segment', candidate.sha256), validationReceiptId: receiptId('mask-validation', [candidate.sha256, facts.width, facts.height]) };
    validator.validateMask(mask); state.revisionInputs[mask.maskRevisionId] = { refId: mask.maskRevisionId, revisionId: mask.maskRevisionId, path: mask.path, sha256: mask.sha256, scope: 'project-local', projectId: state.projectId, consent: true }; state.maskRevision = mask; state.maskRevisions.push(mask); increment(state, 'SEGMENT_SUBJECT'); transition(state, 'observing'); actionReceipt(state, state.actionPlan, [mask.maskRevisionId], [candidate.providerReceipt || { receiptId: mask.segmentationReceiptId }], 'observing');
  }
  async function mutate(state, action, kind, portName, defaultPort) {
    var parent = state.currentRevision, output;
    if (defaultPort) output = await defaultPort(state); else { if (typeof state.ports[portName] !== 'function') fail('ASSET_PRODUCTION_ACTION_UNAVAILABLE', action + ' executor is unavailable.', action === 'REPAIR_MASKED_REGION' ? 'ComfyUIProviderAdapter' : 'LocalDerivationKernel'); output = await state.ports[portName](portState(state)); }
    output = await materialize(state, output); var rev = revision(state, output, kind, [parent.revisionId], { receiptId: receiptId('operation', [action, parent.revisionId, output.sha256]), operation: action });
    if (action === 'REPAIR_MASKED_REGION') maskContract.assertMaskedEdit(fs.readFileSync(parent.path), fs.readFileSync(state.maskRevision.path), fs.readFileSync(output.path));
    state.candidate = output; state.currentRevision = rev; state.revisions.push(rev); state.review = null; state.observation = null; increment(state, action); transition(state, 'observing'); actionReceipt(state, state.actionPlan, [rev.revisionId], rev.executionReceipts, 'observing');
  }
  async function cutout(state) { await mutate(state, 'APPLY_CUTOUT', 'cutout', null, defaultCutout); }
  async function repair(state) {
    if (!state.maskRevision) fail('ASSET_PRODUCTION_MASK_REQUIRED', 'Masked repair requires a versioned mask.', 'AssetEngine');
    var plan = { repairPlanId: receiptId('repair-plan', [state.currentRevision.revisionId, state.maskRevision.maskRevisionId, state.actionPlan.reasonCodes]), sourceRevisionId: state.currentRevision.revisionId, failedChecks: state.actionPlan.reasonCodes.slice(), repairRegions: [{ maskRevisionId: state.maskRevision.maskRevisionId }], repairPrompt: state.actionPlan.reasonCodes.join(', '), maskRevisionId: state.maskRevision.maskRevisionId, returnStage: 'observing', attempt: Number(state.attempts.repair || 0) + 1 };
    validator.validateArtifact('RepairPlan', plan); state.repairPlans.push(plan);
    state.source = { parentRevisionId: state.currentRevision.revisionId, parentAssetRef: { refId: state.currentRevision.revisionId, revisionId: state.currentRevision.revisionId, sha256: state.currentRevision.sha256 }, maskAssetRef: { refId: state.maskRevision.maskRevisionId, revisionId: state.maskRevision.maskRevisionId, sha256: state.maskRevision.sha256 }, repairConstraint: plan.repairPrompt, repairPlan: plan };
    await mutate(state, 'REPAIR_MASKED_REGION', 'repair', 'edit');
  }
  async function color(state) { var palette = styleDNA.style(state.workItem.assetSpec.styleId).palette || {}, plan = { colorPlanId: receiptId('color-plan', [state.currentRevision.revisionId, state.actionPlan.reasonCodes, palette]), sourceRevisionId: state.currentRevision.revisionId, styleId: state.workItem.assetSpec.styleId, paletteRoleMap: clone(palette), protectedRegions: state.maskRevision ? [{ maskRevisionId: state.maskRevision.maskRevisionId, mode: 'protected-outside-mask' }] : [], applicationMode: 'declared-palette', returnStage: 'observing' }; validator.validateArtifact('ColorPlan', plan); state.colorPlans.push(plan); state.source.colorPlan = plan; transition(state, 'color-applying'); await mutate(state, 'APPLY_DECLARED_COLOR', 'color', 'colorize'); }
  async function normalize(state) { await mutate(state, 'NORMALIZE_STYLE', 'normalized', 'normalize'); }
  async function finalReview(state) {
    if (state.observation.sourceRevisionId !== state.currentRevision.revisionId || state.observation.defects.length) fail('ASSET_PRODUCTION_FINAL_REVIEW_INVALID', 'Final review requires current-revision evidence with no defects.', 'AssetAcceptanceGate');
    if (state.candidate.assetBlobRef) {
      if (typeof state.ports.promoteCandidate !== 'function') fail('ASSET_PRODUCTION_PROMOTION_UNAVAILABLE', 'Accepted provider output must be promoted to project-local storage.', 'AssetEngine');
      state.candidate = await state.ports.promoteCandidate(portState(state));
      state.currentRevision = Object.assign({}, state.currentRevision, { path: state.candidate.path, scope: state.candidate.privacyScope || 'project-local' });
      state.revisions[state.revisions.length - 1] = state.currentRevision;
      state.revisionInputs[state.currentRevision.revisionId] = { refId: state.currentRevision.revisionId, revisionId: state.currentRevision.revisionId, path: state.currentRevision.path, sha256: state.currentRevision.sha256, scope: state.currentRevision.scope, projectId: state.projectId, consent: true };
    }
    var receipt = { workItemPlanId: state.workItem.workItemPlanId, finalRevisionId: state.currentRevision.revisionId, targetVisualSlotId: state.workItem.targetVisualSlotId, visionEvidenceIds: [state.visionReceipts[state.visionReceipts.length - 1].receiptId], deterministicEvidenceIds: state.observation.deterministicEvidenceIds.slice(), styleId: state.workItem.assetSpec.styleId, decision: 'accepted', ownerRoute: null };
    validator.validateArtifact('WorkItemAcceptanceReceipt', receipt); state.acceptanceReceipt = receipt; state.accepted = true; transition(state, 'accepted'); actionReceipt(state, state.actionPlan, [], [], 'accepted');
  }
  var graph = new lg.StateGraph(State)
    .addNode('generate-or-resolve', node('generate-or-resolve', generate))
    .addNode('observe', node('observe', observe))
    .addNode('diagnose', node('diagnose', diagnose))
    .addNode('segment', node('segment', segment))
    .addNode('cutout', node('cutout', cutout))
    .addNode('repair', node('repair', repair))
    .addNode('color', node('color', color))
    .addNode('normalize', node('normalize', normalize))
    .addNode('final-review', node('final-review', finalReview))
    .addNode('debt', node('debt', async function(state) { if (!state.debt) state.debt = { code: 'ASSET_PRODUCTION_BUDGET_EXHAUSTED', owner: 'AssetEngine', message: 'No valid action remains within budget.', recoveryPhase: 'diagnosing' }; state.phase = 'debt'; }))
    .addConditionalEdges(lg.START, function(wire) { var state = wire.state || wire, routes = { planned: 'generate-or-resolve', resolving: 'generate-or-resolve', generating: 'generate-or-resolve', observing: 'observe', diagnosing: 'diagnose', segmenting: 'segment', repairing: 'repair', 'color-planning': 'color', 'color-applying': 'color', 'final-reviewing': 'final-review', debt: 'debt' }; if (state.phase === 'normalizing') return state.actionPlan && state.actionPlan.action === 'APPLY_CUTOUT' ? 'cutout' : 'normalize'; return routes[state.phase] || 'generate-or-resolve'; })
    .addConditionalEdges('generate-or-resolve', function(wire) { return (wire.state || wire).phase === 'debt' ? 'debt' : 'observe'; })
    .addConditionalEdges('observe', function(wire) { return (wire.state || wire).phase === 'debt' ? 'debt' : 'diagnose'; })
    .addConditionalEdges('diagnose', function(wire) { var state = wire.state || wire, routes = { FINAL_REVIEW: 'final-review', SEGMENT_SUBJECT: 'segment', APPLY_CUTOUT: 'cutout', REPAIR_MASKED_REGION: 'repair', APPLY_DECLARED_COLOR: 'color', NORMALIZE_STYLE: 'normalize', GENERATE_DRAFT: 'generate-or-resolve', DEBT: 'debt' }; return state.phase === 'debt' ? 'debt' : (routes[state.actionPlan && state.actionPlan.action] || 'debt'); })
    .addConditionalEdges('segment', function(wire) { return (wire.state || wire).phase === 'debt' ? 'debt' : 'observe'; })
    .addConditionalEdges('cutout', function(wire) { return (wire.state || wire).phase === 'debt' ? 'debt' : 'observe'; })
    .addConditionalEdges('repair', function(wire) { return (wire.state || wire).phase === 'debt' ? 'debt' : 'observe'; })
    .addConditionalEdges('color', function(wire) { return (wire.state || wire).phase === 'debt' ? 'debt' : 'observe'; })
    .addConditionalEdges('normalize', function(wire) { return (wire.state || wire).phase === 'debt' ? 'debt' : 'observe'; })
    .addEdge('final-review', lg.END).addEdge('debt', lg.END);
  var output = await graph.compile().invoke({ state: context }), state = output.state;
  state.historyHash = digest(state.history || []);
  state.loopState = { loopId: state.loopId, workItemPlanId: state.workItem.workItemPlanId, currentRevisionId: state.currentRevision ? state.currentRevision.revisionId : null, phase: state.phase, attempt: state.attemptReceipts.length, budgets: clone(state.workItem.retryBudget), observationReceiptIds: state.observations.map(function(item) { return item.observationId; }), pendingAction: state.actionPlan ? state.actionPlan.action : null, historyHash: state.historyHash };
  validator.validateArtifact('AssetProductionLoopState', state.loopState);
  if (input.onCheckpoint) input.onCheckpoint(checkpointSnapshot(state));
  return state;
}
async function runProductionSet(input) {
  validator.validatePlan(input.plan); var results = [], ledger = { schemaVersion: 1, productionSetId: input.plan.productionSetId, planContentHash: input.plan.contentHash, workItems: {} };
  if (input.ledgerPath && fs.existsSync(input.ledgerPath)) { var loaded = JSON.parse(fs.readFileSync(input.ledgerPath, 'utf8')); if (loaded.productionSetId === input.plan.productionSetId && loaded.planContentHash === input.plan.contentHash) ledger = loaded; }
  var revisionInputs = input.revisionInputs || {};
  for (var index = 0; index < input.plan.workItems.length; index++) { var workItem = input.plan.workItems[index]; results.push(await runWorkItem({ runId: input.runId, projectId: input.projectId, productionSetId: input.plan.productionSetId, workItem: workItem, ports: input.ports, revisionInputs: revisionInputs, source: (input.sources || {})[workItem.slotId], candidate: (input.candidates || {})[workItem.slotId], projectAssetDir: input.projectAssetDir, restored: ledger.workItems[workItem.workItemPlanId] || null, onCheckpoint: function(snapshot) { ledger.workItems[snapshot.workItem.workItemPlanId] = snapshot; writeLedger(input.ledgerPath, ledger); if (input.onCheckpoint) input.onCheckpoint(snapshot); } })); }
  var accepted = results.filter(function(result) { return result.accepted; }), expectedTargets = input.plan.coveragePolicy.requiredTargetVisualSlotIds.slice().sort(), acceptedTargets = accepted.map(function(result) { return result.workItem.targetVisualSlotId; }).sort(), complete = JSON.stringify(expectedTargets) === JSON.stringify(acceptedTargets);
  var byTarget = {}; accepted.forEach(function(result) { byTarget[result.workItem.targetVisualSlotId] = result.currentRevision.revisionId; });
  var receipt = { productionSetId: input.plan.productionSetId, workItemAcceptanceReceiptIds: accepted.map(function(result) { return receiptId('work-acceptance', result.acceptanceReceipt); }), requiredSlotCoverage: { expectedTargetVisualSlotIds: expectedTargets, acceptedTargetVisualSlotIds: acceptedTargets, missingTargetVisualSlotIds: expectedTargets.filter(function(target) { return acceptedTargets.indexOf(target) < 0; }), complete: complete }, acceptedRevisionByTargetVisualSlotId: byTarget, decision: complete ? 'accepted' : 'debt', ownerRoute: complete ? null : { owner: 'AssetAcceptanceGate', stage: 'required-slot-coverage' } };
  validator.validateSetAcceptance(receipt);
  return { plan: input.plan, workItems: results, acceptanceReceipt: receipt, pass: complete, decision: complete ? 'pass' : 'blocked', debts: results.filter(function(result) { return result.debt; }).map(function(result) { return result.debt; }) };
}

module.exports = { runWorkItem: runWorkItem, runProductionSet: runProductionSet, _rasterFacts: rasterFacts, _chooseAction: chooseAction, _defaultCutout: defaultCutout };
