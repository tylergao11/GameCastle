var crypto = require('crypto');
var semanticAlgebra = require('./semantic-event-algebra');
var syntax = require('./semantic-dsl-syntax');

// Dispatch-only TaskPlan: planner emits natural-language work orders (plan-task).
// Executor free-writes against the active task goal; no pre-declared structure slots.
var SCHEMA_VERSION = 9;
var DOCUMENT_KIND = 'semantic-task-plan';
var LANGUAGE_ID = syntax.LANGUAGE_ID;
var PLAN_COMMANDS = syntax.PLAN_COMMANDS;
var CATALOGS = ['entity-kinds', 'behavior-kinds', 'event-kinds', 'layouts', 'asset-families', 'asset-styles', 'component-library'];
var RETRIEVE_CATALOG = 'extension-groups';
var PLANNER_CATALOGS = CATALOGS.concat([RETRIEVE_CATALOG]);
var MAX_TASKS_PER_PLAN = 16;
var WRITE_ORDER = Object.freeze(['remove', 'game', 'entity', 'member', 'component', 'asset', 'layout', 'policy', 'event', 'when', 'then']);
var PLAN_SCOPED_WRITE_CODES = Object.freeze(['SEMANTIC_TASK_DELTA_EMPTY', 'SEMANTIC_TASK_DELTA_INVALID', 'SEMANTIC_TASK_BATCH_EMPTY']);

function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'SemanticTaskPlan'; throw error; }
function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, Object.create(null)); return value; }
function digest(value, prefix) { return prefix + crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0, 24); }
function object(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('SEMANTIC_TASK_PLAN_INVALID', label + ' must be a structure.'); return value; }
function array(value, label) { if (!Array.isArray(value)) fail('SEMANTIC_TASK_PLAN_INVALID', label + ' must be an array.'); return value; }
function text(value, label) { if (typeof value !== 'string' || !value.trim()) fail('SEMANTIC_TASK_PLAN_INVALID', label + ' must be a non-empty string.'); return value.trim(); }
function id(value, label) { value = text(value, label); if (!/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(value)) fail('SEMANTIC_TASK_PLAN_INVALID', label + ' must be a semantic id.'); return value; }

function planHash(plan) { return digest({ schemaVersion: plan.schemaVersion, documentKind: plan.documentKind, languageId: plan.languageId, tasks: plan.tasks }, 'semantic.plan.'); }
function documentHash(document) { return digest(document, 'semantic.document.'); }
function taskById(plan, taskId) {
  plan = object(plan, 'plan');
  var found = array(plan.tasks, 'plan.tasks').filter(function(task) { return task.semanticId === taskId; })[0];
  if (!found) fail('SEMANTIC_TASK_MISSING', 'Task plan has no task: ' + taskId);
  return found;
}

function create(commands) {
  array(commands, 'plan commands');
  if (!commands.length) fail('SEMANTIC_TASK_PLAN_EMPTY', 'Dispatch requires plan-task or plan-complete.');
  var completeOnly = commands.length === 1 && commands[0] && commands[0].type === 'plan-complete';
  if (completeOnly) {
    syntax.validateCommand(commands[0], 'planner');
    var done = {
      schemaVersion: SCHEMA_VERSION,
      documentKind: DOCUMENT_KIND,
      languageId: LANGUAGE_ID,
      dispatchComplete: true,
      tasks: Object.freeze([])
    };
    done.planHash = planHash(done);
    return Object.freeze(done);
  }
  // Exactly one work order per dispatch round (one task to executor).
  if (commands.length !== 1 || !commands[0] || commands[0].type !== 'plan-task') {
    fail(
      'SEMANTIC_TASK_PLAN_COMMAND_INVALID',
      'Dispatch accepts exactly one plan-task (or sole plan-complete). Structure plan-* and multi-task batches are removed.'
    );
  }
  var command = commands[0];
  syntax.validateCommand(command, 'planner');
  var semanticId = id(command.semanticId, 'plan-task.semanticId');
  var goal = text(command.goal, 'plan-task.goal');
  var dependsOn = Array.isArray(command.after) ? command.after.map(function(item, index) {
    return id(item, 'plan-task.after[' + index + ']');
  }) : [];
  // after is advisory history only for single-task dispatch (prior task ids).
  var task = Object.freeze({
    semanticId: semanticId,
    goal: goal,
    dependsOn: Object.freeze(dependsOn),
    slots: Object.freeze([]),
    capabilities: Object.freeze([]),
    catalogs: Object.freeze([]),
    retrievals: Object.freeze([])
  });
  var plan = {
    schemaVersion: SCHEMA_VERSION,
    documentKind: DOCUMENT_KIND,
    languageId: LANGUAGE_ID,
    dispatchComplete: false,
    tasks: Object.freeze([task])
  };
  plan.planHash = planHash(plan);
  return Object.freeze(plan);
}

