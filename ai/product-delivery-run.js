var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var contract = require('../shared/product-delivery-contract.json');

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, {}); return value; }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0, 24); }
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'ProductDeliveryRun'; throw error; }
function text(value, label) { if (typeof value !== 'string' || !value.trim()) fail('PRODUCT_DELIVERY_RUN_INVALID', label + ' must be non-empty text.'); return value.trim(); }
function integer(value, label, minimum) { if (!Number.isInteger(value) || value < minimum) fail('PRODUCT_DELIVERY_RUN_INVALID', label + ' must be an integer >= ' + minimum + '.'); return value; }
function number(value, label, minimum) { if (!Number.isFinite(value) || value < minimum) fail('PRODUCT_DELIVERY_RUN_INVALID', label + ' must be a number >= ' + minimum + '.'); return value; }
function allowed(value, fields, label) { Object.keys(value).forEach(function(field) { if (fields.indexOf(field) < 0) fail('PRODUCT_DELIVERY_RUN_INVALID', label + ' contains unknown field: ' + field); }); }
function seal(value) { var core = clone(value); delete core.contentHash; value.contentHash = 'product-delivery-run.' + digest(core); return value; }
function verifySeal(value) { var expected = clone(value); delete expected.contentHash; if (value.contentHash !== 'product-delivery-run.' + digest(expected)) fail('PRODUCT_DELIVERY_RUN_HASH_INVALID', 'ProductDeliveryRun contentHash does not bind its content.'); }

function normalizeBudgets(value) {
  value = Object.assign({}, contract.defaultBudgets, clone(value || {}));
  value.stageAttemptsPerSource = Object.assign({}, contract.defaultBudgets.stageAttemptsPerSource, clone(value.stageAttemptsPerSource || {}));
  allowed(value, ['semanticCycles', 'stageAttemptsPerSource', 'repeatedObservationLimit', 'elapsedMs', 'costUsd'], 'budgets');
  allowed(value.stageAttemptsPerSource, contract.stages, 'budgets.stageAttemptsPerSource');
  integer(value.semanticCycles, 'budgets.semanticCycles', 1);
  integer(value.repeatedObservationLimit, 'budgets.repeatedObservationLimit', 1);
  integer(value.elapsedMs, 'budgets.elapsedMs', 1);
  number(value.costUsd, 'budgets.costUsd', 0);
  contract.stages.forEach(function(stage) { integer(value.stageAttemptsPerSource[stage], 'budgets.stageAttemptsPerSource.' + stage, 1); });
  if (value.semanticCycles > contract.maximumBudgets.semanticCycles || value.repeatedObservationLimit > contract.maximumBudgets.repeatedObservationLimit || value.elapsedMs > contract.maximumBudgets.elapsedMs || value.costUsd > contract.maximumBudgets.costUsd) fail('PRODUCT_DELIVERY_BUDGET_INVALID', 'Product delivery budgets cannot exceed the contract maximums.');
  contract.stages.forEach(function(stage) { if (value.stageAttemptsPerSource[stage] > contract.maximumBudgets.stageAttemptsPerSource[stage]) fail('PRODUCT_DELIVERY_BUDGET_INVALID', 'budgets.stageAttemptsPerSource.' + stage + ' exceeds the contract maximum.'); });
  return value;
}

function emptyArtifacts(sourceHash) {
  return {
    sourceHash: sourceHash || null,
    revisionHash: null,
    assetWorldHash: null,
    assetBoundSeedHash: null,
    geometryFactSetHash: null,
    spatialResolutionHash: null,
    finalProjectionHash: null,
    browserCaptureHash: null,
    assemblyReviewHash: null
  };
}

function create(options) {
  options = options || {};
  var now = Date.now(), sourceHash = options.sourceHash === undefined || options.sourceHash === null ? null : text(options.sourceHash, 'sourceHash');
  return seal({
    schemaVersion: contract.schemaVersion,
    documentKind: 'product-delivery-run',
    deliveryId: text(options.deliveryId, 'deliveryId'),
    projectId: text(options.projectId, 'projectId'),
    status: 'semantic-ready',
    currentSourceHash: sourceHash,
    semanticCycle: sourceHash ? 1 : 0,
    budgets: normalizeBudgets(options.budgets),
    usage: { stageAttempts: {}, observationCounts: {}, settledCostUsd: 0 },
    artifacts: emptyArtifacts(sourceHash),
    history: [],
    startedAtMs: now,
    updatedAtMs: now,
    blocked: null
  });
}

