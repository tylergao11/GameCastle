var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var frameSet = require('./frame-set');
var kernelModule = require('./local-derivation-kernel');
var png = require('./local-derivation-port');
var rembgModule = require('./rembg-background-removal');
var derivationContract = require('../shared/local-derivation-contract.json');

function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, {}); return value; }
function hash(value) { return crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value : JSON.stringify(stable(value))).digest('hex'); }
function fail(code, message, diagnostics) { var error = new Error(message); error.code = code; error.owner = 'AssetDerivationPipeline'; if (diagnostics) error.diagnostics = diagnostics; throw error; }
function receipt(value) { var copy = Object.assign({}, value); delete copy.raster; delete copy.frames; return copy; }
function inspectFile(file, expectedHash) { if (!file || !fs.existsSync(file)) fail('MASTER_IMAGE_MISSING', 'Master image is unavailable.'); var bytes = fs.readFileSync(file), actual = hash(bytes); if (expectedHash && actual !== expectedHash) fail('MASTER_IMAGE_HASH_MISMATCH', 'Master image bytes do not match their declared hash.'); var raster; try { raster = png.decodePng(bytes); } catch (error) { fail('MASTER_IMAGE_INVALID', error.message); } return { bytes: bytes, sha256: actual, raster: raster }; }
function operationSpec(input, op, params, index) { return { schemaVersion: derivationContract.schemaVersion, operationId: 'derive.' + hash([input.masterRevisionId, input.slot.slotId, op, params, index]).slice(0, 24), dictionaryId: derivationContract.styleDictionaryId, styleId: input.slot.styleId, op: op, input: { assetId: input.masterRevisionId, contentHash: input.inputHash }, output: { format: 'png', transparent: true }, scope: 'project-local', params: params || {} }; }
async function apply(kernel, input, raster, op, params, index) { var result = await kernel.execute(operationSpec(Object.assign({}, input, { inputHash: hash(Buffer.from(raster.data.buffer, raster.data.byteOffset, raster.data.byteLength)) }), op, params, index), { raster: raster, parentRevisionId: input.masterRevisionId }); return result; }
function writeRaster(directory, prefix, raster) { var bytes = png.encodePng(raster), sha256 = hash(bytes), file = path.join(directory, prefix + '-' + sha256.slice(0, 16) + '.png'); fs.mkdirSync(directory, { recursive: true }); if (!fs.existsSync(file)) fs.writeFileSync(file, bytes); return { bytes: bytes, sha256: sha256, path: file, width: raster.width, height: raster.height }; }
function alphaProfile(raster) {
  if (!raster || !Number.isInteger(raster.width) || raster.width < 1 || !Number.isInteger(raster.height) || raster.height < 1 || !raster.data || raster.data.length !== raster.width * raster.height * 4) fail('ASSET_DERIVATION_RASTER_INVALID', 'Alpha validation requires a complete RGBA raster.');
  var policy = derivationContract.finalAlphaPolicy, transparent = 0, visible = 0, opaquePerimeter = 0, perimeter = 0;
  for (var y = 0; y < raster.height; y++) for (var x = 0; x < raster.width; x++) {
    var alpha = raster.data[(y * raster.width + x) * 4 + 3], edge = x === 0 || y === 0 || x === raster.width - 1 || y === raster.height - 1;
    if (alpha < policy.transparentBelow) transparent += 1;
    if (alpha > policy.visibleAbove) visible += 1;
    if (edge) { perimeter += 1; if (alpha >= policy.opaqueAtOrAbove) opaquePerimeter += 1; }
  }
  var pixels = raster.width * raster.height;
  return { width: raster.width, height: raster.height, transparentRatio: transparent / pixels, visibleRatio: visible / pixels, opaquePerimeterRatio: perimeter ? opaquePerimeter / perimeter : 0 };
}
function validateFinalAlpha(raster, context) {
  var policy = derivationContract.finalAlphaPolicy, profile = alphaProfile(raster), reasons = [];
  if (profile.transparentRatio < policy.minimumTransparentRatio) reasons.push({ code: 'FINAL_ALPHA_TRANSPARENCY_TOO_LOW', actual: profile.transparentRatio, requiredMinimum: policy.minimumTransparentRatio });
  if (profile.visibleRatio < policy.minimumVisibleRatio) reasons.push({ code: 'FINAL_ALPHA_VISIBLE_CONTENT_TOO_LOW', actual: profile.visibleRatio, requiredMinimum: policy.minimumVisibleRatio });
  if (profile.opaquePerimeterRatio > policy.maximumOpaquePerimeterRatio) reasons.push({ code: 'FINAL_ALPHA_OPAQUE_PERIMETER_TOO_HIGH', actual: profile.opaquePerimeterRatio, requiredMaximum: policy.maximumOpaquePerimeterRatio });
  if (reasons.length) fail('ASSET_DERIVATION_ALPHA_INVALID', 'Final transparent asset pixels violate the deterministic alpha contract.', { stage: context && context.stage || 'final-static', frameId: context && context.frameId || null, profile: profile, policy: policy, rejectionReasons: reasons });
  return profile;
}
function removeOwnedFile(file, root) { if (!file || !root) return; var resolved = path.resolve(file), ownerRoot = path.resolve(root); if (resolved.startsWith(ownerRoot + path.sep) && fs.existsSync(resolved)) fs.rmSync(resolved, { force: true }); }

