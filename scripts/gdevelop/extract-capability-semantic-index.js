var fs = require('fs');
var path = require('path');
var semanticDictionary = require('../../packages/semantic/src/capability-semantic-dictionary');

var ROOT = require('../shared/repository-path').root;
var OUT_PATH = path.join(ROOT, 'packages', 'semantic', 'generated', 'capability-semantic-index.json');
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
    console.log('[GDJSSemanticDictionary] snapshot OK: ' + index.summary.interpretableCapabilityCount + '/' + index.summary.capabilityCount);
    return;
  }
  fs.writeFileSync(OUT_PATH, output, 'utf8');
  console.log('[GDJSSemanticDictionary] wrote ' + OUT_PATH + ': ' + index.summary.interpretableCapabilityCount + '/' + index.summary.capabilityCount + '; executable=' + index.summary.executableCapabilityCount);
}
main();
