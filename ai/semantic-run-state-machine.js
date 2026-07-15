var crypto = require('crypto');

var STATES = Object.freeze({
  PLANNING: 'PLANNING',
  PLAN_REPAIR: 'PLAN_REPAIR',
  TASK_READY: 'TASK_READY',
  TASK_ACTIVE: 'TASK_ACTIVE',
  TASK_REPAIR: 'TASK_REPAIR',
  FINALIZING: 'FINALIZING',
  COMPLETED: 'COMPLETED',
  FUSED: 'FUSED',
  EXPIRED: 'EXPIRED'
});

var EVENT_TYPES = Object.freeze({
  RUN_STARTED: 'RUN_STARTED',
  PLAN_ACCEPTED: 'PLAN_ACCEPTED',
  PLAN_RETRY_STARTED: 'PLAN_RETRY_STARTED',
  TASK_STARTED: 'TASK_STARTED',
  TASK_RETRIEVED: 'TASK_RETRIEVED',
  TASK_COMMITTED: 'TASK_COMMITTED',
  TASK_RETRY_STARTED: 'TASK_RETRY_STARTED',
  FAILURE_RECORDED: 'FAILURE_RECORDED',
  FINALIZATION_RETRY_STARTED: 'FINALIZATION_RETRY_STARTED',
  RUN_COMPLETED: 'RUN_COMPLETED',
  RUN_EXPIRED: 'RUN_EXPIRED'
});

var ALLOWED_MODES = Object.freeze({
  PLAN: 'plan',
  TASK_START: 'task-start',
  TASK_IO: 'write',
  COMPLETION: 'completion',
  NONE: 'none'
});

var TERMINAL_STATES = [STATES.COMPLETED, STATES.FUSED, STATES.EXPIRED];
var LEDGER_FIELDS = ['schemaVersion', 'ledgerKind', 'requestHash', 'events'];
var EVENT_FIELDS = ['sequence', 'previousHash', 'type', 'payload', 'eventHash'];
var PROMPT_PROJECTION_FIELDS = Object.freeze(['state', 'activeTaskId', 'allowedMode', 'completedTaskIds', 'lastFailure', 'transitionLog']);
var LEDGER_KIND = 'semantic-run-state-ledger';
var SCHEMA_VERSION = 1;

function fail(code, message) {
  var error = new Error(message);
  error.code = code;
  error.owner = 'SemanticRunStateMachine';
  throw error;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) {
    out[key] = stable(value[key]);
    return out;
  }, Object.create(null));
  return value;
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.keys(value).forEach(function(key) { freeze(value[key]); });
  return Object.freeze(value);
}

function digest(prefix, value) {
  return prefix + crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail('SEMANTIC_RUN_VALUE_INVALID', label + ' must be non-empty text.');
  return value;
}

function identifier(value, label) {
  value = text(value, label);
  if (!/^[A-Za-z][A-Za-z0-9._-]{0,127}$/.test(value)) fail('SEMANTIC_RUN_VALUE_INVALID', label + ' must be a stable identifier.');
  return value;
}

function allowedFields(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('SEMANTIC_RUN_EVENT_PAYLOAD_INVALID', label + ' must be a structure.');
  Object.keys(value).forEach(function(key) {
    if (fields.indexOf(key) < 0) fail('SEMANTIC_RUN_EVENT_PAYLOAD_INVALID', label + ' contains unknown field: ' + key);
  });
}

function exactFields(value, fields, label) {
  allowedFields(value, fields, label);
  fields.forEach(function(field) {
    if (!Object.prototype.hasOwnProperty.call(value, field)) fail('SEMANTIC_RUN_EVENT_PAYLOAD_INVALID', label + ' is missing field: ' + field);
  });
}

function requestHash(request) {
  return digest('semantic.request.', text(request, 'request'));
}

function genesisHash(ledger) {
  return digest('semantic.run-genesis.', {
    schemaVersion: ledger.schemaVersion,
    ledgerKind: ledger.ledgerKind,
    requestHash: ledger.requestHash
  });
}

function calculateEventHash(ledger, event) {
  return digest('semantic.run-event.', {
    schemaVersion: ledger.schemaVersion,
    ledgerKind: ledger.ledgerKind,
    requestHash: ledger.requestHash,
    sequence: event.sequence,
    previousHash: event.previousHash,
    type: event.type,
    payload: event.payload
  });
}

