var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var semanticFeedback = require('./semantic-feedback');

var ROOT = path.join(__dirname, '..');
var UNIVERSE_PATH = path.join(__dirname, 'gdevelop-truth', 'capability-universe.json');

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function slug(value) { return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unnamed'; }
function humanize(value) {
  return String(value || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_:-]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Unnamed capability';
}
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(value).sort().map(function(key) { return JSON.stringify(key) + ':' + stableStringify(value[key]); }).join(',') + '}';
}
function stableIds(universe) { return universe.capabilities.map(function(item) { return item.id; }).sort(); }
function universeFingerprint(universe) {
  var ids = stableIds(universe);
  var contract = { capabilities: universe.capabilities, families: universe.families, runtime_overrides: universe.runtimeOverrides };
  return {
    capability_count: ids.length,
    capability_id_sha1: crypto.createHash('sha1').update(ids.join('\n')).digest('hex'),
    capability_contract_sha1: crypto.createHash('sha1').update(stableStringify(contract)).digest('hex'),
  };
}
function sameFingerprint(left, right) {
  return left && right && left.capability_count === right.capability_count && left.capability_id_sha1 === right.capability_id_sha1 && left.capability_contract_sha1 === right.capability_contract_sha1;
}
function effectiveContract(capability, families) {
  var family = capability.inherits ? families[capability.inherits] : null;
  return {
    family_id: capability.inherits || null,
    parameters: clone(family ? family.parameters : capability.parameters),
    parameter_macros: clone(family ? family.parameterMacros : capability.parameterMacros),
    flags: clone(family ? family.flags : capability.flags),
  };
}
function renderTemplate(template, values) {
  return template.replace(/\{([a-z_]+)\}/g, function(_, key) { return values[key] || 'unnamed'; });
}
function semanticValues(capability) {
  return { extension: slug(capability.extension), owner_kind: slug(capability.owner.kind), owner: slug(capability.owner.id), kind: slug(capability.kind), local: slug(capability.localId) };
}
function concreteSemantic(policy, capability) {
  return renderTemplate(policy.derivation.concrete_semantic, semanticValues(capability));
}
function abstractSemantics(policy, capability) {
  var values = semanticValues(capability);
  return [
    'gdjs_capability',
    renderTemplate(policy.derivation.kind_parent, values),
    renderTemplate(policy.derivation.extension_parent, values),
    renderTemplate(policy.derivation.owner_parent, values),
  ];
}
function productProofIds(mapping) {
  var ids = {};
  Object.keys(mapping.implementation_bindings || {}).forEach(function(bindingId) {
    ((mapping.implementation_bindings[bindingId] || {}).gdjs_capability_ids || []).forEach(function(id) { ids[id] = true; });
  });
  return ids;
}
function buildIndex(options) {
  options = options || {};
  var mapping = options.mapping || semanticFeedback.loadSemanticMapping();
  var universe = options.universe || readJson(UNIVERSE_PATH);
  var policy = mapping.capability_semantic_policy;
  if (!policy || policy.schemaVersion !== 1) throw new Error('capability_semantic_policy schemaVersion 1 is required');
  if (!policy.derivation || !policy.derivation.concrete_semantic || !policy.derivation.kind_parent || !policy.derivation.extension_parent || !policy.derivation.owner_parent) {
    throw new Error('capability_semantic_policy derivation templates are required');
  }
  var fingerprint = universeFingerprint(universe);
  var families = {};
  (universe.families || []).forEach(function(family) { families[family.id] = family; });
  var proofIds = productProofIds(mapping);
  var byCapability = {};
  var bySemantic = {};
  var byAbstractSemantic = {};

  universe.capabilities.forEach(function(capability) {
    var semanticId = concreteSemantic(policy, capability);
    var abstractIds = abstractSemantics(policy, capability);
    var exposure = proofIds[capability.id] ? 'internal_product_proof' : policy.default_exposure;
    var entry = {
      capability_id: capability.id,
      abstract_semantic_ids: abstractIds,
      semantic_id: semanticId,
      semantic_label: humanize(capability.localId),
      semantic_meaning: [humanize(capability.kind), humanize(capability.localId), 'for', humanize(capability.owner.id)].join(' '),
      inheritance: {
        family_id: capability.inherits || null,
        kind_semantic_id: abstractIds[1],
        extension_semantic_id: abstractIds[2],
        owner_semantic_id: abstractIds[3],
      },
      parameter_contract: effectiveContract(capability, families),
      implementation_route: {
        kind: 'gdjs_capability',
        extension: capability.extension,
        owner: clone(capability.owner),
        runtime: clone(capability.runtime),
        source: clone(capability.source),
      },
      exposure: { status: exposure, llm2: false },
    };
    byCapability[capability.id] = entry;
    if (!bySemantic[semanticId]) bySemantic[semanticId] = [];
    bySemantic[semanticId].push(capability.id);
    abstractIds.forEach(function(id) {
      if (!byAbstractSemantic[id]) byAbstractSemantic[id] = [];
      byAbstractSemantic[id].push(capability.id);
    });
  });
  Object.keys(bySemantic).forEach(function(id) { bySemantic[id].sort(); });
  Object.keys(byAbstractSemantic).forEach(function(id) { byAbstractSemantic[id].sort(); });
  return {
    schemaVersion: 1,
    policy: { reviewed_universe: clone(policy.reviewed_universe), default_exposure: policy.default_exposure },
    universe: fingerprint,
    summary: {
      capability_count: universe.capabilities.length,
      covered_count: Object.keys(byCapability).length,
      uncovered_count: universe.capabilities.length - Object.keys(byCapability).length,
      semantic_count: Object.keys(bySemantic).length,
      abstract_semantic_count: Object.keys(byAbstractSemantic).length,
    },
    by_capability: byCapability,
    by_semantic: bySemantic,
    by_abstract_semantic: byAbstractSemantic,
  };
}

module.exports = { UNIVERSE_PATH: UNIVERSE_PATH, readJson: readJson, universeFingerprint: universeFingerprint, sameFingerprint: sameFingerprint, buildIndex: buildIndex };
