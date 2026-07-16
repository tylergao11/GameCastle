var SCHEMA_VERSION = 3;
var DOCUMENT_KIND = 'semantic-feedback-batch';
var FEEDBACK_KINDS = {
  'user-observation': true,
  'playtest-observation': true,
  'runtime-observation': true,
  'asset-observation': true,
  'layout-observation': true,
  'assembly-observation': true
};
var TARGET_COLLECTIONS = {
  game: true,
  entities: true,
  components: true,
  events: true,
  assetIntents: true,
  layoutIntents: true
};
var FORBIDDEN_CONTROL_KEYS = {
  changescope: true,
  maxrounds: true,
  route: true,
  owner: true,
  repairowner: true,
  nextaction: true,
  command: true,
  suggestedfix: true,
  mutationscope: true,
  taskplan: true
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
  Object.keys(value).forEach(function(key) {
    text(key, label + ' key');
    var canonical = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (FORBIDDEN_CONTROL_KEYS[canonical]) fail('SEMANTIC_FEEDBACK_CONTROL_FIELD_FORBIDDEN', label + ' contains execution-control field: ' + key);
    scalarTree(value[key], label + '.' + key);
  });
}
function nullableHash(value, label) { if (value === null) return null; return text(value, label); }
function targetKey(target) { return target.collection + '/' + target.semanticId; }

function validateTarget(target, entryIndex, targetIndex, knownTargets) {
  var label = 'entries[' + entryIndex + '].targets[' + targetIndex + ']';
  object(target, label);
  allowed(target, ['collection', 'semanticId'], label);
  var collection = text(target.collection, label + '.collection');
  if (!TARGET_COLLECTIONS[collection]) fail('SEMANTIC_FEEDBACK_TARGET_COLLECTION_INVALID', label + '.collection is invalid: ' + collection);
  var valid = { collection: collection, semanticId: semanticId(target.semanticId, label + '.semanticId') };
  if (knownTargets && !knownTargets[targetKey(valid)]) fail('SEMANTIC_FEEDBACK_TARGET_UNKNOWN', 'Feedback target does not exist in the current source: ' + targetKey(valid));
  return valid;
}

function validateEntry(entry, index, knownTargets) {
  object(entry, 'entries[' + index + ']');
  allowed(entry, ['feedbackId', 'kind', 'targets', 'observation'], 'entries[' + index + ']');
  var feedbackId = semanticId(entry.feedbackId, 'entries[' + index + '].feedbackId');
  var kind = text(entry.kind, 'entries[' + index + '].kind');
  if (!FEEDBACK_KINDS[kind]) fail('SEMANTIC_FEEDBACK_KIND_INVALID', 'entries[' + index + '].kind is invalid: ' + kind);
  if (!Array.isArray(entry.targets) || !entry.targets.length) fail('SEMANTIC_FEEDBACK_TARGETS_REQUIRED', 'entries[' + index + '].targets must be a non-empty array');
  var seenTargets = Object.create(null);
  var targets = entry.targets.map(function(target, targetIndex) {
    var valid = validateTarget(target, index, targetIndex, knownTargets), key = targetKey(valid);
    if (seenTargets[key]) fail('SEMANTIC_FEEDBACK_DUPLICATE_TARGET', 'Feedback has duplicate target: ' + key);
    seenTargets[key] = true;
    return valid;
  });
  object(entry.observation, 'entries[' + index + '].observation');
  allowed(entry.observation, ['code', 'description', 'evidence'], 'entries[' + index + '].observation');
  semanticId(entry.observation.code, 'entries[' + index + '].observation.code');
  text(entry.observation.description, 'entries[' + index + '].observation.description');
  scalarTree(entry.observation.evidence, 'entries[' + index + '].observation.evidence');
  return { feedbackId: feedbackId, kind: kind, targets: targets, observation: clone(entry.observation) };
}

function targetsFromSource(source) {
  if (!source) return null;
  var targets = Object.create(null);
  function add(collection, semanticIdValue) { if (semanticIdValue) targets[targetKey({ collection: collection, semanticId: semanticIdValue })] = true; }
  if (source.game) add('game', source.game.semanticId);
  ['entities', 'components', 'assetIntents', 'layoutIntents'].forEach(function(collection) { (source[collection] || []).forEach(function(item) { add(collection, item.semanticId); }); });
  (function walk(events) { (events || []).forEach(function(event) { add('events', event.semanticId); walk(event.children); }); })(source.events);
  return targets;
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
  if (options.structureHash !== undefined && baseStructureHash !== options.structureHash) fail('SEMANTIC_FEEDBACK_STRUCTURE_MISMATCH', 'SemanticFeedbackBatch baseStructureHash does not match the current Source structure');
  if (!Array.isArray(batch.entries) || !batch.entries.length) fail('SEMANTIC_FEEDBACK_ENTRIES_REQUIRED', 'SemanticFeedbackBatch entries must be non-empty');
  var seen = Object.create(null);
  var knownTargets = targetsFromSource(options.source);
  var entries = batch.entries.map(function(entry, index) {
    var valid = validateEntry(entry, index, knownTargets);
    if (seen[valid.feedbackId]) fail('SEMANTIC_FEEDBACK_DUPLICATE_ID', 'SemanticFeedbackBatch has duplicate feedbackId: ' + valid.feedbackId);
    seen[valid.feedbackId] = true;
    return valid;
  });
  return { schemaVersion: SCHEMA_VERSION, documentKind: DOCUMENT_KIND, baseSourceHash: baseSourceHash, baseStructureHash: baseStructureHash, entries: entries };
}

module.exports = { SCHEMA_VERSION: SCHEMA_VERSION, DOCUMENT_KIND: DOCUMENT_KIND, FEEDBACK_KINDS: clone(FEEDBACK_KINDS), TARGET_COLLECTIONS: clone(TARGET_COLLECTIONS), FORBIDDEN_CONTROL_KEYS: clone(FORBIDDEN_CONTROL_KEYS), targetKey: targetKey, targetsFromSource: targetsFromSource, validate: validate };