function assertFeasible(plan, beforeDocument, options) {
  options = options || {};
  object(plan, 'plan');
  array(plan.tasks, 'plan.tasks');
  if (plan.dispatchComplete) {
    if (plan.tasks.length) fail('SEMANTIC_TASK_PLAN_INFEASIBLE', 'plan-complete cannot carry tasks.');
    return true;
  }
  if (plan.tasks.length !== 1) fail('SEMANTIC_TASK_PLAN_INFEASIBLE', 'Dispatch accepts exactly one task per round.');
  var task = plan.tasks[0];
  if (!task.goal || !String(task.goal).trim()) fail('SEMANTIC_TASK_PLAN_INFEASIBLE', 'Task requires a natural-language goal.');
  if (task.slots && task.slots.length) fail('SEMANTIC_TASK_PLAN_INFEASIBLE', 'Dispatch tasks must not carry structure slots.');
  return true;
}

function stripTypedSlotPrefix(slot, type) {
  if (typeof slot !== 'string') return slot;
  var raw = slot.trim();
  var prefix = type + '.';
  // Models often write entity.snakeHead / member.GameState.direction / game.main — strip the type prefix once.
  if (raw.indexOf(prefix) === 0 && raw.length > prefix.length) return raw.slice(prefix.length);
  return raw;
}

function normalizeExecutorCommandSlot(command) {
  command = clone(object(command, 'Draft-write command'));
  if (typeof command.slot === 'string') {
    var facetSlot = /^(.*)#(metadata|conditions|actions)$/.exec(command.slot.trim());
    if (facetSlot && facetSlot[1]) command.slot = facetSlot[1];
    if (command.type === 'game' || command.type === 'entity' || command.type === 'member' || command.type === 'event' || command.type === 'component' || command.type === 'asset' || command.type === 'layout' || command.type === 'remove') {
      command.slot = stripTypedSlotPrefix(command.slot, command.type);
    }
  }
  return command;
}

function orderWriteBatch(commands) {
  return array(commands, 'Draft-write batch').slice().sort(function(left, right) {
    var li = WRITE_ORDER.indexOf(left && left.type);
    var ri = WRITE_ORDER.indexOf(right && right.type);
    if (li < 0) li = WRITE_ORDER.length;
    if (ri < 0) ri = WRITE_ORDER.length;
    return li - ri;
  });
}

function parseMemberAddress(slot, label) {
  slot = text(slot, label);
  var at = slot.indexOf('.');
  if (at <= 0 || at === slot.length - 1) {
    fail('SEMANTIC_TASK_SLOT_MISSING', label + ' member slot must be Owner.field (got ' + slot + ').');
  }
  return { entity: slot.slice(0, at), semanticId: slot.slice(at + 1) };
}

function resolveCapabilityHandle(value, label) {
  value = text(value, label);
  var operation = semanticAlgebra.operationForUse(value);
  if (!operation) fail('SEMANTIC_TASK_CAPABILITY_ALIAS_MISSING', label + ' is not a foundation operation handle: ' + value);
  return { use: value, operation: operation };
}