async function deriveStatic(input) {
  input = input || {}; var slot = input.slot || {}, constraints = slot.constraints || {}, master = inspectFile(input.master.path, input.master.sha256), masterRevisionId = input.master.revisionId || input.master.assetId || 'master-image.' + master.sha256;
  if (!input.projectAssetDir) fail('ASSET_DERIVATION_TARGET_MISSING', 'Deterministic derivation requires projectAssetDir.');
  var kernel = input.kernel || kernelModule.createLocalDerivationKernel(), context = { slot: slot, masterRevisionId: masterRevisionId }, raster = master.raster, receipts = [], result;
  result = await apply(kernel, context, raster, 'decode_normalize_png', {}, receipts.length); raster = result.raster; receipts.push(receipt(result));
  if (constraints.transparent === true) {
    var sourceTransparentRatio = alphaProfile(raster).transparentRatio;
    if (sourceTransparentRatio < 0.05) {
      var backgroundRemoval = input.backgroundRemoval || rembgModule.createRembgBackgroundRemoval();
      result = await backgroundRemoval.remove(raster, { parentRevisionId: masterRevisionId, deadlineAt: input.deadlineAt }); raster = result.raster; receipts.push(receipt(result));
    }
    result = await apply(kernel, context, raster, 'trim_alpha', { padding: Number(constraints.trimPadding === undefined ? 2 : constraints.trimPadding) }, receipts.length); raster = result.raster; receipts.push(receipt(result));
  }
  var width = Number(constraints.width || raster.width), height = Number(constraints.height || raster.height);
  result = await apply(kernel, context, raster, 'fit_canvas', { width: width, height: height, anchor: constraints.anchor || 'bottom-center' }, receipts.length); raster = result.raster; receipts.push(receipt(result));
  var finalAlphaProfile = alphaProfile(raster);
  if (finalAlphaProfile.visibleRatio === 0) fail('ASSET_DERIVATION_EMPTY', 'Deterministic derivation removed every visible pixel.');
  if (constraints.transparent === true) finalAlphaProfile = validateFinalAlpha(raster, { stage: 'final-static' });
  var stored = writeRaster(path.resolve(input.projectAssetDir, 'static'), 'asset', raster);
  return { assetId: 'asset.' + stored.sha256.slice(0, 24), revisionId: 'asset-revision.' + stored.sha256, masterRevisionId: masterRevisionId, sha256: stored.sha256, path: stored.path, format: 'png', resourceKind: 'image', width: stored.width, height: stored.height, transparent: constraints.transparent === true, finalAlphaProfile: finalAlphaProfile, styleId: slot.styleId, semanticTags: (slot.semanticTags || []).slice(), styleTags: (slot.styleTags || []).slice(), status: 'derived', source: 'deterministicDerivation', derivationReceipts: receipts, publishability: { playable: true, publishable: true, blocksFinalExport: false } };
}

