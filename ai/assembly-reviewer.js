var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var projectExporter = require('./gdjs-html-project-exporter');
var png = require('./local-derivation-port');
var sourceContract = require('./game-semantic-source');
var productContract = require('../shared/product-delivery-contract.json');

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, {}); return value; }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0, 24); }
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function fail(code, message, review) { var error = new Error(message); error.code = code; error.owner = 'AssemblyReviewer'; if (review) error.assemblyReview = review; throw error; }
function object(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('ASSEMBLY_REVIEW_INVALID', label + ' must be an object.'); return value; }
function text(value, label) { if (typeof value !== 'string' || !value.trim()) fail('ASSEMBLY_REVIEW_INVALID', label + ' must be non-empty text.'); return value.trim(); }
function allowed(value, fields, label) { Object.keys(value).forEach(function(field) { if (fields.indexOf(field) < 0) fail('ASSEMBLY_REVIEW_INVALID', label + ' contains unknown field: ' + field); }); }
function verifyHash(value, prefix, label) { var core = clone(value); delete core.contentHash; if (value.contentHash !== prefix + digest(core)) fail('ASSEMBLY_REVIEW_HASH_INVALID', label + '.contentHash does not bind its content.'); }

function validateBrowserEvidence(value, expected) {
  object(value, 'GDJSBrowserCapture');
  allowed(value, ['schemaVersion', 'documentKind', 'sourceHash', 'assetWorldHash', 'spatialResolutionHash', 'finalProjectionHash', 'runtimeBuildHash', 'buildManifestHash', 'buildDir', 'browserFingerprint', 'pageUrl', 'imagePath', 'imageHash', 'viewport', 'consoleErrors', 'captureAttestation', 'contentHash'], 'GDJSBrowserCapture');
  if (value.schemaVersion !== 3 || value.documentKind !== 'gdjs-browser-capture') fail('ASSEMBLY_BROWSER_EVIDENCE_INVALID', 'Assembly review requires a current GDJS browser capture.');
  ['sourceHash', 'assetWorldHash', 'spatialResolutionHash', 'finalProjectionHash'].forEach(function(field) { if (text(value[field], field) !== expected[field]) fail('ASSEMBLY_BROWSER_EVIDENCE_MISMATCH', 'GDJS browser capture does not bind the accepted ' + field + '.'); });
  var runtimeBuildHash = text(value.runtimeBuildHash, 'runtimeBuildHash'), buildDir = path.resolve(text(value.buildDir, 'buildDir'));
  if (!fs.existsSync(buildDir) || !fs.statSync(buildDir).isDirectory()) fail('ASSEMBLY_BROWSER_EVIDENCE_MISSING', 'GDJS runtime build is unavailable.');
  var rebuilt = projectExporter.buildHash(buildDir), expectedManifestHash = 'gdjs-build-manifest.' + sha256(Buffer.from(JSON.stringify(rebuilt.files), 'utf8'));
  if (runtimeBuildHash !== rebuilt.runtimeBuildHash || text(value.buildManifestHash, 'buildManifestHash') !== expectedManifestHash) fail('ASSEMBLY_BROWSER_EVIDENCE_HASH_MISMATCH', 'GDJS browser capture no longer binds the exported runtime bytes.');
  text(value.browserFingerprint, 'browserFingerprint');
  var pageUrl = text(value.pageUrl, 'pageUrl'), parsed;
  try { parsed = new URL(pageUrl); } catch (error) { fail('ASSEMBLY_BROWSER_EVIDENCE_INVALID', 'GDJS browser capture pageUrl is invalid.'); }
  if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || !parsed.searchParams.get('capture')) fail('ASSEMBLY_BROWSER_EVIDENCE_INVALID', 'GDJS browser capture must come from the tokenized loopback build server.');
  var imagePath = path.resolve(text(value.imagePath, 'imagePath'));
  if (path.dirname(buildDir) !== path.dirname(imagePath)) fail('ASSEMBLY_BROWSER_EVIDENCE_INVALID', 'GDJS browser capture image and runtime build do not share one evidence root.');
  if (!fs.existsSync(imagePath)) fail('ASSEMBLY_BROWSER_EVIDENCE_MISSING', 'GDJS browser capture image is unavailable.');
  var imageBytes = fs.readFileSync(imagePath), decoded;
  if (text(value.imageHash, 'imageHash') !== sha256(imageBytes)) fail('ASSEMBLY_BROWSER_EVIDENCE_HASH_MISMATCH', 'GDJS browser capture imageHash does not bind the captured bytes.');
  object(value.viewport, 'viewport');
  if (!Number.isInteger(value.viewport.width) || !Number.isInteger(value.viewport.height) || value.viewport.width < 1 || value.viewport.height < 1) fail('ASSEMBLY_BROWSER_EVIDENCE_INVALID', 'GDJS browser capture viewport must use positive integer pixels.');
  try { decoded = png.decodePng(imageBytes); } catch (error) { fail('ASSEMBLY_BROWSER_EVIDENCE_INVALID', 'GDJS browser capture screenshot is not a valid PNG.'); }
  if (decoded.width !== value.viewport.width || decoded.height !== value.viewport.height) fail('ASSEMBLY_BROWSER_EVIDENCE_INVALID', 'GDJS browser capture screenshot pixels do not equal its viewport.');
  if (!Array.isArray(value.consoleErrors) || value.consoleErrors.length) fail('ASSEMBLY_BROWSER_EVIDENCE_INVALID', 'GDJS browser capture must be free of runtime, console, and network errors.');
  object(value.captureAttestation, 'captureAttestation'); allowed(value.captureAttestation, ['schemaVersion', 'documentKind', 'algorithm', 'keyId', 'signature'], 'captureAttestation');
  if (value.captureAttestation.schemaVersion !== 1 || value.captureAttestation.documentKind !== 'gdjs-browser-capture-attestation' || value.captureAttestation.algorithm !== 'hmac-sha256') fail('ASSEMBLY_BROWSER_EVIDENCE_INVALID', 'GDJS browser capture attestation contract is invalid.');
  text(value.captureAttestation.keyId, 'captureAttestation.keyId'); text(value.captureAttestation.signature, 'captureAttestation.signature');
  verifyHash(value, 'gdjs-browser-capture.', 'GDJSBrowserCapture');
  return clone(value);
}

