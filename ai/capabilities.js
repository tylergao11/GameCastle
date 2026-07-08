var fs = require('fs');
var path = require('path');

var CAPABILITY_SCHEMA_VERSION = 1;

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sortById(a, b) {
  return String(a.id).localeCompare(String(b.id));
}

// Load all product modules and extract their capability cards.
// Capabilities with the same id are deduplicated (first wins).
function loadCapabilityCatalog(productModulesDir) {
  var schema = loadJson(path.join(productModulesDir, 'schema.json'));
  var files = fs.readdirSync(productModulesDir)
    .filter(function(file) { return file.endsWith('.json') && file !== 'schema.json'; })
    .sort();

  var seen = {};
  var cards = [];

  files.forEach(function(file) {
    var manifest = loadJson(path.join(productModulesDir, file));
    var moduleCaps = manifest.capabilities || [];
    moduleCaps.forEach(function(cap) {
      if (!seen[cap.id]) {
        seen[cap.id] = true;
        cap._sourceModule = manifest.id;
        cap._sourceFile = file;
        cards.push(cap);
      }
    });
  });

  cards.sort(sortById);
  validateCapabilityCatalog(schema, cards);

  return {
    schemaVersion: CAPABILITY_SCHEMA_VERSION,
    schema: schema,
    cards: cards,
  };
}

function validateCapabilityCatalog(schema, cards) {
  if (!schema || schema.schemaVersion !== CAPABILITY_SCHEMA_VERSION) {
    throw new Error('Unsupported product module schema version');
  }
  var seen = {};
  cards.forEach(function(card) {
    if (card.schemaVersion !== undefined && card.schemaVersion !== CAPABILITY_SCHEMA_VERSION) {
      throw new Error('Capability ' + card.id + ' has unsupported schemaVersion');
    }
    if (!card.id) throw new Error('Capability missing id from source module ' + (card._sourceModule || 'unknown'));
    if (seen[card.id]) throw new Error('Duplicate capability id: ' + card.id);
    seen[card.id] = true;
    if (!card.dsl || !Array.isArray(card.dsl.commands)) {
      throw new Error('Capability ' + card.id + ' must define dsl.commands (source: ' + (card._sourceModule || 'unknown') + ')');
    }
  });
}

function buildCreativeCapabilitySummary(catalog) {
  return catalog.cards.map(function(card) {
    return '- ' + card.name + ': ' + card.llm1Hint;
  }).join('\n');
}

function buildDslReference(catalog) {
  var commandMap = {};
  catalog.cards.forEach(function(card) {
    (card.dsl.commands || []).forEach(function(command) {
      commandMap[command] = true;
    });
  });
  return Object.keys(commandMap).sort().map(function(command) {
    return '- ' + command;
  }).join('\n');
}

function buildCompilerCapabilityContext(catalog) {
  return catalog.cards.map(function(card) {
    return {
      id: card.id,
      name: card.name,
      summary: card.summary,
      provides: card.provides,
      requires: card.requires,
      dsl: card.dsl,
      constraints: card.constraints,
      networking: card.networking,
    };
  });
}

function buildCompilerPromptSection(catalog) {
  return [
    '=== Capability source of truth ===',
    JSON.stringify(buildCompilerCapabilityContext(catalog), null, 2),
    '',
    '=== DSL commands available from capabilities ===',
    buildDslReference(catalog),
  ].join('\n');
}

module.exports = {
  loadCapabilityCatalog: loadCapabilityCatalog,
  validateCapabilityCatalog: validateCapabilityCatalog,
  buildCreativeCapabilitySummary: buildCreativeCapabilitySummary,
  buildCompilerCapabilityContext: buildCompilerCapabilityContext,
  buildCompilerPromptSection: buildCompilerPromptSection,
  buildDslReference: buildDslReference,
};