function failureSignature(payload) {
  return digest('semantic.failure.', {
    phase: payload.phase,
    taskId: payload.taskId || null,
    code: payload.code,
    owner: payload.owner,
    message: payload.message,
    subjectHash: payload.subjectHash
  });
}

function allowedMode(state) {
  if (state === STATES.PLANNING || state === STATES.PLAN_REPAIR) return ALLOWED_MODES.PLAN;
  if (state === STATES.TASK_READY) return ALLOWED_MODES.TASK_START;
  if (state === STATES.TASK_ACTIVE || state === STATES.TASK_REPAIR) return ALLOWED_MODES.TASK_IO;
  if (state === STATES.FINALIZING) return ALLOWED_MODES.COMPLETION;
  return ALLOWED_MODES.NONE;
}

function transitionLine(sequence, type, state, taskId, failure) {
  return [
    'seq=' + sequence,
    'event=' + type,
    'state=' + state,
    'mode=' + allowedMode(state),
    'task=' + (taskId || '-'),
    'code=' + (failure ? encodeURIComponent(String(failure.code)) : '-'),
    'failure=' + (failure && failure.signature || '-'),
    'detail=' + (failure ? encodeURIComponent(String(failure.message)) : '-')
  ].join('|');
}

function validateLedgerHeader(ledger) {
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) fail('SEMANTIC_RUN_LEDGER_INVALID', 'Semantic run ledger must be a structure.');
  Object.keys(ledger).forEach(function(field) {
    if (LEDGER_FIELDS.indexOf(field) < 0) fail('SEMANTIC_RUN_LEDGER_INVALID', 'Semantic run ledger contains unknown field: ' + field);
  });
  LEDGER_FIELDS.forEach(function(field) {
    if (!Object.prototype.hasOwnProperty.call(ledger, field)) fail('SEMANTIC_RUN_LEDGER_INVALID', 'Semantic run ledger is missing field: ' + field);
  });
  if (ledger.schemaVersion !== SCHEMA_VERSION || ledger.ledgerKind !== LEDGER_KIND) fail('SEMANTIC_RUN_LEDGER_INVALID', 'Semantic run ledger identity is invalid.');
  text(ledger.requestHash, 'ledger.requestHash');
  if (!Array.isArray(ledger.events)) fail('SEMANTIC_RUN_LEDGER_INVALID', 'Semantic run ledger events must be an array.');
}

