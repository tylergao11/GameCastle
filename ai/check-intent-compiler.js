var intentCompiler = require('./intent-compiler');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function findByName(list, name) {
  return list.find(function(item) { return item.name === name; });
}

function findComponent(graph, componentId) {
  return graph.components.find(function(component) {
    return component.componentId === componentId;
  });
}

function hasTrace(card, stage, owner) {
  return card.ownerTrace.some(function(item) {
    return item.stage === stage && item.owner === owner;
  });
}

function testCompileGraphAndResultCard() {
  var compiled = intentCompiler.compileIntentDsl([
    'make a mobile platformer',
    'add joystick controls Player near screen bottom-left',
    'add jump button controls Player near screen bottom-right',
    'add attack button controls Player near jump button left',
    'add inventory owned by Player with 24 slots near screen right',
    'place coins near Player front as trail count 8'
  ].join('\n'));

  var graph = compiled.graph;
  var card = compiled.resultCard;

  assert(graph.schemaVersion === 1, 'graph schema should be 1');
  assert(card.schemaVersion === 1, 'result card schema should be 1');
  assert(graph.modules.some(function(module) { return module.id === 'core.platformer'; }), 'mobile platformer should infer core.platformer');
  assert(findByName(graph.things, 'Player'), 'Player thing should exist');
  assert(findByName(graph.things, 'Joystick'), 'Joystick thing should exist');
  assert(findByName(graph.things, 'JumpButton'), 'JumpButton thing should exist');
  assert(findByName(graph.things, 'AttackButton'), 'AttackButton thing should exist');
  assert(findByName(graph.things, 'Inventory'), 'Inventory thing should exist');
  assert(findByName(graph.things, 'CoinsGroup'), 'CoinsGroup thing should exist');

  assert(graph.components.some(function(component) {
    return component.componentId === 'movement.platformer' && component.target === 'Player';
  }), 'Player should have platformer movement');
  assert(graph.components.some(function(component) {
    return component.componentId === 'input.virtual_joystick' && component.target === 'Player';
  }), 'Player should have joystick component');
  assert(graph.components.some(function(component) {
    return component.componentId === 'input.jump_button' && component.target === 'Player';
  }), 'Player should have jump button component');
  assert(graph.components.some(function(component) {
    return component.componentId === 'input.attack_button' && component.target === 'Player';
  }), 'Player should have attack button component');
  assert(graph.components.some(function(component) {
    return component.componentId === 'system.inventory' && component.owner === 'Player';
  }), 'Player should own inventory component');
  assert(findComponent(graph, 'input.virtual_joystick').config.deadZone === 'standard', 'joystick config should come from component manifest');
  assert(findComponent(graph, 'input.jump_button').config.pressMode === 'tap', 'jump config should come from component manifest');
  assert(findComponent(graph, 'input.jump_button').config.shape === 'rectangle', 'jump config should inherit touch button shape');
  assert(findComponent(graph, 'input.jump_button').config.width === 72, 'jump config should inherit touch button width');
  assert(findComponent(graph, 'input.jump_button').config.keyboardKey === 'Space', 'jump config should carry sealed runtime key');
  assert(findComponent(graph, 'input.jump_button').config.controlLabel === 'J', 'jump config should carry sealed runtime label');
  assert(findComponent(graph, 'input.attack_button').config.pressMode === 'tap', 'attack config should inherit touch button press mode');
  assert(findComponent(graph, 'input.attack_button').config.color === '#EB5757', 'attack config should keep concrete visual override');
  assert(findComponent(graph, 'input.attack_button').config.keyboardKey === 'KeyZ', 'attack config should carry sealed runtime key');
  assert(findComponent(graph, 'system.inventory').config.persistence === 'session', 'inventory config should inherit manifest defaults');
  assert(findComponent(graph, 'system.inventory').config.uiMode === 'panel', 'inventory config should inherit panel mode');
  assert(findComponent(graph, 'system.inventory').config.width === 160, 'inventory config should inherit panel width');
  assert(findComponent(graph, 'system.inventory').config.panelTitle === 'Inventory', 'inventory config should carry sealed panel title');

  assert(graph.relations.some(function(relation) {
    return relation.type === 'controls' && relation.from === 'Joystick' && relation.to === 'Player';
  }), 'Joystick should control Player');
  assert(graph.relations.some(function(relation) {
    return relation.type === 'owns' && relation.from === 'Player' && relation.to === 'Inventory';
  }), 'Player should own Inventory');
  assert(graph.placements.some(function(placement) {
    return placement.subject === 'Joystick' && placement.anchor === 'screen' && placement.direction === 'bottom-left';
  }), 'Joystick placement should be screen bottom-left');
  assert(graph.placements.some(function(placement) {
    return placement.subject === 'AttackButton' && placement.anchor === 'JumpButton' && placement.direction === 'left';
  }), 'AttackButton placement should rewrite natural jump button anchor to JumpButton');
  assert(graph.placements.some(function(placement) {
    return placement.subject === 'CoinsGroup' && placement.anchor === 'Player' && placement.pattern === 'trail' && placement.count === 8;
  }), 'CoinsGroup should keep trail placement');

  assert(card.rewrites.some(function(rewrite) {
    return rewrite.from === 'joystick' && rewrite.to === 'input.virtual_joystick' && rewrite.mechanism === 'component-alias';
  }), 'ResultCard should record joystick rewrite');
  assert(card.rewrites.some(function(rewrite) {
    return rewrite.from === 'jump button' && rewrite.to === 'JumpButton' && rewrite.mechanism === 'natural-anchor';
  }), 'ResultCard should record natural anchor rewrite');
  assert(card.autoAdded.some(function(item) {
    return item.kind === 'thing' && item.id === 'thing.player';
  }), 'ResultCard should record auto-added Player from module preset');
  assert(card.autoAdded.some(function(item) {
    return item.kind === 'config-default' && item.id === 'input.virtual_joystick.deadZone';
  }), 'ResultCard should record inherited joystick defaults');
  assert(card.autoAdded.some(function(item) {
    return item.kind === 'config-default' && item.id === 'input.jump_button.shape';
  }), 'ResultCard should record inherited touch button defaults');
  assert(card.autoAdded.some(function(item) {
    return item.kind === 'config-default' && item.id === 'system.inventory.persistence';
  }), 'ResultCard should record inherited inventory defaults');
  assert(card.autoAdded.some(function(item) {
    return item.kind === 'config-default' && item.id === 'system.inventory.uiMode';
  }), 'ResultCard should record inherited inventory panel defaults');
  assert(card.overrides.some(function(item) {
    return item.component === 'system.inventory' && item.key === 'slots' && item.value === 24;
  }), 'ResultCard should record natural inventory slots override');
  assert(graph.requirements.some(function(item) {
    return item.owner === 'component catalog' && item.sourceComponent === 'input.virtual_joystick';
  }), 'component catalog should record inherited control requirements');
  assert(card.emitted.some(function(line) {
    return line.indexOf('intent graph components=') === 0;
  }), 'ResultCard should emit graph fact summary');
  assert(hasTrace(card, 'Resolve Symbols', 'intent-compiler'), 'ResultCard should trace symbol resolution');
  assert(hasTrace(card, 'Resolve Placement', 'placement-resolver'), 'ResultCard should trace placement resolution');
  assert(hasTrace(card, 'Compile Bindings', 'binding-compiler'), 'ResultCard should trace binding compilation');
  assert(hasTrace(card, 'Expand Components', 'component-expander'), 'ResultCard should trace component expansion');
}

