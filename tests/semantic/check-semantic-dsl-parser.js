var assert = require('assert');
var fs = require('fs');
var path = require('path');
var parser = require('../../packages/semantic/src/semantic-dsl-parser');
var syntax = require('../../packages/semantic/src/semantic-dsl-syntax');

assert.strictEqual(parser.LANGUAGE_ID, 'semantic-dsl-v9');
assert.deepStrictEqual(parser.parseValue('list(player,"two words",3,true,false,null)'), ['player', 'two words', 3, true, false, null]);
assert.deepStrictEqual(parser.parseValue('record(bounds=record(width=32,height=32),subjects=list(snakeHead,food))'), { bounds: { width: 32, height: 32 }, subjects: ['snakeHead', 'food'] });

var planner = parser.parse([
  'plan-task(semanticId=core,goal="Create snake core",after=list())',
  'plan-task(semanticId=move,goal="蛇需要会动",after=list(core))'
].join('\n'), { phase: 'planner' });
assert.deepStrictEqual(planner.warnings, []);
assert.strictEqual(planner.commands.length, 2);
assert.strictEqual(planner.commands[1].goal, '蛇需要会动');

var goalCommas = parser.parse(
  'plan-task(semanticId=task1,goal=Add a timed rule that triggers when timer reaches 0.15s and direction is right, then resets timer and moves head,after=list())',
  { phase: 'planner' }
);
assert.strictEqual(goalCommas.commands[0].goal, 'Add a timed rule that triggers when timer reaches 0.15s and direction is right, then resets timer and moves head');
assert.deepStrictEqual(goalCommas.commands[0].after, []);

var executor = parser.parse([
  'entity(slot=snakeHead,roles=list(player,"snake-head"),kind=sprite,behaviors=list())',
  'then(slot=move_right,capability=object.x.add,target=snakeHead,value=32)'
].join('\n'), { phase: 'executor' });
assert.deepStrictEqual(executor.commands[0].roles, ['player', 'snake-head']);
assert.strictEqual(executor.commands[1].capability, 'object.x.add');

['{"kind":"entity"}', '[{"kind":"entity"}]', 'list({"kind":"entity"})'].forEach(function(value) {
  assert.throws(function() { parser.parseValue(value); }, function(error) { return error.code === 'SEMANTIC_DSL_LEGACY_JSON_FORBIDDEN'; });
});
assert.throws(function() { parser.parse('plan-entity(task=core,slot=head,semanticId=snakeHead,intent=create)'); }, function(error) { return error.code === 'SEMANTIC_DSL_COMMAND_UNKNOWN'; });
assert.throws(function() { parser.parse('plan-target(task=core,kind=entity-record,semanticId=head,intent=create)'); }, function(error) { return error.code === 'SEMANTIC_DSL_COMMAND_UNKNOWN'; });
assert.throws(function() { parser.parse('complete()'); }, function(error) { return error.code === 'SEMANTIC_DSL_COMMAND_UNKNOWN'; });
assert.throws(function() { parser.parse('entity(slot=head,roles=list(player),kind=sprite,behaviors=list())', { phase: 'planner' }); }, function(error) { return error.code === 'SEMANTIC_DSL_PHASE_INVALID'; });

assert.deepStrictEqual(syntax.PLAN_LINES, syntax.renderPhase('planner'));
assert.deepStrictEqual(syntax.WRITE_LINES, syntax.renderPhase('executor'));
assert.deepStrictEqual(syntax.PLAN_COMMANDS.slice().sort(), ['plan-complete', 'plan-task']);
var facetStripped = parser.parse('when(slot=moveRight#conditions,capability=timer.elapsed,timer=t,operator=">=",seconds=0.15)', { phase: 'executor' });
assert.strictEqual(facetStripped.commands[0].slot, 'moveRight', 'parse strips trailing #conditions from slot');
var source = fs.readFileSync(path.join(__dirname, '..', '..', 'packages', 'semantic', 'src', 'semantic-dsl-parser.js'), 'utf8');
assert.strictEqual(source.indexOf('JSON.parse'), -1, 'the model DSL parser has no JSON parser fallback');
console.log('[SemanticDSLParser] v9 phase grammar, generated command shapes, slot protocol, and hard legacy rejection passed');
