var assert = require('assert');
var fs = require('fs');
var path = require('path');

var intentCompiler = require('./intent-compiler');
var gdjsBridge = require('./gdjs-bridge');
var emissionContract = require('./gdjs-bridge-emission-contract');
var runtimeAdapterContract = require('./runtime-adapter-requirement-contract');
var pipeline = require('./pipeline');

function hasLine(plan, pattern) {
  return plan.dslLines.some(function(line) {
    return pattern.test(line);
  });
}

function hasTrace(card, stage, owner) {
  return card.ownerTrace.some(function(item) {
    return item.stage === stage && item.owner === owner;
  });
}

function hasAdapter(plan, adapter, componentId) {
  return plan.runtimeAdapterRequirements.some(function(item) {
    return item.adapter === adapter && item.componentId === componentId;
  });
}

async function assertBridgeDslExecutes(plan) {
  var project = pipeline.emptyProject('BridgeCheck');
  var ops = pipeline.parseDSL(plan.dslText);
  assert.strictEqual(ops.length, plan.dslLines.length, 'all bridge DSL lines should parse');
  for (var i = 0; i < ops.length; i++) {
    var result = await pipeline.execute(project, ops[i]);
    assert(result.ok, 'bridge DSL line should execute: ' + plan.dslLines[i] + ' -> ' + result.msg);
  }
  assert(project.layouts.some(function(layout) { return layout.name === 'Game'; }), 'executed bridge DSL should create Game scene');
  var scene = project.layouts.find(function(layout) { return layout.name === 'Game'; });
  assert(scene.objects.some(function(object) { return object.name === 'Joystick'; }), 'executed bridge DSL should create Joystick object');
  assert(scene.instances.some(function(instance) { return instance.name === 'JumpButton' && instance.layer === 'UI'; }), 'executed bridge DSL should place JumpButton on UI layer');
}