function validate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('PRODUCT_DELIVERY_RUN_INVALID', 'ProductDeliveryRun must be an object.');
  allowed(value, ['schemaVersion', 'documentKind', 'deliveryId', 'projectId', 'status', 'currentSourceHash', 'semanticCycle', 'budgets', 'usage', 'artifacts', 'history', 'startedAtMs', 'updatedAtMs', 'blocked', 'contentHash'], 'ProductDeliveryRun');
  if (value.schemaVersion !== contract.schemaVersion || value.documentKind !== 'product-delivery-run') fail('PRODUCT_DELIVERY_RUN_INVALID', 'ProductDeliveryRun kind or version is invalid.');
  text(value.deliveryId, 'deliveryId'); text(value.projectId, 'projectId');
  if (contract.statuses.indexOf(value.status) < 0) fail('PRODUCT_DELIVERY_RUN_INVALID', 'ProductDeliveryRun status is invalid: ' + value.status);
  if (value.currentSourceHash !== null) text(value.currentSourceHash, 'currentSourceHash');
  integer(value.semanticCycle, 'semanticCycle', 0); normalizeBudgets(value.budgets);
  if (!value.usage || typeof value.usage !== 'object' || Array.isArray(value.usage) || !value.artifacts || typeof value.artifacts !== 'object' || Array.isArray(value.artifacts) || !Array.isArray(value.history)) fail('PRODUCT_DELIVERY_RUN_INVALID', 'ProductDeliveryRun usage, artifacts, and history are required.');
  allowed(value.usage, ['stageAttempts', 'observationCounts', 'settledCostUsd'], 'usage');
  if (!value.usage.stageAttempts || typeof value.usage.stageAttempts !== 'object' || Array.isArray(value.usage.stageAttempts) || !value.usage.observationCounts || typeof value.usage.observationCounts !== 'object' || Array.isArray(value.usage.observationCounts)) fail('PRODUCT_DELIVERY_RUN_INVALID', 'usage counters must be objects.');
  Object.keys(value.usage.stageAttempts).forEach(function(key) { integer(value.usage.stageAttempts[key], 'usage.stageAttempts.' + key, 0); });
  Object.keys(value.usage.observationCounts).forEach(function(key) { integer(value.usage.observationCounts[key], 'usage.observationCounts.' + key, 0); });
  allowed(value.artifacts, contract.artifactRefs, 'artifacts');
  contract.artifactRefs.forEach(function(field) { if (!Object.prototype.hasOwnProperty.call(value.artifacts, field)) fail('PRODUCT_DELIVERY_RUN_INVALID', 'artifacts is missing ' + field + '.'); if (value.artifacts[field] !== null) text(value.artifacts[field], 'artifacts.' + field); });
  if (value.artifacts.sourceHash !== value.currentSourceHash) fail('PRODUCT_DELIVERY_RUN_INVALID', 'artifacts.sourceHash must equal currentSourceHash.');
  number(value.usage.settledCostUsd, 'usage.settledCostUsd', 0);
  integer(value.startedAtMs, 'startedAtMs', 0); integer(value.updatedAtMs, 'updatedAtMs', 0);
  if (value.updatedAtMs < value.startedAtMs) fail('PRODUCT_DELIVERY_RUN_INVALID', 'updatedAtMs cannot precede startedAtMs.');
  value.history.forEach(function(event, index) { if (!event || typeof event !== 'object' || Array.isArray(event) || event.sequence !== index + 1 || !Number.isInteger(event.atMs) || event.atMs < 0) fail('PRODUCT_DELIVERY_RUN_INVALID', 'history must be a contiguous timestamped event sequence.'); });
  if (value.status === 'blocked') { if (!value.blocked || typeof value.blocked !== 'object' || Array.isArray(value.blocked)) fail('PRODUCT_DELIVERY_RUN_INVALID', 'Blocked status requires blocked facts.'); text(value.blocked.code, 'blocked.code'); text(value.blocked.owner, 'blocked.owner'); text(value.blocked.message, 'blocked.message'); }
  else if (value.blocked !== null) fail('PRODUCT_DELIVERY_RUN_INVALID', 'Only blocked status may carry blocked facts.');
  verifySeal(value);
  return clone(value);
}

function read(file) {
  if (!file || !fs.existsSync(file)) return null;
  try { return validate(JSON.parse(fs.readFileSync(file, 'utf8'))); }
  catch (error) { if (!error.code) error.code = 'PRODUCT_DELIVERY_RUN_READ_FAILED'; throw error; }
}

