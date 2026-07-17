var LANGUAGE_ID = 'semantic-dsl-v9';

function field(type, required, description) {
  return Object.freeze({ type: type, required: required === true, description: description || type });
}
function command(phase, fields, options) {
  options = options || {};
  return Object.freeze({
    phase: phase,
    fields: Object.freeze(fields),
    openFields: options.openFields === true,
    target: options.target ? Object.freeze(options.target) : null,
    planTarget: options.planTarget ? Object.freeze(options.planTarget) : null,
    capabilityField: options.capabilityField || null
  });
}

// Model-facing wire truth. Planner is dispatch-only (natural-language work orders).
// Structure + values are Executor write commands — not plan-* target slots.
// Runtime validation remains owned by TaskPlan, Draft, and Dictionary.
var COMMANDS = Object.freeze({
  // Planner: schedule tasks only. goal is natural language for the executor LLM.
  'plan-task': command('planner', {
    semanticId: field('semantic-id', true, 'task semantic id'),
    goal: field('text', true, 'natural-language work order for the executor'),
    after: field('semantic-id-list', false, 'ordered earlier task ids')
  }),
  // Terminal dispatch: no more work orders; runtime finalizes Source.
  'plan-complete': command('planner', {}),

  game: command('executor', {
    slot: field('semantic-id', true, 'game target slot'),
    name: field('text', true, 'game name')
  }, { target: { kind: 'game', semanticIdField: 'semanticId' } }),
  entity: command('executor', {
    slot: field('semantic-id', true, 'entity target slot'),
    roles: field('non-empty-text-list', true, 'semantic roles'),
    kind: field('entity-kind', true, 'entity kind handle'),
    // Empty list is the common shell case; requiring behaviors=list() was ceremony and taught omission as "error".
    // Omit or list() when none; list(topdown,...) when needed. Default [] at validate.
    behaviors: field('text-list', false, 'behavior kind handles from structure-kinds; omit or list() when none')
  }, { target: { kind: 'entity-record', semanticIdField: 'semanticId' } }),
  component: command('executor', {
    slot: field('semantic-id', true, 'component target slot'),
    kind: field('component-handle', true, 'component handle'),
    targetSlot: field('semantic-id', false, 'entity target slot'),
    config: field('record', true, 'component configuration'),
    // Named bindings; values are foundation handles after resolve (Draft IR uses use=handle).
    capabilityBindings: field('capability-binding-record', true, 'named foundation capability bindings')
  }, { target: { kind: 'component', semanticIdField: 'semanticId' } }),
  member: command('executor', {
    slot: field('semantic-id', true, 'member target slot'),
    // Empty list() is invalid ceremony; default roles from field id when omitted or empty.
    roles: field('non-empty-text-list', true, 'semantic roles'),
    value: field('value', true, 'initial or replacement value'),
    bindings: field('text-list', false, 'optional foundation operation tags')
  }, { target: { kind: 'member', semanticIdField: 'semanticId', ownerField: 'entity' } }),
  // Event metadata is closed: capability parameters belong on when/then only.
  event: command('executor', {
    slot: field('semantic-id', true, 'event metadata target slot'),
    kind: field('event-kind', true, 'event envelope: rule|else|group|while|repeat|for-each-entity'),
    parentSlot: field('semantic-id', false, 'parent event target slot'),
    locals: field('record', false, 'event local values')
  }, { target: { kind: 'event', facet: 'metadata', semanticIdField: 'semanticId' } }),
  // capability = foundation operation handle from [L1-ops-*].
  when: command('executor', {
    slot: field('semantic-id', true, 'event semantic id'),
    capability: field('operation-handle', true, 'condition foundation handle'),
    not: field('boolean', false, 'condition inversion'),
    replace: field('semantic-id', false, 'existing condition operation id')
  }, { openFields: true, target: { kind: 'event', facet: 'conditions', semanticIdField: 'event' }, capabilityField: 'capability' }),
  then: command('executor', {
    slot: field('semantic-id', true, 'event semantic id'),
    capability: field('operation-handle', true, 'action foundation handle'),
    await: field('boolean', false, 'await action completion'),
    replace: field('semantic-id', false, 'existing action operation id')
  }, { openFields: true, target: { kind: 'event', facet: 'actions', semanticIdField: 'event' }, capabilityField: 'capability' }),
  asset: command('executor', {
    slot: field('semantic-id', true, 'asset target slot'),
    roles: field('non-empty-text-list', true, 'semantic roles'),
    subject: field('text', true, 'asset subject'),
    description: field('text', true, 'asset description'),
    family: field('asset-family-handle', true, 'asset family handle'),
    style: field('asset-style-handle', true, 'asset style handle'),
    constraints: field('record', true, 'asset constraints'),
    animation: field('record', false, 'animation intent'),
    bindings: field('text-list', false, 'optional foundation operation tags')
  }, { target: { kind: 'asset', semanticIdField: 'semanticId' } }),
  layout: command('executor', {
    slot: field('semantic-id', true, 'layout target slot'),
    roles: field('non-empty-text-list', true, 'semantic roles'),
    subject: field('text', true, 'layout subject'),
    bounds: field('record', true, 'positive width and height'),
    relations: field('record-list', true, 'layout relations'),
    bindings: field('text-list', false, 'optional foundation operation tags')
  }, { target: { kind: 'layout', semanticIdField: 'semanticId' } }),
  policy: command('executor', {
    slot: field('semantic-id', true, 'policy target slot'),
    mode: field('policy-mode', true, 'percentage or absolute'),
    value: field('positive-number', true, 'policy value')
  }, { target: { kind: 'policy', semanticIdField: 'degree' } }),
  remove: command('executor', {
    slot: field('semantic-id', true, 'deletion target slot')
  }, { target: { kind: '*', delete: true } })
});

