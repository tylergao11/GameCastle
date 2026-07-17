var syntax = require('./semantic-dsl-syntax');

function fail(message) { var error = new Error(message); error.code = 'SEMANTIC_DSL_GRAMMAR_INVALID'; error.owner = 'SemanticDSLGbnf'; throw error; }
function ruleName(commandName) { return 'cmd-' + commandName; }

var TYPE_RULES = Object.freeze({
  'semantic-id': 'semantic-id',
  'semantic-id-list': 'semantic-id-list',
  text: 'text',
  'text-list': 'text-list',
  'non-empty-text-list': 'non-empty-text-list',
  record: 'record',
  'record-list': 'record-list',
  'capability-binding-record': 'record',
  value: 'value',
  boolean: 'boolean',
  'positive-number': 'positive-number',
  'target-intent': 'target-intent',
  'event-facet-list': 'event-facet-list',
  'retrieve-kind': 'retrieve-kind',
  'policy-mode': 'policy-mode'
});

var VALUE_RULES = String.raw`open-argument ::= key ws "=" ws value
key ::= [A-Za-z] [A-Za-z0-9_.-]{0,127}
value ::= quoted | list | record | atom
list ::= "list(" ws (value (ws "," ws value)*)? ws ")"
record ::= "record(" ws (record-field (ws "," ws record-field)*)? ws ")"
record-field ::= key ws "=" ws value
record-list ::= "list(" ws (record (ws "," ws record)*)? ws ")"
semantic-id-list ::= "list(" ws (semantic-id (ws "," ws semantic-id)*)? ws ")"
text-list ::= "list(" ws (text (ws "," ws text)*)? ws ")"
non-empty-text-list ::= "list(" ws text (ws "," ws text)* ws ")"
event-facet-list ::= "list(" ws event-facet (ws "," ws event-facet)* ws ")"
event-facet ::= "metadata" | "conditions" | "actions"
target-intent ::= "read" | "create" | "update" | "delete"
retrieve-kind ::= "object" | "behavior" | "event" | "action" | "condition" | "number-expression" | "string-expression"
policy-mode ::= "percentage" | "absolute"
boolean ::= "true" | "false"
positive-number ::= [0-9]+ ("." [0-9]+)?
semantic-id ::= [A-Za-z] [A-Za-z0-9_.-]{0,127}
text ::= quoted
string-value ::= quoted | handle
handle ::= [A-Za-z] [A-Za-z0-9_+./:-]*
quoted ::= "\"" quoted-char* "\""
quoted-char ::= [^"\\\r\n] | "\\" escape
escape ::= ["\\/bfnrt] | "u" hex hex hex hex
hex ::= [0-9a-fA-F]
atom ::= [A-Za-z0-9_+./:-] [A-Za-z0-9_+./:-]*
separator ::= ws (";" | "\n") ws
ws ::= [ \t]?`;

function valueRule(fieldSpec) { return TYPE_RULES[fieldSpec.type] || 'string-value'; }
function commandRule(name) {
  var spec = syntax.COMMANDS[name], fields = Object.keys(spec.fields), expression = '"' + name + '" ws "(" ws';
  fields.forEach(function(fieldName, index) {
    var fieldExpression = (index ? ' ws "," ws ' : ' ') + '"' + fieldName + '" ws "=" ws ' + valueRule(spec.fields[fieldName]);
    expression += spec.fields[fieldName].required ? fieldExpression : ' (' + fieldExpression.trimStart() + ')?';
  });
  if (spec.openFields) expression += ' (ws "," ws open-argument)*';
  return ruleName(name) + ' ::= ' + expression + ' ws ")"';
}

function forPhase(phase, options) {
  options = options || {};
  var names = null;
  if (phase === 'planner') names = syntax.PLAN_COMMANDS.slice();
  else if (phase === 'executor') names = syntax.writeCommandNames(options.workMode || 'new');
  if (!names || !names.length) fail('Semantic DSL grammar phase must be planner or executor.');
  return [
    'root ::= ws command (separator command)* ws',
    'command ::= ' + names.map(ruleName).join(' | ')
  ].concat(names.map(commandRule), [VALUE_RULES]).join('\n');
}

module.exports = { forPhase: forPhase };
