function generate(manifest) {
  var bindings = manifest && Array.isArray(manifest.bindings) ? manifest.bindings : [];
  return [
    '(function () {',
    '  var bindings = ' + JSON.stringify(bindings) + ';',
    '  function safe(value) { return String(value || "asset").replace(/[^A-Za-z0-9_]/g, "_"); }',
    '  function resourceName(binding, image) { var file = String(image || "").split("/").pop().replace(/[^A-Za-z0-9._-]/g, "_"); return "gc_" + safe(binding) + "_" + file; }',
    '  function sprite(name, image) { return { name:name, tags:"gamecastle-asset", type:"Sprite", updateIfNotVisible:false, variables:[], behaviors:[], effects:[], animations:[{ name:"idle", useMultipleDirections:false, directions:[{ looping:true, timeBetweenFrames:1, sprites:[{ image:image, originPoint:{name:"origine",x:48,y:96}, centerPoint:{name:"centre",automatic:true,x:0,y:0}, points:[], hasCustomCollisionMask:false, customCollisionMask:[] }] }] }] }; }',
    '  function inject() {',
    '    var project = window.gdjs && window.gdjs.projectData; if (!project || !bindings.length) return;',
    '    project.resources = project.resources || { resources:[], resourceFolders:[] }; project.resources.resources = project.resources.resources || [];',
    '    var layouts = project.layouts || []; var layout = layouts[0]; if (!layout) return; layout.objects = layout.objects || []; layout.instances = layout.instances || []; layout.usedResources = layout.usedResources || [];',
    '    bindings.forEach(function (binding, index) {',
    '      var image = binding && binding.asset && binding.asset.path; if (!image) return; var name = "GameCastleAsset_" + safe(binding.binding); var resource = resourceName(binding.binding, image);',
    '      if (!project.resources.resources.some(function (entry) { return entry.name === resource; })) project.resources.resources.push({ name:resource, kind:"image", file:image, metadata:"", alwaysLoaded:true, smoothed:false, userAdded:true });',
    '      if (!layout.usedResources.some(function (entry) { return entry && entry.name === resource; })) layout.usedResources.push({ name:resource });',
    '      if (!layout.objects.some(function (object) { return object.name === name; })) layout.objects.push(sprite(name, resource));',
    '      if (!layout.instances.some(function (instance) { return instance.persistentUuid === "gc-asset-" + safe(binding.binding); })) layout.instances.push({ angle:0, customSize:true, width:96, height:96, layer:"UI", locked:false, name:name, x:96 + index * 112, y:96, zOrder:100 + index, numberProperties:[], stringProperties:[], initialVariables:[], persistentUuid:"gc-asset-" + safe(binding.binding) });',
    '    });',
    '    window.GameCastleAssetRuntime = { bindings: bindings, injected: true };',
    '  }',
    '  inject();',
    '})();',
    '',
  ].join('\n');
}
module.exports = { generate: generate };
