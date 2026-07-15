var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var sourceRoot = require('./gdevelop-source-root');

var ROOT = path.resolve(__dirname, '..');
var SOURCE_DIR = sourceRoot.resolveSourceRoot();
var REGISTRATION_PATH = path.join(SOURCE_DIR, 'Core', 'GDCore', 'Extensions', 'Builtin', 'CommonInstructionsExtension.cpp');
var EVENT_HEADERS_DIR = path.join(SOURCE_DIR, 'Core', 'GDCore', 'Events', 'Builtin');
var INSTRUCTION_SERIALIZATION_PATH = path.join(SOURCE_DIR, 'Core', 'GDCore', 'Events', 'Serialization.cpp');
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
var SERIALIZATION_SPECS = {
  StandardEvent: { parameters: [], defaults: {} },
  ElseEvent: { parameters: [], defaults: {} },
  WhileEvent: {
    parameters: [{ semanticKey: 'loopIndex', serializedKey: 'loopIndexVariable', type: 'localvar', optional: true, emission: 'when-present', sourceNeedle: 'AddChild("loopIndexVariable")' }],
    defaults: { infiniteLoopWarning: true },
    sourceNeedles: ['SetAttribute("infiniteLoopWarning", infiniteLoopWarning)'],
    headerNeedles: ['infiniteLoopWarning(true)']
  },
  RepeatEvent: {
    parameters: [
      { semanticKey: 'count', serializedKey: 'repeatExpression', type: 'number-expression', optional: false, emission: 'always', sourceNeedle: 'AddChild("repeatExpression")' },
      { semanticKey: 'loopIndex', serializedKey: 'loopIndexVariable', type: 'localvar', optional: true, emission: 'when-present', sourceNeedle: 'AddChild("loopIndexVariable")' }
    ], defaults: {}
  },
  ForEachEvent: {
    parameters: [
      { semanticKey: 'target', serializedKey: 'object', type: 'object', optional: false, emission: 'always', sourceNeedle: 'AddChild("object")' },
      { semanticKey: 'orderBy', serializedKey: 'orderBy', type: 'number-expression', optional: true, emission: 'when-present', sourceNeedle: 'AddChild("orderBy")' },
      { semanticKey: 'order', serializedKey: 'order', type: 'enum', values: ['asc', 'desc'], optional: true, defaultValue: 'asc', emission: 'with:orderBy', sourceNeedle: 'AddChild("order")', defaultSourceNeedle: 'order("asc")' },
      { semanticKey: 'limit', serializedKey: 'limit', type: 'number-expression', optional: true, emission: 'with:orderBy', sourceNeedle: 'AddChild("limit")' },
      { semanticKey: 'loopIndex', serializedKey: 'loopIndexVariable', type: 'localvar', optional: true, emission: 'when-present', sourceNeedle: 'AddChild("loopIndexVariable")' }
    ], defaults: {}
  },
  ForEachChildVariableEvent: {
    parameters: [
      { semanticKey: 'iterable', serializedKey: 'iterableVariableName', type: 'scenevar', optional: false, emission: 'always', sourceNeedle: 'AddChild("iterableVariableName")' },
      { semanticKey: 'valueIterator', serializedKey: 'valueIteratorVariableName', type: 'localvar', optional: true, defaultValue: 'child', emission: 'always', sourceNeedle: 'AddChild("valueIteratorVariableName")', defaultSourceNeedle: 'valueIteratorVariableName("child")' },
      { semanticKey: 'keyIterator', serializedKey: 'keyIteratorVariableName', type: 'localvar', optional: true, defaultValue: '', emission: 'always', sourceNeedle: 'AddChild("keyIteratorVariableName")' },
      { semanticKey: 'loopIndex', serializedKey: 'loopIndexVariable', type: 'localvar', optional: true, emission: 'when-present', sourceNeedle: 'AddChild("loopIndexVariable")' }
    ], defaults: {}
  },
  GroupEvent: {
    parameters: [],
    defaults: { name: '', source: '', creationTime: 0, colorR: 74, colorG: 176, colorB: 228, parameters: [] },
    sourceNeedles: ['creationTime(0)', 'colorR(74)', 'colorG(176)', 'colorB(228)', 'SetAttribute("name"', 'SetAttribute("source"', 'SetAttribute("creationTime"', 'SetAttribute("colorR"', 'SetAttribute("colorG"', 'SetAttribute("colorB"', 'AddChild("parameters")']
  },
  CommentEvent: {
    parameters: [{ semanticKey: 'comment', serializedKey: 'comment', type: 'string', optional: false, emission: 'always', sourceNeedle: 'AddChild("comment")' }],
    defaults: { color: { r: 255, g: 230, b: 109, textR: 0, textG: 0, textB: 0 } },
    headerNeedles: ['r(255)', 'v(230)', 'b(109)', 'textR(0)', 'textG(0)', 'textB(0)']
  },
  LinkEvent: {
    parameters: [{ semanticKey: 'target', serializedKey: 'target', type: 'string', optional: false, emission: 'always', sourceNeedle: 'AddChild("target")' }],
    defaults: { include: { includeConfig: 0 } },
    headerNeedles: ['INCLUDE_ALL = 0', 'includeConfig(INCLUDE_ALL)']
  }
};
var EVENT_PARAMETER_SEMANTICS = {
  'number-expression': { promptType: 'number-or-expression', runtimeValueKind: 'number-expression', runtimeNormalization: 'number-expression', runtimeSerialization: 'expression-or-text' },
  object: { promptType: 'entity', runtimeValueKind: 'object-name', runtimeNormalization: 'entity-object-name', runtimeSerialization: 'text' },
  scenevar: { promptType: 'scene-member', runtimeValueKind: 'variable-expression', runtimeNormalization: 'scene-member-name', runtimeSerialization: 'text' },
  localvar: { promptType: 'local-name', runtimeValueKind: 'variable-expression', runtimeNormalization: 'local-name', runtimeSerialization: 'text' },
  enum: { promptType: 'dictionary-token', runtimeValueKind: 'literal-token', runtimeNormalization: 'dictionary-token', runtimeSerialization: 'text' },
  string: { promptType: 'string', runtimeValueKind: 'literal-token', runtimeNormalization: 'text', runtimeSerialization: 'text' }
};
function serializationContract(className, header, cpp, relativePath) {
  var spec = SERIALIZATION_SPECS[className];
  if (!spec) throw new Error('GDJS event serialization contract is not classified: ' + className);
  (spec.sourceNeedles || []).concat((spec.parameters || []).map(function(parameter) { return parameter.sourceNeedle; }).filter(Boolean)).forEach(function(needle) {
    if (cpp.indexOf(needle) < 0) throw new Error(className + ' serialization source no longer contains: ' + needle);
  });
  (spec.headerNeedles || []).forEach(function(needle) { if (header.indexOf(needle) < 0) throw new Error(className + ' declaration source no longer contains default: ' + needle); });
  (spec.parameters || []).map(function(parameter) { return parameter.defaultSourceNeedle; }).filter(Boolean).forEach(function(needle) { if (cpp.indexOf(needle) < 0) throw new Error(className + ' serialization source no longer contains default: ' + needle); });
  var primaryCondition = (cpp.match(/allConditions\.push_back\(&([A-Za-z0-9_]+)\)/) || [])[1] || null;
  var primaryAction = (cpp.match(/allActions\.push_back\(&([A-Za-z0-9_]+)\)/) || [])[1] || null;
  var instructionLists = [];
  var instructionPattern = /SerializeInstructionsTo\(\s*([A-Za-z0-9_]+)\s*,\s*element\.AddChild\("([^"]+)"\)\)/g;
  var instructionMatch;
  while ((instructionMatch = instructionPattern.exec(cpp))) {
    var kind = /actions/i.test(instructionMatch[1]) ? 'action' : 'condition';
    instructionLists.push({ semanticKey: instructionMatch[1], serializedKey: instructionMatch[2], kind: kind, primary: kind === 'condition' ? instructionMatch[1] === primaryCondition : instructionMatch[1] === primaryAction, emission: 'always' });
  }
  var subEventsMatch = cpp.match(/SerializeEventsTo\(\s*([A-Za-z0-9_]+)\s*,\s*element\.AddChild\("([^"]+)"\)\)/);
  var subEventsPrefix = subEventsMatch ? cpp.slice(Math.max(0, subEventsMatch.index - 160), subEventsMatch.index) : '';
  var subEventsEmission = /canonical\s*\|\|/.test(subEventsPrefix) ? 'canonical-or-present' : (/\bif\s*\([^\r\n]+\)\s*\r?\n\s*gd::EventsListSerialization::\s*$/.test(subEventsPrefix) ? 'when-present' : 'always');
  var localVariablesMatch = cpp.match(/variables\.SerializeTo\(element\.AddChild\("([^"]+)"\)\)/);
  return {
    parameters: (spec.parameters || []).map(function(parameter) { var semantics = EVENT_PARAMETER_SEMANTICS[parameter.type]; if (!semantics) throw new Error(className + ' parameter semantics are not classified: ' + parameter.type); var value = Object.assign({}, parameter, semantics); if (value.runtimeNormalization === 'dictionary-token') value.runtimeValues = (parameter.values || []).slice(); delete value.sourceNeedle; delete value.defaultSourceNeedle; return value; }),
    defaults: stable(spec.defaults || {}),
    instructionLists: instructionLists,
    subEvents: subEventsMatch ? { semanticKey: subEventsMatch[1], serializedKey: subEventsMatch[2], emission: subEventsEmission } : null,
    localVariables: localVariablesMatch ? { serializedKey: localVariablesMatch[1], emission: /canonical\s*\|\|\s*HasVariables/.test(cpp) ? 'canonical-or-present' : 'when-present' } : null,
    source: { path: relativePath, sha1: sha1(cpp) }
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
  if (!fs.existsSync(INSTRUCTION_SERIALIZATION_PATH)) throw new Error('Pinned GDevelop instruction serialization source is missing: ' + INSTRUCTION_SERIALIZATION_PATH);
  var instructionSerializationSource = fs.readFileSync(INSTRUCTION_SERIALIZATION_PATH, 'utf8');
  ['SetAttribute("inverted", list[k].IsInverted())', 'GetBoolAttribute("inverted", false', 'SetAttribute("await", list[k].IsAwaited())', 'GetBoolAttribute("await")', 'SetAttribute("disabled", event.IsDisabled())', 'SetAttribute("folded", event.IsFolded())', 'AddChild("type").SetValue(event.GetType())'].forEach(function(needle) { if (instructionSerializationSource.indexOf(needle) < 0) throw new Error('GDJS event or instruction serialization no longer contains: ' + needle); });
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
    var cppPath = path.join(EVENT_HEADERS_DIR, className + '.cpp');
    if (!fs.existsSync(cppPath)) throw new Error('GDJS event declaration has no serialization source: ' + className);
    var cpp = fs.readFileSync(cppPath, 'utf8');
    var cppRelativePath = 'Core/GDCore/Events/Builtin/' + className + '.cpp';
    eventTypes.push({
      eventType: extension + '::' + strings[0],
      explanation: { title: strings[1], description: strings[2], sentence: strings[3] || null },
      className: className,
      grammar: headerFeatures(header),
      serialization: serializationContract(className, header, cpp, cppRelativePath),
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
    schemaVersion: 3,
    grammarKind: 'gdjs-event-grammar',
    instructionSerialization: { conditionInversion: { dslKey: 'not', serializedKey: 'inverted', defaultValue: false }, actionAwait: { dslKey: 'await', serializedKey: 'await', defaultValue: false }, source: { path: 'Core/GDCore/Events/Serialization.cpp', sha1: sha1(instructionSerializationSource) } },
    eventSerialization: { type: { serializedKey: 'type', emission: 'always' }, canonicalFields: [{ semanticKey: 'disabled', serializedKey: 'disabled', defaultValue: false }, { semanticKey: 'folded', serializedKey: 'folded', defaultValue: false }], source: { path: 'Core/GDCore/Events/Serialization.cpp', sha1: sha1(instructionSerializationSource) } },
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
