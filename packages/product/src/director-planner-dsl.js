var LANGUAGE_ID = 'director-dsl-v1';
var OPERATIONS = Object.freeze(['semantic.design', 'asset.realize', 'assembly.verify']);
var CANONICAL_PROGRAM = [
  'CALL id=semantic operation=semantic.design after=none',
  'CALL id=asset operation=asset.realize after=semantic',
  'CALL id=assembly operation=assembly.verify after=asset',
  'REPAIR from=assembly.verify to=semantic.design'
].join('\n');

function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'DirectorPlannerDSL'; throw error; }
function text(value, label) { if (typeof value !== 'string' || !value.trim()) fail('DIRECTOR_DSL_INVALID', label + ' must be non-empty text.'); return value.trim(); }
function id(value, label) { value = text(value, label); if (!/^[a-z][a-z0-9-]{0,63}$/.test(value)) fail('DIRECTOR_DSL_INVALID', label + ' must be a lowercase DSL identifier.'); return value; }

function parseProgram(value) {
  value = text(value, 'Director Planner output');
  if (/^[\[{]/.test(value)) fail('DIRECTOR_DSL_JSON_FORBIDDEN', 'Director Planner must emit director-dsl-v1 commands, never JSON.');
  var lines = value.split(/\r?\n/).map(function(line) { return line.trim(); }).filter(Boolean), calls = [], repair = null;
  lines.forEach(function(line, index) {
    var call = /^CALL\s+id=([a-z][a-z0-9-]{0,63})\s+operation=(semantic\.design|asset\.realize|assembly\.verify)\s+after=(none|[a-z][a-z0-9-]{0,63})$/.exec(line);
    if (call) { calls.push({ id: id(call[1], 'CALL.id'), operation: call[2], after: call[3] === 'none' ? null : id(call[3], 'CALL.after') }); return; }
    var repairLine = /^REPAIR\s+from=assembly\.verify\s+to=semantic\.design$/.exec(line);
    if (repairLine) { if (repair) fail('DIRECTOR_DSL_DUPLICATE_REPAIR', 'Director Planner may declare one REPAIR command.'); repair = { from: 'assembly.verify', to: 'semantic.design' }; return; }
    fail('DIRECTOR_DSL_INVALID', 'Line ' + (index + 1) + ' is outside director-dsl-v1.');
  });
  return validateProgram({ languageId: LANGUAGE_ID, calls: calls, repair: repair });
}

function validateProgram(program) {
  if (!program || typeof program !== 'object' || Array.isArray(program) || program.languageId !== LANGUAGE_ID || !Array.isArray(program.calls)) fail('DIRECTOR_DSL_INVALID', 'Director program has an invalid shape.');
  if (program.calls.length !== OPERATIONS.length) fail('DIRECTOR_DSL_INCOMPLETE', 'Director program must schedule exactly semantic.design, asset.realize, and assembly.verify.');
  var byOperation = Object.create(null), byId = Object.create(null);
  program.calls.forEach(function(call) {
    if (!call || typeof call !== 'object' || Array.isArray(call)) fail('DIRECTOR_DSL_INVALID', 'CALL must be a structure.');
    var taskId = id(call.id, 'CALL.id'), operation = text(call.operation, 'CALL.operation');
    if (OPERATIONS.indexOf(operation) < 0) fail('DIRECTOR_DSL_OPERATION_INVALID', 'Director operation is outside the domain registry: ' + operation);
    if (byOperation[operation] || byId[taskId]) fail('DIRECTOR_DSL_DUPLICATE_CALL', 'Director program repeats a CALL id or operation.');
    if (call.after !== null && call.after !== undefined) id(call.after, 'CALL.after');
    byOperation[operation] = { id: taskId, operation: operation, after: call.after === undefined ? null : call.after };
    byId[taskId] = true;
  });
  OPERATIONS.forEach(function(operation) { if (!byOperation[operation]) fail('DIRECTOR_DSL_INCOMPLETE', 'Director program is missing ' + operation + '.'); });
  var semantic = byOperation['semantic.design'], asset = byOperation['asset.realize'], assembly = byOperation['assembly.verify'];
  if (semantic.id !== 'semantic' || asset.id !== 'asset' || assembly.id !== 'assembly') fail('DIRECTOR_DSL_TASK_ID_INVALID', 'Director program must use the canonical task ids semantic, asset, and assembly.');
  if (semantic.after !== null || asset.after !== semantic.id || assembly.after !== asset.id) fail('DIRECTOR_DSL_DEPENDENCY_INVALID', 'Director program must order semantic.design -> asset.realize -> assembly.verify.');
  if (!program.repair || program.repair.from !== 'assembly.verify' || program.repair.to !== 'semantic.design') fail('DIRECTOR_DSL_REPAIR_INVALID', 'Director program must route factual assembly rejection to semantic.design.');
  return { languageId: LANGUAGE_ID, calls: [semantic, asset, assembly], repair: { from: 'assembly.verify', to: 'semantic.design' } };
}

function stringify(program) {
  program = validateProgram(program);
  return program.calls.map(function(call) { return 'CALL id=' + call.id + ' operation=' + call.operation + ' after=' + (call.after || 'none'); }).concat(['REPAIR from=assembly.verify to=semantic.design']).join('\n');
}

function canonicalPlan() { return parseProgram(CANONICAL_PROGRAM); }

module.exports = { LANGUAGE_ID: LANGUAGE_ID, OPERATIONS: OPERATIONS, CANONICAL_PROGRAM: CANONICAL_PROGRAM, canonicalPlan: canonicalPlan, parseProgram: parseProgram, validateProgram: validateProgram, stringify: stringify };
