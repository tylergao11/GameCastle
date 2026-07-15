var SCHEMA_VERSION = 2;
var DOCUMENT_KIND = 'semantic-feedback-batch';
var FEEDBACK_KINDS = {
  'user-observation': true,
  'playtest-observation': true,
  'runtime-observation': true,
  'asset-observation': true,
  'layout-observation': true,
  'assembly-observation': true
};

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'SemanticFeedbackContract'; throw error; }
function object(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('SEMANTIC_FEEDBACK_INVALID', label + ' must be an object'); return value; }
function text(value, label) { if (typeof value !== 'string' || !value.trim()) fail('SEMANTIC_FEEDBACK_INVALID', label + ' must be a non-empty string'); return value.trim(); }
function semanticId(value, label) { value = text(value, label); if (!/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(value)) fail('SEMANTIC_FEEDBACK_INVALID', label + ' must be a semantic id'); return value; }
function allowed(value, keys, label) { Object.keys(value).forEach(function(key) { if (keys.indexOf(key) < 0) fail('SEMANTIC_FEEDBACK_UNKNOWN_FIELD', label + ' contains unknown field: ' + key); }); }
function scalar(value) { return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'; }
function scalarTree(value, label) {
  if (scalar(value)) return;
  if (Array.isArray(value)) { value.forEach(function(item, index) { scalarTree(item, label + '[' + index + ']'); }); return; }
  object(value, label);
  Object.keys(value).forEach(function(key) { text(key, label + ' key'); scalarTree(value[key], label + '.' + key); });
}
function nullableHash(value, label) { if (value === null) return null; return text(value, label); }

function validateEntry(entry, index, knownSubjects) {
  object(entry, 'entries[' + index + ']');
  allowed(entry, ['feedbackId', 'kind', 'subjectSemanticIds', 'observation'], 'entries[' + index + ']');
  var feedbackId = semanticId(entry.feedbackId, 'entries[' + index + '].feedbackId');
  var kind = text(entry.kind, 'entries[' + index + '].kind');
  if (!FEEDBACK_KINDS[kind]) fail('SEMANTIC_FEEDBACK_KIND_INVALID', 'entries[' + index + '].kind is invalid: ' + kind);
  if (!Array.isArray(entry.subjectSemanticIds)) fail('SEMANTIC_FEEDBACK_INVALID', 'entries[' + index + '].subjectSemanticIds must be an array');
  var subjects = entry.subjectSemanticIds.map(function(subject, subjectIndex) {
    var value = semanticId(subject, 'entries[' + index + '].subjectSemanticIds[' + subjectIndex + ']');
    if (knownSubjects && !knownSubjects[value]) fail('SEMANTIC_FEEDBACK_SUBJECT_UNKNOWN', 'Feedback references no semantic subject in the current source: ' + value);
    return value;
  });
  if (new Set(subjects).size !== subjects.length) fail('SEMANTIC_FEEDBACK_DUPLICATE_SUBJECT', 'Feedback has duplicate semantic subjects: ' + feedbackId);
  object(entry.observation, 'entries[' + index + '].observation');
  allowed(entry.observation, ['code', 'description', 'evidence'], 'entries[' + index + '].observation');
  semanticId(entry.observation.code, 'entries[' + index + '].observation.code');
  text(entry.observation.description, 'entries[' + index + '].observation.description');
  scalarTree(entry.observation.evidence, 'entries[' + index + '].observation.evidence');
  return { feedbackId: feedbackId, kind: kind, subjectSemanticIds: subjects, observation: clone(entry.observation) };
}

function subjectsFromSource(source) {
  if (!source) return null;
  var subjects = Object.create(null);
  if (source.game && source.game.semanticId) subjects[source.game.semanticId] = true;
  (source.entities || []).forEach(function(entity) { subjects[entity.semanticId] = true; });
  return subjects;
}

function validate(batch, options) {
  options = options || {};
  object(batch, 'SemanticFeedbackBatch');
  allowed(batch, ['schemaVersion', 'documentKind', 'baseSourceHash', 'baseStructureHash', 'entries'], 'SemanticFeedbackBatch');
  if (batch.schemaVersion !== SCHEMA_VERSION) fail('SEMANTIC_FEEDBACK_VERSION_INVALID', 'SemanticFeedbackBatch schemaVersion must be ' + SCHEMA_VERSION);
  if (batch.documentKind !== DOCUMENT_KIND) fail('SEMANTIC_FEEDBACK_KIND_INVALID', 'SemanticFeedbackBatch documentKind is invalid');
  var baseSourceHash = nullableHash(batch.baseSourceHash, 'SemanticFeedbackBatch.baseSourceHash');
  var baseStructureHash = nullableHash(batch.baseStructureHash, 'SemanticFeedbackBatch.baseStructureHash');
  if (options.sourceHash !== undefined && baseSourceHash !== options.sourceHash) fail('SEMANTIC_FEEDBACK_SOURCE_MISMATCH', 'SemanticFeedbackBatch baseSourceHash does not match the current source');
  if (options.structureHash !== undefined && baseStructureHash !== options.structureHash) fail('SEMANTIC_FEEDBACK_STRUCTURE_MISMATCH', 'SemanticFeedbackBatch baseStructureHash does not match the current world structure');
  if (!Array.isArray(batch.entries) || !batch.entries.length) fail('SEMANTIC_FEEDBACK_ENTRIES_REQUIRED', 'SemanticFeedbackBatch entries must be non-empty');
  var seen = Object.create(null);
  var knownSubjects = subjectsFromSource(options.source);
  var entries = batch.entries.map(function(entry, index) {
    var valid = validateEntry(entry, index, knownSubjects);
    if (seen[valid.feedbackId]) fail('SEMANTIC_FEEDBACK_DUPLICATE_ID', 'SemanticFeedbackBatch has duplicate feedbackId: ' + valid.feedbackId);
    seen[valid.feedbackId] = true;
    return valid;
  });
  return { schemaVersion: SCHEMA_VERSION, documentKind: DOCUMENT_KIND, baseSourceHash: baseSourceHash, baseStructureHash: baseStructureHash, entries: entries };
}

module.exports = { SCHEMA_VERSION: SCHEMA_VERSION, DOCUMENT_KIND: DOCUMENT_KIND, FEEDBACK_KINDS: clone(FEEDBACK_KINDS), validate: validate };