// Free-write resolve: slot is the write identity (entity id, event id, or Owner.field for members).
// when/then.capability is a foundation handle (no plan-use table).
function resolveBatch(plan, taskId, commands, world) {
  taskById(plan, taskId);
  world = world || null;
  return array(commands, 'Executor command batch').map(function(raw, position) {
    var command = normalizeExecutorCommandSlot(raw);
    syntax.validateCommand(command, 'executor');
    var label = 'Executor command[' + position + ']';
    if (!command.slot && command.type !== 'policy') fail('SEMANTIC_TASK_SLOT_MISSING', label + ' requires slot.');
    if (command.type === 'game') {
      command.semanticId = id(command.slot, label + '.slot');
      delete command.slot;
    } else if (command.type === 'entity') {
      command.semanticId = id(command.slot, label + '.slot');
      delete command.slot;
    } else if (command.type === 'member') {
      var address = parseMemberAddress(command.slot, label + '.slot');
      command.entity = address.entity;
      command.semanticId = address.semanticId;
      delete command.slot;
      if (command.bindings === undefined) command.bindings = [];
    } else if (command.type === 'component') {
      command.semanticId = id(command.slot, label + '.slot');
      delete command.slot;
      if (command.targetSlot !== undefined) {
        command.target = id(command.targetSlot, label + '.targetSlot');
        delete command.targetSlot;
      }
      // Wire field capabilityBindings → Draft IR bindings (same dual as when/then capability → use).
      if (command.capabilityBindings !== undefined) {
        command.bindings = command.capabilityBindings;
        delete command.capabilityBindings;
      }
      if (command.bindings === undefined) command.bindings = {};
    } else if (command.type === 'event') {
      command.semanticId = id(command.slot, label + '.slot');
      delete command.slot;
      if (command.parentSlot !== undefined) {
        command.parent = id(command.parentSlot, label + '.parentSlot');
        delete command.parentSlot;
      }
      if (command.locals === undefined) command.locals = {};
    } else if (command.type === 'when' || command.type === 'then') {
      var eventId = id(command.slot, label + '.slot');
      var selected = resolveCapabilityHandle(command.capability, label + '.capability');
      if (command.type === 'when' && selected.operation.kind !== 'condition') {
        fail(
          'SEMANTIC_ALGEBRA_KIND_INVALID',
          selected.use + ' is ' + selected.operation.kind + '; when.capability takes handles from [L1-ops-condition] only'
        );
      }
      if (command.type === 'then' && selected.operation.kind !== 'action') {
        fail(
          'SEMANTIC_ALGEBRA_KIND_INVALID',
          selected.use + ' is ' + selected.operation.kind + '; then.capability takes handles from [L1-ops-action] only (condition handles such as object.pick-all / object.*.compare / object.collides go on when)'
        );
      }
      command.event = eventId;
      command.use = selected.use;
      delete command.slot;
      delete command.capability;
      // Nested expression capability=handle still on open fields — leave for algebra resolve in draft path.
      resolveExpressionHandles(command, label);
    } else if (command.type === 'asset' || command.type === 'layout') {
      command.semanticId = id(command.slot, label + '.slot');
      delete command.slot;
      if (command.bindings === undefined) command.bindings = [];
    } else if (command.type === 'policy') {
      command.degree = id(command.slot || command.degree, label + '.slot');
      delete command.slot;
    } else if (command.type === 'remove') {
      command.semanticId = id(command.slot, label + '.slot');
      delete command.slot;
      command.collection = inferRemoveCollection(command.semanticId, world, label);
    } else {
      fail('SEMANTIC_TASK_BATCH_INVALID', label + ' has unsupported type: ' + command.type);
    }
    return command;
  });
}

function resolveExpressionHandles(command, label) {
  Object.keys(command).forEach(function(key) {
    var value = command[key];
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    if (typeof value.capability === 'string' && semanticAlgebra.operationForUse(value.capability)) {
      value.use = value.capability;
      delete value.capability;
    }
  });
}

function inferRemoveCollection(semanticId, world, label) {
  if (!world) fail('SEMANTIC_TASK_SLOT_KIND_INVALID', label + ' remove requires draft world to infer collection for ' + semanticId);
  if (world['entity/' + semanticId]) return 'entities';
  if (world['event/' + semanticId + '#metadata'] || world['event/' + semanticId]) return 'events';
  if (Object.keys(world).some(function(claim) { return claim.indexOf('component/') === 0 && claim.indexOf(semanticId) >= 0; })) return 'components';
  fail('SEMANTIC_TASK_SLOT_KIND_INVALID', label + ' cannot infer remove collection for ' + semanticId);
}

