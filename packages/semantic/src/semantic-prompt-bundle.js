var crypto = require('crypto');
var syntax = require('./semantic-dsl-syntax');
var dsl = require('./semantic-dsl-parser');
var taskPlan = require('./semantic-task-plan');
var modelPolicy = require('./semantic-model-policy');

var PROFILE_VERSIONS = Object.freeze({ planner: 'semantic-planner-prompt-v12', executor: 'semantic-executor-prompt-v9' });

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
    'ROUND_TOKEN_LIMIT|' + modelPolicy.OUTPUT_TOKEN_LIMIT + ' output tokens available for the complete DSL batch in every Planner and Executor call',
    'THINKING_MODE|disabled;the response channel carries the complete DSL batch',
    'RESPONSE|one task-plan DSL batch; command separator:semicolon or line break',
    'OUTPUT_START|first non-whitespace text is a command name immediately followed by (',
    'OUTPUT_BODY|DSL commands only;each line is one complete command',
    'CONTEXT_FACT|fact(path=...,value=...) rows are read-only DSL context',
    'OWNER|LLM2 decomposes the complete request into ordered atomic semantic tasks',
    'RUNTIME|validates, freezes, hashes, activates, and verifies the TaskPlan',
    'PLAN_BATCH|emit the complete ordered Plan command stream in one batch',
    'TASK_COUNT|use the fewest coherent atomic tasks',
    'TASK_PACKING|pack mutually feasible targets into one atomic task whose Executor batch fits the round token limit',
    'ATOMIC_TASK|one task has one coherent Draft-write commit boundary',
    'TASK_AFTER|plan-task.after is list() for an independent task and list(...earlierTaskId) for its ordered prerequisites',
    'TARGET_SLOT|each typed plan target command declares one exact semantic structure address and intent',
    'REQUEST_COVERAGE|each requested semantic structure has one exact target slot',
    'FEEDBACK|when [L2-run].feedback is non-null, every planned update is grounded in those typed observations',
    'TARGET_COMMAND|plan-game=>game;plan-entity=>entity-record;plan-member=>member;plan-component=>component;plan-event=>event;plan-asset=>asset;plan-layout=>layout;plan-policy=>policy',
    'TARGET_INTENT|read binds an existing reference;create,update,delete authorize mutation',
    'SOURCE_MODE|read [L2-run].sourceMode=>new|revision',
    'NEW_SOURCE_ROOT_SLOT|sourceMode=new=>batch game target count=1;kind=game;intent=create',
    'REVISION_ROOT_SLOT|sourceMode=revision=>batch game target count=0;batch policy target count=0',
    'MEMBER_SLOT|plan-member owns owner and member semanticId',
    'EVENT_SLOT|plan-event with create|update owns one facets list containing exact handles from (' + taskPlan.EVENT_FACETS.join(',') + ')',
    'EVENT_FACET_VALUE|metadata,conditions,actions are scope handles;Executor supplies event design values and operation parameters',
    'ENTITY_STRUCTURE|entity members use separate plan-member targets',
    'EVENT_COMMAND_SCOPE|one event target slot owns every declared facet and accepts all matching event,when,then commands',
    'TARGET_IDENTITY|slot binds the exact tuple(kind,owner,semanticId,facets) for Runtime resolution',
    'CAPABILITY_ALIAS|plan-use.alias names one operation;use selects one operation handle from [L1-planner-operation-index]',
    'TASK_RESOURCES|plan-use and plan-retrieve attach to a task that owns at least one target;they activate facts for that task Executor batch',
    'DERIVED_FACT_SLOTS|target commands deterministically activate built-in catalogs in the frozen Plan',
    taskPlan.DERIVED_CATALOG_LINES.join(';'),
    'RETRIEVE_ALIAS|plan-retrieve.alias names one query;group and kind select oneOf(' + taskPlan.RETRIEVE_KINDS.join(',') + ') from [L1-catalog:' + taskPlan.RETRIEVE_CATALOG + ']',
    'PLAN_NAME_UNIQUENESS|every target slot, capability alias, and retrieval alias is unique across the complete Plan',
    'PLAN_VALUES|fields follow the declared scalar or list shape',
    'PLAN_TEXT_SLOT|plan-task.goal=>quoted string',
    'REPAIR|emit one complete repaired Plan grounded in the final [L4-transition-log] fact',
    syntax.PLAN_LINES.join('\n'),
  ].join('\n');
}

