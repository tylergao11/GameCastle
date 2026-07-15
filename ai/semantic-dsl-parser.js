var syntax = require('./semantic-dsl-syntax');

function structureError(message) { var error = new Error(message); error.code = 'SEMANTIC_DSL_STRUCTURE_INVALID'; return error; }
function Walker() { this.quote = null; this.escape = false; this.stack = []; }
Walker.prototype.feed = function(ch) {
  if (this.escape) { this.escape = false; return { quoted: true, nested: this.stack.length > 0 }; }
  if (this.quote) { if (ch === '\\') this.escape = true; else if (ch === this.quote) this.quote = null; return { quoted: true, nested: this.stack.length > 0 }; }
  if (ch === '"' || ch === "'") { this.quote = ch; return { quoted: true, nested: this.stack.length > 0 }; }
  if (ch === '(' || ch === '{' || ch === '[') this.stack.push(ch);
  else if (ch === ')' || ch === '}' || ch === ']') {
    var expected = ch === ')' ? '(' : ch === '}' ? '{' : '[';
    if (this.stack.pop() !== expected) throw structureError('Semantic DSL has mismatched brackets.');
  }
  return { quoted: false, nested: this.stack.length > 0 };
};
Walker.prototype.assertComplete = function() {
  if (this.quote || this.escape) throw structureError('Semantic DSL has an unterminated quoted value.');
  if (this.stack.length) throw structureError('Semantic DSL has an unterminated bracketed value.');
};
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
function coerce(raw) {
  var value = String(raw).trim();
  if (!value) return '';
  if (value[0] === '"' && value[value.length - 1] === '"') { try { return JSON.parse(value); } catch (_error) { var stringError = new Error('Invalid quoted string in semantic DSL: ' + value.slice(0, 160)); stringError.code = 'SEMANTIC_DSL_VALUE_INVALID'; throw stringError; } }
  if (value[0] === "'" && value[value.length - 1] === "'") return value.slice(1, -1);
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(value)) return Number(value);
  if ((value[0] === '{' && value[value.length - 1] === '}') || (value[0] === '[' && value[value.length - 1] === ']')) { try { return JSON.parse(value); } catch (error) { var parseError = new Error('Invalid JSON value in semantic DSL: ' + value.slice(0, 160)); parseError.code = 'SEMANTIC_DSL_VALUE_INVALID'; throw parseError; } }
  return value;
}
function separatorIndex(part) {
  var walker = new Walker();
  for (var i = 0; i < part.length; i++) { var state = walker.feed(part[i]); if (!state.quoted && !state.nested && part[i] === '=') return i; }
  return -1;
}
function parseArgs(text) {
  var args = Object.create(null);
  split(text, ',').forEach(function(part) { var index = separatorIndex(part); if (index < 1) { var error = new Error('Semantic DSL arguments use key=value slots: ' + part); error.code = 'SEMANTIC_DSL_ARG_INVALID'; throw error; } var key = part.slice(0, index).trim(); if (Object.prototype.hasOwnProperty.call(args, key)) { var duplicate = new Error('Duplicate semantic DSL argument: ' + key); duplicate.code = 'SEMANTIC_DSL_ARG_DUPLICATE'; throw duplicate; } args[key] = coerce(part.slice(index + 1)); });
  return args;
}
function parse(text) {
  var commands = [], warnings = [];
  split(text, ';').forEach(function(token) {
    var clean = token.replace(/^>+/, '').trim();
    var match = clean.match(/^([A-Za-z][\w-]*)(?:\((.*)\))?$/s);
    if (!match) { warnings.push('Unparsed semantic DSL: ' + token.slice(0, 160)); return; }
    if (syntax.ALL_COMMANDS.indexOf(match[1]) < 0) { warnings.push('Unknown semantic DSL command: >' + match[1]); return; }
    var command = Object.create(null); command.type = match[1];
    var parsedArgs = match[2] === undefined ? Object.create(null) : parseArgs(match[2]);
    Object.keys(parsedArgs).forEach(function(key) { command[key] = parsedArgs[key]; });
    commands.push(command);
  });
  return { commands: commands, warnings: warnings };
}

module.exports = { parse: parse, parseArgs: parseArgs, split: split };