// Legacy names kept for exports/tests that still reference intent vocabulary; planner no longer declares targets.
var TARGET_KINDS = Object.freeze(['game', 'entity-record', 'member', 'component', 'event', 'asset', 'layout', 'policy']);
var TARGET_INTENTS = Object.freeze(['read', 'create', 'update', 'delete']);
var EVENT_FACETS = Object.freeze(['metadata', 'conditions', 'actions']);
var RETRIEVE_KINDS = Object.freeze(['object', 'behavior', 'event', 'action', 'condition', 'number-expression', 'string-expression']);

function names(phase) {
  return Object.freeze(Object.keys(COMMANDS).filter(function(name) { return COMMANDS[name].phase === phase; }));
}
var PLAN_COMMANDS = names('planner');
var WRITE_COMMANDS = names('executor');
var ALL_COMMANDS = Object.freeze(Object.keys(COMMANDS));

function placeholder(spec) {
  var shapes = {
    // Canonical full-rule shape; subsets remain legal at parse (valueMatches).
    'event-facet-list': 'list(metadata,conditions,actions)',
    'semantic-id-list': 'list(...earlierTask)',
    'text-list': 'list(...text)',
    'non-empty-text-list': 'list(...text)',
    'record-list': 'list(...record)',
    record: 'record(...fields)',
    'capability-binding-record': 'record(...capabilityBindings)',
    value: '...value'
  };
  return shapes[spec.type] || '...' + spec.description.replace(/\s+/g, '-');
}
// COMMAND_FORMS list required fields only. Optional fields are named in protocol OPTIONAL.
// when/then openFields carry capability parameters; event metadata is a closed form.
function renderCommand(name) {
  var spec = COMMANDS[name];
  var fields = Object.keys(spec.fields).filter(function(key) {
    return spec.fields[key].required;
  }).map(function(key) {
    return key + '=' + placeholder(spec.fields[key]);
  });
  if (spec.openFields && spec.capabilityField) fields.push('...capabilityParameters');
  else if (spec.openFields) fields.push('...openParameters');
  return name + '(' + fields.join(', ') + ')';
}
function optionalFieldNames(phase) {
  var names = [];
  Object.keys(COMMANDS).forEach(function(commandName) {
    var spec = COMMANDS[commandName];
    if (phase && spec.phase !== phase) return;
    Object.keys(spec.fields).forEach(function(fieldName) {
      if (!spec.fields[fieldName].required) names.push(commandName + '.' + fieldName);
    });
  });
  return Object.freeze(names.sort());
}
function renderPhase(phase) { return Object.keys(COMMANDS).filter(function(name) { return COMMANDS[name].phase === phase; }).map(renderCommand); }
// Matches draft/authorize: revision cannot introduce game identity or tuning policy shells.
var REVISION_FORBIDDEN_WRITE_COMMANDS = Object.freeze(['game', 'policy']);
function writeCommandNames(workMode) {
  var names = WRITE_COMMANDS.slice();
  if (workMode === 'revision') {
    names = names.filter(function(name) { return REVISION_FORBIDDEN_WRITE_COMMANDS.indexOf(name) < 0; });
  }
  return Object.freeze(names);
}
function writeLinesForMode(workMode) {
  return Object.freeze(writeCommandNames(workMode).map(renderCommand));
}
var PLAN_LINES = Object.freeze(renderPhase('planner'));
var WRITE_LINES = Object.freeze(renderPhase('executor'));
var LINES = Object.freeze(PLAN_LINES.concat(WRITE_LINES));

