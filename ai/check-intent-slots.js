var assert = require('assert');
var intentSlots = require('./intent-slots');

function packet() {
  return {
    schemaVersion: 1,
    commands: [
      { kind: 'make_game', slots: { description: 'mobile platformer' } },
      { kind: 'place_group', slots: { subject: 'platforms', anchor: 'screen', direction: 'center', pattern: 'single' } },
      { kind: 'place_group', slots: { subject: 'platforms', anchor: 'screen', direction: 'left', pattern: 'single' } },
      { kind: 'place_group', slots: { subject: 'coins', anchor: 'platforms', direction: 'above', pattern: 'trail' } },
    ],
  };
}

function main() {
  var rendered = intentSlots.renderSlotPacket(JSON.stringify(packet()));
  assert.strictEqual(rendered.packet.commands.length, packet().commands.length, 'renderer should preserve every LLM2 command');
  assert.strictEqual(rendered.packet.commands.filter(function(command) { return command.kind === 'add_control'; }).length, 0, 'renderer should preserve the absence of control commands');
  assert.strictEqual(rendered.intentDslText.split(/\r?\n/).length, packet().commands.length, 'renderer should emit one DSL line for each command');
  assert(rendered.intentDslText.indexOf('PlatformsGroup') >= 0, 'renderer should bind a declared group anchor to its canonical symbol');
  assert.strictEqual((rendered.intentDslText.match(/^place platforms /gm) || []).length, 2, 'renderer should preserve distinct placement commands');

  var fixturePacket = intentSlots.packetFromIntentDsl([
    'make a mobile platformer',
    'add joystick controls Player near screen bottom-left',
    'place coins near Player front as trail count 3',
  ].join('\n'));
  assert.strictEqual(fixturePacket.commands[0].kind, 'make_game', 'compiler fixture should map through the same slot contract');
  assert(fixturePacket.commands.some(function(command) { return command.kind === 'place_group'; }), 'compiler fixture should preserve explicit group placement');

  assert.throws(function() {
    intentSlots.renderSlotPacket(JSON.stringify({ schemaVersion: 1, commands: [{ kind: 'invent', slots: {} }] }));
  }, /Unknown Intent slot command kind/, 'undeclared command kinds must fail closed');
  assert.throws(function() {
    intentSlots.renderSlotPacket(JSON.stringify({ schemaVersion: 1, commands: [{ kind: 'make_game', slots: { description: 'x=20' } }] }));
  }, /Intent slot/, 'slot values must reject implementation syntax');

  console.log('[IntentSlots] closed packet, command preservation, canonical anchors, and deterministic rendering passed');
}

main();
