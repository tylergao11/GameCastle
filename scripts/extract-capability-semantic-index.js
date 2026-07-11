var fs = require('fs');
var path = require('path');
var semanticDictionary = require('../ai/capability-semantic-dictionary');

var ROOT = path.join(__dirname, '..');
var OUT_PATH = path.join(ROOT, 'ai', 'semantic-mapping', 'capability-semantic-index.json');
var CHECK_MODE = process.argv.indexOf('--check') >= 0;

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(value).sort().map(function(key) { return JSON.stringify(key) + ':' + stableStringify(value[key]); }).join(',') + '}';
}
function render(value) { return JSON.stringify(JSON.parse(stableStringify(value)), null, 2) + '\n'; }
function main() {
  var index = semanticDictionary.buildIndex();
  var output = render(index);
  if (CHECK_MODE) {
    var current = fs.existsSync(OUT_PATH) ? fs.readFileSync(OUT_PATH, 'utf8') : '';
    if (current !== output) throw new Error('Capability semantic index is stale. Run `npm run semantic-universe:extract`.');
    console.log('[CapabilitySemanticIndex] snapshot OK: ' + index.summary.covered_count + '/' + index.summary.capability_count);
    return;
  }
  fs.writeFileSync(OUT_PATH, output, 'utf8');
  console.log('[CapabilitySemanticIndex] wrote ' + OUT_PATH + ': ' + index.summary.covered_count + '/' + index.summary.capability_count);
}
main();
