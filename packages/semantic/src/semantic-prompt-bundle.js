var crypto = require('crypto');
var syntax = require('./semantic-dsl-syntax');
var dsl = require('./semantic-dsl-parser');
var taskPlan = require('./semantic-task-plan');
var modelPolicy = require('./semantic-model-policy');

// Planner = natural-language work-order dispatch. Executor = free write for active goal.
// Do not re-introduce structure plan-* laws into planner protocol.
var PROFILE_VERSIONS = Object.freeze({ planner: 'semantic-planner-prompt-v24', executor: 'semantic-executor-prompt-v31' });

function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'SemanticPromptBundle'; throw error; }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, {}); return value; }
function canonical(value) { return JSON.stringify(stable(value)); }
function hashText(value) { return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex'); }
function hashCanonical(value) { return hashText(canonical(value)); }
function bytes(value) { return Buffer.byteLength(String(value), 'utf8'); }
function object(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('SEMANTIC_PROMPT_CONTEXT_INVALID', label + ' must be an object.'); return value; }
function factRows(value, root) {
  var lines = [];
  function emit(path, item) { lines.push('fact(path=' + dsl.stringifyValue(path) + ',value=' + dsl.stringifyValue(item) + ')'); }
  function visit(item, path) {
    if (Array.isArray(item)) {
      if (!item.length || item.every(function(value) { return value === null || ['string', 'number', 'boolean'].indexOf(typeof value) >= 0; })) { emit(path, item); return; }
      emit(path + '.count', item.length);
      item.forEach(function(value, position) { visit(value, path + '.' + position); });
      return;
    }
    if (item && typeof item === 'object') {
      var keys = Object.keys(item).sort();
      if (!keys.length) { emit(path, {}); return; }
      keys.forEach(function(key) { visit(item[key], path + '.' + key); });
      return;
    }
    emit(path, item);
  }
  visit(stable(value), root);
  return lines;
}
function sectionRows(lines, name, value) { lines.push('[' + name + ']'); if (value === undefined) return; if (Array.isArray(value)) lines.push(value.join('\n')); else lines.push(String(value)); }
function sectionFacts(lines, name, value) { lines.push('[' + name + ']'); if (value !== undefined) lines.push(factRows(value, name).join('\n')); }

function plannerProtocol() {
  if (!Array.isArray(syntax.PLAN_LINES) || !syntax.PLAN_LINES.length) fail('SEMANTIC_PROMPT_PROTOCOL_INVALID', 'Semantic DSL syntax must expose Planner command forms.');
  return [
    'GameCastle Semantic Planner',
    'PROTOCOL|' + PROFILE_VERSIONS.planner,
    'LANGUAGE|' + taskPlan.LANGUAGE_ID,
    'ROUND_TOKEN_LIMIT|' + modelPolicy.OUTPUT_TOKEN_LIMIT,
    'THINKING_MODE|disabled',
    // Role
    'JOB|you are the semantic-domain dispatcher only; product total scheduling lives above this layer',
    'SCOPE|schedule semantic work orders only for the semantic executor (asset routing is product-layer)',
    // Hermes-style discipline: settled ledger, active-only open, one terminal action per round
    'DISCIPLINE|settled ledger + board inventory drive the next step; executor owns detail; assembly accepts later',
    'READ|1 [L2-progress] 2 [L2-world] 3 [L2-run].request 4 [L2-feedback]? 5 [L4-transition-log]',
    'SETTLED|[L2-progress].settled lists committed work orders as taskId|goal — closed units, already done for scheduling',
    'OPEN|[L2-progress].open is empty between rounds (one sealed order at a time); a new plan-task opens the next unit',
    'BOARD|[L2-world] is place-grain inventory: summary, placeIds, places(id,role,kindHint), counts, +place/-place log',
    'GAP|next goal fills only a remaining gap of request vs settled goals + board placeIds (place grain, no member trees)',
    'REQUEST|[L2-run].request is the overall player goal; cover remaining gaps with successive work orders',
    // Terminal action (exactly one)
    'ROUND|each round emit exactly one command: either plan-task(...) or plan-complete()',
    'OUTPUT|DSL commands only; first non-whitespace is plan-task( or plan-complete(',
    'WHEN_TASK|if request still has a place-grain gap after settled+board, emit plan-task with one clear next step',
    'WHEN_DONE|if request is covered at scheduling grain by settled+board, emit plan-complete()',
    'DONE_SCOPE|settled work orders close semantic dispatch units; product assembly acceptance is a later outer loop',
    'TASK_ID|plan-task.semanticId is a short fresh id (e.g. t1, makeSnake, addMove)',
    'TASK_GOAL|plan-task.goal is one natural-language instruction the executor can build (what to add or change)',
    'TASK_GOAL_STYLE|concrete and singular: one place, one behavior, or one rule per goal',
    'TASK_AFTER|plan-task.after may list earlier settled task ids, or list()',
    'ONE_ONLY|multi-task batches and structure plan-* commands are invalid for this role',
    'FEEDBACK|when [L2-feedback] is present, emit one corrected plan-task or plan-complete that satisfies it',
    'FORMS|required fields only',
    syntax.PLAN_LINES.join('\n')
  ].join('\n');
}

function executorProtocol(options) {
  options = options || {};
  var workMode = options.workMode === 'revision' ? 'revision' : 'new';
  // FORMS must match authorize/draft: revision does not offer game/policy (illegal on seeded board).
  var executorLines = syntax.writeLinesForMode(workMode);
  // Dictionary-stable catalogs live in system (cache-friendly). Task board lives in user only once.
  var structureKinds = options.structureKinds || null;
  var components = options.components || [];
  var opsCondition = options.opsCondition || [];
  var opsAction = options.opsAction || [];
  var opsExpression = options.opsExpression || [];
  var assetFamilies = options.assetFamilies || [];
  var assetStyles = options.assetStyles || [];
  var layouts = options.layouts || [];
  var lines = [
    'GameCastle Semantic Executor',
    'PROTOCOL|' + PROFILE_VERSIONS.executor,
    'LANGUAGE|' + syntax.LANGUAGE_ID,
    'WORK_MODE|' + workMode,
    'ROUND_TOKEN_LIMIT|' + modelPolicy.OUTPUT_TOKEN_LIMIT,
    'THINKING_MODE|disabled',
    'RESPONSE|one Draft-write DSL batch; separator:semicolon or line break',
    'OUTPUT|commands only; first non-whitespace is commandName(',
    // Layout: system = law + legal forms + stable catalogs; user = work order + board + optional product + L4
    'READ|1 [L3-work-order] 2 [L3-board] 3 [L2-product]? 4 [L4-transition-log]',
    'ROLE|execute only [L3-work-order].goal on [L3-board]',
    'WORK_ORDER|[L3-work-order] is the sole checklist',
    workMode === 'revision'
      ? 'BOARD|WORK_MODE=revision: [L3-board] already exists; emit only the work-order delta; board member values are live truth'
      : 'BOARD|WORK_MODE=new: [L3-board] is empty; create the structures the work order needs',
    'PRODUCT|[L2-product] is scene background only when present; not a second checklist',
    // --- named channels (each field belongs to exactly one) ---
    'CHANNELS|structure, ops, component, asset, and layout tokens from the L1 catalogs below',
    'CH_ENVELOPE|event.kind from [L1-structure-kinds].eventEnvelopes; rule is the ordinary gameplay envelope; when/then attach to the same event slot',
    'CH_OP|when.capability from [L1-ops-condition] only; then.capability from [L1-ops-action] only; parameters are open fields on that same command',
    'CH_EXPR|number-expression: bare number, Owner.field (state.number), or record(capability=<handle from [L1-ops-expression]>, ...); call-style name(...) is outside wire',
    'CH_STRUCT|entity.kind from [L1-structure-kinds].entityKinds (sprite|state|text|...); entity.behaviors optional (omit or list()); slot ids are bare semantic ids (snakeHead, GameState) not entity.snakeHead; member=Owner.field (GameState.direction); when/then slot=eventId',
    'CH_COMPONENT|component is optional library blueprint only; kind is a handle from [L1-components] only; sprite/state/text are entity.kind values; ordinary shell work uses game+entity+member',
    // Handle tables are handle|identity labels: only the handle token is legal on wire (f1, s0, l0), not the identity name alone.
    'CH_ASSET|asset.family from [L1-asset-families] handle tokens only; asset.style from [L1-asset-styles] handle tokens only; sprite entities that need pixels require asset(...) intents',
    'CH_LAYOUT|layout.relations.layout from [L1-layouts] handle tokens only; component layout-choice config values also use [L1-layouts] handles',
    'WIRE|open fields only (field=value); params= bags are outside wire',
    'VALUES|member.value and closed values: bare literal, list(...), or record(field=value)',
    'ORDER|Runtime orders structure before event before when/then',
    'LIFECYCLE|delete or flag-clear batches reseed with place.random-grid or object.create when required',
    'OPTIONAL|' + syntax.optionalFieldNames('executor').join(';') + ' — present only when filled',
    'REPAIR|preserve board; satisfy [L4]; stay inside the work order',
    'FORMS|legal commands for WORK_MODE=' + workMode + ' only',
    executorLines.join('\n')
  ];
  if (structureKinds) {
    sectionFacts(lines, 'L1-structure-kinds', {
      entityKinds: structureKinds.entityKinds || [],
      behaviorKinds: structureKinds.behaviorKinds || [],
      eventEnvelopes: structureKinds.eventEnvelopes || []
    });
  }
  if (components.length) sectionRows(lines, 'L1-components', components);
  if (opsCondition.length) sectionRows(lines, 'L1-ops-condition', opsCondition);
  if (opsAction.length) sectionRows(lines, 'L1-ops-action', opsAction);
  if (opsExpression.length) sectionRows(lines, 'L1-ops-expression', opsExpression);
  if (assetFamilies.length) sectionRows(lines, 'L1-asset-families', assetFamilies);
  if (assetStyles.length) sectionRows(lines, 'L1-asset-styles', assetStyles);
  if (layouts.length) sectionRows(lines, 'L1-layouts', layouts);
  return lines.join('\n');
}

function profile(phase, protocol, catalog) {
  var system = catalog ? protocol + '\n' + catalog : protocol;
  return {
    phase: phase,
    protocolVersion: PROFILE_VERSIONS[phase],
    system: system,
    protocolHash: hashText(protocol),
    catalogHash: catalog ? hashText(catalog) : null,
    stablePrefixHash: hashCanonical([{ role: 'system', content: system }])
  };
}

function transitionSection(lines, context) {
  sectionRows(lines, 'L4-transition-log');
  var transitions = object(context.l4, 'context.l4').transitionLines;
  if (!Array.isArray(transitions) || !transitions.length || transitions.some(function(line) { return typeof line !== 'string' || !line; })) {
    fail('SEMANTIC_PROMPT_TRANSITION_INVALID', 'context.l4.transitionLines must be canonical non-empty lines.');
  }
  lines.push(transitions.join('\n'));
}

function plannerUser(context) {
  var lines = [];
  var l2 = object(context.l2, 'context.l2');
  // Progress first (Hermes: settled ledger before board detail).
  var progress = l2.progress || {};
  var settled = Array.isArray(progress.settled) ? progress.settled
    : (Array.isArray(progress.completed) ? progress.completed : []);
  var open = Array.isArray(progress.open) ? progress.open : [];
  sectionFacts(lines, 'L2-progress', {
    settledCount: progress.settledCount != null ? progress.settledCount : settled.length,
    settled: settled,
    open: open.length ? open : ['(none)'],
    nextAction: progress.nextAction || 'dispatch-one-or-complete'
  });
  // Board inventory: placeIds lead; places keep role/kindHint only.
  var board = l2.board || null;
  var world = l2.world || null;
  if (board || world) {
    board = board || {};
    world = world || {};
    sectionFacts(lines, 'L2-world', {
      viewKind: world.viewKind || 'semantic-coarse-world',
      source: world.source || 'draft',
      mode: world.mode || board.mode || 'new',
      summary: board.summary || world.summary || 'empty world',
      game: board.game !== undefined ? board.game : world.game,
      placeIds: Array.isArray(board.placeIds) ? board.placeIds
        : (Array.isArray(world.places) ? world.places.map(function(p) { return p.id; }) : []),
      places: Array.isArray(board.places) ? board.places : (world.places || []),
      counts: board.counts || world.counts || {},
      log: Array.isArray(board.log) && board.log.length ? board.log
        : (Array.isArray(world.log) && world.log.length ? world.log : ['(empty)'])
    });
  }
  sectionFacts(lines, 'L2-run', {
    request: l2.request,
    sourceMode: l2.sourceMode,
    baseDraftHash: l2.baseDraftHash
  });
  if (l2.feedback !== undefined && l2.feedback !== null) sectionFacts(lines, 'L2-feedback', l2.feedback);
  transitionSection(lines, context);
  return lines.join('\n');
}

function projectWorkOrder(activeTask) {
  activeTask = object(activeTask, 'activeTask');
  // Dispatch tasks: only id + goal. Empty catalogs/slots are noise and duplicate nothing useful.
  return { semanticId: activeTask.semanticId, goal: activeTask.goal };
}

function projectBoard(draftSlice) {
  draftSlice = object(draftSlice, 'draftSlice');
  var index = draftSlice.index && typeof draftSlice.index === 'object' ? draftSlice.index : {};
  // One board projection: no goal/taskId/documentKind/hash ceremony (those are not model actions).
  return {
    workMode: draftSlice.workMode === 'revision' ? 'revision' : 'new',
    counts: draftSlice.counts || { entities: 0, members: 0, events: 0 },
    game: index.game || null,
    entities: Array.isArray(index.entities) ? index.entities : [],
    events: Array.isArray(index.events)
      ? index.events.map(function(event) { return { semanticId: event.semanticId, kind: event.kind }; })
      : []
  };
}

function executorUser(context) {
  var l3 = object(context.l3, 'context.l3');
  var l2 = object(context.l2, 'context.l2');
  var lines = [];
  // User = task-varying only. Dictionary catalogs live in system (stable prefix / cache).
  sectionFacts(lines, 'L3-work-order', projectWorkOrder(l3.activeTask));
  sectionFacts(lines, 'L3-board', projectBoard(l3.draftSlice));
  if (l2.productRequest !== undefined && l2.productRequest !== null && l2.productRequest !== '') {
    sectionFacts(lines, 'L2-product', { productRequest: l2.productRequest });
  }
  if (l2.feedback !== undefined && l2.feedback !== null) sectionFacts(lines, 'L2-feedback', l2.feedback);
  transitionSection(lines, context);
  return lines.join('\n');
}

function result(profileValue, user) {
  var messages = [{ role: 'system', content: profileValue.system }, { role: 'user', content: user }];
  return {
    phase: profileValue.phase,
    protocolVersion: profileValue.protocolVersion,
    system: profileValue.system,
    user: user,
    hashes: {
      protocolHash: profileValue.protocolHash,
      catalogHash: profileValue.catalogHash,
      stablePrefixHash: profileValue.stablePrefixHash,
      systemHash: hashText(profileValue.system),
      userHash: hashText(user),
      bundleHash: hashCanonical(messages)
    },
    bytes: { system: bytes(profileValue.system), user: bytes(user), total: bytes(profileValue.system) + bytes(user) }
  };
}

function validateContext(context, phase) {
  context = object(context, 'context');
  if (context.phase !== phase) fail('SEMANTIC_PROMPT_PHASE_INVALID', 'Expected ' + phase + ' context.');
  return context;
}

function buildPlannerBundle(options) {
  options = options || {};
  var context = validateContext(options.context, 'planner');
  // No L1 catalog dump — planner only schedules natural-language tasks.
  return result(profile('planner', plannerProtocol(), null), plannerUser(context));
}

function buildExecutorBundle(options) {
  options = options || {};
  var context = validateContext(options.context, 'executor');
  var l3 = object(context.l3, 'context.l3');
  var draftSlice = l3.draftSlice;
  var workMode = draftSlice && draftSlice.workMode === 'revision' ? 'revision' : 'new';
  var protocol = executorProtocol({
    workMode: workMode,
    structureKinds: {
      entityKinds: l3.entityKinds || [],
      behaviorKinds: l3.behaviorKinds || [],
      eventEnvelopes: l3.eventEnvelopes || []
    },
    components: l3.components || [],
    opsCondition: l3.opsCondition || [],
    opsAction: l3.opsAction || [],
    opsExpression: l3.opsExpression || [],
    assetFamilies: l3.assetFamilies || [],
    assetStyles: l3.assetStyles || [],
    layouts: l3.layouts || []
  });
  return result(profile('executor', protocol, null), executorUser(context));
}

module.exports = {
  PROFILE_VERSIONS: PROFILE_VERSIONS,
  hashText: hashText,
  hashCanonical: hashCanonical,
  canonical: canonical,
  factRows: factRows,
  plannerProtocol: plannerProtocol,
  executorProtocol: executorProtocol,
  buildPlannerBundle: buildPlannerBundle,
  buildExecutorBundle: buildExecutorBundle
};
