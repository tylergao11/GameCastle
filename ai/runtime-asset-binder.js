var crypto = require('crypto');

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'RuntimeAssetBinder'; throw error; }
function safe(value) { return String(value || 'asset').replace(/[^A-Za-z0-9_]/g, '_'); }
function resourceName(slotId, image) { var file = String(image || '').split(/[\\/]/).pop().replace(/[^A-Za-z0-9._-]/g, '_'); return 'gc_' + safe(slotId) + '_' + file; }
function spriteAnimations(resource, width, height, collisionBounds) { var collisionWidth = Number(collisionBounds && collisionBounds.width) || width, collisionHeight = Number(collisionBounds && collisionBounds.height) || height, mask = [[{ x: 0, y: 0 }, { x: collisionWidth, y: 0 }, { x: collisionWidth, y: collisionHeight }, { x: 0, y: collisionHeight }]]; return [{ name: 'idle', useMultipleDirections: false, directions: [{ looping: true, timeBetweenFrames: 0.08, sprites: [{ image: resource, originPoint: { name: 'origin', x: width / 2, y: height }, centerPoint: { name: 'centre', automatic: true, x: 0, y: 0 }, points: [], hasCustomCollisionMask: true, customCollisionMask: mask }] }] }]; }
function removeRendererEvents(events, targetObject) { return (events || []).map(function(event) { var next = clone(event); next.actions = (next.actions || []).filter(function(action) { var type = action.type && action.type.value || '', parameters = action.parameters || []; return !(type.indexOf('PrimitiveDrawing') === 0 && parameters[0] === targetObject); }); next.events = removeRendererEvents(next.events || [], targetObject); return next; }).filter(function(event) { return (event.actions || []).length || (event.events || []).length || !(event.conditions || []).some(function(condition) { return condition.type && condition.type.value === 'DepartScene'; }); }); }