function validatePayload(type, payload, view) {
  if (type === EVENT_TYPES.RUN_STARTED) {
    exactFields(payload, [], type + '.payload');
    if (view.transitionLog.length) fail('SEMANTIC_RUN_TRANSITION_INVALID', 'RUN_STARTED must be the first event.');
    return;
  }
  if (type === EVENT_TYPES.PLAN_ACCEPTED) {
    exactFields(payload, ['planHash', 'taskIds'], type + '.payload');
    text(payload.planHash, 'planHash');
    if (!Array.isArray(payload.taskIds) || !payload.taskIds.length) fail('SEMANTIC_RUN_PLAN_INVALID', 'Accepted TaskPlan must expose at least one task id.');
    var seen = Object.create(null);
    payload.taskIds.forEach(function(taskId) {
      taskId = identifier(taskId, 'taskId');
      if (seen[taskId]) fail('SEMANTIC_RUN_PLAN_INVALID', 'Accepted TaskPlan contains duplicate task id: ' + taskId);
      seen[taskId] = true;
    });
    return;
  }
  if (type === EVENT_TYPES.PLAN_RETRY_STARTED || type === EVENT_TYPES.FINALIZATION_RETRY_STARTED) {
    exactFields(payload, [], type + '.payload');
    return;
  }
  if (type === EVENT_TYPES.TASK_STARTED || type === EVENT_TYPES.TASK_RETRY_STARTED) {
    exactFields(payload, ['taskId'], type + '.payload');
    identifier(payload.taskId, 'taskId');
    return;
  }
  if (type === EVENT_TYPES.TASK_RETRIEVED) {
    exactFields(payload, ['taskId', 'queryHash', 'resultHash'], type + '.payload');
    identifier(payload.taskId, 'taskId');
    text(payload.queryHash, 'queryHash');
    text(payload.resultHash, 'resultHash');
    return;
  }
  if (type === EVENT_TYPES.TASK_COMMITTED) {
    exactFields(payload, ['taskId', 'receiptHash', 'draftBeforeHash', 'draftAfterHash'], type + '.payload');
    identifier(payload.taskId, 'taskId');
    text(payload.receiptHash, 'receiptHash');
    text(payload.draftBeforeHash, 'draftBeforeHash');
    text(payload.draftAfterHash, 'draftAfterHash');
    if (payload.draftBeforeHash === payload.draftAfterHash) fail('SEMANTIC_RUN_TASK_NO_PROGRESS', 'Committed task must change the Draft hash.');
    return;
  }
  if (type === EVENT_TYPES.FAILURE_RECORDED) {
    allowedFields(payload, ['phase', 'taskId', 'code', 'owner', 'message', 'subjectHash'], type + '.payload');
    ['phase', 'code', 'owner', 'message', 'subjectHash'].forEach(function(field) {
      if (!Object.prototype.hasOwnProperty.call(payload, field)) fail('SEMANTIC_RUN_EVENT_PAYLOAD_INVALID', type + '.payload is missing field: ' + field);
    });
    if (['plan', 'task', 'finalization'].indexOf(payload.phase) < 0) fail('SEMANTIC_RUN_FAILURE_INVALID', 'Failure phase must be plan, task, or finalization.');
    text(payload.code, 'failure.code');
    text(payload.owner, 'failure.owner');
    text(payload.message, 'failure.message');
    text(payload.subjectHash, 'failure.subjectHash');
    if (payload.phase === 'task') {
      if (!Object.prototype.hasOwnProperty.call(payload, 'taskId')) fail('SEMANTIC_RUN_FAILURE_INVALID', 'Task failure requires taskId.');
      identifier(payload.taskId, 'failure.taskId');
    } else if (Object.prototype.hasOwnProperty.call(payload, 'taskId')) fail('SEMANTIC_RUN_FAILURE_INVALID', 'Only task failures may contain taskId.');
    return;
  }
  if (type === EVENT_TYPES.RUN_COMPLETED) {
    exactFields(payload, ['sourceHash', 'receiptHash'], type + '.payload');
    text(payload.sourceHash, 'sourceHash');
    text(payload.receiptHash, 'receiptHash');
    return;
  }
  if (type === EVENT_TYPES.RUN_EXPIRED) {
    exactFields(payload, ['reason'], type + '.payload');
    text(payload.reason, 'expiration.reason');
    return;
  }
  fail('SEMANTIC_RUN_EVENT_TYPE_INVALID', 'Unknown semantic run event type: ' + type);
}

function resetFailure(view) {
  view.failureSignature = null;
  view.failureCount = 0;
  view.lastFailure = null;
}

function assertState(view, expected, type) {
  if (view.state !== expected) fail('SEMANTIC_RUN_TRANSITION_INVALID', type + ' is not legal from ' + view.state + '.');
}

function assertActiveTask(view, taskId, type) {
  if (!view.activeTaskId || taskId !== view.activeTaskId) fail('SEMANTIC_RUN_TASK_SCOPE_INVALID', type + ' belongs to ' + taskId + ' while the active task is ' + (view.activeTaskId || 'none') + '.');
}

