var intentDsl = require('./intent-dsl');
var intentSurfaceGuard = require('./intent-surface-guard');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertThrows(fn, pattern, message) {
  try {
    fn();
  } catch (e) {
    if (pattern && !pattern.test(e.message)) {
      throw new Error(message + ': unexpected error ' + e.message);
    }
    return e;
  }
  throw new Error(message + ': expected throw');
}

function testNaturalIntentParses() {
  var ast = intentDsl.parseIntentDsl([
    'make a mobile platformer',
    'give Player platformer movement',
    'add joystick controls Player near screen bottom-left',
    'add jump button controls Player near screen bottom-right',
    'add attack button controls Player near jump button left',
    'add inventory owned by Player with 24 slots near screen right',
    'adjust Fox placement above slightly',
    'place coins near Player front as trail count 8',
    'place enemies near Player far front as guard count 3'
  ].join('\n'));

  assert(ast.schemaVersion === 1, 'schema version should be 1');
  assert(ast.commands.length === 9, 'should parse nine commands');
  assert(ast.commands[0].kind === 'makeGame', 'first command should be makeGame');
  assert(ast.commands[0].tags.indexOf('mobile') >= 0, 'makeGame should keep mobile tag');
  assert(ast.commands[1].kind === 'giveAbility', 'second command should be giveAbility');
  assert(ast.commands[2].kind === 'addControl', 'joystick should be addControl');
  assert(ast.commands[2].control === 'joystick', 'joystick control should be natural name');
  assert(ast.commands[2].target === 'Player', 'joystick should target Player');
  assert(ast.commands[2].placement.anchor === 'screen', 'joystick anchor should be screen');
  assert(ast.commands[2].placement.direction === 'bottom-left', 'joystick direction should be bottom-left');
  assert(ast.commands[4].placement.anchor === 'jump button', 'attack button should anchor to jump button');
  assert(ast.commands[5].kind === 'addInventory', 'inventory should parse as addInventory');
  assert(ast.commands[5].slots === 24, 'inventory slots should parse');
  assert(ast.commands[6].kind === 'adjust', 'placement edit should parse as adjust');
  assert(ast.commands[6].subject === 'Fox', 'placement edit should keep subject');
  assert(ast.commands[6].dimension === 'placement', 'placement edit should use placement dimension');
  assert(ast.commands[6].direction === 'above', 'placement edit should keep semantic direction');
  assert(ast.commands[6].amount === 'slightly', 'placement edit should normalize semantic amount');
  assert(ast.commands[7].kind === 'placeGroup', 'coins should parse as placeGroup');
  assert(ast.commands[7].archetype === 'Coin', 'coins archetype should singularize');
  assert(ast.commands[7].placement.pattern === 'trail', 'coins pattern should be trail');
  assert(ast.commands[7].placement.count === 8, 'coins count should parse');
  assert(ast.commands[8].placement.direction === 'far-front', 'far front should normalize to far-front');
}

function testMachineFormsRejected() {
  [
    'install module id=core.platformer preset=mobile',
    'add component id=input.jump_button target=Player near=screen direction=bottom-right',
    'place at x=120 y=480',
    'adjust Fox placement above 10 pixels',
    'move Fox up 10 pixels',
    'nudge Fox left 8px',
    'adjust Fox placement above delta=8',
    '把狐狸往上10像素',
    '狐狸上移8px',
    '把按钮向左 12 像素',
    '把狐狸移动10像素到上方',
    'remove event #2',
    'use runtime adapter gdjs.virtual_joystick',
    'CollisionNP'
  ].forEach(function(line) {
    assertThrows(function() {
      intentDsl.parseIntentDsl(line);
    }, /prohibited machine\/backend form/, 'machine form should be rejected: ' + line);
  });
}

function testUnsupportedNaturalFormsFailFast() {
  assertThrows(function() {
    intentDsl.parseIntentDsl('please make the button nicer');
  }, /Unsupported Intent DSL line/, 'unsupported natural line should fail fast');

  assertThrows(function() {
    intentDsl.parseIntentDsl('add jump button controls Player near somewhere cozy');
  }, /Invalid placement/, 'invalid placement should fail fast');
}

function testSemanticNumbersStillAllowed() {
  var violations = intentSurfaceGuard.detectProhibitedSurface('给玩家一个24格背包');
  assert(!violations.some(function(violation) {
    return violation.id === 'coordinates';
  }), 'semantic inventory slot count should not be treated as coordinate-like movement');
}

function main() {
  testNaturalIntentParses();
  testMachineFormsRejected();
  testUnsupportedNaturalFormsFailFast();
  testSemanticNumbersStillAllowed();
  console.log('[IntentDsl] natural parser and guard passed');
}

main();
