var dsl = require('./director-planner-dsl');

function quote(value) { return '"' + String(value === undefined || value === null ? '' : value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"'; }
function factRows(value, root) {
  var lines = [];
  function visit(current, path) {
    if (Array.isArray(current)) { lines.push('fact(path=' + quote(path + '.count') + ',value=' + current.length + ')'); current.forEach(function(item, index) { visit(item, path + '.' + index); }); return; }
    if (current && typeof current === 'object') { Object.keys(current).sort().forEach(function(key) { visit(current[key], path + '.' + key); }); return; }
    if (typeof current === 'string') lines.push('fact(path=' + quote(path) + ',value=' + quote(current) + ')');
    else if (current === null || current === undefined) lines.push('fact(path=' + quote(path) + ',value=null)');
    else lines.push('fact(path=' + quote(path) + ',value=' + String(current) + ')');
  }
  visit(value, root);
  return lines;
}

function build(input) {
  input = input || {};
  var context = { requestId: String(input.requestId || ''), projectId: String(input.projectId || ''), userRequest: String(input.userRequest || ''), availableOperations: dsl.OPERATIONS.slice(), sourceMode: input.sourceMode || 'new', feedbackPending: input.feedbackPending === true };
  return {
    systemPrompt: [
      'Role: GameCastle Director Planner.',
      'Scope: coordinate only the three domain APIs. Do not author semantic slots, asset work items, spatial placements, parser repairs, or game values.',
      'Language: director-dsl-v1. Output DSL commands only. Never output JSON, Markdown, explanation, or code fences.',
      'The complete response has exactly four lines in this exact order:',
      dsl.CANONICAL_PROGRAM,
      'The response is incomplete until all four lines are emitted.',
      'CALL grammar: CALL id=<lowercase-id> operation=<semantic.design|asset.realize|assembly.verify> after=<none|lowercase-id>.',
      'REPAIR grammar: REPAIR from=assembly.verify to=semantic.design.'
    ].join('\n'),
    prompt: ['[director-facts]'].concat(factRows(context, 'director')).join('\n')
  };
}

module.exports = { build: build, factRows: factRows };