function testAutoMovementForControlOnlyIntent() {
  var compiled = intentCompiler.compileIntentDsl('add joystick controls Hero near screen bottom-left');
  var graph = compiled.graph;
  var card = compiled.resultCard;
  assert(findByName(graph.things, 'Hero'), 'Hero thing should be auto-added');
  assert(graph.components.some(function(component) {
    return component.componentId === 'movement.platformer' && component.target === 'Hero';
  }), 'control-only intent should auto-add movement');
  assert(card.autoAdded.some(function(item) {
    return item.kind === 'component' && item.id.indexOf('movement_platformer') >= 0;
  }), 'ResultCard should record auto-added movement component');
}

function testNaturalActionOverride() {
  var compiled = intentCompiler.compileIntentDsl('add fire button controls Player fire near screen bottom-right');
  assert(compiled.resultCard.overrides.some(function(item) {
    return item.component === 'input.attack_button' && item.key === 'action' && item.value === 'fire';
  }), 'explicit natural action should record a component override');
}

function testSemanticPlacementEdit() {
  var compiled = intentCompiler.compileIntentDsl('adjust Fox placement above slightly', {
    placementContext: {
      objectBounds: {
        Fox: { x: 240, y: 320, width: 64, height: 64 }
      }
    }
  });
  var edit = compiled.graph.edits[0];
  assert(edit, 'semantic placement edit should compile into graph edit constraint');
  assert(edit.kind === 'editConstraint', 'semantic placement edit should use editConstraint kind');
  assert(edit.subject === 'Fox', 'semantic placement edit should preserve subject');
  assert(edit.direction === 'above', 'semantic placement edit should preserve direction');
  assert(edit.amount === 'slightly', 'semantic placement edit should preserve semantic amount');
  assert(edit.owner === 'placement-resolver', 'semantic placement edit should route to placement resolver');
  assert(compiled.contracts && compiled.contracts.edits === 'passed', 'aggregate contract should validate edit constraints');
  assert(compiled.contracts.graph.edits === 1, 'contract summary should count graph edits');
  assert(compiled.contracts.placementPlan.edits === 1, 'contract summary should count placement plan edits');
  assert(compiled.resultCard.resolved.some(function(item) {
    return item.subject === 'Fox' && item.edit === 'placement.above' && item.amount === 'slightly';
  }), 'ResultCard should record semantic placement edit');
  assert(compiled.resultCard.emitted.indexOf('intent graph edits=1') >= 0, 'ResultCard should emit edit count');
  assert(hasTrace(compiled.resultCard, 'Build Edit Constraints', 'intent-compiler'), 'ResultCard should trace edit constraint build');
}

