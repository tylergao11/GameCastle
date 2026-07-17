var crypto = require('crypto');
var syntax = require('./semantic-dsl-syntax');
var dsl = require('./semantic-dsl-parser');
var taskPlan = require('./semantic-task-plan');
var modelPolicy = require('./semantic-model-policy');

// Slot-oriented protocols stay short. Fill rules live in COMMAND_FORMS and L1/L3 dictionary projections;
// legality lives in Runtime (TaskPlan feasibility, slot coverage, write order). Do not grow one protocol line per incident.
var PROFILE_VERSIONS = Object.freeze({ planner: 'semantic-planner-prompt-v18', executor: 'semantic-executor-prompt-v17' });

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
    'RESPONSE|one Plan DSL batch; separator:semicolon or line break',
    'OUTPUT|commands only; first non-whitespace is commandName(',
    'OWNER|decompose the request into atomic TaskPlan slots',
    'RUNTIME|validates and freezes the Plan against dictionary and TaskPlan rules',
    'TASKS|fewest tasks (max 16); one task=one Draft-write boundary; pack co-committed structure+rules (many plan-event) in one task',
    'TASK_AFTER|plan-task.after=list() or list(...earlierTaskId)',
    'SLOTS|each plan-* target command is one structure address (kind,owner,semanticId,facets) plus intent',
    'TARGET_MAP|plan-game=>game;plan-entity=>entity-record;plan-member=>member;plan-component=>component;plan-event=>event;plan-asset=>asset;plan-layout=>layout;plan-policy=>policy',
    'INTENT|create|update|delete mutate; read optional when draft already has the entity/member (draft is visible)',
    'SOURCE|read [L2-run].sourceMode; new=>exactly one game create; revision=>no game/policy mutation',
    'MEMBER|bare field ids via plan-member; kind/roles/behaviors on entity write; new shell w/o events: keep entities, invent no fields',
    'SCOPE|only requested targets; flags on state entity; one plan-event per independent rule; slot/alias names unique in whole Plan',
    'EVENT|plan-event create|update|read facets=list(...) oneOf(' + taskPlan.EVENT_FACETS.join(',') + '); full rule list(metadata,conditions,actions)',
    'PLAN_USE|condition|action aliases; expression plan-use only Entity.member readers (state.number); else capability=handle',
    'CATALOGS|kind/handle catalogs from L1 + plan-retrieve; not plan-use',
    'NAMES|target slots, capability aliases, retrieval aliases unique in Plan',
    'DERIVED|' + taskPlan.DERIVED_CATALOG_LINES.join(';'),
    'RETRIEVE|plan-retrieve.alias/group/kind oneOf(' + taskPlan.RETRIEVE_KINDS.join(',') + ') from [L1-catalog:' + taskPlan.RETRIEVE_CATALOG + ']',
    'FEEDBACK|when [L2-run].feedback non-null, planned updates stay inside those observations',
    'REPAIR|one complete repaired Plan from final [L4-transition-log] fact',
    'OPTIONAL|plan-task.after omit or list(); plan-event.facets omit only on delete',
    'FORMS|required fields only; plan-event always shows facets',
    syntax.PLAN_LINES.join('\n')
  ].join('\n');
}

function executorProtocol() {
  var executorLines = syntax.WRITE_LINES;
  return [
    'GameCastle Semantic Executor',
    'PROTOCOL|' + PROFILE_VERSIONS.executor,
    'LANGUAGE|' + syntax.LANGUAGE_ID,
    'ROUND_TOKEN_LIMIT|' + modelPolicy.OUTPUT_TOKEN_LIMIT,
    'THINKING_MODE|disabled',
    'RESPONSE|one Draft-write DSL batch; separator:semicolon or line break',
    'OUTPUT|commands only; first non-whitespace is commandName(',
    'OWNER|fill design values inside the frozen active task',
    'RUNTIME|authorizes one write batch (coverage, resolve, scope, catalogs, declared uses), then commits',
    'SCOPE|[L3-active-task] is the only writable task; [L3-task-use-facts] and [L3-catalog:*] supply handles and param shapes',
    'WRITE|one write for every non-read active-task slot (event=>event+when+then by facet)',
    'ORDER|Runtime orders structure before event before when/then; emit complete coverage',
    'SLOT|active-task target slot id, unique semanticId, or Owner.field; trailing #metadata|#conditions|#actions stripped',
    'CAPABILITY|when/then and expression record(capability=...) take L3 alias or foundation handle; open fields fill that row params=',
    'REFERENCE|entity/Entity.member: slot id, unique semanticId, Entity.member address, or draft-present id',
    'EXPRESSION|number/text literal, member slot/address, or record(capability=alias|handle,...)',
    'BINDINGS|member/asset/layout.bindings are optional foundation operation tags; component.capabilityBindings is a record of plan-use aliases',
    'OPTIONAL|' + syntax.optionalFieldNames('executor').join(';') + ' — present only when filled',
    'VALUES|list(...); record(field=value); comparison operators = != < > <= >= unquoted; other text with spaces/punctuation quoted',
    'REPAIR|preserve Draft slice; repair only the final transition failure',
    'FORMS|required fields only',
    executorLines.join('\n')
  ].join('\n');
}