async function deriveFrameSet(input) {
  var slot = input.slot || {}, animation = slot.animation, base = await deriveStatic(input);
  if (!animation || !Array.isArray(animation.states) || !animation.states.length) fail('FRAME_SET_INTENT_MISSING', 'FrameSet derivation requires semantic animation states.');
  var baseRaster = inspectFile(base.path, base.sha256).raster, kernel = input.kernel || kernelModule.createLocalDerivationKernel(), frames = [], states = [], alphaProfiles = [], directory = path.resolve(input.projectAssetDir, 'frames');
  try {
    for (var stateIndex = 0; stateIndex < animation.states.length; stateIndex++) {
      var animationState = animation.states[stateIndex], profile = frameSet.contract.derivationProfiles[animationState.derivationProfileId], frameIds = [];
      if (!profile || animationState.frameCount > profile.length) fail('FRAME_SET_PROFILE_INVALID', 'Animation state exceeds its deterministic derivation profile.');
      for (var frameIndex = 0; frameIndex < animationState.frameCount; frameIndex++) {
        var transform = profile[frameIndex], result = await apply(kernel, { slot: slot, masterRevisionId: base.revisionId }, baseRaster, 'frame_transform', transform, frameIndex), frameId = animationState.stateId + '.' + frameIndex, frameAlphaProfile = alphaProfile(result.raster);
        if (frameAlphaProfile.visibleRatio === 0) fail('ASSET_DERIVATION_EMPTY', 'Frame transform removed every visible pixel.', { stage: 'final-frame', frameId: frameId, profile: frameAlphaProfile });
        if ((slot.constraints || {}).transparent === true) frameAlphaProfile = validateFinalAlpha(result.raster, { stage: 'final-frame', frameId: frameId });
        var stored = writeRaster(directory, animationState.stateId + '-' + frameIndex, result.raster);
        alphaProfiles.push({ frameId: frameId, profile: frameAlphaProfile });
        frames.push({ frameId: frameId, sha256: stored.sha256, path: stored.path, width: stored.width, height: stored.height, durationMs: animationState.frameDurationMs, parentRevisionId: base.revisionId, derivationReceiptId: result.operationId }); frameIds.push(frameId);
      }
      states.push({ stateId: animationState.stateId, frameIds: frameIds, loop: animationState.loop });
    }
    states.forEach(function(state) { if (!state.loop) return; var hashes = state.frameIds.map(function(frameId) { return frames.find(function(frame) { return frame.frameId === frameId; }).sha256; }); if (new Set(hashes).size < 2) fail('FRAME_SET_LOOP_STATIC', 'Looping animation state produced fewer than two distinct deterministic frames: ' + state.stateId + '.'); });
    var candidate = frameSet.validateCandidate({ schemaVersion: frameSet.contract.schemaVersion, documentKind: frameSet.contract.candidateDocumentKind, resourceKind: 'image', format: 'png', initialStateId: animation.initialStateId, canvas: { width: base.width, height: base.height }, anchor: { x: base.width / 2, y: base.height }, frames: frames, states: states, provenance: { producer: 'AssetDerivationPipeline', masterRevisionId: base.masterRevisionId, baseRevisionId: base.revisionId, baseSha256: base.sha256, finalAlphaProfiles: alphaProfiles } });
    return frameSet.accept(candidate, 'frame-set-acceptance.' + hash([base.sha256, frames.map(function(frame) { return frame.sha256; }), states]).slice(0, 24));
  } catch (error) {
    frames.forEach(function(frame) { removeOwnedFile(frame.path, input.projectAssetDir); });
    removeOwnedFile(base.path, input.projectAssetDir);
    throw error;
  }
}

module.exports = { deriveStatic: deriveStatic, deriveFrameSet: deriveFrameSet, inspectFile: inspectFile, _alphaProfile: alphaProfile, _validateFinalAlpha: validateFinalAlpha };
