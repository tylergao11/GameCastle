var crypto = require('crypto');
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var SOURCE_DIR = process.env.GAMECASTLE_GDEVELOP_SOURCE_DIR || path.resolve(ROOT, '..', 'GDevelop-master');
var OUT_PATH = path.join(ROOT, 'ai', 'gdevelop-truth', 'capability-universe.json');
var CHECK_MODE = process.argv.indexOf('--check') >= 0;

var DECLARATION_METHODS = {
  AddAction: 'action', AddScopedAction: 'action', addAction: 'action', addScopedAction: 'action',
  AddCondition: 'condition', AddScopedCondition: 'condition', addCondition: 'condition', addScopedCondition: 'condition',
  AddExpression: 'number-expression', addExpression: 'number-expression',
  AddStrExpression: 'string-expression', addStrExpression: 'string-expression',
  AddExpressionAndCondition: 'expression-condition-family', addExpressionAndCondition: 'expression-condition-family',
  AddExpressionAndConditionAndAction: 'expression-condition-action-family', addExpressionAndConditionAndAction: 'expression-condition-action-family',
  AddDuplicatedAction: 'action-alias', addDuplicatedAction: 'action-alias',
  AddDuplicatedCondition: 'condition-alias', addDuplicatedCondition: 'condition-alias',
  AddDuplicatedExpression: 'expression-alias', addDuplicatedExpression: 'expression-alias'
};
var PARAMETER_MACROS = {
  UseStandardParameters: 'standard-value', useStandardParameters: 'standard-value',
  UseStandardOperatorParameters: 'standard-operator', useStandardOperatorParameters: 'standard-operator',
  UseStandardRelationalOperatorParameters: 'standard-relational-operator', useStandardRelationalOperatorParameters: 'standard-relational-operator'
};

function normalizePath(file) { return file.replace(/\\/g, '/'); }
function sha1(text) { return crypto.createHash('sha1').update(text).digest('hex'); }
function lineAt(text, index) { return text.slice(0, index).split(/\r?\n/).length; }
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(value).sort().map(function(key) {
    return JSON.stringify(key) + ':' + stableStringify(value[key]);
  }).join(',') + '}';
}
function prettyStable(value) { return JSON.stringify(JSON.parse(stableStringify(value)), null, 2) + '\n'; }

function walk(dir, files) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function(entry) {
    var full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'tests' && entry.name !== 'node_modules') walk(full, files);
      return;
    }
    files.push(full);
  });
}

function discoverSourceFiles(sourceDir) {
  var files = [];
  var extensionRoot = path.join(sourceDir, 'Extensions');
  var builtinRoot = path.join(sourceDir, 'Core', 'GDCore', 'Extensions', 'Builtin');
  if (fs.existsSync(extensionRoot)) walk(extensionRoot, files);
  if (fs.existsSync(builtinRoot)) walk(builtinRoot, files);
  return files.filter(function(file) {
    var name = path.basename(file);
    var inBuiltin = normalizePath(file).indexOf('/Core/GDCore/Extensions/Builtin/') >= 0;
    return inBuiltin ? /\.cpp$/i.test(name) : /^(?:Extension.*\.cpp|JsExtension\.(?:cpp|js))$/i.test(name);
  }).sort();
}

function stripComments(text) {
  var out = '';
  var mode = 'code';
  var quote = '';
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    var n = text[i + 1];
    if (mode === 'line') {
      if (c === '\n') { out += c; mode = 'code'; } else out += ' ';
      continue;
    }
    if (mode === 'block') {
      if (c === '*' && n === '/') { out += '  '; i++; mode = 'code'; }
      else out += c === '\n' ? '\n' : ' ';
      continue;
    }
    if (mode === 'string') {
      out += c;
      if (c === '\\') { out += n || ''; i++; continue; }
      if (c === quote) mode = 'code';
      continue;
    }
    if (c === '/' && n === '/') { out += '  '; i++; mode = 'line'; continue; }
    if (c === '/' && n === '*') { out += '  '; i++; mode = 'block'; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; mode = 'string'; out += c; continue; }
    out += c;
  }
  return out;
}