function validateTarget(target, label) {
  object(target, label); allowed(target, ['collection', 'semanticId'], label);
  var collection = text(target.collection, label + '.collection'), semanticId = text(target.semanticId, label + '.semanticId');
  if (['entities', 'components', 'events', 'assetIntents', 'layoutIntents'].indexOf(collection) < 0) fail('ASSEMBLY_REVIEW_TARGET_INVALID', 'Assembly observation target collection is not semantic truth: ' + collection);
  return { collection: collection, semanticId: semanticId };
}
function validateObservation(value, index, browserCaptureHash, sourceIds, viewport) {
  var label = 'observations[' + index + ']'; object(value, label); allowed(value, ['code', 'description', 'targets', 'evidence'], label);
  var forbidden = ['suggestedFix', 'repairOwner', 'nextAction', 'route', 'command'];
  forbidden.forEach(function(field) { if (Object.prototype.hasOwnProperty.call(value, field)) fail('ASSEMBLY_REVIEW_REPAIR_FORBIDDEN', 'Assembly Reviewer may report facts but cannot author repair field: ' + field); });
  if (!Array.isArray(value.targets) || !value.targets.length) fail('ASSEMBLY_REVIEW_TARGET_REQUIRED', 'Assembly observation requires exact semantic targets.');
  object(value.evidence, label + '.evidence'); allowed(value.evidence, ['browserCaptureHash', 'visualFact', 'screenshotRegion'], label + '.evidence');
  if (value.evidence.browserCaptureHash !== browserCaptureHash) fail('ASSEMBLY_REVIEW_EVIDENCE_MISMATCH', 'Assembly observation must bind the exact browser capture.');
  if (productContract.semanticAssemblyObservationCodes.indexOf(value.code) < 0) fail('ASSEMBLY_REVIEW_CODE_INVALID', 'Assembly observation code is outside the factual product taxonomy: ' + value.code);
  text(value.evidence.visualFact, label + '.evidence.visualFact');
  if (value.evidence.screenshotRegion !== null) {
    object(value.evidence.screenshotRegion, label + '.evidence.screenshotRegion'); allowed(value.evidence.screenshotRegion, ['x', 'y', 'width', 'height'], label + '.evidence.screenshotRegion');
    ['x', 'y', 'width', 'height'].forEach(function(field) { if (!Number.isFinite(value.evidence.screenshotRegion[field])) fail('ASSEMBLY_REVIEW_EVIDENCE_INVALID', label + '.evidence.screenshotRegion.' + field + ' must be finite.'); });
    var region = value.evidence.screenshotRegion;
    if (region.x < 0 || region.y < 0 || region.width <= 0 || region.height <= 0 || region.x + region.width > viewport.width || region.y + region.height > viewport.height) fail('ASSEMBLY_REVIEW_EVIDENCE_INVALID', label + '.evidence.screenshotRegion must be a positive rectangle inside the attested viewport.');
  }
  var seenTargets = Object.create(null);
  var targets = value.targets.map(function(target, targetIndex) {
    var checked = validateTarget(target, label + '.targets[' + targetIndex + ']');
    if (!sourceIds[checked.collection] || !sourceIds[checked.collection][checked.semanticId]) fail('ASSEMBLY_REVIEW_TARGET_INVALID', 'Assembly observation targets a semantic id absent from Source: ' + checked.collection + '/' + checked.semanticId);
    var key = checked.collection + '/' + checked.semanticId;
    if (seenTargets[key]) fail('ASSEMBLY_REVIEW_TARGET_INVALID', 'Assembly observation repeats semantic target: ' + key);
    seenTargets[key] = true;
    return checked;
  });
  return { code: text(value.code, label + '.code'), description: text(value.description, label + '.description'), targets: targets, evidence: clone(value.evidence) };
}

