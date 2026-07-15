var sourceContract = require('./game-semantic-source');
var runtimeNames = require('./semantic-runtime-names');
var algebra = require('./semantic-event-algebra');

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function valueType(value) { return Array.isArray(value) ? 'array' : (value && typeof value === 'object' ? 'structure' : typeof value); }
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'SemanticDraft'; throw error; }
function allowed(command, fields) { Object.keys(command).forEach(function(key) { if (fields.indexOf(key) < 0) fail('SEMANTIC_DRAFT_FIELD_INVALID', '>' + command.type + ' contains unknown field: ' + key); }); }
function text(value, label) { if (typeof value !== 'string' || !value.trim()) fail('SEMANTIC_DRAFT_VALUE_INVALID', label + ' is required'); return value.trim(); }
function array(value, label) { if (!Array.isArray(value)) fail('SEMANTIC_DRAFT_VALUE_INVALID', label + ' must be an array'); return clone(value); }
function object(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('SEMANTIC_DRAFT_VALUE_INVALID', label + ' must be an object'); return clone(value); }
function upsert(items, value) { var at = items.findIndex(function(item) { return item.semanticId === value.semanticId; }); if (at < 0) items.push(value); else items[at] = value; }
function find(items, id, label) { var item = items.find(function(value) { return value.semanticId === id; }); if (!item) fail('SEMANTIC_DRAFT_TARGET_MISSING', label + ' is missing: ' + id); return item; }
function walkEvents(events, visitor, parent) { events.forEach(function(event) { visitor(event, parent || null); walkEvents(event.children || [], visitor, event); }); }
function findEvent(events, id) { var found = null; walkEvents(events, function(event) { if (event.semanticId === id) found = event; }); return found; }
function eventParent(events, id) { var found = null; walkEvents(events, function(event, parent) { if (event.semanticId === id) found = parent; }); return found; }
function removeEvent(events, id) {
  for (var i = 0; i < events.length; i++) {
    if (events[i].semanticId === id) return events.splice(i, 1)[0];
    var nested = removeEvent(events[i].children || [], id); if (nested) return nested;
  }
  return null;
}
function seedEventSlots(events, refs) {
  events.forEach(function(event) {
    event.conditions.forEach(function(item) { item._slot = item.operation.slot; item._use = algebra.operationForUse(item.operation.use) ? item.operation.use : refs.extensionHandle(item.operation.use); });
    event.actions.forEach(function(item) { item._slot = item.operation.slot; item._use = algebra.operationForUse(item.operation.use) ? item.operation.use : refs.extensionHandle(item.operation.use); });
    seedEventSlots(event.children || [], refs);
  });
}
function nextSlot(items, kind) { var position = 0; while (items.some(function(item) { return item._slot === kind + '.' + position; })) position++; return kind + '.' + position; }
function argumentContext(draft) {
  function entity(entityId) { return find(draft.value.entities, text(entityId, 'event operation entity'), 'entity'); }
  return {
    objectName: function(entityId) { entity(entityId); return runtimeNames.entityObjectName(entityId); },
    behaviorName: function(entityId, behaviorKind) {
      var owner = entity(entityId);
      var behaviorRef = draft.references.resolveBehaviorKinds([behaviorKind])[0];
      if (owner.behaviorTypeRefs.indexOf(behaviorRef) < 0) fail('SEMANTIC_DRAFT_BEHAVIOR_MISSING', owner.semanticId + ' does not declare behavior ' + behaviorKind + '.');
      return runtimeNames.behaviorName(owner.semanticId, behaviorRef);
    },
    memberVariableName: function(reference) {
      var match = /^([A-Za-z][A-Za-z0-9_.-]*)\.([A-Za-z][A-Za-z0-9_.-]*)$/.exec(text(reference, 'object variable'));
      if (!match) fail('SEMANTIC_DRAFT_MEMBER_REFERENCE_INVALID', 'Object variable uses Entity.member: ' + reference);
      var owner = entity(match[1]); find(owner.members, match[2], 'member');
      return runtimeNames.memberVariableName(match[1], match[2]);
    },
    sceneVariableName: function(reference) {
      var match = /^([A-Za-z][A-Za-z0-9_.-]*)\.([A-Za-z][A-Za-z0-9_.-]*)$/.exec(text(reference, 'scene variable'));
      if (!match) fail('SEMANTIC_DRAFT_MEMBER_REFERENCE_INVALID', 'Scene variable uses Entity.member: ' + reference);
      var owner = entity(match[1]); if (owner.objectTypeRef) fail('SEMANTIC_DRAFT_MEMBER_SCOPE_INVALID', reference + ' belongs to an object entity, not scene state.'); find(owner.members, match[2], 'member');
      return runtimeNames.memberVariableName(match[1], match[2]);
    },
    memberScope: function(reference) {
      var match = /^([A-Za-z][A-Za-z0-9_.-]*)\./.exec(text(reference, 'state member'));
      if (!match) fail('SEMANTIC_DRAFT_MEMBER_REFERENCE_INVALID', 'State member uses Entity.member: ' + reference);
      return entity(match[1]).objectTypeRef ? 'object' : 'scene';
    },
    localName: function(reference) { return runtimeNames.generatedName('local', text(reference, 'local variable')); }
  };
}
function create(references, source) {
  var index = references.index;
  var value = source ? sourceContract.validateSource(source, { index: index }) : { schemaVersion: sourceContract.SCHEMA_VERSION, documentKind: 'game-semantic-source', dictionarySource: clone(index.source), game: null, entities: [], events: [], assetIntents: [], layoutIntents: [], tuningPolicies: { relativeChange: {} } };
  value = clone(value); seedEventSlots(value.events, references);
  return { schemaVersion: 4, draftKind: 'game-semantic-draft', baseSource: source ? clone(source) : null, value: value, touched: [], references: references };
}
function mark(draft, command, semanticId) { draft.touched.push({ type: command.type, semanticId: semanticId || command.semanticId || null }); }
function operationArgs(command) {
  var rawArgs = command.arguments === undefined ? Object.create(null) : object(command.arguments, command.type + '.arguments');
  var args = Object.create(null); Object.keys(rawArgs).forEach(function(key) { args[key] = rawArgs[key]; });
  Object.keys(command).forEach(function(key) {
    if (['type', 'event', 'use', 'slot', 'not', 'await', 'arguments'].indexOf(key) >= 0) return;
    if (Object.prototype.hasOwnProperty.call(args, key)) fail('SEMANTIC_DSL_ARG_DUPLICATE', 'Duplicate event operation slot: ' + key);
    args[key] = clone(command[key]);
  });
  return args;
}
function applyInvocations(draft, command) {
  var kind = command.type === 'when' ? 'condition' : 'action';
  if (kind === 'condition' && command.not !== undefined && typeof command.not !== 'boolean') fail('SEMANTIC_DRAFT_VALUE_INVALID', 'when.not must be a boolean.');
  if (kind === 'condition' && command.await !== undefined) fail('SEMANTIC_DRAFT_FIELD_INVALID', 'when has no await slot.');
  if (kind === 'action' && command.not !== undefined) fail('SEMANTIC_DRAFT_FIELD_INVALID', 'then has no not slot.');
  if (kind === 'action' && command.await !== undefined && typeof command.await !== 'boolean') fail('SEMANTIC_DRAFT_VALUE_INVALID', 'then.await must be a boolean.');
  var owner = findEvent(draft.value.events, text(command.event, command.type + '.event'));
  if (!owner) fail('SEMANTIC_DRAFT_TARGET_MISSING', 'event is missing: ' + command.event);
  var list = kind === 'condition' ? owner.conditions : owner.actions;
  var channel = draft.references.invocationChannel(owner.eventTypeRef, kind);
  var use = text(command.use, command.type + '.use');
  var compiled = draft.references.compileOperation(use, kind, operationArgs(command), argumentContext(draft));
  var insertion = list.length;
  var operationSlot;
  if (command.slot !== undefined) {
    var requested = text(command.slot, command.type + '.slot');
    insertion = list.findIndex(function(item) { return item._slot === requested; });
    if (insertion < 0) fail('SEMANTIC_DRAFT_SLOT_MISSING', owner.semanticId + ' has no existing slot ' + requested + '.');
    list.splice(insertion, list.filter(function(item) { return item._slot === requested; }).length);
    operationSlot = requested;
  }
  if (!operationSlot) operationSlot = nextSlot(list, kind);
  var stableUse = algebra.operationForUse(use) ? use : compiled[0].semanticRef;
  var added = compiled.map(function(item, position) {
    var invocation = { _slot: operationSlot, _use: use, semanticRef: item.semanticRef, arguments: item.arguments, channel: channel, operation: { use: stableUse, slot: operationSlot, part: position, size: compiled.length } };
    if (kind === 'condition') invocation.inverted = command.not === true;
    else invocation.awaited = command.await === true;
    list.splice(insertion + position, 0, invocation); return invocation;
  });
  return owner.semanticId + '/' + operationSlot + (added.length > 1 ? '*' + added.length : '');
}
function execute(draft, command) {
  var value = draft.value;
  var refs = draft.references;
  var summaryId = command.semanticId || command.entity || command.event || '';
  if (command.type === 'game') {
    allowed(command, ['type', 'semanticId', 'name']);
    if (draft.baseSource) fail('SEMANTIC_DRAFT_REVISION_UNSUPPORTED', 'Game identity is stable during a revision.');
    value.game = { semanticId: text(command.semanticId, 'game.semanticId'), name: text(command.name, 'game.name') };
  } else if (command.type === 'entity') {
    allowed(command, ['type', 'semanticId', 'roles', 'kind', 'behaviors']);
    var entityId = text(command.semanticId, 'entity.semanticId');
    var currentEntity = value.entities.find(function(item) { return item.semanticId === entityId; });
    upsert(value.entities, { semanticId: entityId, roles: array(command.roles, 'entity.roles'), objectTypeRef: refs.resolveEntityKind(text(command.kind, 'entity.kind')), behaviorTypeRefs: refs.resolveBehaviorKinds(command.behaviors || []), members: currentEntity ? currentEntity.members : [] });
  } else if (command.type === 'member') {
    allowed(command, ['type', 'entity', 'semanticId', 'roles', 'value', 'bindings']);
    var entity = find(value.entities, text(command.entity, 'member.entity'), 'entity');
    upsert(entity.members, { semanticId: text(command.semanticId, 'member.semanticId'), roles: array(command.roles, 'member.roles'), value: clone(command.value), bindings: refs.resolveBindings(command.bindings || [], 'member.bindings') });
  } else if (command.type === 'event') {
    var eventId = text(command.semanticId, 'event.semanticId');
    var parentId = command.parent === undefined ? null : text(command.parent, 'event.parent');
    var eventArguments = Object.create(null);
    Object.keys(command).forEach(function(key) { if (['type', 'semanticId', 'kind', 'parent', 'locals'].indexOf(key) < 0) eventArguments[key] = clone(command[key]); });
    var compiledEvent = refs.compileEventKind(text(command.kind, 'event.kind'), eventArguments, argumentContext(draft));
    if (parentId === eventId) fail('SEMANTIC_EVENT_CYCLE', 'An event cannot parent itself: ' + eventId);
    var currentEvent = findEvent(value.events, eventId);
    if (currentEvent && parentId && findEvent(currentEvent.children || [], parentId)) fail('SEMANTIC_EVENT_CYCLE', 'Event parent would create a cycle: ' + eventId + ' -> ' + parentId);
    var node = currentEvent || { semanticId: eventId, conditions: [], actions: [], children: [] };
    node.eventTypeRef = compiledEvent.eventTypeRef; node.arguments = compiledEvent.arguments; node.locals = command.locals === undefined && currentEvent ? node.locals : object(command.locals || {}, 'event.locals');
    var oldParent = currentEvent ? eventParent(value.events, eventId) : null;
    if (!currentEvent || (oldParent ? oldParent.semanticId : null) !== parentId) {
      if (currentEvent) removeEvent(value.events, eventId);
      if (parentId) { var parent = findEvent(value.events, parentId); if (!parent) fail('SEMANTIC_DRAFT_TARGET_MISSING', 'parent event is missing: ' + parentId); parent.children.push(node); }
      else value.events.push(node);
    }
  } else if (command.type === 'when' || command.type === 'then') {
    summaryId = applyInvocations(draft, command);
  } else if (command.type === 'asset') {
    allowed(command, ['type', 'semanticId', 'roles', 'subject', 'description', 'family', 'style', 'constraints', 'bindings']);
    upsert(value.assetIntents, { semanticId: text(command.semanticId, 'asset.semanticId'), roles: array(command.roles, 'asset.roles'), subject: text(command.subject, 'asset.subject'), description: text(command.description, 'asset.description'), productionFamily: refs.resolveFamily(command.family), styleId: refs.resolveStyle(command.style), constraints: object(command.constraints || {}, 'asset.constraints'), bindings: refs.resolveBindings(command.bindings || [], 'asset.bindings') });
  } else if (command.type === 'layout') {
    allowed(command, ['type', 'semanticId', 'roles', 'subject', 'relations', 'bindings']);
    var relations = array(command.relations, 'layout.relations').map(function(relation, position) { relation = object(relation, 'layout.relations[' + position + ']'); allowed(relation, ['semanticId', 'layout', 'subjects']); return { semanticId: text(relation.semanticId, 'layout relation semanticId'), layoutRef: refs.resolveLayout(relation.layout), subjects: array(relation.subjects, 'layout relation subjects') }; });
    upsert(value.layoutIntents, { semanticId: text(command.semanticId, 'layout.semanticId'), roles: array(command.roles, 'layout.roles'), subject: text(command.subject, 'layout.subject'), relations: relations, bindings: refs.resolveBindings(command.bindings || [], 'layout.bindings') });
  } else if (command.type === 'policy') {
    allowed(command, ['type', 'degree', 'mode', 'value']); if (draft.baseSource) fail('SEMANTIC_DRAFT_REVISION_UNSUPPORTED', 'Tuning policy definitions are stable during a revision.'); value.tuningPolicies.relativeChange[text(command.degree, 'policy.degree')] = { mode: text(command.mode, 'policy.mode'), value: command.value }; summaryId = command.degree;
  } else if (command.type === 'remove') {
    allowed(command, ['type', 'collection', 'semanticId']); var collection = text(command.collection, 'remove.collection'); var removeId = text(command.semanticId, 'remove.semanticId');
    if (collection === 'events') { if (!removeEvent(value.events, removeId)) fail('SEMANTIC_DRAFT_TARGET_MISSING', 'events is missing: ' + removeId); }
    else { if (['entities', 'assetIntents', 'layoutIntents'].indexOf(collection) < 0) fail('SEMANTIC_DRAFT_COLLECTION_INVALID', 'Unknown semantic collection: ' + collection); var removeAt = value[collection].findIndex(function(item) { return item.semanticId === removeId; }); if (removeAt < 0) fail('SEMANTIC_DRAFT_TARGET_MISSING', collection + ' is missing: ' + removeId); value[collection].splice(removeAt, 1); }
  } else fail('SEMANTIC_DRAFT_COMMAND_INVALID', 'Unsupported Draft command: ' + command.type);
  mark(draft, command, summaryId); return { summary: '>' + command.type + (summaryId ? ' ' + summaryId : '') + ' applied' };
}
function cleanEvent(event) { event.conditions.forEach(function(item) { delete item._slot; delete item._use; }); event.actions.forEach(function(item) { delete item._slot; delete item._use; }); event.children.forEach(cleanEvent); }
function materialize(draft) { var source = clone(draft.value); source.events.forEach(cleanEvent); return source; }
function structure(draft) {
  var value = draft.value, refs = draft.references;
  function operationViews(entries, condition) {
    var bySlot = {}, views = [];
    entries.forEach(function(entry) {
      var view = bySlot[entry._slot];
      if (!view) { view = bySlot[entry._slot] = { slot: entry._slot, use: entry._use, channel: entry.channel, argumentNames: [], expansionSize: entry.operation.size }; if (condition) view.not = entry.inverted; else view.await = entry.awaited; views.push(view); }
      Object.keys(entry.arguments).forEach(function(name) { if (view.argumentNames.indexOf(name) < 0) view.argumentNames.push(name); });
    });
    views.forEach(function(view) { view.argumentNames.sort(); }); return views;
  }
  function eventView(item) { return { semanticId: item.semanticId, kind: refs.eventKind(item.eventTypeRef), argumentNames: Object.keys(item.arguments).sort(), locals: Object.keys(item.locals).sort().map(function(key) { return { semanticId: key, valueType: valueType(item.locals[key]) }; }), conditions: operationViews(item.conditions, true), actions: operationViews(item.actions, false), children: item.children.map(eventView) }; }
  return {
    game: value.game ? { semanticId: value.game.semanticId, nameType: 'string' } : null,
    entities: value.entities.map(function(item) { return { semanticId: item.semanticId, roles: clone(item.roles), kind: refs.entityKind(item.objectTypeRef), behaviors: refs.behaviorKinds(item.behaviorTypeRefs), members: item.members.map(function(member) { return { semanticId: member.semanticId, roles: clone(member.roles), valueType: valueType(member.value), bindings: refs.bindingUses(member.bindings) }; }) }; }),
    events: value.events.map(eventView),
    assetIntents: value.assetIntents.map(function(item) { return { semanticId: item.semanticId, subject: item.subject, family: refs.familyHandle(item.productionFamily), style: refs.styleHandle(item.styleId), bindings: refs.bindingUses(item.bindings) }; }),
    layoutIntents: value.layoutIntents.map(function(item) { return { semanticId: item.semanticId, subject: item.subject, layouts: item.relations.map(function(relation) { return refs.layoutHandle(relation.layoutRef); }), bindings: refs.bindingUses(item.bindings) }; }),
    tuningDegrees: Object.keys(value.tuningPolicies.relativeChange).sort()
  };
}
function revision(draft) {
  if (!draft.baseSource) return null; var next = materialize(draft), operations = [];
  ['entities', 'events', 'assetIntents', 'layoutIntents'].forEach(function(collection) { var before = draft.baseSource[collection], after = next[collection]; before.forEach(function(item) { if (!after.some(function(candidate) { return candidate.semanticId === item.semanticId; })) operations.push({ op: 'remove', collection: collection, semanticId: item.semanticId }); }); after.forEach(function(item) { var old = before.find(function(candidate) { return candidate.semanticId === item.semanticId; }); if (!old || JSON.stringify(old) !== JSON.stringify(item)) operations.push({ op: 'upsert', collection: collection, value: item }); }); });
  if (!operations.length) fail('SEMANTIC_DRAFT_NO_CHANGES', 'Draft contains no revision changes.'); return { schemaVersion: sourceContract.SCHEMA_VERSION, documentKind: 'game-semantic-revision', baseSourceHash: sourceContract.sourceHash(draft.baseSource), operations: operations };
}

module.exports = { create: create, execute: execute, materialize: materialize, structure: structure, revision: revision };