function balancedEnd(text, openIndex, openChar, closeChar) {
  var depth = 0;
  var quote = '';
  for (var i = openIndex; i < text.length; i++) {
    var c = text[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === openChar) depth++;
    if (c === closeChar && --depth === 0) return i;
  }
  return -1;
}

function chainEnd(text, start) {
  var round = 0;
  var square = 0;
  var curly = 0;
  var quote = '';
  for (var i = start; i < text.length; i++) {
    var c = text[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '(') round++;
    else if (c === ')') round--;
    else if (c === '[') square++;
    else if (c === ']') square--;
    else if (c === '{') curly++;
    else if (c === '}') curly--;
    else if (c === ';' && round <= 0 && square <= 0 && curly <= 0) return i + 1;
  }
  return text.length;
}

function stringArguments(text) {
  var values = [];
  var pattern = /(["'])((?:\\.|(?!\1)[\s\S])*)\1/g;
  var match;
  while ((match = pattern.exec(text))) values.push(match[2].replace(/\\(["'\\])/g, '$1'));
  return values;
}

function firstCallArgument(chain, method) {
  var pattern = new RegExp('(?:\\.|->)' + method + '\\s*\\(', 'g');
  var match = pattern.exec(chain);
  if (!match) return null;
  var open = chain.indexOf('(', match.index);
  var end = balancedEnd(chain, open, '(', ')');
  if (end < 0) return null;
  var strings = stringArguments(chain.slice(open + 1, end));
  return strings.length ? strings[0] : null;
}

function findAllCalls(chain, methodPattern) {
  var found = [];
  var pattern = new RegExp('(?:\\.|->)(' + methodPattern + ')\\s*\\(', 'g');
  var match;
  while ((match = pattern.exec(chain))) {
    var open = chain.indexOf('(', match.index);
    var end = balancedEnd(chain, open, '(', ')');
    if (end < 0) break;
    found.push({ method: match[1], argumentsText: chain.slice(open + 1, end) });
    pattern.lastIndex = end + 1;
  }
  return found;
}

function extensionName(text, relativePath) {
  var match = text.match(/(?:SetExtensionInformation|setExtensionInformation)\s*\(\s*["']([^"']+)/);
  if (match) return match[1];
  var normalized = normalizePath(relativePath);
  var extMatch = normalized.match(/(?:^|\/)Extensions\/([^/]+)\//);
  if (extMatch) return extMatch[1];
  return 'Builtin';
}

function ownerSymbols(text, extension) {
  var owners = [];
  var pattern = /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*[\s\S]{0,240}?(?:Add|add)(Object|Behavior)(?:<[^>]+>)?\s*\(\s*["']([^"']+)["']/g;
  var match;
  while ((match = pattern.exec(text))) {
    owners.push({ start: match.index, symbol: match[1], owner: { kind: match[2].toLowerCase(), id: extension + '::' + match[3], symbol: match[1] } });
  }
  return owners;
}

function ownerAt(owners, symbol, index) {
  var found = null;
  owners.forEach(function(candidate) {
    if (candidate.symbol === symbol && candidate.start <= index) found = candidate.owner;
  });
  return found;
}

function receiverBefore(text, index) {
  var prefix = text.slice(Math.max(0, index - 120), index);
  var match = prefix.match(/([A-Za-z_][A-Za-z0-9_]*)\s*$/);
  return match ? match[1] : null;
}

function sourceRef(sourceDir, file, text, index) {
  return { path: normalizePath(path.relative(sourceDir, file)), line: lineAt(text, index) };
}

function makeFluentValue() {
  var target = function() {};
  var proxy = new Proxy(target, {
    get: function(_, property) {
      if (property === Symbol.toPrimitive) return function() { return 0; };
      if (property === 'then') return undefined;
      return proxy;
    },
    apply: function() { return proxy; },
    construct: function() { return proxy; }
  });
  return proxy;
}

function parseExecutableJsDeclarations(sourceDir, file, sourceText) {
  var relativePath = normalizePath(path.relative(sourceDir, file));
  var currentExtension = extensionName(stripComments(sourceText), relativePath);
  var records = [];
  var declarations = 0;
  var fallbackLineByMethod = {};
  Object.keys(DECLARATION_METHODS).forEach(function(method) {
    var index = sourceText.indexOf('.' + method + '(');
    fallbackLineByMethod[method] = index >= 0 ? lineAt(sourceText, index) : 1;
  });

  function declarationCallLine(method) {
    var needle = normalizePath(file).toLowerCase();
    var stack = String(new Error().stack || '').split('\n');
    for (var index = 0; index < stack.length; index++) {
      var normalized = normalizePath(stack[index]).toLowerCase();
      if (normalized.indexOf(needle) < 0) continue;
      var location = stack[index].match(/:(\d+):(\d+)\)?\s*$/);
      if (location) return Number(location[1]);
    }
    return fallbackLineByMethod[method] || 1;
  }

  function instructionBuilder(record) {
    var target = {};
    var targetProxy = new Proxy(target, {
      get: function(_, property) {
        return function() {
          var args = Array.prototype.slice.call(arguments);
          if (property === 'addParameter' || property === 'AddParameter') record.parameters.push({ kind: 'visible', type: args[0] == null ? null : String(args[0]), extra: args[2] == null ? null : String(args[2]) });
          else if (property === 'addCodeOnlyParameter' || property === 'AddCodeOnlyParameter') record.parameters.push({ kind: 'code-only', type: args[0] == null ? null : String(args[0]), extra: args[2] == null ? null : String(args[2]) });
          else if (PARAMETER_MACROS[property]) record.parameterMacros.push({ kind: PARAMETER_MACROS[property], valueType: args[0] == null ? null : String(args[0]) });
          else if (property === 'setFunctionName' || property === 'SetFunctionName') record.runtime.functionName = args[0] == null ? null : String(args[0]);
          else if (property === 'setGetter' || property === 'SetGetter') record.runtime.getter = args[0] == null ? null : String(args[0]);
          else if (property === 'setHidden' || property === 'SetHidden') record.flags.hidden = true;
          else if (property === 'markAsAdvanced' || property === 'MarkAsAdvanced') record.flags.advanced = true;
          return targetProxy;
        };
      }
    });
    return targetProxy;
  }

  function addDeclaration(owner, method, args) {
    declarations++;
    var declarationKind = DECLARATION_METHODS[method];
    var isFamily = declarationKind.indexOf('-family') >= 0;
    var isAlias = declarationKind.indexOf('-alias') >= 0;
    var localId = String(isFamily ? args[1] : args[0]);
    var members;
    var expressionKind = isFamily && String(args[0]) === 'string' ? 'string-expression' : 'number-expression';
    if (declarationKind === 'expression-condition-family') members = [{ kind: expressionKind, localId: localId }, { kind: 'condition', localId: localId }];
    else if (declarationKind === 'expression-condition-action-family') members = [{ kind: expressionKind, localId: localId }, { kind: 'condition', localId: localId }, { kind: 'action', localId: 'Set' + localId }];
    else if (declarationKind === 'expression-alias') members = [{ kind: 'number-expression', localId: localId }];
    else members = [{ kind: declarationKind.replace('-alias', ''), localId: localId }];
    var shared = { parameters: [], parameterMacros: [], runtime: { functionName: null, getter: null }, flags: { hidden: false, advanced: false } };
    var source = { path: relativePath, line: declarationCallLine(method) };
    members.forEach(function(member) {
      records.push({
        id: null,
        extension: currentExtension,
        kind: member.kind,
        localId: member.localId,
        owner: owner,
        inherits: isFamily ? 'pending-family' : null,
        familyValueType: isFamily ? String(args[0]) : null,
        aliasOf: isAlias ? String(args[1]) : null,
        parameters: shared.parameters,
        parameterMacros: shared.parameterMacros,
        runtime: shared.runtime,
        flags: shared.flags,
        source: source
      });
    });
    return instructionBuilder(shared);
  }

  function ownerProxy(owner) {
    var target = {};
    var proxy = new Proxy(target, {
      get: function(_, property) {
        if (DECLARATION_METHODS[property]) return function() { return addDeclaration(owner, property, Array.prototype.slice.call(arguments)); };
        return function() { return proxy; };
      }
    });
    return proxy;
  }

  var globalOwner = { kind: 'global', id: 'extension' };
  var extensionTarget = {};
  var extensionProxy = new Proxy(extensionTarget, {
    get: function(_, property) {
      if (property === 'setExtensionInformation' || property === 'SetExtensionInformation') return function(name) { currentExtension = String(name); return extensionProxy; };
      if (property === 'addObject' || property === 'AddObject') return function(name) { return ownerProxy({ kind: 'object', id: currentExtension + '::' + String(name) }); };
      if (property === 'addBehavior' || property === 'AddBehavior') return function(name) { return ownerProxy({ kind: 'behavior', id: currentExtension + '::' + String(name) }); };
      if (DECLARATION_METHODS[property]) return function() { return addDeclaration(globalOwner, property, Array.prototype.slice.call(arguments)); };
      return function() { return extensionProxy; };
    }
  });
  var generic = makeFluentValue();
  var gd = new Proxy({}, {
    get: function(_, property) {
      if (property === 'PlatformExtension') return function() { return extensionProxy; };
      return generic;
    }
  });
  try {
    delete require.cache[require.resolve(file)];
    var moduleValue = require(file);
    if (!moduleValue || typeof moduleValue.createExtension !== 'function') throw new Error('createExtension export missing');
    moduleValue.createExtension(function(value) { return value; }, gd);
  } catch (error) {
    return { records: [], declarations: 0, error: error.message };
  }
  records.forEach(function(record) {
    var stableOwner = record.owner.id.replace(/[^A-Za-z0-9_:.-]+/g, '_');
    record.id = [record.extension, record.owner.kind, stableOwner, record.kind, record.localId].join('::');
    if (record.inherits) record.inherits = [record.extension, record.owner.kind, stableOwner, 'family', record.localId.replace(/^Set/, '')].join('::');
  });
  return { records: records, declarations: declarations, error: null };
}

function parseDeclarations(sourceDir, file, sourceText) {
  var text = stripComments(sourceText);
  var relativePath = normalizePath(path.relative(sourceDir, file));
  var extension = extensionName(text, relativePath);
  var owners = ownerSymbols(text, extension);
  var records = [];
  var unresolved = [];
  var declarations = 0;
  var methodNames = Object.keys(DECLARATION_METHODS).sort(function(a, b) { return b.length - a.length; });
  var pattern = new RegExp('(?:\\.|->)(' + methodNames.join('|') + ')\\s*\\(', 'g');
  var match;
  while ((match = pattern.exec(text))) {
    var method = match[1];
    var open = text.indexOf('(', match.index);
    var callClose = balancedEnd(text, open, '(', ')');
    var end = callClose < 0 ? -1 : chainEnd(text, callClose + 1);
    var source = sourceRef(sourceDir, file, sourceText, match.index);
    if (callClose < 0 || end < 0) {
      unresolved.push({ source: source, method: method, reason: 'unbalanced declaration chain' });
      continue;
    }
    var args = text.slice(open + 1, callClose);
    var strings = stringArguments(args);
    if (!strings.length) {
      unresolved.push({ source: source, method: method, reason: 'dynamic instruction id' });
      pattern.lastIndex = end;
      continue;
    }
    declarations++;
    var declarationKind = DECLARATION_METHODS[method];
    var isFamily = declarationKind.indexOf('-family') >= 0;
    var isAlias = declarationKind.indexOf('-alias') >= 0;
    var localId = isFamily ? strings[1] : strings[0];
    if (!localId || (isAlias && !strings[1])) {
      unresolved.push({ source: source, method: method, reason: 'incomplete declaration identity' });
      declarations--;
      pattern.lastIndex = end;
      continue;
    }
    var chain = text.slice(match.index, end);
    var receiver = receiverBefore(text, match.index - (text[match.index] === '-' ? 0 : 0));
    var typedOwner = receiver && new RegExp('(Object|Behavior)Metadata\\s*&\\s*' + receiver + '\\b').exec(text);
    var owner = ownerAt(owners, receiver, match.index) || (typedOwner ? { kind: typedOwner[1].toLowerCase(), id: extension + '::__' + typedOwner[1].toLowerCase() + '_metadata__', symbol: receiver, inferred: true } : { kind: receiver && /extension/i.test(receiver) ? 'global' : 'symbol', id: receiver || 'unknown', symbol: receiver || null });
    var parameters = findAllCalls(chain, 'AddParameter|addParameter|AddCodeOnlyParameter|addCodeOnlyParameter').map(function(call) {
      var values = stringArguments(call.argumentsText);
      return { kind: /CodeOnly/.test(call.method) ? 'code-only' : 'visible', type: values[0] || null, extra: values[2] || null };
    });
    var parameterMacros = [];
    Object.keys(PARAMETER_MACROS).forEach(function(macro) {
      findAllCalls(chain, macro).forEach(function(call) {
        parameterMacros.push({ kind: PARAMETER_MACROS[macro], valueType: stringArguments(call.argumentsText)[0] || null });
      });
    });
    var runtimeFunction = firstCallArgument(chain, 'SetFunctionName') || firstCallArgument(chain, 'setFunctionName');
    var getter = firstCallArgument(chain, 'SetGetter') || firstCallArgument(chain, 'setGetter');
    var stableOwner = owner.id.replace(/[^A-Za-z0-9_:.-]+/g, '_');
    var members;
    var expressionKind = isFamily && strings[0] === 'string' ? 'string-expression' : 'number-expression';
    if (declarationKind === 'expression-condition-family') members = [{ kind: expressionKind, localId: localId }, { kind: 'condition', localId: localId }];
    else if (declarationKind === 'expression-condition-action-family') members = [{ kind: expressionKind, localId: localId }, { kind: 'condition', localId: localId }, { kind: 'action', localId: 'Set' + localId }];
    else if (declarationKind === 'expression-alias') members = [{ kind: 'number-expression', localId: localId }];
    else members = [{ kind: declarationKind.replace('-alias', ''), localId: localId }];
    var familyId = [extension, owner.kind, stableOwner, 'family', localId].join('::');
    members.forEach(function(member) {
      var id = [extension, owner.kind, stableOwner, member.kind, member.localId].join('::');
      var runtime = { functionName: runtimeFunction, getter: getter };
      if (isFamily) {
        runtime = member.kind === 'action' ? { functionName: runtimeFunction, getter: getter } : { functionName: getter || runtimeFunction, getter: getter };
      }
      records.push({
        id: id,
        extension: extension,
        kind: member.kind,
        localId: member.localId,
        owner: owner,
        inherits: isFamily ? familyId : null,
        familyValueType: isFamily ? strings[0] : null,
        aliasOf: isAlias ? strings[1] : null,
        parameters: parameters,
        parameterMacros: parameterMacros,
        runtime: runtime,
        flags: { hidden: /(?:SetHidden|setHidden)\s*\(/.test(chain), advanced: /(?:MarkAsAdvanced|markAsAdvanced)\s*\(/.test(chain) },
        source: source
      });
    });
    pattern.lastIndex = end;
  }
  return { records: records, unresolved: unresolved, declarations: declarations, extension: extension, ownerHints: owners.map(function(item) { return { extension: extension, owner: item.owner }; }) };
}

function parseRuntimeOverrides(sourceDir, file, sourceText) {
  var text = stripComments(sourceText);
  var relativePath = normalizePath(path.relative(sourceDir, file));
  var extension = extensionName(text, relativePath);
  var records = [];
  var direct = /GetAll(Actions|Conditions|Expressions|StrExpressions)(ForObject|ForBehavior)?\s*\(\s*(?:["']([^"']+)["'])?\s*\)\s*\[\s*["']([^"']+)["']\s*\][\s\S]{0,240}?SetFunctionName\s*\(\s*["']([^"']*)["']/g;
  var match;
  while ((match = direct.exec(text))) {
    var directCollection = match[1] === 'StrExpressions' ? 'string-expressions' : match[1] === 'Expressions' ? 'number-expressions' : match[1].toLowerCase();
    records.push({ extension: extension, collection: directCollection, scope: match[2] ? match[2].slice(3).toLowerCase() : 'global', ownerId: match[3] || null, instructionId: match[4], functionName: match[5], source: sourceRef(sourceDir, file, sourceText, match.index) });
  }
  var aliases = [];
  var aliasPattern = /(?:std::map<[^;]+?>\s*&\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*GetAll(Actions|Conditions|Expressions|StrExpressions|ActionsForObject|ConditionsForObject|ExpressionsForObject|StrExpressionsForObject|ActionsForBehavior|ConditionsForBehavior|ExpressionsForBehavior|StrExpressionsForBehavior)\s*\(\s*(?:["']([^"']+)["'])?\s*\)\s*;/g;
  while ((match = aliasPattern.exec(text))) aliases.push({ alias: match[1], collection: match[2], ownerId: match[3] || null, start: aliasPattern.lastIndex });
  aliases.forEach(function(alias, index) {
    var end = text.length;
    for (var next = index + 1; next < aliases.length; next++) {
      if (aliases[next].alias === alias.alias) { end = aliases[next].start; break; }
    }
    var segment = text.slice(alias.start, end);
    var escaped = alias.alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var bindingPattern = new RegExp(escaped + '\\s*\\[\\s*((?:["\\\'][^"\\\']*["\\\']\\s*)+)\\][\\s\\S]{0,240}?SetFunctionName\\s*\\(\\s*["\\\']([^"\\\']*)["\\\']', 'g');
    var binding;
    while ((binding = bindingPattern.exec(segment))) {
      var scope = alias.collection.indexOf('ForObject') >= 0 ? 'object' : alias.collection.indexOf('ForBehavior') >= 0 ? 'behavior' : 'global';
      var collection = alias.collection.indexOf('StrExpression') >= 0 ? 'string-expressions' : alias.collection.indexOf('Expression') >= 0 ? 'number-expressions' : alias.collection.indexOf('Condition') >= 0 ? 'conditions' : 'actions';
      records.push({ extension: extension, collection: collection, scope: scope, ownerId: alias.ownerId, instructionId: stringArguments(binding[1]).join(''), functionName: binding[2], source: sourceRef(sourceDir, file, sourceText, alias.start + binding.index) });
    }
  });
  return records;
}

function deduplicate(records) {
  var byId = {};
  records.forEach(function(record) {
    var id = record.id;
    if (!byId[id]) { byId[id] = record; return; }
    if (stableStringify(byId[id]) === stableStringify(record)) return;
    var canonical = byId[id];
    if (record.inherits && !canonical.inherits) {
      var previousVariants = canonical.variants || [];
      delete canonical.variants;
      record.variants = previousVariants.concat([{ source: canonical.source, inherits: canonical.inherits, aliasOf: canonical.aliasOf, parameters: canonical.parameters, parameterMacros: canonical.parameterMacros, runtime: canonical.runtime, flags: canonical.flags }]);
      byId[id] = record;
      return;
    }
    if (!canonical.variants) canonical.variants = [];
    canonical.variants.push({ source: record.source, inherits: record.inherits, aliasOf: record.aliasOf, parameters: record.parameters, parameterMacros: record.parameterMacros, runtime: record.runtime, flags: record.flags });
  });
  return Object.keys(byId).sort().map(function(id) { return byId[id]; });
}

function resolveCrossFileOwners(records, ownerHints) {
  var candidates = {};
  (ownerHints || []).forEach(function(hint) {
    var owner = hint.owner;
    var key = hint.extension + '|' + owner.symbol;
    if (!candidates[key]) candidates[key] = {};
    candidates[key][owner.kind + '|' + owner.id] = owner;
  });
  records.forEach(function(record) {
    var owner = record.owner;
    if (!owner || !owner.symbol || owner.inferred || owner.kind === 'symbol') return;
    var key = record.extension + '|' + owner.symbol;
    if (!candidates[key]) candidates[key] = {};
    candidates[key][owner.kind + '|' + owner.id] = owner;
  });
  records.forEach(function(record) {
    var owner = record.owner;
    if (!owner || !owner.symbol || (!owner.inferred && owner.kind !== 'symbol')) return;
    var values = Object.keys(candidates[record.extension + '|' + owner.symbol] || {});
    if (values.length === 1) record.owner = candidates[record.extension + '|' + owner.symbol][values[0]];
    var stableOwner = record.owner.id.replace(/[^A-Za-z0-9_:.-]+/g, '_');
    record.id = [record.extension, record.owner.kind, stableOwner, record.kind, record.localId].join('::');
    if (record.inherits) record.inherits = [record.extension, record.owner.kind, stableOwner, 'family', record.localId.replace(/^Set/, '')].join('::');
  });
  return records;
}

function buildUniverse(sourceDir) {
  sourceDir = sourceDir || SOURCE_DIR;
  if (!fs.existsSync(sourceDir)) throw new Error('GDevelop source directory not found: ' + sourceDir);
  var files = discoverSourceFiles(sourceDir);
  if (!files.length) throw new Error('No GDevelop extension sources discovered in ' + sourceDir);
  var capabilities = [];
  var ownerHints = [];
  var unresolved = [];
  var runtimeOverrides = [];
  var sources = files.map(function(file) {
    var text = fs.readFileSync(file, 'utf8');
    var parsed = parseDeclarations(sourceDir, file, text);
    var staticDeclarations = parsed.declarations;
    var enumeration = 'static-source';
    ownerHints = ownerHints.concat(parsed.ownerHints || []);
    if (/JsExtension\.js$/i.test(file)) {
      var executed = parseExecutableJsDeclarations(sourceDir, file, text);
      if (!executed.error) { parsed = { records: executed.records, unresolved: [], declarations: executed.declarations }; enumeration = 'executed-js-factory'; }
      else parsed.unresolved.push({ source: { path: normalizePath(path.relative(sourceDir, file)), line: 1 }, method: 'createExtension', reason: 'runtime enumeration failed: ' + executed.error });
    }
    capabilities = capabilities.concat(parsed.records);
    unresolved = unresolved.concat(parsed.unresolved);
    var fileRuntimeOverrides = parseRuntimeOverrides(sourceDir, file, text);
    runtimeOverrides = runtimeOverrides.concat(fileRuntimeOverrides);
    var runtimeMarkers = /JsExtension\.cpp$/i.test(file) ? (stripComments(text).match(/SetFunctionName\s*\(/g) || []).length : 0;
    return { path: normalizePath(path.relative(sourceDir, file)), sha1: sha1(text), enumeration: enumeration, staticDeclarations: staticDeclarations, declarations: parsed.declarations, capabilities: parsed.records.length, unresolved: parsed.unresolved.length, runtimeMarkers: runtimeMarkers, runtimeBindings: fileRuntimeOverrides.length, runtimeUnresolved: Math.max(0, runtimeMarkers - fileRuntimeOverrides.length) };
  });
  capabilities = deduplicate(resolveCrossFileOwners(capabilities, ownerHints));
  var familyMap = {};
  capabilities.forEach(function(item) {
    if (!item.inherits) return;
    if (!familyMap[item.inherits]) familyMap[item.inherits] = { id: item.inherits, valueType: item.familyValueType, parameters: item.parameters, parameterMacros: item.parameterMacros, flags: item.flags, members: [], source: item.source };
    if (stableStringify(familyMap[item.inherits].parameters) !== stableStringify(item.parameters) || stableStringify(familyMap[item.inherits].parameterMacros) !== stableStringify(item.parameterMacros) || stableStringify(familyMap[item.inherits].flags) !== stableStringify(item.flags)) {
      throw new Error('Inconsistent inherited family metadata: ' + item.inherits);
    }
    familyMap[item.inherits].members.push(item.id);
    delete item.familyValueType;
    delete item.parameters;
    delete item.parameterMacros;
    delete item.flags;
  });
  var families = Object.keys(familyMap).sort().map(function(id) {
    familyMap[id].members.sort();
    return familyMap[id];
  });
  capabilities.forEach(function(item) { delete item.familyValueType; });
  var runtimeByKey = {};
  runtimeOverrides.forEach(function(item) {
    var key = [item.source.path, item.collection, item.scope, item.ownerId || '', item.instructionId, item.functionName].join('|');
    runtimeByKey[key] = item;
  });
  runtimeOverrides = Object.keys(runtimeByKey).sort().map(function(key) { return runtimeByKey[key]; });
  runtimeOverrides.forEach(function(binding) {
    var kind = binding.collection === 'actions' ? 'action' : binding.collection === 'conditions' ? 'condition' : binding.collection === 'string-expressions' ? 'string-expression' : 'number-expression';
    var instructionId = binding.instructionId.toLowerCase();
    var functionName = binding.functionName.toLowerCase();
    var scoped = capabilities.filter(function(capability) {
      if (capability.extension !== binding.extension || capability.kind !== kind) return false;
      if (binding.ownerId && capability.owner.id !== binding.ownerId) return false;
      return true;
    });
    var exact = scoped.filter(function(capability) {
      var localId = capability.localId.toLowerCase();
      return instructionId === localId || instructionId.slice(-(localId.length + 2)) === '::' + localId;
    });
    var candidates = exact.length ? exact : scoped.filter(function(capability) {
      var declaredFunctions = [capability.runtime.functionName, capability.runtime.getter].filter(Boolean).map(function(value) { return value.toLowerCase(); });
      return declaredFunctions.indexOf(functionName) >= 0;
    });
    binding.capabilityIds = candidates.map(function(capability) { return capability.id; }).sort();
    binding.linkReason = exact.length ? 'instruction-id' : 'runtime-function-fallback';
  });
  var unlinkedRuntimeOverrides = runtimeOverrides.filter(function(binding) { return binding.capabilityIds.length === 0; });
  unresolved.sort(function(a, b) { return stableStringify(a).localeCompare(stableStringify(b)); });
  var extensions = {};
  capabilities.forEach(function(item) {
    if (!extensions[item.extension]) extensions[item.extension] = { actions: 0, conditions: 0, expressions: 0 };
    if (item.kind === 'action') extensions[item.extension].actions++;
    else if (item.kind === 'condition') extensions[item.extension].conditions++;
    else extensions[item.extension].expressions++;
  });
  return {
    schemaVersion: 1,
    source: { dir: sourceDir, roots: ['Core/GDCore/Extensions/Builtin', 'Extensions'], files: sources },
    model: { inheritance: 'Extension definition is the base record; JsExtension runtime metadata overrides execution fields.', parameterMacroKinds: ['standard-value', 'standard-operator', 'standard-relational-operator'] },
    summary: { sourceFiles: sources.length, extensions: Object.keys(extensions).length, declarations: sources.reduce(function(total, item) { return total + item.declarations; }, 0), families: families.length, capabilities: capabilities.length, declarationVariants: capabilities.reduce(function(total, item) { return total + (item.variants ? item.variants.length : 0); }, 0), unresolvedDeclarations: unresolved.length, runtimeOverrides: runtimeOverrides.length, unresolvedRuntimeBindings: sources.reduce(function(total, item) { return total + item.runtimeUnresolved; }, 0), unlinkedRuntimeOverrides: unlinkedRuntimeOverrides.length },
    extensions: extensions,
    families: families,
    capabilities: capabilities,
    runtimeOverrides: runtimeOverrides,
    unresolvedDeclarations: unresolved
  };
}

function main() {
  var universe = buildUniverse(SOURCE_DIR);
  var rendered = prettyStable(universe);
  if (CHECK_MODE) {
    var current = fs.existsSync(OUT_PATH) ? fs.readFileSync(OUT_PATH, 'utf8') : '';
    if (current !== rendered) throw new Error('Capability universe snapshot is stale. Run `npm run capabilities:extract`.');
    console.log('[CapabilityUniverse] snapshot OK: ' + universe.summary.capabilities + ' capabilities from ' + universe.summary.sourceFiles + ' files');
    return;
  }
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, rendered, 'utf8');
  console.log('[CapabilityUniverse] wrote ' + OUT_PATH);
  console.log(JSON.stringify(universe.summary));
}

if (require.main === module) main();
module.exports = { buildUniverse: buildUniverse, discoverSourceFiles: discoverSourceFiles, prettyStable: prettyStable };
