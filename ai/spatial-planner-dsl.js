var LANGUAGE_ID = 'spatial-dsl-v1';
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'SpatialPlannerDSL'; throw error; }
var number = '([-+]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:[eE][-+]?\\d+)?)';
var quoted = '("(?:[^"\\\\]|\\\\.)*")';
var placeLine = new RegExp('^PLACE\\s+subject=' + quoted + '\\s+x=' + number + '\\s+y=' + number + '\\s+width=' + number + '\\s+height=' + number + '\\s+angle=' + number + '\\s+layer=' + quoted + '\\s+zOrder=' + number + '$');

function parseString(value, label) { try { var parsed = JSON.parse(value); if (typeof parsed !== 'string') throw new Error('not text'); return parsed; } catch (_error) { fail('SPATIAL_DSL_INVALID', label + ' must be a JSON string literal'); } }
function parseNumber(value, label) { var parsed = Number(value); if (!Number.isFinite(parsed)) fail('SPATIAL_DSL_INVALID', label + ' must be finite'); return parsed; }
function parsePlace(line, index) {
  var match = placeLine.exec(line);
  if (!match) fail('SPATIAL_DSL_INVALID', 'PLACE line ' + (index + 1) + ' does not match spatial-dsl-v1');
  return { subject: parseString(match[1], 'PLACE.subject'), x: parseNumber(match[2], 'PLACE.x'), y: parseNumber(match[3], 'PLACE.y'), width: parseNumber(match[4], 'PLACE.width'), height: parseNumber(match[5], 'PLACE.height'), angle: parseNumber(match[6], 'PLACE.angle'), layer: parseString(match[7], 'PLACE.layer'), zOrder: parseNumber(match[8], 'PLACE.zOrder') };
}
function parseProgram(program) {
  if (typeof program !== 'string' || !program.trim()) fail('SPATIAL_DSL_INVALID', 'SpatialPlanner output must contain one spatial-dsl-v1 program');
  var lines = program.split(/\r?\n/).map(function(line) { return line.trim(); }).filter(Boolean);
  if (lines.length === 1 && lines[0] === 'ACCEPT') return { kind: 'accept' };
  if (lines.some(function(line) { return line === 'ACCEPT'; })) fail('SPATIAL_DSL_ACCEPTANCE_MIXED', 'ACCEPT is a standalone later-round command and cannot share a PLACE program');
  return { kind: 'candidate', placements: lines.map(parsePlace) };
}

module.exports = { LANGUAGE_ID: LANGUAGE_ID, parseProgram: parseProgram, parsePlace: parsePlace };
