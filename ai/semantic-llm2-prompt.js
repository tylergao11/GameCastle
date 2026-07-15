var syntax = require('./semantic-dsl-syntax');

function buildSystemPrompt() {
  return [
    'GameCastle Semantic Commander',
    'RESPONSE|one DSL batch; prose=0; command separator:semicolon or line break',
    'OWNER|LLM2 chooses gameplay, values, layout, asset intent, and task completion',
    'RUNTIME|validates, binds, multiplies each use, applies one batch, and returns facts',
    'USES|entries in the four *-uses tables are directly executable',
    'EXTENSION_LOOKUP|capability absent from four *-uses tables=>output retrieve(group=gHandle,kind=object|behavior|event|action|condition|number-expression|string-expression) alone; results appear in [retrieve] next response',
    'DRAFT|[draft] is read-only runtime-applied facts accumulated before this response',
    'WRITE|fill command fields from WORK_COMMANDS',
    'APPLIED|[applied] contains the previous batch commands accepted by runtime and their results',
    'SELECT|[draft]+[applied] agree with [task]=>output complete() alone; otherwise=>output one command batch from WORK_COMMANDS',
    'CHANGE_RESULT|runtime applies change commands after this response; results appear in [draft] on the next response',
    'REPAIR|preserve current [draft] and fill failed or remaining work from [errs] and [task-ledger]',
    'WORK_COMMANDS',
    syntax.READ_LINES.concat(syntax.WRITE_LINES, syntax.ROOT_EVENT_LINES, syntax.CHILD_EVENT_LINES, syntax.EVENT_LOGIC_LINES).join('\n'),
    'FIELD_RULES',
    'SEMANTIC_ID|stable design name',
    'MEMBER|member.semanticId=>member name; operation target=>Entity.member',
    'EVENT_ROW|kind|commands:when+then+child-event|parameters:parameter=type',
    'ROOT_EVENT|omit parent',
    'CHILD_EVENT|parent=>existing event semanticId',
    'EVENT_LOGIC|when=>condition use;then=>action use;child-event=>event with parent',
    'USE_ROW|use|parameter=type|meaning',
    'WHEN_USE|fill use from the first field in [condition-uses] exactly',
    'THEN_USE|fill use from the first field in [action-uses] exactly',
    'EXPRESSION_USE|fill use from the first field in [number-expression-uses] or [string-expression-uses] exactly',
    'EXPRESSION|{"use":...expressionUse,"<namedParameter>":...value}',
    'EXTENSION_RESULTS|operation=>xHandle;object=>xoHandle;behavior=>xbHandle;event=>xeHandle',
    'HANDLE|entity.kind=>foundation or xo;behaviors=>foundation or xb;event.kind=>foundation or xe;layout=>l;family=>f;style=>s',
    'UPDATE_OPERATION|replace=>operationId from [draft]',
    'OPTIONAL|omit unfilled optional parameters',
    'STRING_ARRAY|nonEmptyStringArray=>JSON array with at least one JSON string;stringArray=>JSON array of JSON strings',
    'VALUE|text=>one JSON string and runtime builds its string expression;number=>finite;bool=>true|false;array=>JSON array with every string item JSON-quoted;object=>JSON object',
    'DESIGN_VALUE|fill from [task] and [creative-vision]'
  ].join('\n');
}

function buildUserPrompt(options) {
  options = options || {};
  var context = options.context || {}, parameters = context.parameterContext || {}, lines = [];
  function section(name, value) {
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) return;
    if (value && typeof value === 'object' && !Array.isArray(value) && !Object.keys(value).length) return;
    lines.push('[' + name + ']');
    lines.push(Array.isArray(value) && value.every(function(item) { return typeof item === 'string'; }) ? value.join('\n') : typeof value === 'string' ? value : JSON.stringify(value));
  }
  var uses = Object.create(null);
  (context.foundationOperations || []).forEach(function(row) {
    var fields = String(row).split('|'), kind = fields.shift();
    if (!uses[kind]) uses[kind] = [];
    uses[kind].push(fields.join('|'));
  });
  section('condition-uses', uses.condition || []);
  section('action-uses', uses.action || []);
  section('number-expression-uses', uses['number-expression'] || []);
  section('string-expression-uses', uses['string-expression'] || []);
  section('entity-kinds', (parameters.entityKinds || []).join('|'));
  section('behavior-kinds', (parameters.behaviorKinds || []).join('|'));
  section('event-kinds', parameters.eventKinds || []);
  section('layouts', parameters.layouts || []);
  section('asset-families', parameters.assetFamilies || []);
  section('asset-styles', parameters.assetStyles || []);
  section('extension-groups', parameters.extensionGroups || []);
  section('task', String(options.userRequest || ''));
  section('creative-vision', String(options.creativeVision || ''));
  section('draft', context.world);
  section('retrieve', context.retrieve || []);
  section('applied', context.applied || []);
  section('SEMANTIC FEEDBACK', options.feedbackBatch);
  var ledger = Object.assign({}, context.taskLedger || {}), errors = ledger.failed || [];
  delete ledger.failed;
  section('task-ledger', ledger);
  section('errs', errors);
  return lines.join('\n');
}

module.exports = { buildSystemPrompt: buildSystemPrompt, buildUserPrompt: buildUserPrompt };
