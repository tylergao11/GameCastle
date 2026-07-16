var crypto = require('crypto');
var contract = require('../contracts/asset-library-contract.json');
var frameSet = require('./frame-set');
var styleDNA = require('./style-dna');

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, {}); return value; }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'AssetLibrary'; throw error; }

function requirementView(requirement) {
  if (!requirement || typeof requirement !== 'object' || !requirement.semanticId || !requirement.description || !requirement.productionFamily || !requirement.recipeId || !requirement.styleId || !requirement.resourceKind || !Array.isArray(requirement.acceptedFormats) || !requirement.acceptedFormats.length) fail('ASSET_LIBRARY_REQUIREMENT_INVALID', 'AssetLibrary requires a complete semantic asset requirement.');
  return {
    description: requirement.description,
    semanticTags: (requirement.semanticTags || []).slice().sort(),
    productionFamily: requirement.productionFamily,
    recipeId: requirement.recipeId,
    styleId: requirement.styleId,
    styleContractFingerprint: styleDNA.styleFingerprint(requirement.styleId),
    constraints: clone(requirement.constraints || {}),
    animation: clone(requirement.animation || null),
    resourceKind: requirement.resourceKind,
    acceptedFormats: requirement.acceptedFormats.slice().map(function(value) { return String(value).toLowerCase(); }).sort(),
    gdjsAssetAdapterId: requirement.gdjsAssetAdapterId || null
  };
}
function requirementFingerprint(requirement) { return 'asset-requirement.' + hash(requirementView(requirement)); }
function assertRevision(revision, code) {
  if (frameSet.isFrameSet(revision)) return frameSet.validate(revision);
  if (!revision || typeof revision !== 'object' || !revision.revisionId || !revision.sha256 || !revision.resourceKind || !revision.format) fail(code || 'ASSET_LIBRARY_REVISION_INVALID', 'Single-resource AssetLibrary revisions require revisionId, sha256, resourceKind, and format.');
  return clone(revision);
}
function revisionMatches(expected, actual) {
  if (frameSet.isFrameSet(expected)) return frameSet.isFrameSet(actual) && actual.revisionId === expected.revisionId && actual.contentHash === expected.contentHash;
  if (actual.revisionId !== expected.revisionId || actual.sha256 !== expected.sha256 || actual.resourceKind !== expected.resourceKind || String(actual.format).toLowerCase() !== String(expected.format).toLowerCase()) return false;
  return !!actual.path;
}
function assertRecord(record, fingerprint) {
  if (!record || typeof record !== 'object' || !record.recordId || record.requirementFingerprint !== fingerprint || record.status !== 'published') fail('ASSET_LIBRARY_RECORD_INVALID', 'AssetLibrary returned an invalid published record.');
  return Object.assign({}, clone(record), { revision: assertRevision(record.revision, 'ASSET_LIBRARY_RECORD_INVALID') });
}
function create(port) {
  if (!port || typeof port.lookup !== 'function' || typeof port.materialize !== 'function' || typeof port.publish !== 'function') fail('ASSET_LIBRARY_PORT_INVALID', 'AssetLibrary requires lookup, materialize, and publish port operations.');
  async function lookup(requirement) {
    var view = requirementView(requirement), fingerprint = requirementFingerprint(requirement);
    var record = await port.lookup({ schemaVersion: contract.schemaVersion, requirementFingerprint: fingerprint, resourceKind: view.resourceKind, acceptedFormats: view.acceptedFormats, styleId: view.styleId, productionFamily: view.productionFamily, recipeId: view.recipeId });
    return record === null || record === undefined ? null : assertRecord(record, fingerprint);
  }
  async function materialize(record, context) {
    context = context || {};
    if (!record || !record.recordId) fail('ASSET_LIBRARY_MATERIALIZE_RECORD_INVALID', 'AssetLibrary materialization requires a published record.');
    if (!context.projectId || !context.targetDirectory) fail('ASSET_LIBRARY_MATERIALIZE_CONTEXT_INVALID', 'AssetLibrary materialization requires projectId and targetDirectory.');
    var materialized = await port.materialize({ recordId: record.recordId, revisionId: record.revision.revisionId, projectId: context.projectId, targetDirectory: context.targetDirectory });
    var revision = assertRevision(materialized, 'ASSET_LIBRARY_MATERIALIZE_INVALID');
    if (!revisionMatches(record.revision, revision)) fail('ASSET_LIBRARY_MATERIALIZE_INVALID', 'AssetLibrary materialization does not match its published revision.');
    return revision;
  }
  async function publish(requirement, revision, provenance) {
    var fingerprint = requirementFingerprint(requirement), accepted = assertRevision(revision, 'ASSET_LIBRARY_PUBLISH_REVISION_INVALID');
    if (accepted.status !== 'accepted') fail('ASSET_LIBRARY_PUBLISH_STATUS_INVALID', 'Only accepted revisions may enter AssetLibrary.');
    var published = await port.publish({ schemaVersion: contract.schemaVersion, requirementFingerprint: fingerprint, revision: accepted, provenance: clone(provenance || {}) });
    if (!published || !published.recordId || published.revisionId !== accepted.revisionId || published.published !== true) fail('ASSET_LIBRARY_PUBLISH_INVALID', 'AssetLibrary publish did not return an idempotent publication receipt.');
    return clone(published);
  }
  return { contract: contract, lookup: lookup, materialize: materialize, publish: publish, requirementFingerprint: requirementFingerprint, requirementView: requirementView };
}

module.exports = { create: create, requirementFingerprint: requirementFingerprint, requirementView: requirementView };
