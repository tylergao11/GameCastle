var draftApi = require('./semantic-draft');
var promptBundle = require('./semantic-prompt-bundle');
var stateMachine = require('./semantic-run-state-machine');
var taskPlan = require('./semantic-task-plan');

var SCHEMA_VERSION = 1;
var CONTEXT_KIND = 'semantic-commander-context';
var DRAFT_SLICE_KIND = 'semantic-task-draft-slice';
var catalogField = {
  'entity-kinds': 'entityKinds',
  'behavior-kinds': 'behaviorKinds',
  'event-kinds': 'eventKinds',
  layouts: 'layouts',
  'asset-families': 'assetFamilies',
  'asset-styles': 'assetStyles',
  'component-library': 'components',
};
catalogField[taskPlan.RETRIEVE_CATALOG] = 'extensionGroups';
var CATALOG_FIELD = Object.freeze(catalogField);

function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'SemanticCommanderContext'; throw error; }
function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function object(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('SEMANTIC_CONTEXT_INVALID', label + ' must be an object.'); return value; }
function text(value, label) { if (typeof value !== 'string' || !value.trim()) fail('SEMANTIC_CONTEXT_INVALID', label + ' must be non-empty text.'); return value; }
function exactFields(value, fields, label) {
  Object.keys(value).forEach(function(key) { if (fields.indexOf(key) < 0) fail('SEMANTIC_CONTEXT_FIELD_INVALID', label + ' contains unknown field: ' + key); });
  fields.forEach(function(key) { if (!Object.prototype.hasOwnProperty.call(value, key)) fail('SEMANTIC_CONTEXT_FIELD_MISSING', label + ' is missing field: ' + key); });
}
function equal(left, right) { return promptBundle.canonical(left) === promptBundle.canonical(right); }
function stringArray(value, label) {
  if (!Array.isArray(value) || value.some(function(item) { return typeof item !== 'string' || !item; })) fail('SEMANTIC_CONTEXT_INVALID', label + ' must be an array of non-empty strings.');
  return value;
}

function machine(projection, expectedTaskId) {
  stateMachine.assertPromptProjection(projection, expectedTaskId);
  return projection.transitionLog.slice();
}

function compactOperation(row) {
  // Same handle= wire as executor L1-ops rows (not legacy use=).
  return operationIndexLine(row);
}
function plannerCatalog(references) {
  if (!references || typeof references.foundationOperationLines !== 'function' || typeof references.parameterContext !== 'function') fail('SEMANTIC_CONTEXT_REFERENCES_INVALID', 'Planner context requires SemanticReferenceRuntime.');
  var parameters = references.parameterContext();
  var catalogs = {};
  taskPlan.PLANNER_CATALOGS.forEach(function(name) {
    var field = CATALOG_FIELD[name];
    if (!field) fail('SEMANTIC_CONTEXT_CATALOG_INVALID', 'TaskPlan catalog has no SemanticReferenceRuntime projection: ' + name);
    catalogs[name] = clone(parameters[field] || []);
  });
  return {
    sourceFingerprint: clone(references.index && references.index.source || null),
    operationIndex: references.foundationOperationLines().map(compactOperation),
    catalogs: catalogs,
  };
}

