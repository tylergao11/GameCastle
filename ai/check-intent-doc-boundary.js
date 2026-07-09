var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');

var DOCS = [
  'README.md',
  'ai/README.md',
  'docs/architecture.md',
  'docs/ai-first-intent-runtime-bridge.md',
  'docs/roadmap.md',
];

var FORBIDDEN_PRIMARY_SURFACE_PHRASES = [
  'The live LLM2 path is also Module DSL first',
  'LLM2 Module Patch Commander',
  'LLM2 Module DSL.',
  'LLM2 deterministic DSL patch',
  'translating creative intent into Module DSL',
  'DSLAgent output containing Module DSL patch text',
  'repairs Module DSL compile failures and inherits the DSL model',
  'LLM2 receives those interaction contracts',
  'Compile creative intent and ProjectWorld into Module DSL',
  'LLM2 may adjust coordinates',
  'LLM2 may add',
  'LLM2 may randomize position',
];

var FORBIDDEN_PRIMARY_SURFACE_PATTERNS = [
  /DSLAgent[^\n]*Module DSL/,
];

var REQUIRED_BOUNDARY_PHRASES = {
  'README.md': [
    'Current AI-first boundary: LLM2 writes natural Intent DSL only.',
  ],
  'ai/README.md': [
    'The live LLM2 product surface is Intent DSL.',
    'Module DSL and low-level DSL are',
    'legacy/internal compiler target shapes',
  ],
  'docs/architecture.md': [
    'Current AI-first override: LLM2 output is AI-first Intent DSL.',
  ],
  'docs/ai-first-intent-runtime-bridge.md': [
    'live LLM2 path now selects them through AI-first Intent DSL',
  ],
};

function main() {
  var failures = [];
  DOCS.forEach(function(relativePath) {
    var fullPath = path.join(ROOT, relativePath);
    var text = fs.readFileSync(fullPath, 'utf8');
    FORBIDDEN_PRIMARY_SURFACE_PHRASES.forEach(function(phrase) {
      if (text.indexOf(phrase) >= 0) {
        failures.push(relativePath + ': ' + phrase);
      }
    });
    FORBIDDEN_PRIMARY_SURFACE_PATTERNS.forEach(function(pattern) {
      if (pattern.test(text)) {
        failures.push(relativePath + ': ' + pattern.toString());
      }
    });
    (REQUIRED_BOUNDARY_PHRASES[relativePath] || []).forEach(function(phrase) {
      if (text.indexOf(phrase) < 0) {
        failures.push(relativePath + ': missing required boundary phrase: ' + phrase);
      }
    });
  });
  if (failures.length) {
    throw new Error('Intent docs still teach stale LLM2 machine/Module DSL primary forms:\n' + failures.join('\n'));
  }
  console.log('[IntentDocBoundary] docs do not teach stale LLM2 machine/Module DSL primary forms');
}

main();
