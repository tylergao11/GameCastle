var intentSurfaceGuard = require('./intent-surface-guard');

var INTENT_DSL_SCHEMA_VERSION = 1;

function trimLine(line) {
  return String(line || '').trim();
}

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function singularize(value) {
  value = String(value || '');
  if (value.toLowerCase() === 'coins') return 'Coin';
  if (value.toLowerCase() === 'enemies') return 'Enemy';
  if (value.endsWith('s') && value.length > 1) return value.slice(0, -1);
  return value;
}

function parsePlacement(text) {
  text = normalizeName(text);
  if (!text) return null;

  var nearMatch = text.match(/\bnear\s+(.+?)\s+(top-left|top-right|bottom-left|bottom-right|far front|front|behind|left|right|above|below|top|bottom|center)(?:\s+(?:as|in)\s+([a-z_ -]+?))?(?:\s+count\s+(\d+))?$/i);
  if (!nearMatch) return null;

  return {
    anchor: normalizeName(nearMatch[1]),
    direction: normalizeName(nearMatch[2]).replace(/\s+/g, '-').toLowerCase(),
    pattern: nearMatch[3] ? normalizeName(nearMatch[3]).replace(/\s+/g, '_').toLowerCase() : undefined,
    count: nearMatch[4] ? Number(nearMatch[4]) : undefined
  };
}

function normalizeAmount(value) {
  var text = normalizeName(value || 'slightly').toLowerCase();
  if (text === 'a little' || text === 'a bit' || text === 'slight') return 'slightly';
  if (text === 'much' || text === 'a lot') return 'far';
  return text || 'slightly';
}

function removeUndefined(value) {
  Object.keys(value).forEach(function(key) {
    if (value[key] === undefined || value[key] === null) delete value[key];
  });
  return value;
}

function parseLine(line, lineNumber) {
  var raw = trimLine(line);
  if (!raw || raw[0] === '#') return null;
  intentSurfaceGuard.assertIntentSurfaceAllowed(raw);

  var makeMatch = raw.match(/^make\s+(?:a\s+|an\s+)?(.+)$/i);
  if (makeMatch) {
    var description = normalizeName(makeMatch[1]);
    return {
      kind: 'makeGame',
      lineNumber: lineNumber,
      description: description,
      tags: description.toLowerCase().split(/\s+/),
      raw: raw
    };
  }

  var giveMatch = raw.match(/^give\s+(.+?)\s+(.+)$/i);
  if (giveMatch) {
    return {
      kind: 'giveAbility',
      lineNumber: lineNumber,
      target: normalizeName(giveMatch[1]),
      ability: normalizeName(giveMatch[2]),
      raw: raw
    };
  }

  var adjustPlacementMatch = raw.match(/^(?:adjust|nudge|move|shift)\s+(.+?)\s+placement\s+(above|below|left|right|front|behind|up|down)(?:\s+(slightly|slight|a little|a bit|far|much|a lot))?$/i);
  if (adjustPlacementMatch) {
    return removeUndefined({
      kind: 'adjust',
      lineNumber: lineNumber,
      subject: normalizeName(adjustPlacementMatch[1]),
      dimension: 'placement',
      direction: normalizeName(adjustPlacementMatch[2]).toLowerCase(),
      amount: normalizeAmount(adjustPlacementMatch[3]),
      raw: raw
    });
  }

  var addControlMatch = raw.match(/^add\s+(.+?)\s+controls\s+(.+?)(?:\s+(?:action\s+)?([a-z_ -]+?))?\s+near\s+(.+)$/i);
  if (addControlMatch) {
    var placement = parsePlacement('near ' + addControlMatch[4]);
    if (!placement) throw new Error('Invalid placement on Intent DSL line ' + lineNumber + ': ' + raw);
    return removeUndefined({
      kind: 'addControl',
      lineNumber: lineNumber,
      control: normalizeName(addControlMatch[1]),
      target: normalizeName(addControlMatch[2]),
      action: addControlMatch[3] ? normalizeName(addControlMatch[3]) : undefined,
      placement: placement,
      raw: raw
    });
  }

  var addInventoryMatch = raw.match(/^add\s+inventory\s+owned\s+by\s+(.+?)(?:\s+with\s+(\d+)\s+slots?)?\s+near\s+(.+)$/i);
  if (addInventoryMatch) {
    var inventoryPlacement = parsePlacement('near ' + addInventoryMatch[3]);
    if (!inventoryPlacement) throw new Error('Invalid placement on Intent DSL line ' + lineNumber + ': ' + raw);
    return removeUndefined({
      kind: 'addInventory',
      lineNumber: lineNumber,
      owner: normalizeName(addInventoryMatch[1]),
      slots: addInventoryMatch[2] ? Number(addInventoryMatch[2]) : undefined,
      placement: inventoryPlacement,
      raw: raw
    });
  }

  var placeGroupMatch = raw.match(/^place\s+(.+?)\s+near\s+(.+)$/i);
  if (placeGroupMatch) {
    var groupPlacement = parsePlacement('near ' + placeGroupMatch[2]);
    if (!groupPlacement) throw new Error('Invalid placement on Intent DSL line ' + lineNumber + ': ' + raw);
    return removeUndefined({
      kind: 'placeGroup',
      lineNumber: lineNumber,
      subject: normalizeName(placeGroupMatch[1]),
      archetype: singularize(normalizeName(placeGroupMatch[1])),
      placement: groupPlacement,
      raw: raw
    });
  }

  throw new Error('Unsupported Intent DSL line ' + lineNumber + ': ' + raw);
}

function parseIntentDsl(text) {
  var lines = String(text || '').split(/\r?\n/);
  var commands = [];
  for (var i = 0; i < lines.length; i++) {
    var command = parseLine(lines[i], i + 1);
    if (command) commands.push(command);
  }
  if (!commands.length) throw new Error('No Intent DSL commands parsed');
  return {
    schemaVersion: INTENT_DSL_SCHEMA_VERSION,
    commands: commands
  };
}

module.exports = {
  INTENT_DSL_SCHEMA_VERSION: INTENT_DSL_SCHEMA_VERSION,
  parseIntentDsl: parseIntentDsl,
  parseLine: parseLine,
  parsePlacement: parsePlacement
};