function eventIndex(event) {
  return {
    semanticId: event.semanticId,
    kind: event.kind,
    conditions: (event.conditions || []).map(function(item) { return { operationId: item.operationId, use: item.use }; }),
    actions: (event.actions || []).map(function(item) { return { operationId: item.operationId, use: item.use }; }),
    children: (event.children || []).map(eventIndex),
  };
}
function emptyDraftIndex() {
  return { game: null, entities: [], components: [], events: [], assetIntents: [], layoutIntents: [] };
}
function indexFromStructure(structure) {
  structure = structure || {};
  return {
    game: structure.game ? { semanticId: structure.game.semanticId } : null,
    entities: (structure.entities || []).map(function(entity) {
      return {
        semanticId: entity.semanticId,
        roles: clone(entity.roles),
        kind: entity.kind,
        behaviors: clone(entity.behaviors),
        members: (entity.members || []).map(function(member) {
          return { semanticId: member.semanticId, roles: clone(member.roles), valueType: member.valueType };
        })
      };
    }),
    components: (structure.components || []).map(function(component) {
      return { semanticId: component.semanticId, kind: component.kind, target: component.target || null };
    }),
    events: (structure.events || []).map(eventIndex),
    assetIntents: (structure.assetIntents || []).map(function(asset) {
      return { semanticId: asset.semanticId, subject: asset.subject, family: asset.family, style: asset.style };
    }),
    layoutIntents: (structure.layoutIntents || []).map(function(layout) {
      return { semanticId: layout.semanticId, subject: layout.subject, layouts: clone(layout.layouts) };
    })
  };
}
function baseDraftIndex(draft) {
  var structure = draftApi.structure(draft);
  return {
    baseDraftHash: promptBundle.hashCanonical(structure),
    index: indexFromStructure(structure)
  };
}
// Project revision seed (or empty) as the stable world base — never rewritten when later rounds only append.
function baseWorldIndex(draft) {
  if (!draft || !draft.baseSource) return emptyDraftIndex();
  var seedView = {
    schemaVersion: draft.schemaVersion,
    draftKind: draft.draftKind,
    baseSource: draft.baseSource,
    value: draft.baseSource,
    touched: [],
    references: draft.references
  };
  return indexFromStructure(draftApi.structure(seedView));
}

// Planner-facing inventory slice from a draft index.
function worldInventory(index) {
  var stateOwners = [];
  var objectEntities = [];
  var memberAddresses = [];
  (index.entities || []).forEach(function(entity) {
    var memberIds = (entity.members || []).map(function(member) { return member.semanticId; }).slice().sort();
    memberIds.forEach(function(memberId) { memberAddresses.push(entity.semanticId + '.' + memberId); });
    if (entity.kind === 'state') {
      stateOwners.push({ semanticId: entity.semanticId, roles: clone(entity.roles || []), members: memberIds.slice() });
    } else {
      objectEntities.push({
        semanticId: entity.semanticId,
        kind: entity.kind || null,
        roles: clone(entity.roles || []),
        members: memberIds.slice()
      });
    }
  });
  stateOwners.sort(function(a, b) { return a.semanticId < b.semanticId ? -1 : a.semanticId > b.semanticId ? 1 : 0; });
  objectEntities.sort(function(a, b) { return a.semanticId < b.semanticId ? -1 : a.semanticId > b.semanticId ? 1 : 0; });
  memberAddresses.sort();
  return {
    game: index.game ? index.game.semanticId : null,
    stateOwners: stateOwners,
    objectEntities: objectEntities,
    memberAddresses: memberAddresses,
    eventIds: (index.events || []).map(function(event) { return event.semanticId; }).slice().sort(),
    componentIds: (index.components || []).map(function(component) { return component.semanticId; }).slice().sort(),
    assetIds: (index.assetIntents || []).map(function(asset) { return asset.semanticId; }).slice().sort(),
    layoutIds: (index.layoutIntents || []).map(function(layout) { return layout.semanticId; }).slice().sort()
  };
}

// Planner is dispatch-only: constraints are scheduling hints, not structure-slot laws.
function staticPlanConstraints(draft) {
  if (draft && draft.baseSource) {
    return [
      'mode=revision',
      'planner=semantic-domain dispatch-only one work-order per round',
      'world=coarse text places+summary',
      'no_game_or_policy_mutation'
    ];
  }
  return [
    'mode=new',
    'planner=semantic-domain dispatch-only one work-order per round',
    'world=coarse text places+summary'
  ];
}