function testMachineFormRejectedBeforeCompile() {
  try {
    intentCompiler.compileIntentDsl('add component id=input.jump_button target=Player near=screen direction=bottom-right');
  } catch (e) {
    assert(e.message.indexOf('prohibited machine/backend form') >= 0, 'machine form should fail through surface guard');
    return;
  }
  throw new Error('machine form should have failed');
}

function testPlacementGroupsEmitCanonicalMemberObjects() {
  var compiled = intentCompiler.compileIntentDsl([
    'make a mobile platformer',
    'place coins near Player front as trail count 5',
    'place enemies near Player front as guard count 2',
    'place platforms near Player bottom as line count 3'
  ].join('\n'));
  var lines = compiled.bridgePlan.targetPlanLines;
  assert(lines.some(function(line) { return line.indexOf('place object=Enemy ') === 0; }), 'enemy group must emit the canonical Enemy object');
  assert(lines.some(function(line) { return line.indexOf('place object=Platform ') === 0; }), 'platform group must emit the canonical Platform object');
  assert(lines.some(function(line) { return line.indexOf('place object=Coin ') === 0; }), 'coin group must emit the canonical Coin object');
  assert(!lines.some(function(line) { return /^place object=(Enemies|Platforms|Coins)\b/.test(line); }), 'group labels must never leak into target object names');
}

function testScreenEdgeRelativePlacement() {
  var compiled = intentCompiler.compileIntentDsl([
    'make a mobile platformer',
    'place coins near screen bottom above as line count 5'
  ].join('\n'));
  var placement = compiled.graph.placements[0];
  var resolved = compiled.placementPlan.placements[0];
  assert(placement.anchor === 'screen.bottom', 'natural screen edge anchor must canonicalize in the compiler');
  assert(!resolved.unresolved && resolved.points.length === 5, 'placement owner must resolve screen-edge-relative groups');
  assert(compiled.resultCard.rewrites.some(function(item) {
    return item.from === 'screen bottom' && item.to === 'screen.bottom' && item.mechanism === 'screen-edge-anchor';
  }), 'screen edge normalization must stay visible in ResultCard');
}

function main() {
  testCompileGraphAndResultCard();
  testAutoMovementForControlOnlyIntent();
  testNaturalActionOverride();
  testSemanticPlacementEdit();
  testMachineFormRejectedBeforeCompile();
  testPlacementGroupsEmitCanonicalMemberObjects();
  testScreenEdgeRelativePlacement();
  console.log('[IntentCompiler] graph, inheritance, rewrites, and ResultCard passed');
}

main();
