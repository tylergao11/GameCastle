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

// This registry is the sole authored truth for the model-facing Semantic DSL.
// Runtime semantic validation remains owned by TaskPlan, Draft, and Dictionary.
var COMMANDS = Object.freeze({
  'plan-task': command('planner', {
    semanticId: field('semantic-id', true, 'task semantic id'),
    goal: field('text', true, 'positive task goal'),
    after: field('semantic-id-list', true, 'ordered earlier task ids')
  }),
  'plan-game': command('planner', {
    task: field('semantic-id', true, 'task semantic id'),
    slot: field('semantic-id', true, 'target slot id'),
    semanticId: field('semantic-id', true, 'target semantic id'),
    intent: field('target-intent', true, 'read, create, update, or delete')
  }, { planTarget: { kind: 'game' } }),
  'plan-entity': command('planner', {
    task: field('semantic-id', true, 'task semantic id'), slot: field('semantic-id', true, 'target slot id'), semanticId: field('semantic-id', true, 'target semantic id'), intent: field('target-intent', true, 'read, create, update, or delete')
  }, { planTarget: { kind: 'entity-record' } }),
  'plan-member': command('planner', {
    task: field('semantic-id', true, 'task semantic id'), slot: field('semantic-id', true, 'target slot id'), owner: field('semantic-id', true, 'member owner semantic id'), semanticId: field('semantic-id', true, 'target semantic id'), intent: field('target-intent', true, 'read, create, update, or delete')
  }, { planTarget: { kind: 'member' } }),
  'plan-component': command('planner', {
    task: field('semantic-id', true, 'task semantic id'), slot: field('semantic-id', true, 'target slot id'), semanticId: field('semantic-id', true, 'target semantic id'), intent: field('target-intent', true, 'read, create, update, or delete')
  }, { planTarget: { kind: 'component' } }),
  'plan-event': command('planner', {
    task: field('semantic-id', true, 'task semantic id'), slot: field('semantic-id', true, 'target slot id'), semanticId: field('semantic-id', true, 'target semantic id'), intent: field('target-intent', true, 'read, create, update, or delete'), facets: field('event-facet-list', false, 'list of metadata, conditions, and actions owned by this event slot')
  }, { planTarget: { kind: 'event' } }),
  'plan-asset': command('planner', {
    task: field('semantic-id', true, 'task semantic id'), slot: field('semantic-id', true, 'target slot id'), semanticId: field('semantic-id', true, 'target semantic id'), intent: field('target-intent', true, 'read, create, update, or delete')
  }, { planTarget: { kind: 'asset' } }),
  'plan-layout': command('planner', {
    task: field('semantic-id', true, 'task semantic id'), slot: field('semantic-id', true, 'target slot id'), semanticId: field('semantic-id', true, 'target semantic id'), intent: field('target-intent', true, 'read, create, update, or delete')
  }, { planTarget: { kind: 'layout' } }),
  'plan-policy': command('planner', {
    task: field('semantic-id', true, 'task semantic id'), slot: field('semantic-id', true, 'target slot id'), semanticId: field('semantic-id', true, 'target semantic id'), intent: field('target-intent', true, 'read, create, update, or delete')
  }, { planTarget: { kind: 'policy' } }),
  'plan-use': command('planner', {
    task: field('semantic-id', true, 'task semantic id'),
    alias: field('semantic-id', true, 'capability alias'),
    use: field('operation-handle', true, 'operation handle')
  }),
  'plan-retrieve': command('planner', {
    task: field('semantic-id', true, 'task semantic id'),
    alias: field('semantic-id', true, 'retrieval alias'),
    group: field('extension-group-handle', true, 'extension group handle'),
    kind: field('retrieve-kind', true, 'retrieval kind')
  }),

  game: command('executor', {
    slot: field('semantic-id', true, 'game target slot'),
    name: field('text', true, 'game name')
  }, { target: { kind: 'game', semanticIdField: 'semanticId' } }),
  entity: command('executor', {
    slot: field('semantic-id', true, 'entity target slot'),
    roles: field('non-empty-text-list', true, 'semantic roles'),
    kind: field('entity-kind', true, 'entity kind handle'),
    behaviors: field('text-list', true, 'behavior kind handles')
  }, { target: { kind: 'entity-record', semanticIdField: 'semanticId' } }),
  component: command('executor', {
    slot: field('semantic-id', true, 'component target slot'),
    kind: field('component-handle', true, 'component handle'),
    targetSlot: field('semantic-id', false, 'entity target slot'),
    config: field('record', true, 'component configuration'),
    bindings: field('capability-binding-record', true, 'named capability bindings')
  }, { target: { kind: 'component', semanticIdField: 'semanticId' } }),
  member: command('executor', {
    slot: field('semantic-id', true, 'member target slot'),
    roles: field('non-empty-text-list', true, 'semantic roles'),
    value: field('value', true, 'initial or replacement value'),
    bindings: field('text-list', true, 'semantic bindings')
  }, { target: { kind: 'member', semanticIdField: 'semanticId', ownerField: 'entity' } }),
  event: command('executor', {
    slot: field('semantic-id', true, 'event metadata target slot'),
    kind: field('event-kind', true, 'event kind handle'),
    parentSlot: field('semantic-id', false, 'parent event target slot'),
    locals: field('record', true, 'event local values')
  }, { openFields: true, target: { kind: 'event', facet: 'metadata', semanticIdField: 'semanticId' } }),
  when: command('executor', {
    slot: field('semantic-id', true, 'event conditions target slot'),
    capability: field('semantic-id', true, 'condition capability slot'),
    not: field('boolean', false, 'condition inversion'),
    replace: field('semantic-id', false, 'existing condition operation id'),
    arguments: field('record', false, 'operation arguments')
  }, { openFields: true, target: { kind: 'event', facet: 'conditions', semanticIdField: 'event' }, capabilityField: 'capability' }),
  then: command('executor', {
    slot: field('semantic-id', true, 'event actions target slot'),
    capability: field('semantic-id', true, 'action capability slot'),
    await: field('boolean', false, 'await action completion'),
    replace: field('semantic-id', false, 'existing action operation id'),
    arguments: field('record', false, 'operation arguments')
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
    bindings: field('text-list', true, 'semantic bindings')
  }, { target: { kind: 'asset', semanticIdField: 'semanticId' } }),
  layout: command('executor', {
    slot: field('semantic-id', true, 'layout target slot'),
    roles: field('non-empty-text-list', true, 'semantic roles'),
    subject: field('text', true, 'layout subject'),
    bounds: field('record', true, 'positive width and height'),
    relations: field('record-list', true, 'layout relations'),
    bindings: field('text-list', true, 'semantic bindings')
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

var TARGET_KINDS = Object.freeze(Object.keys(COMMANDS).map(function(name) { return COMMANDS[name].planTarget && COMMANDS[name].planTarget.kind; }).filter(Boolean));
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
    'event-facet-list': 'list(...eventFacet)',
    'semantic-id-list': 'list(...earlierTask)',
    'text-list': 'list(...text)',
    'non-empty-text-list': 'list(...text)',
    'record-list': 'list(...record)',
    record: 'record(...fields)',
    'capability-binding-record': 'record(...bindings)',
    value: '...value'
  };
  var value = shapes[spec.type] || '...' + spec.description.replace(/\s+/g, '-');
  return spec.required ? value : value + 'Optional';
}
function renderCommand(name) {
  var spec = COMMANDS[name];
  var fields = Object.keys(spec.fields).map(function(key) { return key + '=' + placeholder(spec.fields[key]); });
  if (spec.openFields) fields.push('...capabilityParameters');
  return name + '(' + fields.join(', ') + ')';
}
function renderPhase(phase) { return Object.keys(COMMANDS).filter(function(name) { return COMMANDS[name].phase === phase; }).map(renderCommand); }
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
  Object.keys(value).forEach(function(key) {
    if (key !== 'type' && !spec.fields[key] && !spec.openFields) throw Object.assign(new Error(value.type + ' contains unknown field: ' + key), { code: 'SEMANTIC_DSL_FIELD_UNKNOWN' });
  });
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
  TARGET_KINDS: TARGET_KINDS,
  TARGET_INTENTS: TARGET_INTENTS,
  EVENT_FACETS: EVENT_FACETS,
  RETRIEVE_KINDS: RETRIEVE_KINDS,
  renderCommand: renderCommand,
  renderPhase: renderPhase,
  validateCommand: validateCommand
};