function applyEvent(view, event) {
  var type = event.type, payload = event.payload, signature = null;
  validatePayload(type, payload, view);

  if (TERMINAL_STATES.indexOf(view.state) >= 0) fail('SEMANTIC_RUN_TERMINAL', 'No event may follow terminal state ' + view.state + '.');

  if (type === EVENT_TYPES.PLAN_ACCEPTED) {
    assertState(view, STATES.PLANNING, type);
    view.planHash = payload.planHash;
    view.taskIds = payload.taskIds.slice();
    view.activeTaskId = view.taskIds[0];
    view.state = STATES.TASK_READY;
    resetFailure(view);
  } else if (type === EVENT_TYPES.PLAN_RETRY_STARTED) {
    assertState(view, STATES.PLAN_REPAIR, type);
    view.state = STATES.PLANNING;
  } else if (type === EVENT_TYPES.TASK_STARTED) {
    assertState(view, STATES.TASK_READY, type);
    assertActiveTask(view, payload.taskId, type);
    view.state = STATES.TASK_ACTIVE;
    resetFailure(view);
  } else if (type === EVENT_TYPES.TASK_RETRIEVED) {
    assertState(view, STATES.TASK_ACTIVE, type);
    assertActiveTask(view, payload.taskId, type);
    if (view.retrievals.some(function(item) { return item.taskId === payload.taskId && item.queryHash === payload.queryHash; })) fail('SEMANTIC_RUN_RETRIEVE_DUPLICATE', 'Task-local retrieve query is already recorded for ' + payload.taskId + ': ' + payload.queryHash);
    view.retrievals.push(clone(payload));
    resetFailure(view);
  } else if (type === EVENT_TYPES.TASK_COMMITTED) {
    assertState(view, STATES.TASK_ACTIVE, type);
    assertActiveTask(view, payload.taskId, type);
    view.completedTaskIds.push(payload.taskId);
    resetFailure(view);
    if (view.completedTaskIds.length === view.taskIds.length) {
      view.activeTaskId = null;
      view.state = STATES.FINALIZING;
    } else {
      view.activeTaskId = view.taskIds[view.completedTaskIds.length];
      view.state = STATES.TASK_READY;
    }
  } else if (type === EVENT_TYPES.TASK_RETRY_STARTED) {
    assertState(view, STATES.TASK_REPAIR, type);
    assertActiveTask(view, payload.taskId, type);
    view.state = STATES.TASK_ACTIVE;
  } else if (type === EVENT_TYPES.FAILURE_RECORDED) {
    if (payload.phase === 'plan') assertState(view, STATES.PLANNING, type);
    else if (payload.phase === 'task') {
      assertState(view, STATES.TASK_ACTIVE, type);
      assertActiveTask(view, payload.taskId, type);
    } else assertState(view, STATES.FINALIZING, type);
    signature = failureSignature(payload);
    view.failureCount = view.failureSignature === signature ? view.failureCount + 1 : 1;
    view.failureSignature = signature;
    view.lastFailure = Object.assign(clone(payload), { signature: signature, consecutiveCount: view.failureCount });
    if (view.failureCount >= 2) view.state = STATES.FUSED;
    else if (payload.phase === 'plan') view.state = STATES.PLAN_REPAIR;
    else if (payload.phase === 'task') view.state = STATES.TASK_REPAIR;
    else view.state = STATES.FINALIZING;
  } else if (type === EVENT_TYPES.FINALIZATION_RETRY_STARTED) {
    assertState(view, STATES.FINALIZING, type);
    if (!view.lastFailure || view.lastFailure.phase !== 'finalization') fail('SEMANTIC_RUN_TRANSITION_INVALID', 'FINALIZATION_RETRY_STARTED requires a finalization failure.');
  } else if (type === EVENT_TYPES.RUN_COMPLETED) {
    assertState(view, STATES.FINALIZING, type);
    view.state = STATES.COMPLETED;
    view.sourceHash = payload.sourceHash;
    resetFailure(view);
  } else if (type === EVENT_TYPES.RUN_EXPIRED) {
    view.state = STATES.EXPIRED;
    view.expirationReason = payload.reason;
  }

  view.transitionLog.push(transitionLine(event.sequence, type, view.state, view.activeTaskId, view.lastFailure));
}

function project(ledger) {
  validateLedgerHeader(ledger);
  var view = {
    state: STATES.PLANNING,
    planHash: null,
    taskIds: [],
    activeTaskId: null,
    completedTaskIds: [],
    retrievals: [],
    failureSignature: null,
    failureCount: 0,
    lastFailure: null,
    sourceHash: null,
    expirationReason: null,
    transitionLog: []
  };
  var previousHash = genesisHash(ledger);
  ledger.events.forEach(function(event, position) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) fail('SEMANTIC_RUN_EVENT_INVALID', 'Semantic run event must be a structure.');
    Object.keys(event).forEach(function(field) {
      if (EVENT_FIELDS.indexOf(field) < 0) fail('SEMANTIC_RUN_EVENT_INVALID', 'Semantic run event contains unknown field: ' + field);
    });
    EVENT_FIELDS.forEach(function(field) {
      if (!Object.prototype.hasOwnProperty.call(event, field)) fail('SEMANTIC_RUN_EVENT_INVALID', 'Semantic run event is missing field: ' + field);
    });
    if (event.sequence !== position + 1) fail('SEMANTIC_RUN_EVENT_SEQUENCE_INVALID', 'Semantic run event sequence must be contiguous.');
    if (event.previousHash !== previousHash) fail('SEMANTIC_RUN_EVENT_CHAIN_INVALID', 'Semantic run event previousHash does not match the canonical head.');
    if (event.eventHash !== calculateEventHash(ledger, event)) fail('SEMANTIC_RUN_EVENT_HASH_INVALID', 'Semantic run event hash does not match its canonical content.');
    applyEvent(view, event);
    previousHash = event.eventHash;
  });
  var projection = {
    state: view.state,
    activeTaskId: view.activeTaskId,
    allowedMode: allowedMode(view.state),
    planHash: view.planHash,
    taskIds: view.taskIds.slice(),
    completedTaskIds: view.completedTaskIds.slice(),
    retrievals: clone(view.retrievals),
    lastFailure: clone(view.lastFailure),
    transitionLog: view.transitionLog.slice(),
    eventCount: ledger.events.length,
    headHash: previousHash,
    sourceHash: view.sourceHash,
    expirationReason: view.expirationReason
  };
  return freeze(projection);
}