// Coarse world for Planner: what exists where (id/role/kindHint). Not member values, not event trees.
// source=draft today; assembly layer can later feed the same schema (source=assembly, optional image later).
function coarseWorldFromDraft(draft) {
  var current = baseDraftIndex(draft).index;
  var baseIdx = baseWorldIndex(draft);
  var places = (current.entities || []).map(function(entity) {
    var roles = entity.roles || [];
    return {
      id: entity.semanticId,
      role: roles[0] || 'entity',
      kindHint: entity.kind || null
    };
  }).sort(function(a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
  var memberCount = (current.entities || []).reduce(function(sum, entity) {
    return sum + ((entity.members || []).length);
  }, 0);
  var eventCount = (current.events || []).length;
  var game = current.game && current.game.semanticId || null;
  var summary;
  if (!game && !places.length) summary = 'empty world';
  else if (!eventCount && places.length) summary = 'shell with ' + places.length + ' places';
  else if (eventCount) summary = places.length + ' places, ' + eventCount + ' events';
  else summary = (game ? 'game ' + game + ' with ' : '') + places.length + ' places';

  // Coarse place-level log since revision seed (or empty): +/- place ids only.
  var beforeIds = (baseIdx.entities || []).map(function(entity) { return entity.semanticId; });
  var afterIds = places.map(function(place) { return place.id; });
  var beforeSet = Object.create(null);
  var afterSet = Object.create(null);
  beforeIds.forEach(function(id) { beforeSet[id] = true; });
  afterIds.forEach(function(id) { afterSet[id] = true; });
  var log = [];
  beforeIds.slice().sort().forEach(function(id) {
    if (!afterSet[id]) log.push('-place ' + id);
  });
  afterIds.slice().sort().forEach(function(id) {
    if (!beforeSet[id]) log.push('+place ' + id);
  });
  if (baseIdx.game && baseIdx.game.semanticId && (!game || baseIdx.game.semanticId !== game)) {
    log.unshift('-game ' + baseIdx.game.semanticId);
  }
  if (game && (!baseIdx.game || baseIdx.game.semanticId !== game)) {
    log.push('+game ' + game);
  }

  return {
    schemaVersion: 1,
    viewKind: 'semantic-coarse-world',
    source: draft && draft.baseSource ? 'draft-revision' : 'draft',
    mode: draft && draft.baseSource ? 'revision' : 'new',
    summary: summary,
    game: game,
    places: places,
    counts: {
      places: places.length,
      members: memberCount,
      events: eventCount
    },
    log: log,
    planConstraints: staticPlanConstraints(draft)
  };
}

function bySemanticId(items) {
  var map = Object.create(null);
  (items || []).forEach(function(item) { if (item && item.semanticId) map[item.semanticId] = item; });
  return map;
}
function sortedKeys(map) { return Object.keys(map).sort(); }
function entityMemberSet(entity) {
  var set = Object.create(null);
  ((entity && entity.members) || []).forEach(function(member) { set[member.semanticId] = true; });
  return set;
}
// Append-oriented world log: removes first, then adds, deterministic sort within each class.
// Base inventory stays fixed; later rounds only grow this log (when draft advances past base).
function worldDiffLog(beforeIndex, afterIndex) {
  beforeIndex = beforeIndex || emptyDraftIndex();
  afterIndex = afterIndex || emptyDraftIndex();
  var lines = [];
  var beforeGame = beforeIndex.game && beforeIndex.game.semanticId || null;
  var afterGame = afterIndex.game && afterIndex.game.semanticId || null;
  if (beforeGame && beforeGame !== afterGame) lines.push('-game ' + beforeGame);
  if (afterGame && afterGame !== beforeGame) lines.push('+game ' + afterGame);

  var beforeEntities = bySemanticId(beforeIndex.entities);
  var afterEntities = bySemanticId(afterIndex.entities);
  sortedKeys(beforeEntities).forEach(function(id) {
    if (!afterEntities[id]) lines.push('-entity ' + id);
  });
  sortedKeys(afterEntities).forEach(function(id) {
    var after = afterEntities[id];
    var before = beforeEntities[id];
    var kind = after.kind || 'object';
    var roles = (after.roles || []).slice().sort().join(',');
    var members = (after.members || []).map(function(member) { return member.semanticId; }).slice().sort().join(',');
    if (!before) {
      lines.push('+entity ' + kind + ' ' + id + ' roles=' + (roles || '-') + ' members=' + (members || '-'));
      return;
    }
    var beforeRoles = (before.roles || []).slice().sort().join(',');
    var beforeKind = before.kind || 'object';
    if (beforeKind !== kind || beforeRoles !== roles) {
      lines.push('~entity ' + kind + ' ' + id + ' roles=' + (roles || '-'));
    }
    var beforeMembers = entityMemberSet(before);
    var afterMembers = entityMemberSet(after);
    sortedKeys(beforeMembers).forEach(function(memberId) {
      if (!afterMembers[memberId]) lines.push('-member ' + id + '.' + memberId);
    });
    sortedKeys(afterMembers).forEach(function(memberId) {
      if (!beforeMembers[memberId]) lines.push('+member ' + id + '.' + memberId);
    });
  });

  function collectionDiff(label, beforeItems, afterItems) {
    var beforeMap = bySemanticId(beforeItems);
    var afterMap = bySemanticId(afterItems);
    sortedKeys(beforeMap).forEach(function(id) {
      if (!afterMap[id]) lines.push('-' + label + ' ' + id);
    });
    sortedKeys(afterMap).forEach(function(id) {
      if (!beforeMap[id]) lines.push('+' + label + ' ' + id);
    });
  }
  collectionDiff('component', beforeIndex.components, afterIndex.components);
  collectionDiff('event', beforeIndex.events, afterIndex.events);
  collectionDiff('asset', beforeIndex.assetIntents, afterIndex.assetIntents);
  collectionDiff('layout', beforeIndex.layoutIntents, afterIndex.layoutIntents);
  return lines;
}

// Planner-facing world: stable base inventory + append-only log of changes since base (cache-friendly).
// form=base+append-log. Current inventory is derived (base ∘ log) for tests/runtime consumers.
function worldFromDraftIndex(draft, index) {
  var baseIndex = baseWorldIndex(draft);
  var currentIndex = index || emptyDraftIndex();
  var base = worldInventory(baseIndex);
  var current = worldInventory(currentIndex);
  var log = worldDiffLog(baseIndex, currentIndex);
  return {
    form: 'base+append-log',
    operatingMode: draft && draft.baseSource ? 'min-delta-revision' : 'min-delta-new',
    planConstraints: staticPlanConstraints(draft),
    base: base,
    log: log,
    // Derived current view (base applied with log). Prefer base+log in prompts for prefix cache.
    stateOwners: current.stateOwners,
    objectEntities: current.objectEntities,
    memberAddresses: current.memberAddresses,
    eventIds: current.eventIds
  };
}

// Hermes-style scheduler grain: settled ledger (committed work orders) vs open unit.
// No receipt hashes, no member trees — assembly/product judges true playability later.
function progressFromProjection(machineProjection) {
  machineProjection = machineProjection || {};
  var settled = [];
  if (Array.isArray(machineProjection.dispatchLog) && machineProjection.dispatchLog.length) {
    machineProjection.dispatchLog.forEach(function(item) {
      if (!item || !item.taskId) return;
      settled.push({
        taskId: item.taskId,
        goal: item.goal ? String(item.goal) : ''
      });
    });
  } else {
    (machineProjection.completedTaskIds || []).forEach(function(taskId) {
      settled.push({ taskId: taskId, goal: '' });
    });
  }
  // Flat rows: "taskId|goal" — easy to scan (Hermes: finished work is ledger text, not active todo).
  var settledRows = settled.map(function(item) {
    return item.goal ? (item.taskId + '|' + item.goal) : item.taskId;
  });
  // One sealed work order at a time: at PLANNING re-entry there is no open unit (Hermes active-only reinjection).
  var open = [];
  if (machineProjection.activeTaskId && machineProjection.state === stateMachine.STATES.TASK_ACTIVE) {
    open.push(String(machineProjection.activeTaskId));
  }
  return {
    settledCount: settledRows.length,
    settled: settledRows,
    // Alias for older readers/tests — same rows as settled.
    completedCount: settledRows.length,
    completed: settledRows,
    open: open,
    nextAction: 'dispatch-one-or-complete'
  };
}

// Board inventory for the dispatcher only: place ids + coarse counts (no member/event trees).
function boardInventoryFromWorld(world) {
  world = world || {};
  var places = Array.isArray(world.places) ? world.places : [];
  return {
    summary: world.summary || 'empty world',
    game: world.game || null,
    placeIds: places.map(function(place) { return place.id; }),
    places: places,
    counts: world.counts || { places: places.length, members: 0, events: 0 },
    log: Array.isArray(world.log) && world.log.length ? world.log : ['(empty)']
  };
}

function planner(references, draft, request, machineProjection, feedback) {
  var base = baseDraftIndex(draft);
  var world = coarseWorldFromDraft(draft);
  var progress = progressFromProjection(machineProjection);
  return {
    schemaVersion: SCHEMA_VERSION,
    contextKind: CONTEXT_KIND,
    phase: 'planner',
    // No L1 catalog for dispatcher — settled ledger + coarse board only.
    l1: null,
    l2: {
      request: text(request, 'request'),
      sourceMode: draft.baseSource ? 'revision' : 'new',
      baseDraftHash: base.baseDraftHash,
      // Internal only; not projected to planner user.
      baseDraftIndex: base.index,
      world: world,
      board: boardInventoryFromWorld(world),
      progress: progress,
      feedback: feedback === undefined ? null : clone(feedback)
    },
    l4: { transitionLines: machine(machineProjection, null) }
  };
}

// Dispatch tasks have no plan-use table. Executor free-write reads:
// - structure-kinds (entity / behavior / event envelope tokens)
// - L1-ops rows with handle= (legal when/then.capability and nested expr capability)
// Index rows must not use the key "use=" — models copy that into capability=use.
function operationIndexLine(row) {
  var fields = String(row).split('|');
  if (fields.length < 4 || !fields[0] || !fields[1]) fail('SEMANTIC_CONTEXT_CATALOG_INVALID', 'Foundation operation row is invalid: ' + row);
  return {
    channel: fields[0],
    handle: fields[1],
    line: 'handle=' + fields[1] + '|channel=' + fields[0] + '|params=' + fields[2] + '|summary=' + fields.slice(3).join('|')
  };
}

function emptyTaskFacts() {
  return {
    operationIndex: [],
    opsCondition: [],
    opsAction: [],
    opsExpression: [],
    entityKinds: [],
    behaviorKinds: [],
    eventEnvelopes: [],
    components: [],
    assetFamilies: [],
    assetStyles: [],
    layouts: []
  };
}

function taskFacts(references, task) {
  object(task, 'task');
  if (!references || typeof references.foundationOperationLines !== 'function') return emptyTaskFacts();
  var parsed = references.foundationOperationLines().map(operationIndexLine);
  var opsCondition = [];
  var opsAction = [];
  var opsExpression = [];
  parsed.forEach(function(item) {
    if (item.channel === 'condition') opsCondition.push(item.line);
    else if (item.channel === 'action') opsAction.push(item.line);
    else if (item.channel === 'number-expression' || item.channel === 'string-expression') opsExpression.push(item.line);
  });
  // Flat operationIndex retained for ledger fingerprint / diagnostics; model sees channel-split L1-ops.
  var parameters = typeof references.parameterContext === 'function' ? references.parameterContext() : {};
  var eventEnvelopes = (parameters.eventKinds || []).map(function(line) {
    return String(line).split('|')[0];
  }).filter(Boolean);
  return {
    operationIndex: parsed.map(function(item) { return item.line; }),
    opsCondition: opsCondition,
    opsAction: opsAction,
    opsExpression: opsExpression,
    entityKinds: Array.isArray(parameters.entityKinds) ? parameters.entityKinds.slice() : [],
    behaviorKinds: Array.isArray(parameters.behaviorKinds) ? parameters.behaviorKinds.slice() : [],
    eventEnvelopes: eventEnvelopes,
    components: Array.isArray(parameters.components) ? parameters.components.slice() : [],
    // Wire handles only (f1|character, s0|styleId|name, l0|placement). Tokens before | are legal field values.
    assetFamilies: Array.isArray(parameters.assetFamilies) ? parameters.assetFamilies.slice() : [],
    assetStyles: Array.isArray(parameters.assetStyles) ? parameters.assetStyles.slice() : [],
    layouts: Array.isArray(parameters.layouts) ? parameters.layouts.slice() : []
  };
}

function task(draftSlice, plan, machineProjection, activeTask, facts, feedback, request) {
  plan = object(plan, 'plan'); activeTask = object(activeTask, 'activeTask');
  var frozenTask = taskPlan.taskById(plan, activeTask.semanticId);
  if (!equal(frozenTask, activeTask)) fail('SEMANTIC_CONTEXT_ACTIVE_TASK_DIVERGED', 'activeTask must be the unmodified task from the frozen TaskPlan.');
  machineProjection = object(machineProjection, 'machineProjection');
  var transitions = machine(machineProjection, activeTask.semanticId);
  draftSlice = object(draftSlice, 'draftSlice');
  if (draftSlice.documentKind !== DRAFT_SLICE_KIND || draftSlice.taskId !== activeTask.semanticId) fail('SEMANTIC_CONTEXT_DRAFT_SLICE_INVALID', 'draftSlice must be the authoritative ' + DRAFT_SLICE_KIND + ' for activeTask.');
  facts = facts || emptyTaskFacts();
  // productRequest = whole-run user text (scene background only).
  // Execution scope is only activeTask.goal — never mirror the product request as a second checklist.
  var productRequest = request === undefined || request === null || request === '' ? null : text(request, 'productRequest');
  return {
    schemaVersion: SCHEMA_VERSION,
    contextKind: CONTEXT_KIND,
    phase: 'executor',
    l2: {
      // Sole product-background field (not the work order). No dual request alias.
      productRequest: productRequest,
      plan: clone(plan),
      feedback: feedback === undefined ? null : clone(feedback)
    },
    l3: {
      activeTask: clone(activeTask),
      draftSlice: clone(draftSlice),
      // Channel-split ops + structure kinds (flat operationIndex kept for diagnostics only).
      opsCondition: clone(facts.opsCondition || []),
      opsAction: clone(facts.opsAction || []),
      opsExpression: clone(facts.opsExpression || []),
      entityKinds: clone(facts.entityKinds || []),
      behaviorKinds: clone(facts.behaviorKinds || []),
      eventEnvelopes: clone(facts.eventEnvelopes || []),
      components: clone(facts.components || []),
      assetFamilies: clone(facts.assetFamilies || []),
      assetStyles: clone(facts.assetStyles || []),
      layouts: clone(facts.layouts || []),
      operationIndex: clone(facts.operationIndex || [])
    },
    l4: { transitionLines: transitions }
  };
}

module.exports = {
  SCHEMA_VERSION: SCHEMA_VERSION,
  CONTEXT_KIND: CONTEXT_KIND,
  DRAFT_SLICE_KIND: DRAFT_SLICE_KIND,
  CATALOG_FIELD: CATALOG_FIELD,
  baseDraftIndex: baseDraftIndex,
  baseWorldIndex: baseWorldIndex,
  worldInventory: worldInventory,
  worldDiffLog: worldDiffLog,
  worldFromDraftIndex: worldFromDraftIndex,
  coarseWorldFromDraft: coarseWorldFromDraft,
  progressFromProjection: progressFromProjection,
  boardInventoryFromWorld: boardInventoryFromWorld,
  plannerCatalog: plannerCatalog,
  taskFacts: taskFacts,
  planner: planner,
  task: task,
};