function write(file, run) {
  if (!file) fail('PRODUCT_DELIVERY_RUN_PATH_REQUIRED', 'A persistent ProductDeliveryRun path is required so budgets cannot reset with a new runId.');
  var valid = validate(seal(Object.assign(clone(run), { updatedAtMs: Date.now() })));
  var resolved = path.resolve(file), temporary = resolved + '.tmp.' + process.pid + '.' + crypto.randomBytes(8).toString('hex');
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  try { fs.writeFileSync(temporary, JSON.stringify(valid, null, 2), { encoding: 'utf8', flag: 'wx' }); fs.renameSync(temporary, resolved); }
  finally { if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true }); }
  return valid;
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error && error.code !== 'ESRCH'; }
}
function acquireLease(file) {
  if (!file) fail('PRODUCT_DELIVERY_RUN_PATH_REQUIRED', 'A persistent ProductDeliveryRun path is required for the execution lease.');
  var resolved = path.resolve(file), lockPath = resolved + '.lock', token = crypto.randomBytes(24).toString('hex'), attempt = 0;
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  while (attempt < 2) {
    attempt += 1;
    try {
      var descriptor = fs.openSync(lockPath, 'wx');
      var lease = { schemaVersion: 1, documentKind: 'product-delivery-lease', token: token, pid: process.pid, acquiredAtMs: Date.now() };
      fs.writeFileSync(descriptor, JSON.stringify(lease), 'utf8');
      return { descriptor: descriptor, lockPath: lockPath, token: token };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      var current = null;
      try { current = JSON.parse(fs.readFileSync(lockPath, 'utf8')); } catch (_readError) {}
      var stale = current && Number.isInteger(current.acquiredAtMs) && Date.now() - current.acquiredAtMs > contract.stagePolicy.leaseStaleMs && !processAlive(current.pid);
      if (stale && attempt === 1) { try { fs.rmSync(lockPath, { force: true }); } catch (_removeError) {} continue; }
      fail('PRODUCT_DELIVERY_ALREADY_RUNNING', 'This product delivery already owns an active execution lease.');
    }
  }
  fail('PRODUCT_DELIVERY_ALREADY_RUNNING', 'This product delivery already owns an active execution lease.');
}
function releaseLease(lease) {
  if (!lease) return;
  try { if (lease.descriptor !== undefined && lease.descriptor !== null) fs.closeSync(lease.descriptor); } catch (_closeError) {}
  try {
    var current = JSON.parse(fs.readFileSync(lease.lockPath, 'utf8'));
    if (current.token === lease.token) fs.rmSync(lease.lockPath, { force: true });
  } catch (_releaseError) {}
}

function open(options) {
  options = options || {};
  var existing = read(options.file);
  if (!existing) return write(options.file, create(options));
  if (existing.deliveryId !== options.deliveryId || existing.projectId !== options.projectId) fail('PRODUCT_DELIVERY_RUN_IDENTITY_MISMATCH', 'Existing ProductDeliveryRun belongs to a different delivery or project.');
  return existing;
}

function attemptKey(run, stage) { return (run.currentSourceHash || 'source-pending') + '/' + stage; }
function append(run, event) {
  run.history.push(Object.assign({ sequence: run.history.length + 1, atMs: Date.now(), sourceHash: run.currentSourceHash }, clone(event)));
  return run;
}

function assertBudget(run) {
  if (Date.now() - run.startedAtMs > run.budgets.elapsedMs) fail('PRODUCT_DELIVERY_TIME_BUDGET_EXHAUSTED', 'Product delivery exceeded its persisted elapsed-time budget.');
  if (run.usage.settledCostUsd > run.budgets.costUsd) fail('PRODUCT_DELIVERY_COST_BUDGET_EXHAUSTED', 'Product delivery exceeded its persisted settled-cost budget.');
  if (run.semanticCycle > run.budgets.semanticCycles) fail('PRODUCT_DELIVERY_SEMANTIC_BUDGET_EXHAUSTED', 'Product delivery exceeded its persisted semantic-cycle budget.');
}
function assertMutable(run, operation) {
  if (run.status === 'accepted' || run.status === 'blocked') fail('PRODUCT_DELIVERY_TERMINAL', operation + ' is forbidden after terminal status ' + run.status + '.');
}