function snapshot(document) {
  document = document || {};
  var claims = Object.create(null);
  if (document.game && document.game.semanticId) claims['game/' + document.game.semanticId] = true;
  (document.entities || []).forEach(function(entity) {
    claims['entity/' + entity.semanticId] = { objectTypeRef: entity.objectTypeRef };
    (entity.members || []).forEach(function(member) {
      claims['member/' + entity.semanticId + '/' + member.semanticId] = true;
    });
  });
  function walkEvents(events) {
    (events || []).forEach(function(event) {
      claims['event/' + event.semanticId + '#metadata'] = { parent: event.parent || null };
      walkEvents(event.children);
    });
  }
  walkEvents(document.events);
  (document.components || []).forEach(function(component) { claims['component/' + component.semanticId] = true; });
  return claims;
}

function assertBatchScope(plan, taskId, commands) {
  taskById(plan, taskId);
  array(commands, 'Draft-write batch');
  if (!commands.length) fail('SEMANTIC_TASK_BATCH_EMPTY', 'An active task requires a non-empty Draft-write batch.');
  return commands;
}

function isBooleanFalseValue(value) {
  return value === false || value === 'false' || value === 'False' || value === 'FALSE';
}
function commandUseOf(command) {
  return command && typeof command.use === 'string' ? command.use : '';
}
function assertObjectDeleteReseed(commands, label) {
  label = label || 'Draft-write batch';
  var hasDelete = false, hasReseed = false, restartish = false;
  array(commands, label).forEach(function(command) {
    var use = commandUseOf(command);
    if (use === 'object.delete') hasDelete = true;
    if (use === 'object.place.random-grid' || use === 'object.create') hasReseed = true;
    if (use.indexOf('input.key.') === 0) restartish = true;
    if (use === 'state.boolean.set' && isBooleanFalseValue(command.value)) restartish = true;
  });
  if (hasDelete && restartish && !hasReseed) {
    fail(
      'SEMANTIC_TASK_LIFECYCLE_INCOMPLETE',
      label + ' uses object.delete in a restart-style batch without object.place.random-grid or object.create to re-seed scene objects.'
    );
  }
}

function authorizeWriteBatch(plan, taskId, commands, options) {
  return authorizeTaskWrite(plan, taskId, commands, options);
}

function authorizeTaskWrite(plan, taskId, commands, options) {
  options = options || {};
  var world = options.world || null;
  if (!world && options.beforeDocument) world = snapshot(options.beforeDocument);
  var task = taskById(plan, taskId);
  var normalized = array(commands, 'Draft-write batch').map(normalizeExecutorCommandSlot);
  if (!normalized.length) fail('SEMANTIC_TASK_BATCH_EMPTY', 'Task ' + task.semanticId + ' requires a non-empty Draft-write batch for goal: ' + task.goal);
  var ordered = orderWriteBatch(normalized);
  var resolved = resolveBatch(plan, taskId, ordered, world);
  assertBatchScope(plan, taskId, resolved);
  assertObjectDeleteReseed(resolved, 'Draft-write batch');
  // Foundation handles only — no plan-use declaration table.
  commandUses(resolved).forEach(function(use) {
    if (!semanticAlgebra.operationForUse(use)) {
      fail('SEMANTIC_TASK_USE_UNDECLARED', 'Draft-write batch uses unknown capability handle: ' + use);
    }
  });
  // Revision: game create forbidden
  if (options.beforeDocument && options.beforeDocument.game) {
    resolved.forEach(function(command) {
      if (command.type === 'game') fail('SEMANTIC_TASK_PLAN_INFEASIBLE', 'Revision write cannot create game identity.');
      if (command.type === 'policy') fail('SEMANTIC_TASK_PLAN_INFEASIBLE', 'Revision write cannot mutate tuning policies.');
    });
  }
  return resolved;
}

