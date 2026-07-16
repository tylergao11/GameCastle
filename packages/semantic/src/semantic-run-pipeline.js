var syntax = require('./semantic-dsl-syntax');
function validate(commands, warnings, expectedMode) {
  if (Array.isArray(warnings) && warnings.length) return { ok: false, code: 'SEMANTIC_DSL_PARSE_INCOMPLETE', message: warnings.join(' | ') };
  if (!Array.isArray(commands) || !commands.length) return { ok: false, code: 'SEMANTIC_DSL_EMPTY', message: 'Commander produced no executable semantic DSL.' };
  var plans = commands.filter(function(command) { return syntax.PLAN_COMMANDS.indexOf(command.type) >= 0; });
  var writes = commands.filter(function(command) { return syntax.WRITE_COMMANDS.indexOf(command.type) >= 0; });
  var populatedModes = [plans, writes].filter(function(items) { return items.length; }).length;
  if (populatedModes !== 1) return { ok: false, code: 'SEMANTIC_BATCH_MIXED', message: 'A TaskPlan or Draft write is one isolated semantic batch.' };
  var mode = plans.length ? 'task-plan' : 'draft-write';
  if (expectedMode && mode !== expectedMode) return { ok: false, code: 'SEMANTIC_STATE_OUTPUT_INVALID', message: 'Current semantic state accepts only ' + expectedMode + '; received ' + mode + '.' };
  return { ok: true, mode: mode };
}
module.exports = { validate: validate };