function beginStage(run, stage) {
  run = validate(run);
  assertMutable(run, 'beginStage');
  if (contract.stages.indexOf(stage) < 0) fail('PRODUCT_DELIVERY_STAGE_INVALID', 'Unknown product delivery stage: ' + stage);
  var permitted = {
    semantic: ['semantic-ready', 'asset-producing', 'spatial-planning', 'assembly-reviewing'],
    asset: ['semantic-ready', 'asset-producing'],
    spatial: ['asset-bound', 'spatial-planning'],
    assembly: ['spatial-accepted']
  };
  if (permitted[stage].indexOf(run.status) < 0) fail('PRODUCT_DELIVERY_STAGE_ORDER_INVALID', stage + ' cannot start from ' + run.status + '.');
  assertBudget(run);
  if (stage === 'semantic' && run.currentSourceHash && run.semanticCycle >= run.budgets.semanticCycles) fail('PRODUCT_DELIVERY_SEMANTIC_BUDGET_EXHAUSTED', 'Product delivery has no semantic cycle available for another LLM2 Revision.');
  var key = attemptKey(run, stage), next = (run.usage.stageAttempts[key] || 0) + 1, limit = run.budgets.stageAttemptsPerSource[stage];
  if (next > limit) fail('PRODUCT_DELIVERY_STAGE_BUDGET_EXHAUSTED', stage + ' exceeded ' + limit + ' attempts for the current sourceHash.');
  run.usage.stageAttempts[key] = next;
  var statuses = { semantic: 'awaiting-semantic-revision', asset: 'asset-producing', spatial: 'spatial-planning', assembly: 'assembly-reviewing' };
  run.status = statuses[stage];
  append(run, { kind: 'stage-attempt', stage: stage, attempt: next });
  return seal(run);
}

function startSource(run, sourceHash, revisionHash) {
  run = validate(run); sourceHash = text(sourceHash, 'sourceHash');
  assertMutable(run, 'startSource');
  if (run.currentSourceHash === sourceHash) fail('PRODUCT_DELIVERY_SOURCE_UNCHANGED', 'A Source activation must change sourceHash.');
  if (run.currentSourceHash !== null && run.status !== 'awaiting-semantic-revision') fail('PRODUCT_DELIVERY_SOURCE_TRANSITION_INVALID', 'Only a completed semantic-revision stage may replace the active Source.');
  if (run.currentSourceHash !== null && run.semanticCycle >= run.budgets.semanticCycles) fail('PRODUCT_DELIVERY_SEMANTIC_BUDGET_EXHAUSTED', 'Product delivery has no semantic cycle available for another Source.');
  run.semanticCycle += 1;
  run.currentSourceHash = sourceHash;
  run.artifacts = emptyArtifacts(sourceHash);
  run.artifacts.revisionHash = revisionHash ? text(revisionHash, 'revisionHash') : null;
  run.status = 'semantic-ready'; run.blocked = null;
  append(run, { kind: 'source-activated', revisionHash: run.artifacts.revisionHash });
  assertBudget(run);
  return seal(run);
}

function recordArtifacts(run, stage, refs) {
  run = validate(run); refs = refs || {};
  assertMutable(run, 'recordArtifacts');
  var stageFields = { asset: ['assetWorldHash', 'assetBoundSeedHash'], spatial: ['geometryFactSetHash', 'spatialResolutionHash', 'finalProjectionHash'], assembly: ['browserCaptureHash', 'assemblyReviewHash'] };
  if (!stageFields[stage]) fail('PRODUCT_DELIVERY_ARTIFACT_INVALID', 'Unknown artifact stage: ' + stage);
  Object.keys(refs).forEach(function(field) { if (stageFields[stage].indexOf(field) < 0) fail('PRODUCT_DELIVERY_ARTIFACT_INVALID', stage + ' cannot record ' + field + '.'); });
  if (!Object.keys(refs).length) fail('PRODUCT_DELIVERY_ARTIFACT_INVALID', 'Artifact recording requires at least one hash.');
  if (stage === 'asset' && run.status !== 'asset-producing') fail('PRODUCT_DELIVERY_STAGE_ORDER_INVALID', 'Asset artifacts require an active asset stage.');
  if (stage === 'spatial' && (run.status !== 'spatial-planning' || !run.artifacts.assetWorldHash || !run.artifacts.assetBoundSeedHash)) fail('PRODUCT_DELIVERY_STAGE_ORDER_INVALID', 'Spatial artifacts require accepted asset artifacts and an active spatial stage.');
  if (stage === 'assembly' && (run.status !== 'assembly-reviewing' || !run.artifacts.spatialResolutionHash || !run.artifacts.finalProjectionHash)) fail('PRODUCT_DELIVERY_STAGE_ORDER_INVALID', 'Assembly artifacts require accepted spatial artifacts and an active assembly stage.');
  Object.keys(refs).forEach(function(field) {
    if (contract.artifactRefs.indexOf(field) < 0 || field === 'sourceHash') fail('PRODUCT_DELIVERY_ARTIFACT_INVALID', 'Unknown or immutable artifact ref: ' + field);
    run.artifacts[field] = text(refs[field], field);
  });
  var statuses = { asset: 'asset-bound', spatial: 'spatial-accepted', assembly: 'assembly-reviewing' };
  if (statuses[stage]) run.status = statuses[stage];
  append(run, { kind: 'artifacts-recorded', stage: stage, refs: clone(refs) });
  return seal(run);
}