function valueMatches(type, value) {
  if (type === 'value') return value !== undefined;
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'positive-number') return typeof value === 'number' && Number.isFinite(value) && value > 0;
  if (type === 'record' || type === 'capability-binding-record') return !!value && typeof value === 'object' && !Array.isArray(value);
  if (type === 'record-list') return Array.isArray(value) && value.every(function(item) { return !!item && typeof item === 'object' && !Array.isArray(item); });
  if (type === 'text-list') return Array.isArray(value) && value.every(function(item) { return typeof item === 'string'; });
  if (type === 'non-empty-text-list') return Array.isArray(value) && value.length > 0 && value.every(function(item) { return typeof item === 'string' && item.trim(); });
  if (type === 'text') return typeof value === 'string' && value.trim();
  if (type === 'semantic-id') return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(value);
  if (type === 'target-kind') return TARGET_KINDS.indexOf(value) >= 0;
  if (type === 'target-intent') return TARGET_INTENTS.indexOf(value) >= 0;
  if (type === 'event-facet') return EVENT_FACETS.indexOf(value) >= 0;
  if (type === 'event-facet-list') return Array.isArray(value) && value.length > 0 && value.every(function(item, position, all) { return EVENT_FACETS.indexOf(item) >= 0 && all.indexOf(item) === position; });
  if (type === 'semantic-id-list') return Array.isArray(value) && value.every(function(item, position, all) { return typeof item === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(item) && all.indexOf(item) === position; });
  if (type === 'retrieve-kind') return RETRIEVE_KINDS.indexOf(value) >= 0;
  if (type === 'policy-mode') return value === 'percentage' || value === 'absolute';
  return typeof value === 'string' && value.trim();
}
function validateCommand(value, phase) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Object.assign(new Error('Semantic DSL command must be a structure.'), { code: 'SEMANTIC_DSL_COMMAND_INVALID' });
  var spec = COMMANDS[value.type];
  if (!spec) throw Object.assign(new Error('Unknown Semantic DSL command: ' + value.type), { code: 'SEMANTIC_DSL_COMMAND_UNKNOWN' });
  if (phase && spec.phase !== phase) throw Object.assign(new Error('Semantic DSL phase ' + phase + ' does not accept command ' + value.type + '.'), { code: 'SEMANTIC_DSL_PHASE_INVALID' });
  // Event facet is owned by command type (event/when/then), not by slot id. Strip model-emitted slot#facet early.
  if (typeof value.slot === 'string') {
    var facetSlot = /^(.*)#(metadata|conditions|actions)$/.exec(value.slot.trim());
    if (facetSlot && facetSlot[1]) value.slot = facetSlot[1];
  }
  // Optional declared fields with null are absent: null is not a typed fill value.
  Object.keys(spec.fields).forEach(function(key) {
    if (!spec.fields[key].required && Object.prototype.hasOwnProperty.call(value, key) && value[key] === null) delete value[key];
  });
  // Empty-container defaults: optional list/record ceremony must not be model-required.
  if (value.type === 'entity' && value.behaviors === undefined) value.behaviors = [];
  if (value.type === 'event' && value.locals === undefined) value.locals = {};
  if ((value.type === 'member' || value.type === 'asset' || value.type === 'layout') && value.bindings === undefined) value.bindings = [];
  // member.roles: empty list() is not a valid fill — default to field name from Owner.field slot.
  if (value.type === 'member') {
    var roleEmpty = !Array.isArray(value.roles) || value.roles.length === 0;
    if (value.roles === undefined || roleEmpty) {
      var roleSlot = typeof value.slot === 'string' ? value.slot : '';
      var roleField = roleSlot.indexOf('.') >= 0 ? roleSlot.split('.').pop() : (typeof value.semanticId === 'string' ? value.semanticId : 'field');
      value.roles = [roleField || 'field'];
    }
  }
  Object.keys(value).forEach(function(key) {
    if (key !== 'type' && !spec.fields[key] && !spec.openFields) throw Object.assign(new Error(value.type + ' contains unknown field: ' + key), { code: 'SEMANTIC_DSL_FIELD_UNKNOWN' });
  });
  // Capability ops take parameters as open fields only — nested arguments= is a closed dual channel.
  if (spec.capabilityField && Object.prototype.hasOwnProperty.call(value, 'arguments')) {
    throw Object.assign(new Error(value.type + ' takes capability parameters as open fields, not arguments=.'), { code: 'SEMANTIC_DSL_FIELD_UNKNOWN' });
  }
  Object.keys(spec.fields).forEach(function(key) {
    var fieldSpec = spec.fields[key];
    if (fieldSpec.required && !Object.prototype.hasOwnProperty.call(value, key)) throw Object.assign(new Error(value.type + ' requires field: ' + key), { code: 'SEMANTIC_DSL_FIELD_REQUIRED' });
    if (Object.prototype.hasOwnProperty.call(value, key) && !valueMatches(fieldSpec.type, value[key])) throw Object.assign(new Error(value.type + '.' + key + ' must match ' + fieldSpec.type + '.'), { code: 'SEMANTIC_DSL_FIELD_TYPE_INVALID' });
  });
  return value;
}

module.exports = {
  LANGUAGE_ID: LANGUAGE_ID,
  COMMANDS: COMMANDS,
  PLAN_COMMANDS: PLAN_COMMANDS,
  WRITE_COMMANDS: WRITE_COMMANDS,
  ALL_COMMANDS: ALL_COMMANDS,
  PLAN_LINES: PLAN_LINES,
  WRITE_LINES: WRITE_LINES,
  LINES: LINES,
  REVISION_FORBIDDEN_WRITE_COMMANDS: REVISION_FORBIDDEN_WRITE_COMMANDS,
  writeCommandNames: writeCommandNames,
  writeLinesForMode: writeLinesForMode,
  optionalFieldNames: optionalFieldNames,
  TARGET_KINDS: TARGET_KINDS,
  TARGET_INTENTS: TARGET_INTENTS,
  EVENT_FACETS: EVENT_FACETS,
  RETRIEVE_KINDS: RETRIEVE_KINDS,
  renderCommand: renderCommand,
  renderPhase: renderPhase,
  validateCommand: validateCommand
};
