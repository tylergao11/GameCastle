var syntax = require('./semantic-dsl-syntax');
function validate(commands, warnings, expectedMode) {
  if (Array.isArray(warnings) && warnings.length) return { ok: false, code: 'SEMANTIC_DSL_PARSE_INCOMPLETE', message: warnings.join(' | ') };
  if (!Array.isArray(commands) || !commands.length) return { ok: false, code: 'SEMANTIC_DSL_EMPTY', message: 'Commander produced no executable semantic DSL.' };
  var plans = commands.filter(function(command) { return syntax.PLAN_COMMANDS.indexOf(command.type) >= 0; });
  var writes = commands.filter(function(command) { return syntax.WRITE_COMMANDS.indexOf(command.type) >= 0; });
  var completions = commands.filter(function(command) { return syntax.COMPLETION_COMMANDS.indexOf(command.type) >= 0; });
  var populatedModes = [plans, writes, completions].filter(function(items) { return items.length; }).length;
  if (populatedModes !== 1) return { ok: false, code: 'SEMANTIC_BATCH_MIXED', message: 'A TaskPlan, Draft write, or completion is one isolated semantic batch.' };
  if (completions.length && commands.length !== 1) return { ok: false, code: 'SEMANTIC_COMPLETION_BATCH_INVALID', message: 'This response is a WRITE batch. End it with the final write command; after runtime applies the WRITE, use complete() alone in the next response.' };
  var mode = plans.length ? 'task-plan' : completions.length ? 'completion' : 'draft-write';
  if (expectedMode && mode !== expectedMode) return { ok: false, code: 'SEMANTIC_STATE_OUTPUT_INVALID', message: 'Current semantic state accepts only ' + expectedMode + '; received ' + mode + '.' };
  return { ok: true, mode: mode };
}
module.exports = { validate: validate };
