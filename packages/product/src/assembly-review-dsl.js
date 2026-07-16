var LANGUAGE_ID = 'assembly-review-dsl-v1';

var number = '([-+]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:[eE][-+]?\\d+)?)';
var quoted = '"(?:[^"\\\\\\r\\n]|\\\\.)*"';
var observeLine = new RegExp('^OBSERVE code=([A-Za-z][A-Za-z0-9_]*) description=(' + quoted + ')$');
var evidenceLine = new RegExp('^EVIDENCE visualFact=(' + quoted + ')$');
var regionLine = new RegExp('^REGION x=' + number + ' y=' + number + ' width=' + number + ' height=' + number + '$');
var targetLine = new RegExp('^TARGET collection=(' + quoted + ') semanticId=(' + quoted + ')$');

function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'AssemblyReviewDSL'; throw error; }

function quote(value) {
  if (typeof value !== 'string') fail('ASSEMBLY_REVIEW_DSL_CONTEXT_INVALID', 'DSL text must be a string.');
  return '"' + value.replace(/[\\"\u0000-\u001f]/g, function(character) {
    if (character === '\\') return '\\\\';
    if (character === '"') return '\\"';
    if (character === '\n') return '\\n';
    if (character === '\r') return '\\r';
    if (character === '\t') return '\\t';
    return '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0');
  }) + '"';
}

function parseQuoted(value, label) {
  if (typeof value !== 'string' || value.length < 2 || value.charAt(0) !== '"' || value.charAt(value.length - 1) !== '"') fail('ASSEMBLY_REVIEW_DSL_INVALID', label + ' must be a quoted DSL string.');
  var text = '';
  for (var index = 1; index < value.length - 1; index++) {
    var character = value.charAt(index);
    if (character !== '\\') {
      if (character < ' ') fail('ASSEMBLY_REVIEW_DSL_INVALID', label + ' contains an unescaped control character.');
      text += character;
      continue;
    }
    index += 1;
    if (index >= value.length - 1) fail('ASSEMBLY_REVIEW_DSL_INVALID', label + ' ends with an incomplete escape.');
    var escape = value.charAt(index);
    if (escape === '"' || escape === '\\') { text += escape; continue; }
    if (escape === 'n') { text += '\n'; continue; }
    if (escape === 'r') { text += '\r'; continue; }
    if (escape === 't') { text += '\t'; continue; }
    if (escape === 'u') {
      var hex = value.slice(index + 1, index + 5);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('ASSEMBLY_REVIEW_DSL_INVALID', label + ' contains an invalid unicode escape.');
      text += String.fromCharCode(parseInt(hex, 16)); index += 4; continue;
    }
    fail('ASSEMBLY_REVIEW_DSL_INVALID', label + ' contains an unsupported escape.');
  }
  return text;
}

function parseNumber(value, label) {
  var parsed = Number(value);
  if (!Number.isFinite(parsed)) fail('ASSEMBLY_REVIEW_DSL_INVALID', label + ' must be finite.');
  return parsed;
}

