var assert = require('assert');
var dictionary = require('../../packages/semantic/src/capability-semantic-dictionary');
var index = dictionary.readJson(require('path').join(__dirname, '..', '..', 'packages', 'semantic', 'generated', 'capability-semantic-index.json'));
var universe = dictionary.readJson(dictionary.UNIVERSE_PATH);
var bindings = dictionary.readJson(dictionary.OFFICIAL_BINDINGS_PATH);

var fresh = dictionary.buildIndex({ universe: universe, officialBindings: bindings });
assert.strictEqual(index.schemaVersion, 3, 'GDJS Semantic Dictionary schemaVersion mismatch');
assert.strictEqual(index.dictionaryKind, 'gdjs-semantic-dictionary', 'GDJS Semantic Dictionary kind mismatch');
assert(dictionary.sameFingerprint(index.source, fresh.source), 'GDJS Semantic Dictionary is built from a different pinned source truth');
assert.strictEqual(typeof index.source.layoutDictionaryHash, 'string', 'The source fingerprint must pin the semantic layout dictionary.');
assert.strictEqual(typeof index.source.assetBindingDictionaryHash, 'string', 'The source fingerprint must pin the GDJS asset binding dictionary.');
assert.strictEqual(typeof index.source.componentDictionaryHash, 'string', 'The source fingerprint must pin the component dictionary.');
assert.strictEqual(index.summary.capabilityCount, universe.capabilities.length, 'every GDJS no-code declaration must be represented');
assert.strictEqual(index.summary.interpretableCapabilityCount, universe.capabilities.length, 'every GDJS no-code declaration must have official explanatory text');
assert.strictEqual(Object.keys(index.by_capability).length, universe.capabilities.length, 'dictionary capability coverage mismatch');
assert.strictEqual(index.summary.executableCapabilityCount, Object.keys(bindings.bindings).length, 'runtime binding coverage mismatch');
assert.strictEqual(index.summary.sourceOnlyCapabilityCount, universe.capabilities.length - Object.keys(bindings.bindings).length, 'source-only declaration count mismatch');
assert.strictEqual(universe.unresolvedDeclarations.length, 0, 'dictionary source contains unresolved declarations');
assert.strictEqual(Object.keys(index.by_component).length, index.summary.componentCount, 'component dictionary coverage mismatch');
Object.keys(index.by_component).forEach(function(componentId) {
  var entry = index.by_component[componentId];
  assert.strictEqual(dictionary.resolveComponent(index, entry.semantic_id).component_id, componentId, componentId + ' component resolution is not unique');
  assert(entry.source && entry.source.kind === 'component-manifest', componentId + ' lacks component source evidence');
  assert(entry.runtime && (entry.runtime.status === 'executable' || entry.runtime.status === 'source-only'), componentId + ' lacks explicit component execution status');
});
assert(index.event_grammar && Array.isArray(index.event_grammar.eventTypes) && index.event_grammar.eventTypes.length === index.summary.eventTypeCount, 'full GDJS event grammar is missing');
index.event_grammar.eventTypes.forEach(function(eventType) {
  assert(eventType.eventType && eventType.explanation.title && eventType.explanation.description, 'event grammar lacks explanatory source text');
  assert(eventType.grammar && Object.prototype.hasOwnProperty.call(eventType.grammar, 'canHaveSubEvents'), eventType.eventType + ' lacks an explicit subevent grammar status');
});
(universe.semanticTypes || []).forEach(function(type) {
  var collection = type.kind === 'object' ? index.by_object_type : index.by_behavior_type;
  var entry = collection[type.id];
  assert(entry, 'every declared GDJS ' + type.kind + ' type must be represented: ' + type.id);
  assert(entry.semantic_id && entry.owner && entry.owner.id === type.id, type.id + ' lacks a deterministic type reference');
  assert(entry.explanation && entry.explanation.title && entry.explanation.descriptionStatus, type.id + ' lacks declared or explicitly unavailable explanatory metadata');
  assert(Array.isArray(entry.source) && entry.source.length, type.id + ' lacks source evidence');
  assert(entry.runtime && (entry.runtime.status === 'executable' || entry.runtime.status === 'source-only'), type.id + ' lacks explicit materialization status');
  if (type.kind === 'object' && entry.runtime.status === 'executable') {
    assert(entry.configuration && entry.configuration.status === 'executable' && entry.configuration.configurationType && Array.isArray(entry.configuration.methods) && Object.prototype.hasOwnProperty.call(entry.configuration, 'defaultData'), type.id + ' lacks official object configuration truth');
  }
});

Object.keys(index.by_capability).forEach(function(capabilityId) {
  var entry = index.by_capability[capabilityId];
  assert(entry.semantic_id && index.by_semantic[entry.semantic_id], capabilityId + ' lacks deterministic semantic reference');
  assert(entry.explanation && entry.explanation.title && entry.explanation.description, capabilityId + ' lacks official explanatory text');
  assert(entry.source && entry.source.path && entry.source.line, capabilityId + ' lacks source evidence');
  assert(entry.parameter_contract && Array.isArray(entry.parameter_contract.parameters), capabilityId + ' lacks parameter semantics');
  assert(entry.event_contract && entry.event_contract.eventSlot && entry.event_contract.role, capabilityId + ' lacks event grammar role');
  assert(entry.event_contract.selectionEffect.status === 'not-declared-by-capability-metadata', capabilityId + ' must not invent object-selection semantics');
  assert(entry.binding && (entry.binding.status === 'executable' || entry.binding.status === 'source-only'), capabilityId + ' lacks explicit execution status');
  assert.strictEqual(dictionary.resolve(index, entry.semantic_id).capability_id, capabilityId, capabilityId + ' semantic resolution is not unique');
});

var keyboardResults = dictionary.search(index, 'key pressed', 20);
assert(keyboardResults.length > 0, 'official explanatory-text search must discover keyboard semantics');
assert(keyboardResults.every(function(entry) { return entry.explanation.description; }), 'search must return explainable semantics');
assert(dictionary.listOwners(index).length === index.summary.ownerCount, 'owner query coverage mismatch');

var appOpen = index.by_capability['AdMob::global::extension::action::LoadAppOpen'];
assert(appOpen, 'pinned GDJS source fixture is missing AdMob.LoadAppOpen');
assert.strictEqual(appOpen.parameter_contract.parameters[0].label, 'Android app open ID', 'parameter labels must preserve the official short label');
assert(appOpen.parameter_contract.parameters[0].description.indexOf('AdMob account') >= 0, 'parameter long descriptions must preserve the official explanatory text');

console.log('[GDJSSemanticDictionary] ' + index.summary.interpretableCapabilityCount + '/' + index.summary.capabilityCount + ' source declarations are explainable; executable=' + index.summary.executableCapabilityCount + '; sourceOnly=' + index.summary.sourceOnlyCapabilityCount + '; objectTypes=' + index.summary.objectTypeCount + '; behaviorTypes=' + index.summary.behaviorTypeCount);
