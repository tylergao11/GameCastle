var SCHEMA_VERSION = 1;
var intentSurfaceGuard = require('./intent-surface-guard');
var intentDsl = require('./intent-dsl');
var writeContract = require('./intent-write-contract');

var COMMAND_SLOTS = {
  make_game: ['description'],
  give_ability: ['target', 'ability'],
  add_control: ['control', 'target', 'action', 'anchor', 'direction'],
  add_inventory: ['owner', 'slots', 'anchor', 'direction'],
  place_group: ['subject', 'anchor', 'direction', 'pattern', 'count'],
  adjust_placement: ['subject', 'direction', 'amount'],
};

var DIRECTIONS = writeContract.DIRECTIONS;
var PATTERNS = writeContract.PATTERNS;
var AMOUNTS = writeContract.AMOUNTS;

function cleanJsonOutput(text) {
  text = String(text || '').trim();
  var fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fence ? fence[1].trim() : text;
}

function stringSlot(slots, key, required) {
  var value = slots[key];
  if (value === undefined || value === null || value === '') {
    if (required) throw new Error('Intent slot is required: ' + key);
    return null;
  }
  value = String(value).trim();
  if (!value || value.length > 160 || /[\r\n={}]/.test(value)) throw new Error('Intent slot is invalid: ' + key);
  if (intentSurfaceGuard.detectProhibitedSurface(value).length) throw new Error('Intent slot contains prohibited implementation syntax: ' + key);
  return value;
}

function enumSlot(slots, key, allowed, required) {
  var value = stringSlot(slots, key, required);
  if (value === null) return null;
  value = value.toLowerCase().replace(/\s+/g, '-');
  if (allowed.indexOf(value) < 0) throw new Error('Intent slot value is not allowed: ' + key + '=' + value);
  return value;
}

function integerSlot(slots, key, required, minimum, maximum) {
  var value = slots[key];
  if ((value === undefined || value === null || value === '') && !required) return null;
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error('Intent slot integer is invalid: ' + key);
  return value;
}

function assertKnownSlots(kind, slots) {
  var allowed = COMMAND_SLOTS[kind];
  if (!allowed) throw new Error('Unknown Intent slot command kind: ' + kind);
  Object.keys(slots).forEach(function(key) {
    if (allowed.indexOf(key) < 0) throw new Error('Unknown Intent slot for ' + kind + ': ' + key);
  });
}

function parseSlotPacket(text) {
  var packet;
  try {
    packet = JSON.parse(cleanJsonOutput(text));
  } catch (error) {
    throw new Error('Intent slot packet must be valid JSON: ' + error.message);
  }
  if (!packet || packet.schemaVersion !== SCHEMA_VERSION || !Array.isArray(packet.commands)) {
    throw new Error('Intent slot packet must use schemaVersion 1 and a commands array.');
  }
  var commands = packet.commands.map(function(command) {
    if (!command || typeof command !== 'object' || typeof command.kind !== 'string' || !command.slots || typeof command.slots !== 'object' || Array.isArray(command.slots)) {
      throw new Error('Each Intent command must contain kind and slots.');
    }
    var normalized = { kind: command.kind, slots: Object.assign({}, command.slots) };
    assertKnownSlots(normalized.kind, normalized.slots);
    return normalized;
  });
  if (!commands.length) throw new Error('Intent slot packet contains no commands.');
  return { schemaVersion: SCHEMA_VERSION, commands: commands };
}

function groupAnchorName(anchor, groupSubjects) {
  var lower = String(anchor || '').toLowerCase();
  if (!groupSubjects[lower]) return anchor;
  return lower.split(/\s+/).map(function(part) { return part[0].toUpperCase() + part.slice(1); }).join('') + 'Group';
}