function executorProtocol() {
  var executorLines = syntax.WRITE_LINES;
  return [
    'GameCastle Semantic Executor',
    'PROTOCOL|' + PROFILE_VERSIONS.executor,
    'LANGUAGE|' + syntax.LANGUAGE_ID,
    'ROUND_TOKEN_LIMIT|' + modelPolicy.OUTPUT_TOKEN_LIMIT + ' output tokens available for the complete DSL batch in every Planner and Executor call',
    'THINKING_MODE|disabled;the response channel carries the complete DSL batch',
    'RESPONSE|one Draft-write DSL batch; command separator:semicolon or line break',
    'OUTPUT_START|first non-whitespace text is a command name immediately followed by (',
    'OUTPUT_BODY|DSL commands only;each line is one complete command',
    'CONTEXT_FACT|fact(path=...,value=...) rows are read-only DSL context',
    'MODE|the final [L4-transition-log] row owns the legal write response mode',
    'OWNER|Executor chooses semantic design values inside the frozen active task',
    'RUNTIME|resolves target slots, capability aliases, references, scope, atomic commit, and transition',
    'PLAN|[L2-run].plan is frozen and read-only',
    'ACTIVE_TASK|when allowedMode is write, [L3-active-task] is the only task that may be executed',
    'TASK_FACTS|use only [L3-task-use-facts], selected [L3-catalog:*], and deterministic [L3-retrieve-facts]',
    'DRAFT_SLICE|[L3-draft-slice] is the authoritative read-only slice for the active task',
    'WRITE|when allowedMode is write, emit one write-command batch using activeTask target slots',
    'REPAIR|preserve the Draft slice and repair only the failure in the final transition row',
    'COMMAND_FORMS|fill command fields from the forms below',
    executorLines.join('\n'),
    'TARGET_SLOT|each command.slot selects one compatible target slot from [L3-active-task]',
    'REFERENCE_SLOT|targetSlot,parentSlot,entity parameters,and Entity.member parameters select visible target slots',
    'CAPABILITY_ALIAS|when.capability and then.capability select one alias from [L3-task-use-facts]',
    'COMPONENT_BINDING_ALIAS|component.bindings values=>record(capability=...capabilityAlias,arguments=record(...parameterValues))',
    'EVENT_LOGIC|event fills metadata;when fills conditions;then fills actions',
    'EXPRESSION_ALIAS|record(use=...capabilityAlias,...parameterValues) selects a declared expression capability',
    'UPDATE_OPERATION|replace=>operationId from [L3-draft-slice]',
    'OPTIONAL_SLOT|present when filled; absent otherwise',
    'LIST|list(value,...);empty=>list()',
    'RECORD|record(field=value,...);empty=>record();field=>bare semantic identifier',
    'VALUE|text=>quoted string when it contains spaces or punctuation;number=>finite;bool=>true|false;null=>null;composites=>list(...) or record(...)',
    'COMPOSITE_GRAMMAR|list(...) owns sequences;record(...) owns keyed structures',
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
  var protocol = executorProtocol();
  return result(profile('executor', protocol, null), executorUser(context));
}

module.exports = {
  PROFILE_VERSIONS: PROFILE_VERSIONS,
  canonical: canonical,
  hashText: hashText,
  hashCanonical: hashCanonical,
  buildPlannerBundle: buildPlannerBundle,
  buildExecutorBundle: buildExecutorBundle,
};
