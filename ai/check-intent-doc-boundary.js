var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');

var REQUIRED_DOC_PHRASES = {
  'README.md': [
    'Current AI-first boundary: LLM2 writes natural Intent DSL only.',
    'semantic evidence',
    'owner-routed repair',
  ],
  'ai/README.md': [
    'The live LLM2 product surface is Intent DSL.',
    'semantic playtest evidence',
    'owner-routed repair',
  ],
  'docs/architecture.md': [
    'Current AI-first override: LLM2 output is AI-first Intent DSL.',
    'semantic repair candidates',
  ],
  'docs/ai-first-intent-runtime-bridge.md': [
    'capability through AI-first Intent DSL',
  ],
};

function main() {
  var failures = [];
  Object.keys(REQUIRED_DOC_PHRASES).forEach(function(relativePath) {
    var fullPath = path.join(ROOT, relativePath);
    var text = fs.readFileSync(fullPath, 'utf8');
    REQUIRED_DOC_PHRASES[relativePath].forEach(function(phrase) {
      if (text.indexOf(phrase) < 0) {
        failures.push(relativePath + ': missing current boundary phrase: ' + phrase);
      }
    });
  });
  if (failures.length) {
    throw new Error('Intent docs must describe the current AI-first boundary:\n' + failures.join('\n'));
  }
  console.log('[IntentDocBoundary] docs describe current AI-first Intent boundary');
}

main();
