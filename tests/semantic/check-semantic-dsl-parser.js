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
  'plan-entity(task=core,slot=head,semanticId=snakeHead,intent=create)',
  'plan-use(task=core,alias=moveRight,use=object.x.add)'
].join('\n'), { phase: 'planner' });
assert.deepStrictEqual(planner.warnings, []);
assert.strictEqual(planner.commands.length, 3);
assert.strictEqual(planner.commands[1].slot, 'head');

var executor = parser.parse([
  'entity(slot=head,roles=list(player,"snake-head"),kind=sprite,behaviors=list())',
  'then(slot=moveActions,capability=moveRight,target=head,value=32)'
].join('\n'), { phase: 'executor' });
assert.deepStrictEqual(executor.commands[0].roles, ['player', 'snake-head']);
assert.strictEqual(executor.commands[1].capability, 'moveRight');

['{"kind":"entity"}', '[{"kind":"entity"}]', 'list({"kind":"entity"})'].forEach(function(value) {
  assert.throws(function() { parser.parseValue(value); }, function(error) { return error.code === 'SEMANTIC_DSL_LEGACY_JSON_FORBIDDEN'; });
});
assert.throws(function() { parser.parse('plan-target(task=core,kind=entity-record,semanticId=head,intent=create)'); }, function(error) { return error.code === 'SEMANTIC_DSL_COMMAND_UNKNOWN'; });
assert.throws(function() { parser.parse('complete()'); }, function(error) { return error.code === 'SEMANTIC_DSL_COMMAND_UNKNOWN'; });
assert.throws(function() { parser.parse('entity(slot=head,roles=list(player),kind=sprite,behaviors=list())', { phase: 'planner' }); }, function(error) { return error.code === 'SEMANTIC_DSL_PHASE_INVALID'; });
assert.throws(function() { parser.parse('entity(semanticId=head,roles=list(player),kind=sprite,behaviors=list())', { phase: 'executor' }); }, function(error) { return error.code === 'SEMANTIC_DSL_FIELD_UNKNOWN' || error.code === 'SEMANTIC_DSL_FIELD_REQUIRED'; });

assert.deepStrictEqual(syntax.PLAN_LINES, syntax.renderPhase('planner'));
assert.deepStrictEqual(syntax.WRITE_LINES, syntax.renderPhase('executor'));
var source = fs.readFileSync(path.join(__dirname, '..', '..', 'packages', 'semantic', 'src', 'semantic-dsl-parser.js'), 'utf8');
assert.strictEqual(source.indexOf('JSON.parse'), -1, 'the model DSL parser has no JSON parser fallback');
console.log('[SemanticDSLParser] v9 phase grammar, generated command shapes, slot protocol, and hard legacy rejection passed');
