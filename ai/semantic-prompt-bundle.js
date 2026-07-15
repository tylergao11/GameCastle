var crypto = require('crypto');
var syntax = require('./semantic-dsl-syntax');
var taskPlan = require('./semantic-task-plan');

var PROFILE_VERSIONS = Object.freeze({ planner: 'semantic-planner-prompt-v1', executor: 'semantic-executor-prompt-v1' });

function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'SemanticPromptBundle'; throw error; }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, {}); return value; }
function canonical(value) { return JSON.stringify(stable(value)); }
function hashText(value) { return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex'); }
function hashCanonical(value) { return hashText(canonical(value)); }
function bytes(value) { return Buffer.byteLength(String(value), 'utf8'); }
function object(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('SEMANTIC_PROMPT_CONTEXT_INVALID', label + ' must be an object.'); return value; }
function rows(value) { if (Array.isArray(value) && value.every(function(item) { return typeof item === 'string'; })) return value.join('\n'); return canonical(value); }
function section(lines, name, value) { lines.push('[' + name + ']'); if (value !== undefined) lines.push(rows(value)); }

function plannerProtocol() {
  if (!Array.isArray(taskPlan.PLAN_LINES) || !taskPlan.PLAN_LINES.length) fail('SEMANTIC_PROMPT_PROTOCOL_INVALID', 'SemanticTaskPlan must export PLAN_LINES.');
  return [
    'GameCastle Semantic Planner',
    'PROTOCOL|' + PROFILE_VERSIONS.planner,
    'LANGUAGE|' + taskPlan.LANGUAGE_ID,
    'RESPONSE|one task-plan DSL batch; prose=0; command separator:semicolon or line break',
    'OUTPUT_START|first non-whitespace text is a command name immediately followed by (',
    'OWNER|LLM2 decomposes the complete request into ordered atomic semantic tasks',
    'RUNTIME|validates, freezes, hashes, activates, and verifies the TaskPlan',
    'PLAN_BATCH|emit every plan-task(...) in one batch',
    'TASK_COUNT|use the fewest coherent atomic tasks; maximum=' + taskPlan.MAX_TASKS,
    'ATOMIC_TASK|one task has one coherent Draft-write commit boundary',
    'DEPENDENCY|dependsOn names only earlier task semanticIds',
    'TARGET|targets declare exact semantic structure ownership and intent',
    'FEEDBACK|when [L2-run].feedback is non-null, every planned update is grounded in those typed observations',
    'TARGET_KIND|kind=>oneOf(' + taskPlan.TARGET_KINDS.join(',') + ')',
    'TARGET_INTENT|intent=>oneOf(' + taskPlan.TARGET_INTENTS.join(',') + ')',
    'MEMBER_TARGET|kind=member=>owner is required; facets omitted',
    'EVENT_TARGET|kind=event and intent!=delete=>facets is a non-empty array of oneOf(' + taskPlan.EVENT_FACETS.join(',') + '); owner omitted',
    'OTHER_TARGET|kind!=member=>owner omitted; kind!=event=>facets omitted',
    'USE|uses select stable operations from [L1-planner-operation-index]',
    'CATALOG|catalogs is an array of oneOf(' + taskPlan.CATALOGS.join(',') + ') containing only directories needed by that task',
    'RETRIEVE|retrieves contains {group:gHandle,kind:oneOf(' + taskPlan.RETRIEVE_KINDS.join(',') + ')} selected from [L1-catalog:' + taskPlan.RETRIEVE_CATALOG + ']',
    'REPAIR|preserve valid tasks and repair only facts identified by the final [L4-transition-log] row',
    taskPlan.PLAN_LINES.join('\n'),
  ].join('\n');
}

function executorProtocol() {
  var executorLines = syntax.WRITE_LINES.concat(syntax.ROOT_EVENT_LINES, syntax.CHILD_EVENT_LINES, syntax.EVENT_LOGIC_LINES, syntax.COMPLETION_LINES);
  return [
    'GameCastle Semantic Executor',
    'PROTOCOL|' + PROFILE_VERSIONS.executor,
    'LANGUAGE|' + syntax.LANGUAGE_ID,
    'RESPONSE|one DSL batch; prose=0; command separator:semicolon or line break',
    'OUTPUT_START|first non-whitespace text is a command name immediately followed by (',
    'MODE|the final [L4-transition-log] row owns the only legal response mode',
    'OWNER|LLM2 chooses semantic design values inside the frozen active task',
    'RUNTIME|validates scope, binds capability facts, applies one atomic batch, and returns one transition',
    'PLAN|[L2-run].plan is frozen and read-only',
    'ACTIVE_TASK|when allowedMode is write, [L3-active-task] is the only task that may be executed',
    'FINAL_CANDIDATE|when allowedMode is completion, [L3-final-candidate] contains only the final Draft, Source, and task receipt hashes',
    'TASK_FACTS|use only [L3-task-use-facts], selected [L3-catalog:*], and deterministic [L3-retrieve-facts]',
    'DRAFT_SLICE|[L3-draft-slice] is the authoritative read-only slice for the active task',
    'WRITE|when allowedMode is write, emit one write-command batch only inside activeTask targets',
    'COMPLETE|when allowedMode is completion, emit complete() alone',
    'REPAIR|preserve the Draft slice and repair only the failure in the final transition row',
    'COMMAND_FORMS|fill command fields from the forms below',
    executorLines.join('\n'),
    'SEMANTIC_ID|stable design name',
    'MEMBER|member.semanticId=>member name; operation target=>Entity.member',
    'ROOT_EVENT|omit parent',
    'CHILD_EVENT|parent=>existing event semanticId',
    'EVENT_LOGIC|event(...) fills metadata; each condition is when(...); each action is then(...)',
    'WHEN_USE|fill use from an exact condition fact',
    'THEN_USE|fill use from an exact action fact',
    'EXPRESSION_USE|fill use from an exact number-expression or string-expression fact',
    'EXPRESSION|{"use":...expressionUse,"<namedParameter>":...value}',
    'UPDATE_OPERATION|replace=>operationId from [L3-draft-slice]',
    'OPTIONAL|omit unfilled optional parameters',
    'STRING_ARRAY|nonEmptyStringArray=>JSON array with at least one JSON string;stringArray=>JSON array of JSON strings',
    'VALUE|text=>one JSON string;number=>finite;bool=>true|false;array=>JSON array;object=>JSON object',
  ].join('\n');
}

function plannerCatalog(catalog) {
  catalog = object(catalog, 'context.l1');
  var lines = [];
  section(lines, 'L1-catalog-source', catalog.sourceFingerprint);
  section(lines, 'L1-planner-operation-index', catalog.operationIndex || []);
  taskPlan.PLANNER_CATALOGS.forEach(function(name) { section(lines, 'L1-catalog:' + name, object(catalog.catalogs, 'context.l1.catalogs')[name] || []); });
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
  section(lines, 'L4-transition-log');
  var transitions = object(context.l4, 'context.l4').transitionLines;
  if (!Array.isArray(transitions) || !transitions.length || transitions.some(function(line) { return typeof line !== 'string' || !line; })) fail('SEMANTIC_PROMPT_TRANSITION_INVALID', 'context.l4.transitionLines must be canonical non-empty lines.');
  lines.push(transitions.join('\n'));
}
function plannerUser(context) {
  var lines = [];
  section(lines, 'L2-run', object(context.l2, 'context.l2'));
  transitionSection(lines, context);
  return lines.join('\n');
}
function executorUser(context) {
  var l3 = object(context.l3, 'context.l3'), hasTask = Object.prototype.hasOwnProperty.call(l3, 'activeTask'), hasFinal = Object.prototype.hasOwnProperty.call(l3, 'finalCandidate'), lines = [];
  if (hasTask === hasFinal) fail('SEMANTIC_PROMPT_L3_INVALID', 'Executor context requires exactly one activeTask or finalCandidate projection.');
  section(lines, 'L2-run', object(context.l2, 'context.l2'));
  if (hasTask) {
    var facts = object(l3.facts, 'context.l3.facts');
    section(lines, 'L3-active-task', object(l3.activeTask, 'context.l3.activeTask'));
    section(lines, 'L3-task-use-facts', Object.keys(object(facts.uses, 'context.l3.facts.uses')).sort().map(function(use) { return facts.uses[use]; }));
    Object.keys(object(facts.catalogs, 'context.l3.facts.catalogs')).sort().forEach(function(name) { section(lines, 'L3-catalog:' + name, facts.catalogs[name]); });
    section(lines, 'L3-retrieve-facts', facts.retrieves || []);
    section(lines, 'L3-draft-slice', object(l3.draftSlice, 'context.l3.draftSlice'));
  } else section(lines, 'L3-final-candidate', object(l3.finalCandidate, 'context.l3.finalCandidate'));
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
