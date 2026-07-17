var syntax = require('./semantic-dsl-syntax');

function error(code, message) { var value = new Error(message); value.code = code; return value; }
function structureError(message) { return error('SEMANTIC_DSL_STRUCTURE_INVALID', message); }
function valueError(message) { return error('SEMANTIC_DSL_VALUE_INVALID', message); }

function Walker() { this.quote = null; this.escape = false; this.depth = 0; }
Walker.prototype.feed = function(ch) {
  if (this.escape) { this.escape = false; return { quoted: true, nested: this.depth > 0 }; }
  if (this.quote) {
    if (ch === '\\') this.escape = true;
    else if (ch === this.quote) this.quote = null;
    return { quoted: true, nested: this.depth > 0 };
  }
  if (ch === '"' || ch === "'") { this.quote = ch; return { quoted: true, nested: this.depth > 0 }; }
  if (ch === '(') this.depth += 1;
  else if (ch === ')') {
    this.depth -= 1;
    if (this.depth < 0) throw structureError('Semantic DSL has a mismatched parenthesis.');
  }
  return { quoted: false, nested: this.depth > 0 };
};
Walker.prototype.assertComplete = function() {
  if (this.quote || this.escape) throw structureError('Semantic DSL has an unterminated quoted value.');
  if (this.depth) throw structureError('Semantic DSL has an unterminated parenthesized value.');
};

function assertNoLegacyJson(text) {
  var quote = null, escape = false;
  String(text || '').split('').forEach(function(ch) {
    if (escape) { escape = false; return; }
    if (quote) { if (ch === '\\') escape = true; else if (ch === quote) quote = null; return; }
    if (ch === '"' || ch === "'") { quote = ch; return; }
    if (ch === '[' || ch === ']' || ch === '{' || ch === '}') throw error('SEMANTIC_DSL_LEGACY_JSON_FORBIDDEN', syntax.LANGUAGE_ID + ' accepts list(...) and record(...) composite values.');
  });
}

function split(text, separator) {
  var out = [], current = '', walker = new Walker();
  String(text || '').replace(/[\r\n]+/g, ';').split('').forEach(function(ch) {
    var state = walker.feed(ch);
    if (!state.quoted && !state.nested && ch === separator) { if (current.trim()) out.push(current.trim()); current = ''; }
    else current += ch;
  });
  walker.assertComplete();
  if (current.trim()) out.push(current.trim());
  return out;
}

function Cursor(text) { this.text = String(text); this.index = 0; }
Cursor.prototype.skip = function() { while (/\s/.test(this.text[this.index] || '')) this.index += 1; };
Cursor.prototype.peek = function() { return this.text[this.index]; };
Cursor.prototype.consume = function(value) {
  if (this.text.slice(this.index, this.index + value.length) !== value) throw valueError('Expected ' + value + ' in semantic DSL value.');
  this.index += value.length;
};

function quoted(cursor) {
  var quote = cursor.peek(), out = ''; cursor.index += 1;
  while (cursor.index < cursor.text.length) {
    var ch = cursor.text[cursor.index++];
    if (ch === quote) return out;
    if (ch !== '\\') { out += ch; continue; }
    if (cursor.index >= cursor.text.length) throw valueError('Semantic DSL string ends with an escape character.');
    var escaped = cursor.text[cursor.index++];
    var escapes = { '"': '"', "'": "'", '\\': '\\', n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' };
    if (Object.prototype.hasOwnProperty.call(escapes, escaped)) { out += escapes[escaped]; continue; }
    if (escaped === 'u') {
      var hex = cursor.text.slice(cursor.index, cursor.index + 4);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw valueError('Semantic DSL string contains an invalid unicode escape.');
      out += String.fromCharCode(parseInt(hex, 16)); cursor.index += 4; continue;
    }
    throw valueError('Semantic DSL string contains an unsupported escape: \\' + escaped);
  }
  throw valueError('Semantic DSL has an unterminated string.');
}

function atom(cursor) {
  var start = cursor.index;
  while (cursor.index < cursor.text.length && cursor.peek() !== ',' && cursor.peek() !== ')') cursor.index += 1;
  var raw = cursor.text.slice(start, cursor.index).trim();
  if (!raw) throw valueError('Semantic DSL contains an empty value.');
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  // Comparison operators are first-class dictionary tokens; they contain '=' but are not field separators.
  if (/^(>=|<=|!=|=|<|>)$/.test(raw)) return raw;
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw)) {
    var number = Number(raw);
    if (!Number.isFinite(number)) throw valueError('Semantic DSL number must be finite.');
    return number;
  }
  if (raw.indexOf('=') >= 0) throw valueError('Semantic DSL scalar values cannot contain =; use record(field=value).');
  return raw;
}

