var componentCatalog = require('./component-catalog');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function main() {
  var catalog = componentCatalog.loadComponentCatalog();
  var ids = catalog.components.map(function(component) { return component.id; }).sort();
  [
    'input.touch_button',
    'movement.platformer',
    'input.virtual_joystick',
    'input.jump_button',
    'input.attack_button',
    'system.storage',
    'ui.panel',
    'system.inventory'
  ].forEach(function(id) {
    assert(ids.indexOf(id) >= 0, 'missing component manifest: ' + id);
  });

  assert(
    componentCatalog.findControlComponent(catalog, 'joystick').id === 'input.virtual_joystick',
    'joystick should resolve through natural alias'
  );
  assert(
    componentCatalog.findControlComponent(catalog, 'jump button').id === 'input.jump_button',
    'jump button should resolve through natural alias'
  );
  assert(
    componentCatalog.findControlComponent(catalog, 'fire button', 'fire').id === 'input.attack_button',
    'fire button should resolve to attack button through natural alias and action'
  );
  assert(
    !componentCatalog.findControlComponent(catalog, 'touch button'),
    'abstract touch button base should not resolve from LLM2-facing intent'
  );
  assert(
    !componentCatalog.findSystemComponent(catalog, 'storage'),
    'abstract storage base should not resolve from LLM2-facing intent'
  );
  assert(
    componentCatalog.findAbilityComponent(catalog, 'platformer movement').id === 'movement.platformer',
    'platformer movement should resolve through natural alias'
  );
  assert(
    componentCatalog.findSystemComponent(catalog, 'backpack').id === 'system.inventory',
    'backpack should resolve to inventory through natural alias'
  );

  catalog.components.forEach(function(component) {
    var ai = componentCatalog.aiView(component);
    var compiler = componentCatalog.compilerView(component);
    assert(!ai.componentId, component.id + ' ai view must not expose componentId');
    assert(compiler.componentId === component.id, component.id + ' compiler view should expose componentId');
    if (compiler.defaultConfig && Object.keys(compiler.defaultConfig).length) {
      assert(compiler.inheritance, component.id + ' compiler view should expose inheritance contract');
      assert(compiler.inheritance.defaultOwner === 'component-manifest', component.id + ' defaults should be owned by component manifest');
      Object.keys(compiler.defaultConfig).forEach(function(key) {
        var exposed = compiler.inheritance.exposedOverrides || [];
        var sealed = compiler.inheritance.sealedDefaults || [];
        assert(
          exposed.indexOf(key) >= 0 || sealed.indexOf(key) >= 0,
          component.id + ' default key should be classified by inheritance contract: ' + key
        );
      });
    }
  });

  var touchBase = componentCatalog.getComponent(catalog, 'input.touch_button');
  var storageBase = componentCatalog.getComponent(catalog, 'system.storage');
  var panelBase = componentCatalog.getComponent(catalog, 'ui.panel');
  var jump = componentCatalog.getComponent(catalog, 'input.jump_button');
  var attack = componentCatalog.getComponent(catalog, 'input.attack_button');
  var inventory = componentCatalog.getComponent(catalog, 'system.inventory');
  assert(touchBase.compilerManifest.abstract === true, 'touch button base should be internal abstract compiler manifest');
  assert(storageBase.compilerManifest.abstract === true, 'storage base should be internal abstract compiler manifest');
  assert(panelBase.compilerManifest.abstract === true, 'panel base should be internal abstract compiler manifest');
  assert(jump.compilerManifest.abstract !== true, 'jump button should remain a concrete control');
  assert(attack.compilerManifest.abstract !== true, 'attack button should remain a concrete control');
  assert(inventory.compilerManifest.abstract !== true, 'inventory should remain a concrete system');
  assert(jump.compilerManifest.extends === 'input.touch_button', 'jump button should declare touch button parent');
  assert(attack.compilerManifest.extends === 'input.touch_button', 'attack button should declare touch button parent');
  assert(Array.isArray(inventory.compilerManifest.extends), 'inventory should declare multiple compiler parents');
  assert(inventory.compilerManifest.extends.indexOf('system.storage') >= 0, 'inventory should inherit storage parent');
  assert(inventory.compilerManifest.extends.indexOf('ui.panel') >= 0, 'inventory should inherit panel parent');
  assert(jump.compilerManifest.defaultConfig.pressMode === 'tap', 'jump button should inherit press mode from touch button base');
  assert(jump.compilerManifest.defaultConfig.shape === 'rectangle', 'jump button should inherit shape from touch button base');
  assert(jump.compilerManifest.defaultConfig.width === 72, 'jump button should inherit width from touch button base');
  assert(jump.compilerManifest.defaultConfig.keyboardKey === 'Space', 'jump button should own keyboard key as sealed runtime default');
  assert(jump.compilerManifest.defaultConfig.controlLabel === 'J', 'jump button should own runtime label as sealed default');
  assert(attack.compilerManifest.defaultConfig.keyboardKey === 'KeyZ', 'attack button should own keyboard key as sealed runtime default');
  assert(attack.compilerManifest.defaultConfig.controlLabel === 'A', 'attack button should own runtime label as sealed default');
  assert(jump.compilerManifest.binding.inputKind === 'touch_button', 'jump button should inherit touch binding');
  assert(jump.compilerManifest.gdjsBridge.runtimeAdapters.indexOf('touch-button') >= 0, 'jump button should inherit touch runtime adapter');
  assert(jump.compilerManifest.gdjsBridge.adapterRoutes['touch-button'].mechanism === 'touch-button-adapter', 'jump button should inherit touch adapter route metadata');
  assert(jump.compilerManifest.gdjsBridge.objectSpec.type === 'ShapePainter', 'jump button should inherit GDJS object spec');
  assert(jump.compilerManifest.gdjsBridge.objectSpec.routeId === 'collision-mask-setup', 'jump object spec should carry route evidence');
  assert(jump.compilerManifest.gdjsBridge.objectSpec.layerEmission.routeId === 'responsive-ui', 'jump object spec should inherit layer route evidence');
  assert(jump.compilerManifest.gdjsBridge.objectSpec.placementEmission.routeMechanism === 'target-rewrite', 'jump object spec should inherit placement route evidence');
  assert(jump.compilerManifest.inheritance.sealedDefaults.indexOf('pressMode') >= 0, 'inherited press mode should stay sealed');
  assert(inventory.compilerManifest.defaultConfig.slots === 24, 'inventory should inherit slot defaults from storage base');
  assert(inventory.compilerManifest.defaultConfig.persistence === 'session', 'inventory should inherit persistence from storage base');
  assert(inventory.compilerManifest.defaultConfig.uiMode === 'panel', 'inventory should inherit panel mode from panel base');
  assert(inventory.compilerManifest.defaultConfig.width === 160, 'inventory should inherit panel width from panel base');
  assert(inventory.compilerManifest.defaultConfig.panelTitle === 'Inventory', 'inventory should own panel title as sealed runtime default');
  assert(inventory.compilerManifest.inheritance.exposedOverrides.indexOf('slots') >= 0, 'inventory should expose natural slot override through storage parent');
  assert(inventory.compilerManifest.inheritance.sealedDefaults.indexOf('persistence') >= 0, 'inventory persistence should stay sealed');
  assert(inventory.compilerManifest.gdjsBridge.runtimeAdapters.indexOf('inventory-storage') >= 0, 'inventory should inherit storage runtime adapter');
  assert(inventory.compilerManifest.gdjsBridge.runtimeAdapters.indexOf('inventory-panel') >= 0, 'inventory should inherit panel runtime adapter');
  assert(inventory.compilerManifest.gdjsBridge.objectSpec.type === 'ShapePainter', 'inventory should inherit panel GDJS object spec');
  assert(inventory.compilerManifest.gdjsBridge.objectSpec.layerEmission.mechanism === 'component-ui-layer', 'inventory should inherit layer emission evidence');
  assert(inventory.compilerManifest.gdjsBridge.adapterRoutes['inventory-storage'].routeId === 'inventory-persistence', 'inventory should inherit storage adapter route metadata');
  assert(inventory.compilerManifest.gdjsBridge.adapterRoutes['inventory-panel'].routeOwner === 'component-expander', 'inventory should inherit panel adapter route metadata');
  assert((inventory.compilerManifest.gdjsBridge.configExpansions || []).some(function(expansion) {
    return expansion.name === 'InventorySlots' && expansion.configKey === 'slots';
  }), 'inventory should inherit slot config expansion for bridge output');

  console.log('[Components] ' + catalog.components.length + ' component manifests passed');
}

main();
