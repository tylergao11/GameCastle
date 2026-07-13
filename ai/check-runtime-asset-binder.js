var assert = require('assert');
var binder = require('./runtime-asset-binder');

var behaviors = [{ type: 'PlatformBehavior::PlatformerObjectBehavior', name: 'Platformer' }];
var project = { resources: { resources: [], resourceFolders: [] }, layouts: [{ name: 'Game', objects: [{ name: 'Player', type: 'PrimitiveDrawing::Drawer', variables: [{ name: 'Health', value: 3 }], behaviors: behaviors, effects: [] }], instances: [{ name: 'Player', layer: '', zOrder: 4, persistentUuid: 'player-1' }], usedResources: [], layers: [{ name: '' }] }] };
var declaration = { visualSlotId: 'game.player.visual', scene: 'Game', targetObject: 'Player', role: 'player', allowedBindingModes: ['object-resource'], requiredAssetKind: 'sprite', preserve: ['behaviors', 'collisionMask', 'variables', 'instanceIdentity', 'layer', 'zOrderPolicy'] };
var manifest = { productionSetId: 'production.test', productionSetDecision: 'accepted', bindings: [{ slotId: 'hero', targetVisualSlotId: 'game.player.visual', assetRevisionId: 'revision.hero', bindingMode: 'object-resource', required: true, preserve: declaration.preserve, asset: { path: 'assets/generated/hero.png', width: 64, height: 64, sha256: 'hero-hash' } }] };
var report = binder.bind({ project: project, manifest: manifest, visualSlots: [declaration] });
assert.strictEqual(report.pass, true);
assert.strictEqual(report.receipts.length, 1);
assert.strictEqual(project.layouts[0].objects.length, 1, 'binder must not create a detached overlay object');
assert.strictEqual(project.layouts[0].objects[0].name, 'Player');
assert.strictEqual(project.layouts[0].objects[0].type, 'Sprite');
assert.deepStrictEqual(project.layouts[0].objects[0].behaviors, behaviors);
assert.strictEqual(project.layouts[0].instances[0].persistentUuid, 'player-1');
assert.strictEqual(report.receipts[0].runtimeChecks.detachedOverlay, false);
assert.throws(function() { binder.bind({ project: project, manifest: Object.assign({}, manifest, { productionSetDecision: 'debt' }), visualSlots: [declaration] }); }, /Only an accepted complete production set/);
assert.throws(function() { binder.bind({ project: project, manifest: Object.assign({}, manifest, { bindings: [] }), visualSlots: [declaration] }); }, /exactly cover/);

var roleDeclarations = [
  { visualSlotId: 'game.player.visual', scene: 'Game', targetObject: 'Player', role: 'player', allowedBindingModes: ['object-resource', 'attached-visual'], requiredAssetKind: 'sprite', preserve: ['behaviors', 'collisionMask', 'variables', 'instanceIdentity', 'layer', 'zOrderPolicy'] },
  { visualSlotId: 'game.enemy.visual', scene: 'Game', targetObject: 'Enemy', role: 'enemy', allowedBindingModes: ['object-resource'], requiredAssetKind: 'sprite', preserve: ['collisionMask', 'instanceIdentity', 'layer', 'zOrderPolicy'] },
  { visualSlotId: 'game.collectible.visual', scene: 'Game', targetObject: 'Coin', role: 'collectible', allowedBindingModes: ['object-resource'], requiredAssetKind: 'sprite', preserve: ['collisionMask', 'instanceIdentity', 'layer', 'zOrderPolicy'] },
  { visualSlotId: 'game.background.visual', scene: 'Game', targetObject: 'Background', role: 'background', allowedBindingModes: ['layer-background'], requiredAssetKind: 'sprite', preserve: ['instanceIdentity', 'layer', 'zOrderPolicy'] },
  { visualSlotId: 'game.ui.jump.visual', scene: 'Game', targetObject: 'JumpButton', role: 'ui-control', allowedBindingModes: ['ui-slot'], requiredAssetKind: 'sprite', preserve: ['instanceIdentity', 'layer', 'zOrderPolicy'] }
];
var roleProject = { resources: { resources: [], resourceFolders: [] }, layouts: [{ name: 'Game', objects: roleDeclarations.map(function(slot) { return { name: slot.targetObject, type: 'PrimitiveDrawing::Drawer', variables: [], behaviors: slot.role === 'player' ? [{ name: 'Platformer', type: 'PlatformBehavior::PlatformerObjectBehavior' }] : [], effects: [] }; }), instances: roleDeclarations.map(function(slot, index) { return { name: slot.targetObject, layer: slot.role === 'ui-control' ? 'UI' : slot.role === 'background' ? 'Background' : '', zOrder: index, persistentUuid: 'role-' + index }; }), events: [], usedResources: [], layers: [{ name: '' }, { name: 'Background' }, { name: 'UI' }] }] };
var modes = ['object-resource', 'object-resource', 'object-resource', 'layer-background', 'ui-slot'];
var roleManifest = { productionSetId: 'production.roles', productionSetDecision: 'accepted', bindings: roleDeclarations.map(function(slot, index) { return { slotId: 'slot-' + index, targetVisualSlotId: slot.visualSlotId, assetRevisionId: 'revision-' + index, bindingMode: modes[index], required: true, preserve: slot.preserve, asset: { path: 'assets/generated/' + index + '.png', width: 64, height: 64, sha256: 'hash-' + index } }; }) };
var roleReport = binder.bind({ project: roleProject, manifest: roleManifest, visualSlots: roleDeclarations });
assert.strictEqual(roleReport.receipts.length, 5); assert(roleReport.receipts.every(function(receipt) { return receipt.runtimeChecks.detachedOverlay === false && receipt.runtimeChecks.modeSemanticValid === true; }));
var mixed = JSON.parse(JSON.stringify(roleManifest)); mixed.bindings[0].bindingMode = 'ui-slot'; var mixedDeclarations = JSON.parse(JSON.stringify(roleDeclarations)); mixedDeclarations[0].allowedBindingModes.push('ui-slot');
assert.throws(function() { binder.bind({ project: JSON.parse(JSON.stringify(roleProject)), manifest: mixed, visualSlots: mixedDeclarations }); }, /World role cannot bind/);
var attachedProject = { resources: { resources: [], resourceFolders: [] }, layouts: [{ name: 'Game', objects: [{ name: 'Player', type: 'PrimitiveDrawing::Drawer', variables: [], behaviors: behaviors, effects: [] }], instances: [{ name: 'Player', layer: '', zOrder: 1, persistentUuid: 'attached-player' }], events: [], usedResources: [], layers: [{ name: '' }] }] };
var attachedManifest = { productionSetId: 'production.attached', productionSetDecision: 'accepted', bindings: [{ slotId: 'hero', targetVisualSlotId: 'game.player.visual', assetRevisionId: 'revision.attached', bindingMode: 'attached-visual', required: true, preserve: declaration.preserve, asset: { path: 'assets/generated/attached.png', width: 64, height: 64, sha256: 'attached-hash' } }] };
var attached = binder.bind({ project: attachedProject, manifest: attachedManifest, visualSlots: [Object.assign({}, declaration, { allowedBindingModes: ['attached-visual'] })] }); assert.strictEqual(attached.receipts[0].runtimeChecks.attachedVisualControlled, true);
console.log('[RuntimeAssetBinder] all four legal modes cover Player, Enemy, Collectible, Background and UI with preservation and role-mode gates');
