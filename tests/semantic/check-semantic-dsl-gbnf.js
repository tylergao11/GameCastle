var assert = require('assert');
var grammar = require('../../packages/semantic/src/semantic-dsl-gbnf');

var planner = grammar.forPhase('planner');
var executor = grammar.forPhase('executor');
assert(planner.indexOf('"plan-task"') >= 0);
assert(planner.indexOf('"entity"') < 0);
assert(executor.indexOf('"entity"') >= 0);
assert(executor.indexOf('"plan-task"') < 0);
assert(executor.indexOf('cmd-entity ::= "entity"') >= 0);
assert(executor.indexOf('"slot" ws "="') >= 0, 'Command fields are grammar-constrained rather than left to the model.');
assert(planner.indexOf('record ::=') >= 0);
assert(planner.indexOf('list ::=') >= 0);
assert.throws(function() { grammar.forPhase('unknown'); }, function(error) { return error.code === 'SEMANTIC_DSL_GRAMMAR_INVALID'; });
console.log('[SemanticDSLGbnf] phase-specific command vocabulary and non-JSON composite grammar passed');
