var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var headlessPort = require('./gdjs-headless-browser-capture-port');
var projectExporter = require('./gdjs-html-project-exporter');
var png = require('./local-derivation-port');

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, {}); return value; }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0, 24); }
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'GDJSBrowserCapture'; throw error; }
function text(value, label) { if (typeof value !== 'string' || !value.trim()) fail('GDJS_BROWSER_CAPTURE_INVALID', label + ' must be non-empty text.'); return value.trim(); }
function allowed(value, fields, label) { Object.keys(value || {}).forEach(function(field) { if (fields.indexOf(field) < 0) fail('GDJS_BROWSER_CAPTURE_INVALID', label + ' contains unknown field: ' + field); }); }

function create(options) {
  var port = headlessPort.create(options || {});
  var attestationKey = crypto.randomBytes(32), attestationKeyId = 'gdjs-capture-key.' + sha256(attestationKey).slice(0, 24);
  function attestationSignature(value) { return crypto.createHmac('sha256', attestationKey).update(JSON.stringify(stable(value))).digest('hex'); }
  function verifyAttestation(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || !value.captureAttestation || typeof value.captureAttestation !== 'object' || Array.isArray(value.captureAttestation)) fail('GDJS_BROWSER_CAPTURE_ATTESTATION_INVALID', 'Browser evidence has no product-owned capture attestation.');
    var attestation = value.captureAttestation;
    allowed(attestation, ['schemaVersion', 'documentKind', 'algorithm', 'keyId', 'signature'], 'GDJS browser capture attestation');
    if (attestation.schemaVersion !== 1 || attestation.documentKind !== 'gdjs-browser-capture-attestation' || attestation.algorithm !== 'hmac-sha256' || attestation.keyId !== attestationKeyId || typeof attestation.signature !== 'string' || !/^[a-f0-9]{64}$/.test(attestation.signature)) fail('GDJS_BROWSER_CAPTURE_ATTESTATION_INVALID', 'Browser evidence attestation identity is invalid.');
    var core = clone(value); delete core.contentHash; delete core.captureAttestation;
    var expected = Buffer.from(attestationSignature(core), 'hex'), actual = Buffer.from(attestation.signature, 'hex');
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) fail('GDJS_BROWSER_CAPTURE_ATTESTATION_INVALID', 'Browser evidence was not issued by this product-owned real-browser capture authority.');
    return true;
  }
  async function capture(input) {
    input = input || {};
    allowed(input, ['assetProduct', 'spatialProduct', 'outputDir'], 'GDJS browser capture input');
    var assetProduct = input.assetProduct, spatialProduct = input.spatialProduct;
    if (!assetProduct || !assetProduct.assetState || !assetProduct.assetState.assetWorld || !spatialProduct || !spatialProduct.resolution || !spatialProduct.acceptedProjection) fail('GDJS_BROWSER_CAPTURE_PRODUCT_INVALID', 'Browser capture requires accepted asset and spatial products.');
    var outputRoot = path.resolve(text(input.outputDir, 'outputDir'));
    var raw = await port.captureAcceptedProjection({ assetProduct: clone(assetProduct), spatialProduct: clone(spatialProduct), outputDir: outputRoot });
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('GDJS_BROWSER_CAPTURE_INVALID', 'Headless browser returned no evidence.');
    allowed(raw, ['runtimeBuildHash', 'buildManifestHash', 'buildDir', 'browserFingerprint', 'pageUrl', 'imagePath', 'viewport', 'consoleErrors'], 'Headless browser evidence');
    var buildDir = path.resolve(text(raw.buildDir, 'buildDir'));
    if (buildDir !== outputRoot && buildDir.indexOf(outputRoot + path.sep) !== 0) fail('GDJS_BROWSER_CAPTURE_PATH_INVALID', 'Runtime build escaped its capture output root.');
    var rebuilt = projectExporter.buildHash(buildDir);
    var runtimeBuildHash = text(raw.runtimeBuildHash, 'runtimeBuildHash');
    if (runtimeBuildHash !== rebuilt.runtimeBuildHash) fail('GDJS_BROWSER_CAPTURE_BUILD_HASH_MISMATCH', 'Runtime build bytes changed after browser capture.');
    var expectedManifestHash = 'gdjs-build-manifest.' + sha256(Buffer.from(JSON.stringify(rebuilt.files), 'utf8'));
    if (text(raw.buildManifestHash, 'buildManifestHash') !== expectedManifestHash) fail('GDJS_BROWSER_CAPTURE_BUILD_HASH_MISMATCH', 'Build manifest does not bind every exported runtime byte.');
    var imagePath = path.resolve(text(raw.imagePath, 'imagePath'));
    if (path.dirname(imagePath) !== outputRoot || !fs.existsSync(imagePath)) fail('GDJS_BROWSER_CAPTURE_IMAGE_MISSING', 'Real-browser screenshot is unavailable inside the capture output root.');
    if (!raw.viewport || !Number.isInteger(raw.viewport.width) || !Number.isInteger(raw.viewport.height) || raw.viewport.width < 1 || raw.viewport.height < 1) fail('GDJS_BROWSER_CAPTURE_INVALID', 'Browser viewport must use positive integer pixels.');
    var imageBytes = fs.readFileSync(imagePath), decoded;
    try { decoded = png.decodePng(imageBytes); } catch (error) { fail('GDJS_BROWSER_CAPTURE_IMAGE_INVALID', 'Real-browser screenshot is not a valid PNG: ' + error.message); }
    if (decoded.width !== raw.viewport.width || decoded.height !== raw.viewport.height) fail('GDJS_BROWSER_CAPTURE_VIEWPORT_MISMATCH', 'Screenshot pixels do not equal the captured viewport.');
    if (!Array.isArray(raw.consoleErrors) || raw.consoleErrors.length) fail('GDJS_BROWSER_CAPTURE_RUNTIME_ERROR', 'Accepted browser evidence cannot contain runtime, console, or network errors.');
    var pageUrl = text(raw.pageUrl, 'pageUrl'), parsed;
    try { parsed = new URL(pageUrl); } catch (error) { fail('GDJS_BROWSER_CAPTURE_PAGE_INVALID', 'Browser evidence pageUrl is invalid.'); }
    if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || !parsed.searchParams.get('capture')) fail('GDJS_BROWSER_CAPTURE_PAGE_INVALID', 'Browser evidence must come from the tokenized loopback build server.');
    var result = {
      schemaVersion: 3,
      documentKind: 'gdjs-browser-capture',
      sourceHash: assetProduct.sourceHash,
      assetWorldHash: assetProduct.assetState.assetWorld.contentHash,
      spatialResolutionHash: spatialProduct.resolution.contentHash,
      finalProjectionHash: spatialProduct.acceptedProjection.contentHash,
      runtimeBuildHash: runtimeBuildHash,
      buildManifestHash: expectedManifestHash,
      buildDir: buildDir,
      browserFingerprint: text(raw.browserFingerprint, 'browserFingerprint'),
      pageUrl: pageUrl,
      imagePath: imagePath,
      imageHash: sha256(imageBytes),
      viewport: clone(raw.viewport),
      consoleErrors: []
    };
    result.captureAttestation = { schemaVersion: 1, documentKind: 'gdjs-browser-capture-attestation', algorithm: 'hmac-sha256', keyId: attestationKeyId, signature: attestationSignature(result) };
    result.contentHash = 'gdjs-browser-capture.' + digest(result);
    return result;
  }
  return { capture: capture, verifyAttestation: verifyAttestation };
}

var defaultCapture = create();
module.exports = { create: create, capture: defaultCapture.capture, verifyAttestation: defaultCapture.verifyAttestation };