function bind(input) {
  input = input || {}; var project = input.project, manifest = input.manifest || {}, declarations = input.visualSlots || [];
  if (!project) fail('ASSET_BIND_PROJECT_REQUIRED', 'RuntimeAssetBinder requires the GDJS project.');
  if (manifest.productionSetDecision !== 'accepted') fail('ASSET_BIND_PRODUCTION_NOT_ACCEPTED', 'Only an accepted complete production set may bind.');
  var byTarget = {}; declarations.forEach(function(slot) { if (!slot.visualSlotId || byTarget[slot.visualSlotId]) fail('ASSET_BIND_DECLARATION_INVALID', 'VisualSlotDeclaration ids must be unique.'); byTarget[slot.visualSlotId] = slot; });
  var bindings = manifest.bindings || [], requiredTargets = declarations.map(function(slot) { return slot.visualSlotId; }).sort(), actualTargets = bindings.map(function(binding) { return binding.targetVisualSlotId; }).sort();
  if (JSON.stringify(requiredTargets) !== JSON.stringify(actualTargets)) fail('ASSET_BIND_COVERAGE_INCOMPLETE', 'Binding targets must exactly cover every declared VisualSlotDeclaration.');
  var receipts = bindings.map(function(binding) {
    var slot = byTarget[binding.targetVisualSlotId]; if (!slot) fail('ASSET_BIND_TARGET_UNKNOWN', 'Unknown targetVisualSlotId: ' + binding.targetVisualSlotId);
    if (!binding.assetRevisionId || !binding.asset || !binding.asset.path) fail('ASSET_BIND_FINAL_REVISION_REQUIRED', 'Binding requires an accepted project-local final revision.');
    if (slot.allowedBindingModes.indexOf(binding.bindingMode) < 0) fail('ASSET_BIND_MODE_FORBIDDEN', 'Binding mode is not allowed for ' + slot.visualSlotId);
    var worldRoles = ['player', 'enemy', 'collectible', 'platform'], mode = binding.bindingMode;
    if (worldRoles.indexOf(slot.role) >= 0 && (mode === 'ui-slot' || mode === 'layer-background')) fail('ASSET_BIND_ROLE_MODE_MISMATCH', 'World role cannot bind through ' + mode + '.');
    if (slot.role === 'ui-control' && mode !== 'ui-slot') fail('ASSET_BIND_ROLE_MODE_MISMATCH', 'UI control requires ui-slot binding.');
    if (slot.role === 'background' && mode !== 'layer-background') fail('ASSET_BIND_ROLE_MODE_MISMATCH', 'Background requires layer-background binding.');
    if (mode === 'attached-visual' && worldRoles.indexOf(slot.role) < 0) fail('ASSET_BIND_ROLE_MODE_MISMATCH', 'Attached visual is limited to declared world roles.');
    var layout = (project.layouts || []).find(function(item) { return item.name === slot.scene; }); if (!layout) fail('ASSET_BIND_SCENE_MISSING', 'Target scene is missing: ' + slot.scene);
    var object = (layout.objects || []).find(function(item) { return item.name === slot.targetObject; }); if (!object) fail('ASSET_BIND_OBJECT_MISSING', 'Target object is missing: ' + slot.targetObject);
    var instances = (layout.instances || []).filter(function(instance) { return instance.name === slot.targetObject; }); if (!instances.length) fail('ASSET_BIND_INSTANCE_MISSING', 'Target has no live instance: ' + slot.targetObject);
    var before = { behaviors: clone(object.behaviors || []), variables: clone(object.variables || []), effects: clone(object.effects || []), instances: clone(instances) };
    var resource = resourceName(slot.visualSlotId, binding.asset.path), width = Number(binding.asset.width) || 64, height = Number(binding.asset.height) || 64;
    project.resources = project.resources || { resources: [], resourceFolders: [] }; project.resources.resources = project.resources.resources || [];
    if (!project.resources.resources.some(function(entry) { return entry.name === resource; })) project.resources.resources.push({ name: resource, kind: 'image', file: binding.asset.path, metadata: '', alwaysLoaded: true, smoothed: false, userAdded: true });
    layout.usedResources = layout.usedResources || []; if (!layout.usedResources.some(function(entry) { return entry && entry.name === resource; })) layout.usedResources.push({ name: resource });
    var identity = { name: object.name, tags: object.tags || '', variables: before.variables, behaviors: before.behaviors, effects: before.effects };
    Object.keys(object).forEach(function(key) { delete object[key]; }); Object.assign(object, identity, { type: 'Sprite', updateIfNotVisible: false, animations: spriteAnimations(resource, width, height, slot.collisionBounds) }); layout.events = removeRendererEvents(layout.events || [], slot.targetObject);
    var sprite = object.animations[0].directions[0].sprites[0];
    var preservationChecks = { behaviors: hash(object.behaviors) === hash(before.behaviors), collisionMask: sprite.hasCustomCollisionMask === true && sprite.customCollisionMask.length > 0, variables: hash(object.variables) === hash(before.variables), instanceIdentity: hash(instances) === hash(before.instances), layer: instances.every(function(item, index) { return item.layer === before.instances[index].layer; }), zOrderPolicy: instances.every(function(item, index) { return item.zOrder === before.instances[index].zOrder; }) };
    if ((slot.preserve || []).some(function(field) { return preservationChecks[field] !== true; })) fail('ASSET_BIND_PRESERVATION_FAILED', 'Binding changed preserved gameplay state for ' + slot.visualSlotId);
    return { bindingId: 'binding.' + hash([manifest.productionSetId, slot.visualSlotId, binding.assetRevisionId]).slice(0, 24), productionSetId: manifest.productionSetId, assetRevisionId: binding.assetRevisionId, targetVisualSlotId: slot.visualSlotId, scene: slot.scene, targetObject: slot.targetObject, boundInstanceCount: instances.length, resourceName: resource, bindingMode: binding.bindingMode, preservationChecks: preservationChecks, runtimeChecks: { resourceInstalled: true, targetObjectIsSprite: object.type === 'Sprite', worldTransformFollowsTarget: true, attachedVisualControlled: mode !== 'attached-visual' || object.name === slot.targetObject, modeSemanticValid: true, detachedOverlay: false }, contentHash: binding.asset.sha256 };
  });
  return { pass: receipts.length === requiredTargets.length, productionSetId: manifest.productionSetId, receipts: receipts, expectedTargetVisualSlotIds: requiredTargets, boundTargetVisualSlotIds: actualTargets };
}

module.exports = { bind: bind };