function observationSignature(observation) {
  var targets = clone(observation.targets || []).sort(function(left, right) { return String(left.collection || '').localeCompare(String(right.collection || '')) || String(left.semanticId || '').localeCompare(String(right.semanticId || '')); });
  return 'observation.' + digest({ stage: observation.stage, code: observation.code, targets: targets });
}
function recordObservation(run, observation) {
  run = validate(run); observation = observation || {};
  assertMutable(run, 'recordObservation');
  var signature = observationSignature(observation), count = (run.usage.observationCounts[signature] || 0) + 1;
  run.usage.observationCounts[signature] = count;
  append(run, { kind: 'observation', stage: observation.stage, code: observation.code, message: observation.message || null, targets: clone(observation.targets || []), evidenceHash: observation.evidenceHash || null, signature: signature, count: count });
  return { run: seal(run), signature: signature, count: count, fused: count >= run.budgets.repeatedObservationLimit };
}

function recordCost(run, settledCostUsd, receiptIds) {
  run = validate(run); settledCostUsd = number(settledCostUsd, 'settledCostUsd', 0);
  assertMutable(run, 'recordCost');
  if (settledCostUsd < run.usage.settledCostUsd) fail('PRODUCT_DELIVERY_COST_INVALID', 'Settled provider cost cannot decrease.');
  run.usage.settledCostUsd = settledCostUsd;
  append(run, { kind: 'cost-settled', settledCostUsd: settledCostUsd, receiptIds: (receiptIds || []).slice().sort() });
  var settledRun = seal(run);
  try { assertBudget(settledRun); }
  catch (error) { error.deliveryRun = settledRun; throw error; }
  return settledRun;
}

function accept(run) {
  run = validate(run);
  assertMutable(run, 'accept');
  assertBudget(run);
  if (run.status !== 'assembly-reviewing') fail('PRODUCT_DELIVERY_STAGE_ORDER_INVALID', 'Product acceptance requires the assembly-reviewing stage.');
  contract.completionGate.forEach(function(field) { if (!run.artifacts[field]) fail('PRODUCT_DELIVERY_COMPLETION_INCOMPLETE', 'Product delivery cannot be accepted without ' + field + '.'); });
  run.status = 'accepted'; run.blocked = null;
  append(run, { kind: 'accepted', refs: clone(run.artifacts) });
  return seal(run);
}

function recover(run) {
  run = validate(run);
  assertMutable(run, 'recover');
  if (run.status === 'semantic-ready') return run;
  var previousStatus = run.status, revisionHash = run.artifacts.revisionHash;
  run.artifacts = emptyArtifacts(run.currentSourceHash);
  run.artifacts.revisionHash = revisionHash;
  run.status = 'semantic-ready';
  run.blocked = null;
  append(run, { kind: 'recovery-restarted', previousStatus: previousStatus, invalidatedDownstreamArtifacts: true });
  assertBudget(run);
  return seal(run);
}

function block(run, issue) {
  run = validate(run); issue = issue || {};
  assertMutable(run, 'block');
  run.status = 'blocked';
  run.blocked = { code: text(issue.code || 'PRODUCT_DELIVERY_BLOCKED', 'blocked.code'), owner: text(issue.owner || 'ProductDeliveryOrchestrator', 'blocked.owner'), stage: issue.stage || null, message: text(issue.message || 'Product delivery is blocked.', 'blocked.message'), evidenceHash: issue.evidenceHash || null };
  append(run, { kind: 'blocked', blocked: clone(run.blocked) });
  return seal(run);
}

module.exports = {
  contract: contract,
  create: create,
  validate: validate,
  read: read,
  write: write,
  open: open,
  acquireLease: acquireLease,
  releaseLease: releaseLease,
  beginStage: beginStage,
  startSource: startSource,
  recordArtifacts: recordArtifacts,
  recordObservation: recordObservation,
  recordCost: recordCost,
  recover: recover,
  accept: accept,
  block: block,
  observationSignature: observationSignature
};