function commandUses(commands) {
  var seen = Object.create(null), uses = [];
  function addUse(value) {
    if (typeof value !== 'string' || !value || seen[value]) return;
    seen[value] = true;
    uses.push(value);
  }
  function visit(value) {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== 'object') return;
    if (typeof value.use === 'string') addUse(value.use);
    Object.keys(value).forEach(function(key) { visit(value[key]); });
  }
  array(commands, 'Draft-write batch').forEach(visit);
  return uses.sort();
}

function claimForResolved(command) {
  if (!command || !command.type) return null;
  if (command.type === 'game') return 'game/' + command.semanticId;
  if (command.type === 'entity') return 'entity/' + command.semanticId;
  if (command.type === 'member') return 'member/' + command.entity + '/' + command.semanticId;
  if (command.type === 'event') return 'event/' + command.semanticId + '#metadata';
  if (command.type === 'when') return 'event/' + command.event + '#conditions';
  if (command.type === 'then') return 'event/' + command.event + '#actions';
  if (command.type === 'component') return 'component/' + command.semanticId;
  if (command.type === 'asset') return 'asset/' + command.semanticId;
  if (command.type === 'layout') return 'layout/' + command.semanticId;
  if (command.type === 'remove') return command.collection + '/' + command.semanticId;
  return command.type + '/' + (command.semanticId || command.event || '?');
}

function verifyBatch(plan, taskId, resolved, before, after) {
  taskById(plan, taskId);
  array(resolved, 'resolved batch');
  var beforeHash = documentHash(before);
  var afterHash = documentHash(after);
  if (beforeHash === afterHash) {
    fail('SEMANTIC_TASK_DELTA_EMPTY', 'Draft-write batch produced an empty delta for task ' + taskId + '.');
  }
  var beforeClaims = snapshot(before);
  var afterClaims = snapshot(after);
  var changedClaims = Object.keys(afterClaims).filter(function(claim) { return !beforeClaims[claim]; })
    .concat(Object.keys(beforeClaims).filter(function(claim) { return !afterClaims[claim]; }));
  if (!changedClaims.length) {
    // Member value mutations may keep claim keys; still treat as changed via document hash.
    changedClaims = resolved.map(claimForResolved).filter(Boolean);
  }
  return {
    taskId: taskId,
    beforeDraftHash: beforeHash,
    afterDraftHash: afterHash,
    changedClaims: changedClaims
  };
}

function diagnosePlanCommands(commands) {
  var list = Array.isArray(commands) ? commands : [];
  var planTasks = list.filter(function(command) { return command && command.type === 'plan-task'; }).length;
  var structureNoise = list.filter(function(command) {
    return command && command.type && command.type.indexOf('plan-') === 0 && command.type !== 'plan-task' && command.type !== 'plan-complete';
  }).map(function(command) { return command.type; });
  return {
    planTasks: planTasks,
    structureNoise: structureNoise.sort()
  };
}

