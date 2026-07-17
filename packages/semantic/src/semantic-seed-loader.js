var parser = require('./semantic-dsl-parser');
var syntax = require('./semantic-dsl-syntax');
var taskPlan = require('./semantic-task-plan');
var draftApi = require('./semantic-draft');
var referencesApi = require('./semantic-reference-runtime');
var sourceContract = require('./game-semantic-source');

function load(text, index) {
  var parsed = parser.parse(text);
  if (parsed.warnings.length) { var error = new Error('Semantic seed DSL is incomplete: ' + parsed.warnings.join(' | ')); error.code = 'SEMANTIC_SEED_DSL_INVALID'; throw error; }
  var planCommands = parsed.commands.filter(function(command) { return syntax.PLAN_COMMANDS.indexOf(command.type) >= 0; });
  var writes = parsed.commands.filter(function(command) { return syntax.WRITE_COMMANDS.indexOf(command.type) >= 0; });
  var plan = taskPlan.create(planCommands), draft = draftApi.create(referencesApi.create(index), null);
  taskPlan.assertFeasible(plan, draftApi.materialize(draft), { revision: false, allowShellMembers: true });
  plan.tasks.forEach(function(task) {
    var owned = Object.create(null); task.slots.forEach(function(slot) { owned[slot.slot] = true; });
    var resolved = taskPlan.resolveBatch(plan, task.semanticId, writes.filter(function(command) { return owned[command.slot]; }));
    resolved.forEach(function(command) { draftApi.execute(draft, command); });
  });
  return sourceContract.validateSource(draftApi.materialize(draft), { index: index });
}

module.exports = { load: load };
