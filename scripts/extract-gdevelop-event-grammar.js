var crypto = require('crypto');
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var SOURCE_DIR = process.env.GAMECASTLE_GDEVELOP_SOURCE_DIR || path.resolve(ROOT, '..', 'GDevelop-master');
var REGISTRATION_PATH = path.join(SOURCE_DIR, 'Core', 'GDCore', 'Extensions', 'Builtin', 'CommonInstructionsExtension.cpp');
var EVENT_HEADERS_DIR = path.join(SOURCE_DIR, 'Core', 'GDCore', 'Events', 'Builtin');
var OUT_PATH = path.join(ROOT, 'ai', 'gdevelop-truth', 'event-grammar.json');
var CHECK_MODE = process.argv.indexOf('--check') >= 0;

function sha1(text) { return crypto.createHash('sha1').update(text).digest('hex'); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(result, key) { result[key] = stable(value[key]); return result; }, {});
  return value;
}
function render(value) { return JSON.stringify(stable(value), null, 2) + '\n'; }
function lineAt(text, index) { return text.slice(0, index).split(/\r?\n/).length; }
function stringArguments(text) {
  var values = [];
  var pattern = /(["'])((?:\\.|(?!\1)[\s\S])*)\1/g;
  var match;
  while ((match = pattern.exec(text))) values.push(match[2].replace(/\\(["'\\])/g, '$1'));
  return values;
}
function balancedEnd(text, openIndex) {
  var depth = 0;
  var quote = '';
  for (var index = openIndex; index < text.length; index++) {
    var character = text[index];
    if (quote) {
      if (character === '\\') { index++; continue; }
      if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (character === '(') depth++;
    if (character === ')' && --depth === 0) return index;
  }
  return -1;
}
function booleanMethod(header, name) {
  var match = header.match(new RegExp(name + '\\s*\\(\\s*\\)\\s*const(?:\\s+override)?\\s*\\{\\s*return\\s+(true|false)\\s*;', 'm'));
  return match ? match[1] === 'true' : null;
}
function headerFeatures(header) {
  return {
    executable: booleanMethod(header, 'IsExecutable'),
    canHaveSubEvents: booleanMethod(header, 'CanHaveSubEvents'),
    canHaveVariables: booleanMethod(header, 'CanHaveVariables'),
    hasConditions: /GetConditions\s*\(/.test(header),
    hasActions: /GetActions\s*\(/.test(header),
    hasExpressions: /GetAllExpressionsWithMetadata\s*\(/.test(header)
  };
}
function extensionName(text) {
  var match = text.match(/SetExtensionInformation\s*\(\s*["']([^"']+)/);
  if (!match) throw new Error('GDJS event registration has no extension identity');
  return match[1];
}
function extract(sourceDir) {
  if (!fs.existsSync(REGISTRATION_PATH)) throw new Error('Pinned GDevelop event registration source is missing: ' + REGISTRATION_PATH);
  var registration = fs.readFileSync(REGISTRATION_PATH, 'utf8');
  var extension = extensionName(registration);
  var eventTypes = [];
  var pattern = /\.AddEvent\s*\(/g;
  var match;
  while ((match = pattern.exec(registration))) {
    var open = registration.indexOf('(', match.index);
    var close = balancedEnd(registration, open);
    if (close < 0) throw new Error('Unbalanced AddEvent declaration at line ' + lineAt(registration, match.index));
    var call = registration.slice(open + 1, close);
    var strings = stringArguments(call);
    var classMatch = call.match(/std::make_shared<gd::([A-Za-z0-9_]+)>/);
    if (strings.length < 3 || !classMatch) throw new Error('Incomplete AddEvent declaration at line ' + lineAt(registration, match.index));
    var className = classMatch[1];
    var headerPath = path.join(EVENT_HEADERS_DIR, className + '.h');
    if (!fs.existsSync(headerPath)) throw new Error('GDJS event declaration has no header: ' + className);
    var header = fs.readFileSync(headerPath, 'utf8');
    eventTypes.push({
      eventType: extension + '::' + strings[0],
      explanation: { title: strings[1], description: strings[2], sentence: strings[3] || null },
      className: className,
      grammar: headerFeatures(header),
      source: {
        registration: { path: 'Core/GDCore/Extensions/Builtin/CommonInstructionsExtension.cpp', line: lineAt(registration, match.index), sha1: sha1(registration) },
        definition: { path: 'Core/GDCore/Events/Builtin/' + className + '.h', sha1: sha1(header) }
      }
    });
    pattern.lastIndex = close + 1;
  }
  if (!eventTypes.length) throw new Error('Pinned GDevelop source contains no registered event types');
  var seen = {};
  eventTypes.forEach(function(eventType) {
    if (seen[eventType.eventType]) throw new Error('Duplicate GDJS event type: ' + eventType.eventType);
    seen[eventType.eventType] = true;
    if (!eventType.explanation.title || !eventType.explanation.description) throw new Error('GDJS event type has no explanatory source text: ' + eventType.eventType);
  });
  eventTypes.sort(function(left, right) { return left.eventType.localeCompare(right.eventType); });
  return {
    schemaVersion: 1,
    grammarKind: 'gdjs-event-grammar',
    source: { root: ['Core/GDCore/Extensions/Builtin', 'Core/GDCore/Events/Builtin'], registrationSha1: sha1(registration) },
    summary: { eventTypeCount: eventTypes.length },
    eventTypes: eventTypes
  };
}

function main() {
  var grammar = extract(SOURCE_DIR);
  var output = render(grammar);
  if (CHECK_MODE) {
    if (!fs.existsSync(OUT_PATH) || fs.readFileSync(OUT_PATH, 'utf8') !== output) throw new Error('GDJS event grammar snapshot is stale; run node scripts/extract-gdevelop-event-grammar.js');
    console.log('[GDJSEventGrammar] snapshot OK: ' + grammar.summary.eventTypeCount + ' event types');
    return;
  }
  fs.writeFileSync(OUT_PATH, output, 'utf8');
  console.log('[GDJSEventGrammar] wrote ' + OUT_PATH + ': ' + grammar.summary.eventTypeCount + ' event types');
}

if (require.main === module) main();
module.exports = { extract: extract };