function renderCommand(command, context) {
  var slots = command.slots;
  if (command.kind === 'make_game') return 'make a ' + stringSlot(slots, 'description', true).replace(/^(?:a|an)\s+/i, '');
  if (command.kind === 'give_ability') {
    var ability = stringSlot(slots, 'ability', true).toLowerCase();
    if (!writeContract.ability(ability)) {
      var abilityError = new Error('Intent ability is owned by component-catalog: ' + ability);
      abilityError.nonRepairableByLlm = true;
      throw abilityError;
    }
    return 'give ' + stringSlot(slots, 'target', true) + ' ' + ability;
  }
  if (command.kind === 'add_control') {
    var control = enumSlot(slots, 'control', writeContract.CONTROL_VALUES.map(function(item) { return item.value.replace(/ /g, '-'); }), true).replace(/-/g, ' ');
    var target = stringSlot(slots, 'target', true);
    var action = stringSlot(slots, 'action', false);
    var anchor = groupAnchorName(stringSlot(slots, 'anchor', true), context.groupSubjects);
    var direction = enumSlot(slots, 'direction', DIRECTIONS, true);
    return 'add ' + control + ' controls ' + target + (action ? ' ' + action : '') + ' near ' + anchor + ' ' + direction;
  }
  if (command.kind === 'add_inventory') {
    var owner = stringSlot(slots, 'owner', true);
    var inventorySize = integerSlot(slots, 'slots', false, 1, 999);
    return 'add inventory owned by ' + owner + (inventorySize === null ? '' : ' with ' + inventorySize + ' slots') + ' near ' + groupAnchorName(stringSlot(slots, 'anchor', true), context.groupSubjects) + ' ' + enumSlot(slots, 'direction', DIRECTIONS, true);
  }
  if (command.kind === 'place_group') {
    var subject = enumSlot(slots, 'subject', writeContract.PLACE_GROUP_VALUES, true);
    var anchorValue = stringSlot(slots, 'anchor', true).toLowerCase();
    var pattern = enumSlot(slots, 'pattern', PATTERNS, false);
    var count = integerSlot(slots, 'count', false, 1, 100);
    return 'place ' + subject + ' near ' + groupAnchorName(anchorValue, context.groupSubjects) + ' ' + enumSlot(slots, 'direction', DIRECTIONS, true) + (pattern ? ' as ' + pattern : '') + (count === null ? '' : ' count ' + count);
  }
  if (command.kind === 'adjust_placement') {
    return 'adjust ' + stringSlot(slots, 'subject', true) + ' placement ' + enumSlot(slots, 'direction', ['above', 'below', 'left', 'right', 'front', 'behind'], true) + ' ' + enumSlot(slots, 'amount', AMOUNTS, true);
  }
  throw new Error('Unknown Intent slot command kind: ' + command.kind);
}

function renderSlotPacket(text) {
  var packet = parseSlotPacket(text);
  var groupSubjects = {};
  packet.commands.forEach(function(command) {
    if (command.kind === 'place_group') groupSubjects[String(command.slots.subject || '').toLowerCase()] = true;
  });
  return {
    packet: packet,
    intentDslText: packet.commands.map(function(command) { return renderCommand(command, { groupSubjects: groupSubjects }); }).join('\n'),
  };
}

function packetFromIntentDsl(text) {
  var parsed = intentDsl.parseIntentDsl(text);
  var commands = parsed.commands.map(function(command) {
    if (command.kind === 'makeGame') {
      return { kind: 'make_game', slots: { description: command.description } };
    }
    if (command.kind === 'giveAbility') {
      return { kind: 'give_ability', slots: { target: command.target, ability: command.ability } };
    }
    if (command.kind === 'addControl') {
      return { kind: 'add_control', slots: Object.assign({
        control: command.control,
        target: command.target,
        anchor: command.placement.anchor,
        direction: command.placement.direction,
      }, command.action ? { action: command.action } : {}) };
    }
    if (command.kind === 'addInventory') {
      return { kind: 'add_inventory', slots: Object.assign({
        owner: command.owner,
        anchor: command.placement.anchor,
        direction: command.placement.direction,
      }, command.slots === undefined ? {} : { slots: command.slots }) };
    }
    if (command.kind === 'placeGroup') {
      return { kind: 'place_group', slots: Object.assign({
        subject: command.subject.toLowerCase(),
        anchor: command.placement.anchor,
        direction: command.placement.direction,
      }, command.placement.pattern ? { pattern: command.placement.pattern.replace(/_/g, '-') } : {}, command.placement.count === undefined ? {} : { count: command.placement.count }) };
    }
    if (command.kind === 'adjust') {
      var direction = command.direction === 'up' ? 'above' : (command.direction === 'down' ? 'below' : command.direction);
      return { kind: 'adjust_placement', slots: { subject: command.subject, direction: direction, amount: command.amount || 'slightly' } };
    }
    throw new Error('Intent DSL fixture command has no slot mapping: ' + command.kind);
  });
  return parseSlotPacket(JSON.stringify({ schemaVersion: SCHEMA_VERSION, commands: commands }));
}

module.exports = {
  SCHEMA_VERSION: SCHEMA_VERSION,
  COMMAND_SLOTS: COMMAND_SLOTS,
  parseSlotPacket: parseSlotPacket,
  renderSlotPacket: renderSlotPacket,
  packetFromIntentDsl: packetFromIntentDsl,
};