function plannerCatalog(catalog) {
  catalog = object(catalog, 'context.l1');
  var lines = [];
  sectionRows(lines, 'L1-catalog-source', catalog.sourceFingerprint);
  sectionRows(lines, 'L1-planner-operation-index', catalog.operationIndex || []);
  taskPlan.PLANNER_CATALOGS.forEach(function(name) { sectionRows(lines, 'L1-catalog:' + name, object(catalog.catalogs, 'context.l1.catalogs')[name] || []); });
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
    stablePrefixHash: hashCanonical([{ role: 'system', content: system }]),
  };
}

function transitionSection(lines, context) {
  sectionRows(lines, 'L4-transition-log');
  var transitions = object(context.l4, 'context.l4').transitionLines;
  if (!Array.isArray(transitions) || !transitions.length || transitions.some(function(line) { return typeof line !== 'string' || !line; })) fail('SEMANTIC_PROMPT_TRANSITION_INVALID', 'context.l4.transitionLines must be canonical non-empty lines.');
  lines.push(transitions.join('\n'));
}
function plannerUser(context) {
  var lines = [];
  sectionFacts(lines, 'L2-run', object(context.l2, 'context.l2'));
  transitionSection(lines, context);
  return lines.join('\n');
}
function executorUser(context) {
  var l3 = object(context.l3, 'context.l3'), lines = [];
  var l3Fields = Object.keys(l3).sort();
  if (l3Fields.length !== 3 || l3Fields[0] !== 'activeTask' || l3Fields[1] !== 'draftSlice' || l3Fields[2] !== 'facts') fail('SEMANTIC_PROMPT_L3_INVALID', 'Executor context requires exactly activeTask, draftSlice, and facts.');
  sectionFacts(lines, 'L2-run', object(context.l2, 'context.l2'));
  var facts = object(l3.facts, 'context.l3.facts');
  sectionFacts(lines, 'L3-active-task', object(l3.activeTask, 'context.l3.activeTask'));
  sectionRows(lines, 'L3-task-use-facts', Object.keys(object(facts.uses, 'context.l3.facts.uses')).sort().map(function(use) { return facts.uses[use]; }));
  Object.keys(object(facts.catalogs, 'context.l3.facts.catalogs')).sort().forEach(function(name) { sectionRows(lines, 'L3-catalog:' + name, facts.catalogs[name]); });
  sectionFacts(lines, 'L3-retrieve-facts', facts.retrieves || []);
  sectionFacts(lines, 'L3-draft-slice', object(l3.draftSlice, 'context.l3.draftSlice'));
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
      bundleHash: hashCanonical(messages),
    },
    bytes: { system: bytes(profileValue.system), user: bytes(user), total: bytes(profileValue.system) + bytes(user) },
  };
}

function validateContext(context, phase) {
  context = object(context, 'context');
  if (context.phase !== phase) fail('SEMANTIC_PROMPT_PHASE_INVALID', 'Expected ' + phase + ' context.');
  return context;
}
function buildPlannerBundle(options) {
  options = options || {}; var context = validateContext(options.context, 'planner');
  var protocol = plannerProtocol(), catalog = plannerCatalog(context.l1);
  return result(profile('planner', protocol, catalog), plannerUser(context));
}
function buildExecutorBundle(options) {
  options = options || {}; var context = validateContext(options.context, 'executor');
  return result(profile('executor', executorProtocol(), null), executorUser(context));
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
