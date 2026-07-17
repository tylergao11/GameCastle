var parser = require('./semantic-dsl-parser');
var syntax = require('./semantic-dsl-syntax');
var taskPlan = require('./semantic-task-plan');
var draftApi = require('./semantic-draft');
var referencesApi = require('./semantic-reference-runtime');
var sourceContract = require('./game-semantic-source');

// Seeds: dispatch plan-task rows (optional) + executor write commands.
// Structure is write DSL only — no plan-entity/member target slots.
function load(text, index) {
  var parsed = parser.parse(text);
  if (parsed.warnings.length) {
    var error = new Error('Semantic seed DSL is incomplete: ' + parsed.warnings.join(' | '));
    error.code = 'SEMANTIC_SEED_DSL_INVALID';
    throw error;
  }
  var planCommands = parsed.commands.filter(function(command) { return syntax.PLAN_COMMANDS.indexOf(command.type) >= 0; });
  var writes = parsed.commands.filter(function(command) { return syntax.WRITE_COMMANDS.indexOf(command.type) >= 0; });
  if (!planCommands.length) {
    planCommands = [{ type: 'plan-task', semanticId: 'seed', goal: 'Load semantic seed writes.', after: [] }];
  }
  var plan = taskPlan.create(planCommands);
  var draft = draftApi.create(referencesApi.create(index), null);
  taskPlan.assertFeasible(plan, draftApi.materialize(draft), { revision: false });
  // Single write pass ordered by DSL; all writes run under the first task (seed is one-shot).
  var taskId = plan.tasks[0].semanticId;
  var resolved = taskPlan.authorizeWriteBatch(plan, taskId, writes, {
    beforeDocument: draftApi.materialize(draft)
  });
  resolved.forEach(function(command) { draftApi.execute(draft, command); });
  return sourceContract.validateSource(draftApi.materialize(draft), { index: index });
}

module.exports = { load: load };