function buildFailureFeedback(error, commands) {
  var code = error && error.code || 'SEMANTIC_RUN_INVALID';
  var message = error && error.message || String(error || '');
  var diagnosis = diagnosePlanCommands(commands);
  var repair = [];
  if (diagnosis.structureNoise.length) {
    repair.push('planner is dispatch-only: emit plan-task(goal=natural language) or plan-complete only; drop ' + diagnosis.structureNoise.join(','));
  }
  if (/empty delta/i.test(message)) {
    repair.push('executor: emit a non-empty Draft-write batch that advances the active work order');
  }
  if (/Revision write cannot create game/i.test(message)) {
    repair.push('revision board: omit game(...); emit only work-order delta on [L3-board]');
  }
  // Handle catalog: require wire handle tokens from L1 tables, never bare identity names.
  if (code === 'SEMANTIC_REFERENCE_HANDLE_INVALID' || /requires a handle from \[param-context\] or \[retrieve\]/i.test(message)) {
    repair.push('use only wire handle tokens from the matching L1 catalog: asset.family from [L1-asset-families], asset.style from [L1-asset-styles], layout from [L1-layouts], capability from [L1-ops-*], component.kind from [L1-components]; identity names after | are labels only');
  }
  // Component shell confusion (bound to component.kind wording; do not match generic "text" substrings).
  if (/component\.kind|component contains unknown|component requires field/i.test(message) || /requires a handle from \[param-context\] or \[retrieve\]: (sprite|state|text)\b/i.test(message)) {
    repair.push('omit component for shell sprites/state; use entity.kind from [L1-structure-kinds]; component.kind only from [L1-components]');
  }
  if (/member slot must be Owner\.field/i.test(message)) {
    repair.push('member.slot must be Owner.field (e.g. GameState.direction), not a bare field and not member.Owner.field');
  }
  if (/entity is missing: member/i.test(message)) {
    repair.push('member.slot is Owner.field only (GameState.direction); drop member. / entity. / game. type prefixes from slots');
  }
  if (code === 'SEMANTIC_DSL_FIELD_REQUIRED' || /entity requires field:\s*roles/i.test(message)) {
    repair.push('entity requires roles=list(...); emit roles on every entity write');
  }
  if (code === 'SEMANTIC_DRAFT_BEHAVIOR_MISSING' || /does not declare behavior/i.test(message)) {
    repair.push('declare entity.behaviors before behavior actions; use behavior kinds from [L1-structure-kinds].behaviorKinds');
  }
  if (code === 'SEMANTIC_ASSET_INTENTS_REQUIRED' || /asset intent/i.test(message) && /sprite/i.test(message)) {
    repair.push('sprite entities need asset(...) intents: family from [L1-asset-families], style from [L1-asset-styles], subject matching the entity slot');
  }
  if (!repair.length) {
    repair.push('repair against [L3-work-order] and [L3-board]; preserve existing board values unless the goal changes them');
  }
  var className = 'other';
  if (code === 'SEMANTIC_TASK_PLAN_INFEASIBLE') className = 'plan-infeasible';
  else if (code === 'SEMANTIC_TASK_PLAN_DUPLICATE') className = 'plan-duplicate';
  else if (code === 'SEMANTIC_REFERENCE_HANDLE_INVALID') className = 'handle-catalog';
  else if (code === 'SEMANTIC_ASSET_INTENTS_REQUIRED') className = 'asset-intents';
  else if (code.indexOf('SEMANTIC_DSL_') === 0) className = 'dsl-syntax';
  else if (code === 'SEMANTIC_TASK_LIFECYCLE_INCOMPLETE') className = 'lifecycle';
  else if (code.indexOf('SEMANTIC_TASK_') === 0) className = 'task-write';
  return { class: className, repair: repair, diagnosis: diagnosis };
}

function isPlanScopedWriteFailure(plan, taskId, error) {
  var code = error && error.code || '';
  return PLAN_SCOPED_WRITE_CODES.indexOf(code) >= 0;
}

module.exports = {
  SCHEMA_VERSION: SCHEMA_VERSION,
  DOCUMENT_KIND: DOCUMENT_KIND,
  LANGUAGE_ID: LANGUAGE_ID,
  PLAN_COMMANDS: PLAN_COMMANDS,
  CATALOGS: CATALOGS,
  RETRIEVE_CATALOG: RETRIEVE_CATALOG,
  PLANNER_CATALOGS: PLANNER_CATALOGS,
  MAX_TASKS_PER_PLAN: MAX_TASKS_PER_PLAN,
  PLAN_SCOPED_WRITE_CODES: PLAN_SCOPED_WRITE_CODES,
  WRITE_ORDER: WRITE_ORDER,
  create: create,
  planHash: planHash,
  documentHash: documentHash,
  taskById: taskById,
  orderWriteBatch: orderWriteBatch,
  resolveBatch: resolveBatch,
  assertBatchScope: assertBatchScope,
  assertObjectDeleteReseed: assertObjectDeleteReseed,
  diagnosePlanCommands: diagnosePlanCommands,
  buildFailureFeedback: buildFailureFeedback,
  authorizeWriteBatch: authorizeWriteBatch,
  authorizeTaskWrite: authorizeTaskWrite,
  commandUses: commandUses,
  assertFeasible: assertFeasible,
  verifyBatch: verifyBatch,
  isPlanScopedWriteFailure: isPlanScopedWriteFailure
};
