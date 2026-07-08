var fs = require('fs');
var path = require('path');

var MODULE_DSL_SCHEMA_VERSION = 1;

function tokenize(line) {
  var tokens = [];
  var current = '';
  var quote = '';
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (quote) {
      if (ch === quote) quote = '';
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (quote) throw new Error('Unclosed quote in Module DSL line: ' + line);
  if (current) tokens.push(current);
  return tokens;
}

function coerceValue(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function parseLine(line, lineNumber) {
  var raw = line;
  line = line.trim();
  if (!line || line[0] === '#') return null;
  var tokens = tokenize(line);
  if (tokens.length < 2) throw new Error('Invalid Module DSL line ' + lineNumber + ': ' + raw);
  var verb = tokens[0];
  var target = tokens[1];
  if (verb !== 'install' && verb !== 'configure') {
    throw new Error('Unsupported Module DSL verb on line ' + lineNumber + ': ' + verb);
  }
  if (target !== 'module') {
    throw new Error('Unsupported Module DSL target on line ' + lineNumber + ': ' + target);
  }

  var params = {};
  for (var i = 2; i < tokens.length; i++) {
    var eq = tokens[i].indexOf('=');
    if (eq <= 0) throw new Error('Expected key=value on Module DSL line ' + lineNumber + ': ' + tokens[i]);
    var key = tokens[i].slice(0, eq);
    var value = tokens[i].slice(eq + 1);
    params[key] = coerceValue(value);
  }
  if (!params.id) throw new Error('Module DSL line ' + lineNumber + ' missing id=<module.id>');
  return {
    schemaVersion: MODULE_DSL_SCHEMA_VERSION,
    lineNumber: lineNumber,
    command: verb + ' ' + target,
    verb: verb,
    target: target,
    id: String(params.id),
    params: params,
    raw: raw.trim()
  };
}

function parseModuleDsl(text) {
  var lines = String(text || '').split(/\r?\n/);
  var commands = [];
  for (var i = 0; i < lines.length; i++) {
    var command = parseLine(lines[i], i + 1);
    if (command) commands.push(command);
  }
  if (!commands.length) throw new Error('No Module DSL commands parsed');
  return commands;
}

function parseModuleDslFile(filePath) {
  return parseModuleDsl(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

module.exports = {
  MODULE_DSL_SCHEMA_VERSION: MODULE_DSL_SCHEMA_VERSION,
  parseModuleDsl: parseModuleDsl,
  parseModuleDslFile: parseModuleDslFile
};
