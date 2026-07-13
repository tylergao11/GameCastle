/* Deployment extension compiler. It intentionally accepts IDs only and never exposes file paths to callers. */
var crypto = require('crypto');
var fs = require('fs');
var registry = require('../shared/comfyui-extension-registry.json');

function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'ComfyExtensionRegistry'; throw error; }
function hashFile(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function compile(requested, workflow, styleId) {
  if (requested === undefined || requested === null) return [];
  if (!Array.isArray(requested)) fail('COMFYUI_EXTENSION_REQUEST_INVALID', 'Extension request must be an array of IDs.');
  return requested.map(function(request) {
    if (!request || typeof request !== 'object' || Object.keys(request).some(function(key) { return ['id', 'strength', 'inputRef', 'inputKind'].indexOf(key) < 0; }) || typeof request.id !== 'string') fail('COMFYUI_EXTENSION_REQUEST_INVALID', 'Extension request may contain only id, strength, inputRef, and inputKind.');
    var extension = registry.extensions[request.id]; if (!extension) fail('COMFYUI_EXTENSION_UNREGISTERED', 'Extension is not registered.');
    if (extension.status !== 'approved') fail('COMFYUI_EXTENSION_NOT_APPROVED', 'Extension is not approved for execution.');
    if ((extension.allowedWorkflows || []).indexOf(workflow.id) < 0 || extension.baseModelId !== workflow.model.id) fail('COMFYUI_EXTENSION_INCOMPATIBLE', 'Extension is incompatible with this workflow base model.');
    if (extension.kind === 'lora' && extension.styleId !== styleId) fail('COMFYUI_EXTENSION_STYLE_DENIED', 'LoRA is not mapped to the requested styleId.');
    if (extension.kind === 'controlnet' && ((extension.inputKinds || []).indexOf(request.inputKind) < 0 || !request.inputRef || typeof request.inputRef !== 'object' || !request.inputRef.refId)) fail('COMFYUI_CONTROL_INPUT_INVALID', 'ControlNet requires a typed, registered control input reference.');
    var modelPath = process.env[extension.pathEnv], expectedHash = process.env[extension.sha256Env]; if (!modelPath || !expectedHash || !fs.existsSync(modelPath) || hashFile(modelPath) !== expectedHash) fail('COMFYUI_EXTENSION_HASH_MISMATCH', 'Extension artifact does not match its approved hash.');
    return { id: request.id, kind: extension.kind, strength: Math.max(0, Math.min(1, Number(request.strength === undefined ? 1 : request.strength))), inputRef: request.inputRef || null, inputKind: request.inputKind || null, artifactSha256: expectedHash, licenseId: extension.licenseId };
  });
}
module.exports = { compile: compile, registry: registry };