function renderFactRows(scope, value) {
  if (typeof scope !== 'string' || !scope) fail('ASSEMBLY_REVIEW_DSL_CONTEXT_INVALID', 'FACT scope must be non-empty text.');
  var rows = [];
  function emit(path, kind, valueText) {
    var row = 'FACT scope=' + quote(scope) + ' path=' + quote(path || '/') + ' kind=' + kind;
    if (valueText !== undefined) row += ' value=' + valueText;
    rows.push(row);
  }
  function childPath(path, key) { return (path || '') + '/' + String(key).replace(/~/g, '~0').replace(/\//g, '~1'); }
  function walk(path, current) {
    if (current === null) { emit(path, 'null'); return; }
    if (current === undefined) { emit(path, 'undefined'); return; }
    if (typeof current === 'string') { emit(path, 'text', quote(current)); return; }
    if (typeof current === 'boolean') { emit(path, 'boolean', current ? 'true' : 'false'); return; }
    if (typeof current === 'number') { emit(path, Number.isFinite(current) ? 'number' : 'nonfinite-number', quote(String(current))); return; }
    if (typeof current === 'bigint') { emit(path, 'bigint', quote(String(current))); return; }
    if (Array.isArray(current)) {
      emit(path, 'array', String(current.length));
      current.forEach(function(item, index) { walk(childPath(path, index), item); });
      return;
    }
    if (typeof current === 'object') {
      emit(path, 'object');
      Object.keys(current).sort().forEach(function(key) { walk(childPath(path, key), current[key]); });
      return;
    }
    emit(path, 'unsupported', quote(String(current)));
  }
  walk('', value);
  return rows;
}

function parseProgram(program) {
  if (typeof program !== 'string' || !program.trim()) fail('ASSEMBLY_REVIEW_DSL_INVALID', 'Assembly Reviewer output must contain one ' + LANGUAGE_ID + ' program.');
  var lines = program.split(/\r?\n/).map(function(line) { return line.trim(); }).filter(Boolean);
  if (lines.length === 1 && lines[0] === 'ACCEPT') return { decision: 'accepted', observations: [] };
  if (lines.some(function(line) { return line === 'ACCEPT'; })) fail('ASSEMBLY_REVIEW_DSL_ACCEPTANCE_MIXED', 'ACCEPT must be the entire Assembly Reviewer program.');
  if (lines[0] !== 'REJECT') fail('ASSEMBLY_REVIEW_DSL_INVALID', 'Assembly Reviewer output must begin with ACCEPT or REJECT.');
  var observations = [], index = 1;
  while (index < lines.length) {
    var observationMatch = observeLine.exec(lines[index]);
    if (!observationMatch) fail('ASSEMBLY_REVIEW_DSL_INVALID', 'Expected OBSERVE at line ' + (index + 1) + '.');
    var observation = { code: observationMatch[1], description: parseQuoted(observationMatch[2], 'OBSERVE.description'), targets: [], evidence: { visualFact: null, screenshotRegion: null } };
    index += 1;
    var evidenceMatch = evidenceLine.exec(lines[index] || '');
    if (!evidenceMatch) fail('ASSEMBLY_REVIEW_DSL_INVALID', 'OBSERVE at line ' + index + ' requires one EVIDENCE row.');
    observation.evidence.visualFact = parseQuoted(evidenceMatch[1], 'EVIDENCE.visualFact');
    index += 1;
    if (lines[index] === 'REGION NONE') {
      observation.evidence.screenshotRegion = null;
    } else {
      var regionMatch = regionLine.exec(lines[index] || '');
      if (!regionMatch) fail('ASSEMBLY_REVIEW_DSL_INVALID', 'OBSERVE at line ' + (index - 1) + ' requires REGION NONE or a rectangular REGION row.');
      observation.evidence.screenshotRegion = {
        x: parseNumber(regionMatch[1], 'REGION.x'),
        y: parseNumber(regionMatch[2], 'REGION.y'),
        width: parseNumber(regionMatch[3], 'REGION.width'),
        height: parseNumber(regionMatch[4], 'REGION.height')
      };
    }
    index += 1;
    while (index < lines.length && targetLine.test(lines[index])) {
      var targetMatch = targetLine.exec(lines[index]);
      observation.targets.push({ collection: parseQuoted(targetMatch[1], 'TARGET.collection'), semanticId: parseQuoted(targetMatch[2], 'TARGET.semanticId') });
      index += 1;
    }
    if (!observation.targets.length) fail('ASSEMBLY_REVIEW_DSL_INVALID', 'OBSERVE at line ' + (index + 1) + ' requires at least one TARGET row.');
    if (lines[index] !== 'END') fail('ASSEMBLY_REVIEW_DSL_INVALID', 'OBSERVE at line ' + (index + 1) + ' must end with END.');
    observations.push(observation);
    index += 1;
  }
  if (!observations.length) fail('ASSEMBLY_REVIEW_DSL_INVALID', 'REJECT requires at least one factual OBSERVE block.');
  return { decision: 'rejected', observations: observations };
}

module.exports = { LANGUAGE_ID: LANGUAGE_ID, quote: quote, parseQuoted: parseQuoted, parseProgram: parseProgram, renderFactRows: renderFactRows };