function assertPromptProjection(projection, expectedTaskId) {
  if (!projection || typeof projection !== 'object' || Array.isArray(projection)) fail('SEMANTIC_RUN_PROMPT_PROJECTION_INVALID', 'Prompt projection must be a structure.');
  Object.keys(projection).forEach(function(field) {
    if (PROMPT_PROJECTION_FIELDS.indexOf(field) < 0) fail('SEMANTIC_RUN_PROMPT_PROJECTION_INVALID', 'Prompt projection contains unknown field: ' + field);
  });
  PROMPT_PROJECTION_FIELDS.forEach(function(field) {
    if (!Object.prototype.hasOwnProperty.call(projection, field)) fail('SEMANTIC_RUN_PROMPT_PROJECTION_INVALID', 'Prompt projection is missing field: ' + field);
  });
  if (Object.keys(STATES).map(function(key) { return STATES[key]; }).indexOf(projection.state) < 0) fail('SEMANTIC_RUN_PROMPT_PROJECTION_INVALID', 'Prompt projection state is invalid.');
  if (projection.allowedMode !== allowedMode(projection.state)) fail('SEMANTIC_RUN_PROMPT_PROJECTION_DIVERGED', 'Prompt projection allowedMode diverges from state.');
  if (projection.activeTaskId !== null) identifier(projection.activeTaskId, 'promptProjection.activeTaskId');
  if (!Array.isArray(projection.completedTaskIds)) fail('SEMANTIC_RUN_PROMPT_PROJECTION_INVALID', 'Prompt projection completedTaskIds must be an array.');
  projection.completedTaskIds.forEach(function(taskId) { identifier(taskId, 'promptProjection.completedTaskIds'); });
  if (projection.lastFailure !== null && (!projection.lastFailure || typeof projection.lastFailure !== 'object' || Array.isArray(projection.lastFailure))) fail('SEMANTIC_RUN_PROMPT_PROJECTION_INVALID', 'Prompt projection lastFailure must be null or a structure.');
  if (!Array.isArray(projection.transitionLog) || !projection.transitionLog.length) fail('SEMANTIC_RUN_PROMPT_PROJECTION_INVALID', 'Prompt projection transitionLog must contain canonical history.');
  projection.transitionLog.forEach(function(line) { if (typeof line !== 'string' || !line || /[\r\n]/.test(line)) fail('SEMANTIC_RUN_PROMPT_PROJECTION_INVALID', 'Prompt projection transition rows must be non-empty single lines.'); });
  var finalFields = projection.transitionLog[projection.transitionLog.length - 1].split('|').reduce(function(out, part) { var at = part.indexOf('='); if (at > 0) out[part.slice(0, at)] = part.slice(at + 1); return out; }, Object.create(null));
  if (finalFields.state !== projection.state || finalFields.mode !== projection.allowedMode || finalFields.task !== (projection.activeTaskId || '-')) fail('SEMANTIC_RUN_PROMPT_PROJECTION_DIVERGED', 'Final transition row diverges from prompt projection state.');
  var signature = projection.lastFailure && projection.lastFailure.signature || '-';
  if (finalFields.failure !== signature) fail('SEMANTIC_RUN_PROMPT_PROJECTION_DIVERGED', 'Final transition row diverges from prompt projection failure.');
  if (expectedTaskId !== undefined && projection.activeTaskId !== expectedTaskId) fail('SEMANTIC_RUN_PROMPT_PROJECTION_DIVERGED', 'Prompt projection active task differs from the frozen active task.');
  return projection;
}

