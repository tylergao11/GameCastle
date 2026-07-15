var assert = require('assert');
var path = require('path');
var capabilityIr = require('../../ai/gdjs-capability-ir');
var extensionLoader = require('../../ai/gdevelop-extension-loader');
var runtimeCodegen = require('../../ai/runtime-codegen');

function metadataFor(gd, platform, capability, binding) {
  var owner = capability.owner || {};
  if (capability.kind === 'action') return gd.MetadataProvider.getActionMetadata(platform, binding.runtimeId);
  if (capability.kind === 'condition') return gd.MetadataProvider.getConditionMetadata(platform, binding.runtimeId);
  if (owner.kind === 'object') return gd.MetadataProvider[capability.kind === 'string-expression' ? 'getObjectStrExpressionMetadata' : 'getObjectExpressionMetadata'](platform, binding.metadataOwnerId, binding.runtimeId);
  if (owner.kind === 'behavior') return gd.MetadataProvider[capability.kind === 'string-expression' ? 'getBehaviorStrExpressionMetadata' : 'getBehaviorExpressionMetadata'](platform, binding.metadataOwnerId, binding.runtimeId);
  return gd.MetadataProvider[capability.kind === 'string-expression' ? 'getStrExpressionMetadata' : 'getExpressionMetadata'](platform, binding.runtimeId);
}

(async function() {
  var registry = capabilityIr.loadRegistry();
  var libGdPath = runtimeCodegen.resolveLibGdPath();
  var gd = await require(libGdPath)({ print: function() {}, printErr: function() {}, locateFile: function(fileName) { return path.join(path.dirname(libGdPath), fileName); } });
  var evidence = extensionLoader.loadOfficialExtensions(gd, path.join(path.dirname(libGdPath), 'extensions'));
  var platform = gd.JsPlatform.get();
  var capabilityIds = Object.keys(registry.byId);
  assert.strictEqual(capabilityIds.length, Object.keys(registry.officialBindings).length, 'official binding registry has unreachable entries');
  capabilityIds.forEach(function(capabilityId) {
    var capability = registry.byId[capabilityId];
    var binding = registry.officialBindings[capabilityId];
    var metadata = metadataFor(gd, platform, capability, binding);
    var bad = /expression$/.test(capability.kind) ? gd.MetadataProvider.isBadExpressionMetadata(metadata) : gd.MetadataProvider.isBadInstructionMetadata(metadata);
    assert(!bad, capabilityId + ' is absent from pinned official GDJS metadata: ' + binding.runtimeId);
    assert.strictEqual(metadata.getParametersCount(), binding.parameters.length, capabilityId + ' official parameter count drifted');
    binding.parameters.forEach(function(parameter, index) {
      var official = metadata.getParameter(index);
      assert.strictEqual(official.getType(), parameter.type, capabilityId + ' parameter type drifted at ' + index);
      assert.strictEqual(official.isCodeOnly(), parameter.codeOnly, capabilityId + ' code-only contract drifted at ' + index);
      assert.strictEqual(official.isOptional(), parameter.optional, capabilityId + ' optional contract drifted at ' + index);
    });
  });
  console.log('[OfficialCapabilityMetadata] ' + capabilityIds.length + '/' + capabilityIds.length + ' capabilities exist in pinned libGD + official extensions at ' + evidence.commit);
})().catch(function(error) { console.error(error); process.exit(1); });
