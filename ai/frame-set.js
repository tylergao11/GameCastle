var crypto = require('crypto');
var contract = require('../shared/frame-set-contract.json');

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, {}); return value; }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'FrameSetRevision'; throw error; }
function positiveInteger(value, label) { if (!Number.isInteger(value) || value < 1) fail('FRAME_SET_INVALID', label + ' must be a positive integer.'); return value; }
function string(value, label) { if (typeof value !== 'string' || !value) fail('FRAME_SET_INVALID', label + ' must be a non-empty string.'); return value; }

function normalizeCore(input) {
  if (!input || typeof input !== 'object' || input.schemaVersion !== contract.schemaVersion || [contract.documentKind, contract.candidateDocumentKind].indexOf(input.documentKind) < 0) fail('FRAME_SET_INVALID', 'FrameSet has an invalid schema version or document kind.');
  if (input.resourceKind !== contract.resource.resourceKind || String(input.format).toLowerCase() !== contract.resource.format) fail('FRAME_SET_RESOURCE_INVALID', 'FrameSet resource kind and format must match the contract.');
  if (!input.canvas || typeof input.canvas !== 'object') fail('FRAME_SET_INVALID', 'FrameSet requires a canvas.');
  positiveInteger(input.canvas.width, 'canvas.width'); positiveInteger(input.canvas.height, 'canvas.height');
  if (!input.anchor || typeof input.anchor !== 'object' || !Number.isFinite(input.anchor.x) || !Number.isFinite(input.anchor.y)) fail('FRAME_SET_INVALID', 'FrameSet requires a numeric anchor.');
  if (!Array.isArray(input.frames) || !input.frames.length) fail('FRAME_SET_INVALID', 'FrameSet requires ordered frames.');
  var frameIds = {}, frames = input.frames.map(function(frame, index) {
    if (!frame || typeof frame !== 'object') fail('FRAME_SET_INVALID', 'frames[' + index + '] must be an object.');
    string(frame.frameId, 'frames[' + index + '].frameId'); if (frameIds[frame.frameId]) fail('FRAME_SET_INVALID', 'Frame IDs must be unique.'); frameIds[frame.frameId] = true;
    string(frame.sha256, 'frames[' + index + '].sha256'); string(frame.path, 'frames[' + index + '].path'); positiveInteger(frame.width, 'frames[' + index + '].width'); positiveInteger(frame.height, 'frames[' + index + '].height'); positiveInteger(frame.durationMs, 'frames[' + index + '].durationMs');
    if (frame.width !== input.canvas.width || frame.height !== input.canvas.height) fail('FRAME_SET_CANVAS_MISMATCH', 'Every frame must match the declared canvas.');
    return { frameId: frame.frameId, sha256: frame.sha256, path: frame.path, width: frame.width, height: frame.height, durationMs: frame.durationMs, parentRevisionId: frame.parentRevisionId || null, derivationReceiptId: frame.derivationReceiptId || null };
  });
  if (!Array.isArray(input.states) || !input.states.length) fail('FRAME_SET_INVALID', 'FrameSet requires one or more states.');
  var stateIds = {}, states = input.states.map(function(state, index) {
    if (!state || typeof state !== 'object') fail('FRAME_SET_INVALID', 'states[' + index + '] must be an object.');
    string(state.stateId, 'states[' + index + '].stateId'); if (stateIds[state.stateId]) fail('FRAME_SET_INVALID', 'State IDs must be unique.'); stateIds[state.stateId] = true;
    if (!Array.isArray(state.frameIds) || !state.frameIds.length || state.frameIds.some(function(frameId) { return !frameIds[frameId]; })) fail('FRAME_SET_STATE_INVALID', 'A state must reference declared frame IDs.');
    if (typeof state.loop !== 'boolean' || (state.loop && state.frameIds.length < 2)) fail('FRAME_SET_STATE_INVALID', 'A looping state requires at least two frames.');
    return { stateId: state.stateId, frameIds: state.frameIds.slice(), loop: state.loop };
  });
  string(input.initialStateId, 'initialStateId'); if (!stateIds[input.initialStateId]) fail('FRAME_SET_STATE_INVALID', 'initialStateId must reference a declared state.');
  return { schemaVersion: contract.schemaVersion, resourceKind: contract.resource.resourceKind, format: contract.resource.format, initialStateId: input.initialStateId, canvas: { width: input.canvas.width, height: input.canvas.height }, anchor: { x: input.anchor.x, y: input.anchor.y }, frames: frames, states: states, provenance: clone(input.provenance || {}) };
}
function identity(core) { return { schemaVersion: core.schemaVersion, resourceKind: core.resourceKind, format: core.format, initialStateId: core.initialStateId, canvas: core.canvas, anchor: core.anchor, frames: core.frames.map(function(frame) { return { frameId: frame.frameId, sha256: frame.sha256, width: frame.width, height: frame.height, durationMs: frame.durationMs }; }), states: core.states }; }
function validateCandidate(input) { var core = normalizeCore(input); if (input.documentKind !== contract.candidateDocumentKind) fail('FRAME_SET_CANDIDATE_INVALID', 'FrameSet candidate document kind is required.'); return Object.freeze(Object.assign(core, { documentKind: contract.candidateDocumentKind })); }
function accept(input, acceptanceReceiptId) {
  var core = validateCandidate(input), hash = digest(identity(core)); string(acceptanceReceiptId, 'acceptanceReceiptId');
  return Object.freeze(Object.assign({}, core, { documentKind: contract.documentKind, revisionId: 'frame-set-revision.' + hash, status: 'accepted', acceptanceReceiptId: acceptanceReceiptId, contentHash: 'frame-set-content.' + hash }));
}
function validate(input) {
  var core = normalizeCore(input); if (input.documentKind !== contract.documentKind || input.status !== 'accepted') fail('FRAME_SET_STATUS_INVALID', 'Accepted FrameSetRevision is required.');
  var hash = digest(identity(core)), revisionId = 'frame-set-revision.' + hash, contentHash = 'frame-set-content.' + hash;
  if (input.revisionId !== revisionId || input.contentHash !== contentHash) fail('FRAME_SET_HASH_INVALID', 'FrameSet identity does not match its immutable frames and animation structure.');
  string(input.acceptanceReceiptId, 'acceptanceReceiptId');
  return Object.freeze(Object.assign({}, core, { documentKind: contract.documentKind, revisionId: revisionId, status: 'accepted', acceptanceReceiptId: input.acceptanceReceiptId, contentHash: contentHash }));
}
function isFrameSet(value) { return !!value && value.documentKind === contract.documentKind; }
function isCandidate(value) { return !!value && value.documentKind === contract.candidateDocumentKind; }

module.exports = { contract: contract, validate: validate, validateCandidate: validateCandidate, accept: accept, isFrameSet: isFrameSet, isCandidate: isCandidate, contentHash: function(value) { return validate(value).contentHash; } };
