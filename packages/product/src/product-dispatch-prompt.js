var dsl = require('./product-dispatch-dsl');
var ledgerApi = require('./product-dispatch-ledger');

var PROFILE_VERSION = 'product-dispatch-prompt-v2';

function quote(value) {
  return '"' + String(value === undefined || value === null ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t') + '"';
}

function factRows(value, root) {
  var lines = [];
  function visit(current, path) {
    if (Array.isArray(current)) {
      lines.push('fact(path=' + quote(path + '.count') + ',value=' + current.length + ')');
      current.forEach(function(item, index) { visit(item, path + '.' + index); });
      return;
    }
    if (current && typeof current === 'object') {
      Object.keys(current).sort().forEach(function(key) { visit(current[key], path + '.' + key); });
      return;
    }
    if (typeof current === 'string') lines.push('fact(path=' + quote(path) + ',value=' + quote(current) + ')');
    else if (current === null || current === undefined) lines.push('fact(path=' + quote(path) + ',value=null)');
    else lines.push('fact(path=' + quote(path) + ',value=' + String(current) + ')');
  }
  visit(value, root);
  return lines;
}

function build(input) {
  input = input || {};
  var progress = Array.isArray(input.progress) ? input.progress : [];
  var world = input.world && typeof input.world === 'object' ? input.world : null;
  var feedback = input.feedback && typeof input.feedback === 'object' ? input.feedback : null;
  var ledgerSummary = input.ledger ? ledgerApi.summary(input.ledger) : ledgerApi.summary(ledgerApi.empty());
  var context = {
    requestId: String(input.requestId || ''),
    projectId: String(input.projectId || ''),
    userRequest: String(input.userRequest || ''),
    availableRoutes: dsl.ROUTES.slice(),
    completedCount: progress.length,
    completed: progress.map(function(item) {
      return {
        id: item.id,
        route: item.route,
        goal: item.goal,
        status: item.status,
        summary: item.summary || null
      };
    }),
    placeholders: ledgerSummary
  };
  if (world) context.world = world;
  if (feedback) context.feedback = feedback;

  return {
    protocolVersion: PROFILE_VERSION,
    languageId: dsl.LANGUAGE_ID,
    systemPrompt: [
      'GameCastle Product Dispatcher',
      'PROTOCOL|' + PROFILE_VERSION,
      'LANGUAGE|' + dsl.LANGUAGE_ID,
      'JOB|you are the product total scheduler on a LangGraph with parallel domain lanes',
      'SCOPE|schedule work orders only; domains own semantic structure, asset pixels, and assembly join',
      'GRAPH|decide -> fan-out semantic/asset lanes -> merge placeholder ledger -> assembly gate -> assembly|decide|end',
      'PLACEHOLDERS|assembly joins sealed placeholder ids; asset may fill only sealed ids; semantic should produce accurate placeholders early',
      'ROUTES|semantic = gameplay/logic; asset = visual/resource fill against sealed placeholders',
      'ASSEMBLY|not a model route; the graph enters assembly only when the placeholder gate is green',
      'READ|1 request 2 progress.completed 3 placeholders 4 world? 5 feedback?',
      'PROGRESS|completed lists finished work orders; do not reuse a finished id',
      'REQUEST|userRequest is the overall product goal; cover it across rounds and lanes',
      'ROUND|each decide emit exactly one command: dispatch-task(...) or dispatch-complete',
      'OUTPUT|DSL only; first non-whitespace is dispatch-task or dispatch-complete; never JSON, Markdown, or fences',
      'WHEN_TASK|if product still needs work, emit one dispatch-task with a singular next step',
      'WHEN_ASSET|route=asset only when placeholders.sealed is true; otherwise prefer semantic that seals placeholders',
      'WHEN_DONE|if progress+placeholders already satisfy the request, emit dispatch-complete',
      'TASK_ID|dispatch-task.id is a short unique work-order id',
      'TASK_ROUTE|dispatch-task.route is semantic or asset',
      'TASK_GOAL|dispatch-task.goal is one natural-language instruction for that domain executor',
      'TASK_GOAL_STYLE|concrete and singular',
      'ONE_ONLY|multi-task batches and director CALL programs are invalid here',
      'FEEDBACK|when feedback is present, emit one corrected dispatch-task or dispatch-complete',
      'FORMS|',
      'dispatch-task id=<id> route=semantic|asset goal="<natural language>"',
      'dispatch-complete'
    ].join('\n'),
    prompt: ['[product-dispatch-facts]'].concat(factRows(context, 'dispatch')).join('\n')
  };
}

module.exports = {
  PROFILE_VERSION: PROFILE_VERSION,
  build: build,
  factRows: factRows
};
