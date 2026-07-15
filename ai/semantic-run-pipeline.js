var syntax = require('./semantic-dsl-syntax');
function validate(commands, warnings) {
  if (Array.isArray(warnings) && warnings.length) return { ok: false, code: 'SEMANTIC_DSL_PARSE_INCOMPLETE', message: warnings.join(' | ') };
  if (!Array.isArray(commands) || !commands.length) return { ok: false, code: 'SEMANTIC_DSL_EMPTY', message: 'Commander produced no executable semantic DSL.' };
  var reads = commands.filter(function(command) { return syntax.READ_COMMANDS.indexOf(command.type) >= 0; });
  var writes = commands.filter(function(command) { return syntax.WRITE_COMMANDS.indexOf(command.type) >= 0; });
  var completions = commands.filter(function(command) { return syntax.COMPLETION_COMMANDS.indexOf(command.type) >= 0; });
  if (reads.length && (writes.length || completions.length)) return { ok: false, code: 'SEMANTIC_BATCH_MIXED', message: 'A parameter-read batch and a Draft-write batch are separate semantic steps.' };
  if (completions.length && commands.length !== 1) return { ok: false, code: 'SEMANTIC_COMPLETION_BATCH_INVALID', message: 'This response is a WRITE batch. End it with the final write command; after runtime applies the WRITE, use complete() alone in the next response.' };
  return { ok: true, mode: reads.length ? 'parameter-read' : completions.length ? 'completion' : 'draft-write' };
}
module.exports = { validate: validate };