async function testBridgePlanFromIntent() {
  var compiled = intentCompiler.compileIntentDsl([
    'make a mobile platformer',
    'add joystick controls Player near screen bottom-left',
    'add jump button controls Player near screen bottom-right',
    'add attack button controls Player near jump button left',
    'add inventory owned by Player with 24 slots near screen right',
    'place coins near Player front as trail count 3'
  ].join('\n'), {
    placementContext: {
      objectBounds: {
        Player: { x: 100, y: 400, width: 32, height: 48 }
      }
    }
  });

  var plan = compiled.bridgePlan;
  emissionContract.assertPlan(plan);
  runtimeAdapterContract.assertRequirements(plan.runtimeAdapterRequirements);
  assert(plan, 'Intent compiler should emit a GDJS bridge plan');
  assert.strictEqual(plan.schemaVersion, 1, 'bridge schema should be 1');
  assert.strictEqual(plan.target, 'gdjs-internal-dsl', 'bridge target should be internal DSL');
  assert(plan.contracts && plan.contracts.emission === 'passed', 'bridge should self-validate emission contract');
  assert(plan.contracts && plan.contracts.runtimeAdapters === 'passed', 'bridge should self-validate runtime adapter contract');
  assert.strictEqual(plan.diagnostics.length, 0, 'bridge should not emit diagnostics for the happy path');
  assert(plan.dslLines.length > 20, 'bridge should combine module DSL and component DSL');
  assert(plan.dslText.indexOf('create scene name=Game first=true') >= 0, 'bridge should include product module DSL');

  assert(
    plan.installedModules.some(function(module) {
      return module.id === 'core.platformer' && module.preset === 'mobile';
    }),
    'mobile platformer should compile through the product module layer'
  );

  assert(hasLine(plan, /^add layer name=UI scene=Game visible=true$/), 'bridge should create the UI layer');
  assert(hasLine(plan, /^create object name=Joystick type=ShapePainter shape=circle/), 'bridge should create joystick object');
  assert(hasLine(plan, /^place object=Joystick at=\d+,\d+ scene=Game width=96 height=96 layer=UI$/), 'bridge should place joystick on UI layer');
  assert(hasLine(plan, /^create object name=JumpButton type=ShapePainter shape=rectangle color=#27AE60 width=72 height=72/), 'bridge should create jump button object from inherited manifest config');
  assert(hasLine(plan, /^create object name=AttackButton type=ShapePainter shape=rectangle color=#EB5757 width=72 height=72/), 'bridge should create attack button object from inherited manifest config');
  assert(hasLine(plan, /^create object name=Inventory type=ShapePainter shape=rectangle color=#4F4F4F width=160 height=220/), 'bridge should create inventory object from inherited panel config');
  assert(hasLine(plan, /^set variable name=InventorySlots value=24 type=Number scope=global$/), 'bridge should emit inventory slot variable');
  assert(hasLine(plan, /^place object=Coin at=\d+,\d+ scene=Game$/), 'bridge should emit semantic coin trail placements');
  assert(plan.emitted.some(function(item) {
    return item.mechanism === 'component-object-expansion' && item.routeId === 'collision-mask-setup';
  }), 'bridge emitted object lines should carry component expansion evidence');
  assert(plan.emitted.some(function(item) {
    return item.mechanism === 'component-placement-rewrite' && item.routeId === 'awkward-gdjs-parameters';
  }), 'bridge emitted placement lines should carry target rewrite evidence');
  assert(plan.emitted.some(function(item) {
    return item.mechanism === 'semantic-group-placement-rewrite' && item.routeId === 'semantic-pattern-placement';
  }), 'bridge emitted semantic group lines should inherit placement emission evidence');
  assert(!plan.emitted.some(function(item) {
    return item.mechanism === 'semantic-group-placement-rewrite' && item.routeId === 'awkward-gdjs-parameters';
  }), 'bridge should not hard-code awkward GDJS route for semantic group placement');
  assert(plan.emitted.some(function(item) {
    return item.mechanism === 'component-config-expansion' && item.routeId === 'inventory-expansion';
  }), 'bridge emitted inventory config should carry component expansion evidence');

  assert(hasAdapter(plan, 'virtual-joystick', 'input.virtual_joystick'), 'joystick should require virtual joystick adapter');
  assert(hasAdapter(plan, 'touch-button', 'input.jump_button'), 'jump button should require touch button adapter');
  assert(hasAdapter(plan, 'touch-button', 'input.attack_button'), 'attack button should require touch button adapter');
  assert(hasAdapter(plan, 'inventory-storage', 'system.inventory'), 'inventory should require storage adapter');
  assert(hasAdapter(plan, 'inventory-panel', 'system.inventory'), 'inventory should require panel adapter');
  assert(plan.runtimeAdapterRequirements.some(function(req) {
    return req.adapter === 'virtual-joystick' && req.routeId === 'touch-multitouch-state' && req.routeOwner === 'runtime-adapter' && req.mechanism === 'touch-axis-adapter';
  }), 'joystick adapter should carry runtime route evidence');
  assert(plan.runtimeAdapterRequirements.some(function(req) {
    return req.adapter === 'inventory-storage' && req.routeId === 'inventory-persistence' && req.routeOwner === 'runtime-adapter' && req.mechanism === 'inventory-storage-adapter';
  }), 'inventory storage adapter should carry persistence route evidence');

  assert(hasTrace(compiled.resultCard, 'Emit Internal DSL', 'gdjs-bridge'), 'ResultCard should trace bridge emission');
  assert(
    compiled.resultCard.emitted.some(function(line) { return line.indexOf('bridge plan internalDslLines=') === 0; }),
    'ResultCard should summarize bridge DSL lines'
  );
  await assertBridgeDslExecutes(plan);

  var bridgeSource = fs.readFileSync(path.join(__dirname, 'gdjs-bridge.js'), 'utf8');
  assert(bridgeSource.indexOf("manifest.id === 'input.jump_button'") < 0, 'bridge should not hard-code jump button leaf id for object specs');
  assert(bridgeSource.indexOf("manifest.id === 'input.attack_button'") < 0, 'bridge should not hard-code attack button leaf id for object specs');
  assert(bridgeSource.indexOf("manifest.id === 'system.inventory'") < 0, 'bridge should not hard-code inventory leaf id for object specs or config expansion');
  assert(bridgeSource.indexOf('runtimeAdapterMeta') < 0, 'bridge should not centralize runtime adapter route metadata in code');
  assert(bridgeSource.indexOf("adapter === '") < 0, 'bridge should not branch on adapter ids for route metadata');
  assert(bridgeSource.indexOf("type: 'ShapePainter'") < 0, 'bridge should not hard-code component object type');
  assert(bridgeSource.indexOf("config.color ||") < 0, 'bridge should not default component object colors');
  assert(bridgeSource.indexOf("config.layer ||") < 0, 'bridge should not default component object layers');
  assert(bridgeSource.indexOf("manifest.kind === 'control'") < 0, 'bridge should not infer object emission from component kind');
  assert(bridgeSource.indexOf("mechanism: 'component-ui-layer'") < 0, 'bridge should not hard-code layer emission mechanism');
  assert(bridgeSource.indexOf("routeId: 'responsive-ui'") < 0, 'bridge should not hard-code layer route id');
  assert(bridgeSource.indexOf("mechanism: 'component-placement-rewrite'") < 0, 'bridge should not hard-code placement emission mechanism');
}

function testBridgeRoutesUnknownComponentToOwnerDiagnostic() {
  var plan = gdjsBridge.compileBridge({
    graph: {
      modules: [],
      components: [
        {
          componentId: 'system.crafting',
          thing: 'Crafting',
          config: {}
        }
      ],
      things: [],
      placements: []
    },
    placementPlan: { placements: [] },
    resultCard: {
      emitted: [],
      diagnostics: [],
      ownerTrace: []
    }
  });

  assert.strictEqual(plan.diagnostics.length, 1, 'unknown component should produce one bridge diagnostic');
  assert.strictEqual(plan.diagnostics[0].owner, 'component-catalog');
  assert.strictEqual(plan.diagnostics[0].category, 'unknown-component');
  assert.strictEqual(plan.dslLines.length, 0, 'unknown component should not emit guessed target DSL');
}

async function main() {
  await testBridgePlanFromIntent();
  testBridgeRoutesUnknownComponentToOwnerDiagnostic();
  console.log('[GdjsBridge] internal DSL bridge plan passed');
}

main().catch(function(error) {
  console.error(error);
  process.exit(1);
});
