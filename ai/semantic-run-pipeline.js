var syntax = require('./semantic-dsl-syntax');
function validate(commands, warnings) {
  if (Array.isArray(warnings) && warnings.length) return { ok: false, code: 'SEMANTIC_DSL_PARSE_INCOMPLETE', message: warnings.join(' | ') };
  if (!Array.isArray(commands) || !commands.length) return { ok: false, code: 'SEMANTIC_DSL_EMPTY', message: 'Commander produced no executable semantic DSL.' };
  var reads = commands.filter(function(command) { return syntax.READ_COMMANDS.indexOf(command.type) >= 0; });
  var writes = commands.filter(function(command) { return syntax.WRITE_COMMANDS.indexOf(command.type) >= 0; });
  var commits = commands.filter(function(command) { return syntax.COMMIT_COMMANDS.indexOf(command.type) >= 0; });
  if (reads.length && (writes.length || commits.length)) return { ok: false, code: 'SEMANTIC_BATCH_MIXED', message: 'A parameter-read batch and a Draft-write batch are separate semantic steps.' };
  if (commits.length && commands.length !== 1) return { ok: false, code: 'SEMANTIC_COMMIT_BATCH_INVALID', message: 'Commit is one standalone semantic step.' };
  return { ok: true, mode: reads.length ? 'parameter-read' : commits.length ? 'commit' : 'draft-write' };
}
module.exports = { validate: validate };
