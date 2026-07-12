var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var DICTIONARY_PATH = path.join(__dirname, 'semantic-mapping', 'semantic-feedback.json');
var CAPABILITY_INDEX_PATH = path.join(__dirname, 'semantic-mapping', 'capability-semantic-index.json');

function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function decodePart(value) { return String(value).replace(/~1/g, '/').replace(/~0/g, '~'); }
function pointer(document, value) {
  if (String(value).indexOf('/') !== 0) return undefined;
  return String(value).split('/').slice(1).map(decodePart).reduce(function(current, key) {
    if (!current || !Object.prototype.hasOwnProperty.call(current, key)) return undefined;
    return current[key];
  }, document);
}
function resolve(ref, options) {
  options = options || {};
  var dictionary = options.dictionary || read(DICTIONARY_PATH);
  var index = options.capabilityIndex || read(CAPABILITY_INDEX_PATH);
  if (typeof ref !== 'string') throw new Error('Semantic ref must be a string');
  if (ref.indexOf('semantic-dictionary#/') === 0) {
    var value = pointer(dictionary, ref.slice('semantic-dictionary#'.length));
    if (value === undefined) throw new Error('Unresolved semantic dictionary ref: ' + ref);
    return { ref: ref, source: 'semantic-dictionary', value: value };
  }
  if (ref.indexOf('capability-index#/by_semantic/') === 0) {
    var capability = pointer(index, ref.slice('capability-index#'.length));
    if (capability === undefined) throw new Error('Unresolved capability semantic ref: ' + ref);
    return { ref: ref, source: 'capability-index', value: capability };
  }
  throw new Error('Non-canonical semantic ref: ' + ref);
}
function assertAll(refs, options) { return (refs || []).map(function(ref) { return resolve(ref, options); }); }
module.exports = { ROOT: ROOT, resolve: resolve, assertAll: assertAll };
