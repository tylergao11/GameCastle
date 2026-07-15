var crypto = require('crypto');
var fs = require('fs');
var path = require('path');

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, Object.create(null)); return value; }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0, 24); }
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'SpatialPlannerTrace'; throw error; }
function text(value, label) { if (typeof value !== 'string' || !value.trim()) fail('SPATIAL_PLANNER_TRACE_INVALID', label + ' must be non-empty text'); return value.trim(); }
function positiveInteger(value, label) { if (!Number.isInteger(value) || value < 1) fail('SPATIAL_PLANNER_TRACE_INVALID', label + ' must be a positive integer'); return value; }
function identity(value) {
  value = value || {};
  return { runId: text(value.runId, 'trace.runId'), projectId: text(value.projectId, 'trace.projectId'), sourceHash: text(value.sourceHash, 'trace.sourceHash'), spatialAssemblyInputHash: text(value.spatialAssemblyInputHash, 'trace.spatialAssemblyInputHash') };
}
function document(kind, identityValue, payload) {
  var result = Object.assign({ schemaVersion: 1, documentKind: kind }, identity(identityValue), clone(payload));
  result.contentHash = kind + '.' + hash(result);
  return result;
}
function write(traceDir, fileName, value) {
  var directory = path.resolve(text(traceDir, 'trace.directory'));
  try { fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(path.join(directory, fileName), JSON.stringify(value, null, 2) + '\n', 'utf8'); }
  catch (error) { fail('SPATIAL_PLANNER_TRACE_WRITE_FAILED', 'Cannot persist Spatial Planner trace evidence: ' + String(error.message || error)); }
  return { documentKind: value.documentKind, contentHash: value.contentHash, path: path.join(directory, fileName) };
}
function writeModelOutput(input) {
  var round = positiveInteger(input.round, 'trace.round'), entry = clone(input.entry);
  if (!entry || entry.stage !== 'planner-invoke' || entry.round !== round || typeof entry.dsl !== 'string') fail('SPATIAL_PLANNER_TRACE_INVALID', 'Model-output trace must contain the exact planner-invoke entry.');
  return write(input.traceDir, 'round-' + String(round).padStart(4, '0') + '-model-output.json', document('spatial-planner-model-output', input, { round: round, entry: entry }));
}
function writeRound(input) {
  var round = positiveInteger(input.round, 'trace.round'), entries = clone(input.entries);
  if (!Array.isArray(entries) || !entries.length || entries.some(function(entry) { return entry.round !== round; })) fail('SPATIAL_PLANNER_TRACE_INVALID', 'Round trace entries must belong to one planner round.');
  return write(input.traceDir, 'round-' + String(round).padStart(4, '0') + '.json', document('spatial-planner-round-trace', input, { round: round, entries: entries }));
}
function writeRun(input) {
  if (!Array.isArray(input.entries) || !Array.isArray(input.modelOutputs) || !Array.isArray(input.rounds)) fail('SPATIAL_PLANNER_TRACE_INVALID', 'Run trace requires entries and artifact receipts.');
  return write(input.traceDir, 'run.json', document('spatial-planner-run-trace', input, { status: text(input.status, 'trace.status'), completedRounds: input.completedRounds, entries: clone(input.entries), modelOutputs: clone(input.modelOutputs), rounds: clone(input.rounds) }));
}

module.exports = { writeModelOutput: writeModelOutput, writeRound: writeRound, writeRun: writeRun };