function promptProjection(ledger) {
  var view = project(ledger);
  return freeze(assertPromptProjection({
    state: view.state,
    activeTaskId: view.activeTaskId,
    allowedMode: view.allowedMode,
    completedTaskIds: view.completedTaskIds.slice(),
    lastFailure: clone(view.lastFailure),
    transitionLog: view.transitionLog.slice()
  }));
}

function create(request) {
  var ledger = freeze({
    schemaVersion: SCHEMA_VERSION,
    ledgerKind: LEDGER_KIND,
    requestHash: requestHash(request),
    events: []
  });
  return append(ledger, EVENT_TYPES.RUN_STARTED, {});
}

function append(ledger, type, payload) {
  var current = project(ledger);
  if (TERMINAL_STATES.indexOf(current.state) >= 0) fail('SEMANTIC_RUN_TERMINAL', 'No event may follow terminal state ' + current.state + '.');
  if (Object.keys(EVENT_TYPES).map(function(key) { return EVENT_TYPES[key]; }).indexOf(type) < 0) fail('SEMANTIC_RUN_EVENT_TYPE_INVALID', 'Unknown semantic run event type: ' + type);
  payload = clone(payload || {});
  var previousHash = ledger.events.length ? ledger.events[ledger.events.length - 1].eventHash : genesisHash(ledger);
  var event = { sequence: ledger.events.length + 1, previousHash: previousHash, type: type, payload: payload };
  event.eventHash = calculateEventHash(ledger, event);
  var next = { schemaVersion: ledger.schemaVersion, ledgerKind: ledger.ledgerKind, requestHash: ledger.requestHash, events: ledger.events.map(clone).concat([event]) };
  project(next);
  return freeze(next);
}

var transition = Object.freeze({
  acceptPlan: function(ledger, planHash, taskIds) { return append(ledger, EVENT_TYPES.PLAN_ACCEPTED, { planHash: planHash, taskIds: taskIds }); },
  retryPlan: function(ledger) { return append(ledger, EVENT_TYPES.PLAN_RETRY_STARTED, {}); },
  startTask: function(ledger, taskId) { return append(ledger, EVENT_TYPES.TASK_STARTED, { taskId: taskId }); },
  recordRetrieve: function(ledger, taskId, queryHash, resultHash) { return append(ledger, EVENT_TYPES.TASK_RETRIEVED, { taskId: taskId, queryHash: queryHash, resultHash: resultHash }); },
  commitTask: function(ledger, taskId, receiptHash, draftBeforeHash, draftAfterHash) { return append(ledger, EVENT_TYPES.TASK_COMMITTED, { taskId: taskId, receiptHash: receiptHash, draftBeforeHash: draftBeforeHash, draftAfterHash: draftAfterHash }); },
  retryTask: function(ledger, taskId) { return append(ledger, EVENT_TYPES.TASK_RETRY_STARTED, { taskId: taskId }); },
  recordFailure: function(ledger, failure) { return append(ledger, EVENT_TYPES.FAILURE_RECORDED, failure); },
  retryFinalization: function(ledger) { return append(ledger, EVENT_TYPES.FINALIZATION_RETRY_STARTED, {}); },
  completeRun: function(ledger, sourceHash, receiptHash) { return append(ledger, EVENT_TYPES.RUN_COMPLETED, { sourceHash: sourceHash, receiptHash: receiptHash }); },
  expireRun: function(ledger, reason) { return append(ledger, EVENT_TYPES.RUN_EXPIRED, { reason: reason }); }
});

module.exports = {
  SCHEMA_VERSION: SCHEMA_VERSION,
  LEDGER_KIND: LEDGER_KIND,
  STATES: STATES,
  EVENT_TYPES: EVENT_TYPES,
  ALLOWED_MODES: ALLOWED_MODES,
  PROMPT_PROJECTION_FIELDS: PROMPT_PROJECTION_FIELDS,
  create: create,
  project: project,
  promptProjection: promptProjection,
  assertPromptProjection: assertPromptProjection,
  append: append,
  transition: transition,
  failureSignature: failureSignature
};
