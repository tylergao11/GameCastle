var fs = require('fs');
var path = require('path');

var CAPABILITY_SCHEMA_VERSION = 1;

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sortById(a, b) {
  return String(a.id).localeCompare(String(b.id));
}

function loadCapabilityCatalog(capabilitiesDir) {
  var schema = loadJson(path.join(capabilitiesDir, 'schema.json'));
  var files = fs.readdirSync(capabilitiesDir)
    .filter(function(file) { return file.endsWith('.json') && file !== 'schema.json'; })
    .sort();
  var cards = files.map(function(file) {
    var card = loadJson(path.join(capabilitiesDir, file));
    card.sourceFile = file;
    return card;
  }).sort(sortById);

  validateCapabilityCatalog(schema, cards);
  return {
    schemaVersion: CAPABILITY_SCHEMA_VERSION,
    schema: schema,
    cards: cards,
  };
}

function validateCapabilityCatalog(schema, cards) {
  if (!schema || schema.schemaVersion !== CAPABILITY_SCHEMA_VERSION) {
    throw new Error('Unsupported capability schema version');
  }
  var required = schema.requiredFields || [];
  var seen = {};
  cards.forEach(function(card) {
    required.forEach(function(field) {
      if (card[field] === undefined || card[field] === null) {
        throw new Error('Capability ' + (card.id || card.sourceFile) + ' missing field: ' + field);
      }
    });
    if (card.schemaVersion !== CAPABILITY_SCHEMA_VERSION) {
      throw new Error('Capability ' + card.id + ' has unsupported schemaVersion');
    }
    if (seen[card.id]) throw new Error('Duplicate capability id: ' + card.id);
    seen[card.id] = true;
    if (!card.dsl || !Array.isArray(card.dsl.commands)) {
      throw new Error('Capability ' + card.id + ' must define dsl.commands');
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