function list(cursor) {
  cursor.consume('list('); var out = []; cursor.skip();
  if (cursor.peek() === ')') { cursor.index += 1; return out; }
  while (true) {
    out.push(readValue(cursor)); cursor.skip();
    if (cursor.peek() === ')') { cursor.index += 1; return out; }
    if (cursor.peek() !== ',') throw valueError('Semantic DSL list values must be separated by commas.');
    cursor.index += 1; cursor.skip();
    if (cursor.peek() === ')') throw valueError('Semantic DSL list cannot end with a trailing comma.');
  }
}

function record(cursor) {
  cursor.consume('record('); var out = {}, forbidden = ['__proto__', 'prototype', 'constructor']; cursor.skip();
  if (cursor.peek() === ')') { cursor.index += 1; return out; }
  while (true) {
    var start = cursor.index;
    while (/[A-Za-z0-9_.-]/.test(cursor.peek() || '')) cursor.index += 1;
    var key = cursor.text.slice(start, cursor.index);
    if (!/^[A-Za-z][A-Za-z0-9_.-]*$/.test(key)) throw valueError('Semantic DSL record keys must be bare semantic identifiers.');
    if (forbidden.indexOf(key) >= 0) throw valueError('Semantic DSL record key is forbidden: ' + key);
    if (Object.prototype.hasOwnProperty.call(out, key)) throw error('SEMANTIC_DSL_ARG_DUPLICATE', 'Duplicate semantic DSL record field: ' + key);
    cursor.skip();
    if (cursor.peek() !== '=') throw valueError('Semantic DSL record fields use key=value.');
    cursor.index += 1; cursor.skip(); out[key] = readValue(cursor); cursor.skip();
    if (cursor.peek() === ')') { cursor.index += 1; return out; }
    if (cursor.peek() !== ',') throw valueError('Semantic DSL record fields must be separated by commas.');
    cursor.index += 1; cursor.skip();
    if (cursor.peek() === ')') throw valueError('Semantic DSL record cannot end with a trailing comma.');
  }
}

function readValue(cursor) {
  cursor.skip();
  if (cursor.text.slice(cursor.index, cursor.index + 5) === 'list(') return list(cursor);
  if (cursor.text.slice(cursor.index, cursor.index + 7) === 'record(') return record(cursor);
  if (cursor.peek() === '"' || cursor.peek() === "'") return quoted(cursor);
  return atom(cursor);
}

function parseValue(raw) {
  assertNoLegacyJson(raw);
  var cursor = new Cursor(raw), value = readValue(cursor); cursor.skip();
  if (cursor.index !== cursor.text.length) throw valueError('Semantic DSL value has unexpected trailing text: ' + cursor.text.slice(cursor.index, cursor.index + 80));
  return value;
}

function stringifyString(value) {
  return '"' + String(value).replace(/["\\\b\f\n\r\t]/g, function(ch) {
    return { '"': '\\"', '\\': '\\\\', '\b': '\\b', '\f': '\\f', '\n': '\\n', '\r': '\\r', '\t': '\\t' }[ch];
  }) + '"';
}
function stringifyValue(value) {
  if (value === null) return 'null';
  if (typeof value === 'string') return stringifyString(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw valueError('Semantic DSL number must be finite.');
    return String(value);
  }
  if (Array.isArray(value)) return 'list(' + value.map(stringifyValue).join(',') + ')';
  if (value && typeof value === 'object') {
    return 'record(' + Object.keys(value).map(function(key) {
      if (!/^[A-Za-z][A-Za-z0-9_.-]*$/.test(key) || ['__proto__', 'prototype', 'constructor'].indexOf(key) >= 0) throw valueError('Semantic DSL record key is invalid: ' + key);
      return key + '=' + stringifyValue(value[key]);
    }).join(',') + ')';
  }
  throw valueError('Semantic DSL cannot serialize value type: ' + typeof value);
}

