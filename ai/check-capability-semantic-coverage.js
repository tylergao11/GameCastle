var assert = require('assert');
var path = require('path');
var semanticFeedback = require('./semantic-feedback');
var semanticDictionary = require('./capability-semantic-dictionary');

var INDEX_PATH = path.join(__dirname, 'semantic-mapping', 'capability-semantic-index.json');

function main() {
  var mapping = semanticFeedback.loadSemanticMapping();
  var index = semanticDictionary.readJson(INDEX_PATH);
  var fresh = semanticDictionary.buildIndex({ mapping: mapping });
  assert.strictEqual(index.schemaVersion, 1, 'capability semantic index schemaVersion mismatch');
  assert(semanticDictionary.sameFingerprint(mapping.capability_semantic_policy.reviewed_universe, fresh.universe), 'semantic policy needs explicit review for the current capability universe');
  assert(semanticDictionary.sameFingerprint(index.universe, fresh.universe), 'capability semantic index is built from a different universe');
  assert.strictEqual(index.summary.capability_count, fresh.summary.capability_count, 'capability count mismatch');
  assert.strictEqual(index.summary.covered_count, fresh.summary.covered_count, 'coverage count mismatch');
  assert.strictEqual(index.summary.covered_count, index.summary.capability_count, 'capability semantic coverage must be complete');
  assert.strictEqual(index.summary.uncovered_count, 0, 'capability semantic coverage has uncovered entries');
  var changedUniverse = semanticDictionary.readJson(semanticDictionary.UNIVERSE_PATH);
  changedUniverse.capabilities[0].runtime.functionName = '__semantic_contract_change_probe__';
  assert(!semanticDictionary.sameFingerprint(mapping.capability_semantic_policy.reviewed_universe, semanticDictionary.universeFingerprint(changedUniverse)), 'capability contract drift must require semantic review');
  Object.keys(index.by_capability).forEach(function(capabilityId) {
    var entry = index.by_capability[capabilityId];
    assert(entry.semantic_id && entry.abstract_semantic_ids.length, capabilityId + ' lacks semantic inheritance');
    assert(entry.semantic_label && entry.semantic_meaning, capabilityId + ' lacks concrete semantic meaning');
    assert(entry.inheritance && entry.inheritance.kind_semantic_id && entry.inheritance.extension_semantic_id && entry.inheritance.owner_semantic_id, capabilityId + ' lacks family extension owner inheritance');
    assert(entry.parameter_contract && Array.isArray(entry.parameter_contract.parameters), capabilityId + ' lacks parameter contract');
    assert(entry.implementation_route && entry.implementation_route.kind === 'gdjs_capability', capabilityId + ' lacks implementation route');
    assert(entry.exposure && entry.exposure.llm2 === false, capabilityId + ' must remain outside LLM2');
    assert(index.by_semantic[entry.semantic_id] && index.by_semantic[entry.semantic_id].indexOf(capabilityId) >= 0, capabilityId + ' missing reverse semantic lookup');
    entry.abstract_semantic_ids.forEach(function(id) { assert(index.by_abstract_semantic[id] && index.by_abstract_semantic[id].indexOf(capabilityId) >= 0, capabilityId + ' missing reverse abstract lookup'); });
  });
  Object.keys(index.by_semantic).forEach(function(semanticId) {
    assert(index.by_semantic[semanticId].length > 0, semanticId + ' has empty capability lookup');
    index.by_semantic[semanticId].forEach(function(capabilityId) {
      assert(index.by_capability[capabilityId] && index.by_capability[capabilityId].semantic_id === semanticId, semanticId + ' reverse lookup is inconsistent');
    });
  });
  Object.keys(index.by_abstract_semantic).forEach(function(semanticId) {
    assert(index.by_abstract_semantic[semanticId].length > 0, semanticId + ' has empty abstract capability lookup');
    index.by_abstract_semantic[semanticId].forEach(function(capabilityId) {
      assert(index.by_capability[capabilityId] && index.by_capability[capabilityId].abstract_semantic_ids.indexOf(semanticId) >= 0, semanticId + ' abstract reverse lookup is inconsistent');
    });
  });
  var llmView = semanticFeedback.buildSemanticMappingLlmView(mapping);
  var llmText = JSON.stringify(llmView);
  assert(llmText.indexOf('gdjs_capability') < 0 && llmText.indexOf('capability_semantic_policy') < 0, 'LLM2 view must not expose internal capability semantics');
  console.log('[CapabilitySemanticCoverage] ' + index.summary.covered_count + '/' + index.summary.capability_count + ' complete; semantic=' + index.summary.semantic_count);
}
main();
