var fs = require('fs');
var path = require('path');

var SCHEMA_VERSION = 2;
var RECORD_KIND = 'semantic-model-training-record';

function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'SemanticTrainingLog'; throw error; }
function safe(value) { return String(value || '').replace(/[^A-Za-z0-9_.-]/g, '_'); }
function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function assertSink(sink) {
  if (!sink || typeof sink.append !== 'function') fail('SEMANTIC_TRAINING_LOG_SINK_INVALID', 'Training log sink requires append(record).');
  return sink;
}
function record(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('SEMANTIC_TRAINING_LOG_RECORD_INVALID', 'Training record must be a structure.');
  if (value.phase !== 'planner' && value.phase !== 'executor') fail('SEMANTIC_TRAINING_LOG_RECORD_INVALID', 'Training record phase must be planner or executor.');
  return Object.assign({ schemaVersion: SCHEMA_VERSION, recordKind: RECORD_KIND }, clone(value));
}
function createFileSink(options) {
  options = options || {};
  if (typeof options.directory !== 'string' || !options.directory.trim()) fail('SEMANTIC_TRAINING_LOG_SINK_INVALID', 'File sink directory is required.');
  if (typeof options.runId !== 'string' || !options.runId.trim()) fail('SEMANTIC_TRAINING_LOG_SINK_INVALID', 'File sink runId is required.');
  var directory = path.resolve(options.directory), file = path.join(directory, safe(options.runId) + '.jsonl');
  fs.mkdirSync(directory, { recursive: true });
  return assertSink({
    kind: 'semantic-training-jsonl-sink',
    file: file,
    append: function(value) { var normalized = record(value); fs.appendFileSync(file, JSON.stringify(normalized) + '\n', 'utf8'); return { file: file, sequence: normalized.sequence }; }
  });
}

module.exports = { SCHEMA_VERSION: SCHEMA_VERSION, RECORD_KIND: RECORD_KIND, assertSink: assertSink, record: record, createFileSink: createFileSink };