function separatorIndex(part) {
  var walker = new Walker();
  for (var i = 0; i < part.length; i++) {
    var state = walker.feed(part[i]);
    if (!state.quoted && !state.nested && part[i] === '=') return i;
  }
  walker.assertComplete();
  return -1;
}
// Split command args on ",key=" boundaries. When knownKeys is set (closed command forms),
// only declared field names start a new argument — so unquoted text values may contain commas.
// openFields commands pass knownKeys=null and treat any ,key= as a boundary (open parameters).
function splitArgs(text, knownKeys) {
  var body = String(text || '');
  if (!body.trim()) return [];
  var parts = [], start = 0, walker = new Walker(), i = 0;
  while (i < body.length) {
    var ch = body[i];
    var state = walker.feed(ch);
    if (!state.quoted && !state.nested && ch === ',') {
      var rest = body.slice(i + 1);
      var keyMatch = /^\s*([A-Za-z][A-Za-z0-9_.-]*)\s*=/.exec(rest);
      if (keyMatch && (!knownKeys || knownKeys[keyMatch[1]])) {
        var segment = body.slice(start, i).trim();
        if (segment) parts.push(segment);
        start = i + 1;
      }
    }
    i += 1;
  }
  walker.assertComplete();
  var tail = body.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}
function parseTextField(raw) {
  raw = String(raw || '').trim();
  if (!raw) throw valueError('Semantic DSL text field cannot be empty.');
  // Quoted, list, and record still use the normal value grammar.
  if (raw[0] === '"' || raw[0] === "'" || raw.indexOf('list(') === 0 || raw.indexOf('record(') === 0) return parseValue(raw);
  // Unquoted text keeps commas and spaces; only reject embedded = which would be ambiguous.
  if (raw.indexOf('=') >= 0) throw valueError('Semantic DSL unquoted text cannot contain =; quote the text value.');
  return raw;
}
function parseArgs(text, options) {
  options = options || {};
  var knownKeys = options.knownKeys || null;
  var fieldTypes = options.fieldTypes || Object.create(null);
  var args = Object.create(null);
  if (!String(text || '').trim()) return args;
  splitArgs(text, knownKeys).forEach(function(part) {
    var index = separatorIndex(part);
    if (index < 1) throw error('SEMANTIC_DSL_ARG_INVALID', 'Semantic DSL arguments use key=value fields: ' + part);
    var key = part.slice(0, index).trim();
    if (!/^[A-Za-z][A-Za-z0-9_.-]*$/.test(key)) throw error('SEMANTIC_DSL_ARG_INVALID', 'Semantic DSL argument key is invalid: ' + key);
    if (Object.prototype.hasOwnProperty.call(args, key)) throw error('SEMANTIC_DSL_ARG_DUPLICATE', 'Duplicate semantic DSL argument: ' + key);
    var raw = part.slice(index + 1);
    args[key] = fieldTypes[key] === 'text' ? parseTextField(raw) : parseValue(raw);
  });
  return args;
}

function parse(text, options) {
  options = options || {};
  assertNoLegacyJson(text);
  var commands = [], warnings = [];
  split(text, ';').forEach(function(token) {
    if (token[0] === '>') { warnings.push('Semantic DSL uses bare command names: ' + token.slice(0, 160)); return; }
    var clean = token.trim(), match = clean.match(/^([A-Za-z][\w-]*)\((.*)\)$/s);
    if (!match) { warnings.push('Unparsed semantic DSL: ' + token.slice(0, 160)); return; }
    if (syntax.ALL_COMMANDS.indexOf(match[1]) < 0) throw error('SEMANTIC_DSL_COMMAND_UNKNOWN', 'Unknown Semantic DSL command: ' + match[1]);
    var command = Object.create(null); command.type = match[1];
    var spec = syntax.COMMANDS[match[1]];
    var knownKeys = null;
    var fieldTypes = Object.create(null);
    if (spec) {
      Object.keys(spec.fields).forEach(function(name) { fieldTypes[name] = spec.fields[name].type; });
      if (!spec.openFields) {
        knownKeys = Object.create(null);
        Object.keys(spec.fields).forEach(function(name) { knownKeys[name] = true; });
      }
    }
    var parsedArgs = parseArgs(match[2], { knownKeys: knownKeys, fieldTypes: fieldTypes });
    Object.keys(parsedArgs).forEach(function(key) { command[key] = parsedArgs[key]; });
    syntax.validateCommand(command, options.phase || null);
    commands.push(command);
  });
  return { commands: commands, warnings: warnings };
}

module.exports = { LANGUAGE_ID: syntax.LANGUAGE_ID, parse: parse, parseArgs: parseArgs, parseValue: parseValue, stringifyValue: stringifyValue, split: split };