async function review(input, captureVerifier, reviewerPort) {
  input = input || {};
  allowed(input, ['requestNamespace', 'projectId', 'assetProduct', 'spatialProduct', 'browserEvidence', 'assetCards'], 'AssemblyReviewer input');
  var requestNamespace = text(input.requestNamespace, 'requestNamespace'), projectId = text(input.projectId, 'projectId');
  var assetProduct = object(input.assetProduct, 'assetProduct'), spatialProduct = object(input.spatialProduct, 'spatialProduct');
  if (assetProduct.schemaVersion !== 2 || assetProduct.documentKind !== 'semantic-asset-product' || !assetProduct.assetState || !assetProduct.assetState.assetWorld || !assetProduct.artifact) fail('ASSEMBLY_REVIEW_PRODUCT_INVALID', 'Assembly review requires one current accepted semantic asset product.');
  if (spatialProduct.schemaVersion !== 3 || spatialProduct.documentKind !== 'semantic-spatial-product' || !spatialProduct.resolution || !spatialProduct.acceptedProjection) fail('ASSEMBLY_REVIEW_PRODUCT_INVALID', 'Assembly review requires one current accepted semantic spatial product.');
  verifyHash(assetProduct, 'semantic-asset-product.', 'SemanticAssetProduct');
  verifyHash(spatialProduct, 'semantic-spatial-product.', 'SemanticSpatialProduct');
  var expected = {
    sourceHash: assetProduct.sourceHash,
    assetWorldHash: assetProduct.assetState.assetWorld.contentHash,
    spatialResolutionHash: spatialProduct.resolution.contentHash,
    finalProjectionHash: spatialProduct.acceptedProjection.contentHash
  };
  if (spatialProduct.sourceHash !== expected.sourceHash || spatialProduct.acceptedProjection.assetWorldHash !== expected.assetWorldHash) fail('ASSEMBLY_REVIEW_PRODUCT_MISMATCH', 'Assembly review products do not share one source and AssetWorld.');
  var browserEvidence = validateBrowserEvidence(input.browserEvidence, expected);
  if (typeof captureVerifier !== 'function') fail('ASSEMBLY_REVIEWER_UNAVAILABLE', 'Assembly review requires the product-owned browser capture authority.');
  captureVerifier(browserEvidence);
  if (!reviewerPort || typeof reviewerPort.reviewAssembly !== 'function') fail('ASSEMBLY_REVIEWER_UNAVAILABLE', 'An independent Assembly Reviewer port is required.');
  var source = sourceContract.validateSource(assetProduct.source);
  if (sourceContract.sourceHash(source) !== expected.sourceHash) fail('ASSEMBLY_REVIEW_PRODUCT_MISMATCH', 'Assembly review source does not bind assetProduct.sourceHash.');
  var sourceIds = {};
  ['entities', 'components', 'events', 'assetIntents', 'layoutIntents'].forEach(function(collection) { sourceIds[collection] = Object.create(null); (source[collection] || []).forEach(function(item) { sourceIds[collection][item.semanticId] = true; }); });
  var raw = await reviewerPort.reviewAssembly({ requestNamespace: requestNamespace, projectId: projectId, source: clone(source), assetCards: clone(input.assetCards || null), assetProductHash: assetProduct.contentHash, spatialProductHash: spatialProduct.contentHash, resolutionHash: expected.spatialResolutionHash, projectionHash: expected.finalProjectionHash, browserEvidence: clone(browserEvidence) });
  object(raw, 'AssemblyReviewer result'); allowed(raw, ['receiptId', 'modelFingerprint', 'decision', 'observations'], 'AssemblyReviewer result');
  var decision = text(raw.decision, 'decision');
  if (decision !== 'accepted' && decision !== 'rejected') fail('ASSEMBLY_REVIEW_DECISION_INVALID', 'Assembly Reviewer decision must be accepted or rejected.');
  if (!Array.isArray(raw.observations)) fail('ASSEMBLY_REVIEW_INVALID', 'Assembly Reviewer observations must be an array.');
  var observations = raw.observations.map(function(observation, index) { return validateObservation(observation, index, browserEvidence.contentHash, sourceIds, browserEvidence.viewport); });
  if (decision === 'accepted' && observations.length) fail('ASSEMBLY_REVIEW_DECISION_INVALID', 'Accepted assembly review cannot retain unresolved observations.');
  if (decision === 'rejected' && !observations.length) fail('ASSEMBLY_REVIEW_DECISION_INVALID', 'Rejected assembly review requires factual observations.');
  var result = {
    schemaVersion: 1,
    documentKind: 'assembly-review-receipt',
    sourceHash: expected.sourceHash,
    assetWorldHash: expected.assetWorldHash,
    spatialResolutionHash: expected.spatialResolutionHash,
    finalProjectionHash: expected.finalProjectionHash,
    browserCaptureHash: browserEvidence.contentHash,
    receiptId: text(raw.receiptId, 'receiptId'),
    modelFingerprint: text(raw.modelFingerprint, 'modelFingerprint'),
    decision: decision,
    observations: observations
  };
  result.contentHash = 'assembly-review-receipt.' + digest(result);
  if (decision === 'rejected') fail('ASSEMBLY_REVIEW_REJECTED', 'Independent Assembly Reviewer rejected the browser-proven product.', result);
  return result;
}

function create(options) {
  options = options || {};
  allowed(options, ['captureVerifier', 'reviewerPort'], 'AssemblyReviewer options');
  if (typeof options.captureVerifier !== 'function') fail('ASSEMBLY_REVIEWER_UNAVAILABLE', 'AssemblyReviewer requires a captureVerifier at composition time.');
  if (!options.reviewerPort || typeof options.reviewerPort.reviewAssembly !== 'function') fail('ASSEMBLY_REVIEWER_UNAVAILABLE', 'AssemblyReviewer requires a reviewerPort at composition time.');
  return { review: function(input) { return review(input, options.captureVerifier, options.reviewerPort); } };
}

module.exports = { create: create, validateBrowserEvidence: validateBrowserEvidence };
