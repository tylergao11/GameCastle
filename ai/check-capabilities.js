var path = require('path');
var capabilities = require('./capabilities');

var catalog = capabilities.loadCapabilityCatalog(path.join(__dirname, 'product-modules'));
console.log('[Capabilities] ' + catalog.cards.length + ' cards loaded');
catalog.cards.forEach(function(card) {
  console.log('  OK ' + card.id + ' <- ' + card._sourceFile);
  if (card.dsl !== undefined) throw new Error('Capability card must not expose low-level DSL: ' + card.id);
});
if (capabilities.buildCompilerPromptSection !== undefined) throw new Error('Capability catalog must not export low-level compiler prompt sections');
if (capabilities.buildCompilerCapabilityContext !== undefined) throw new Error('Capability catalog must not export low-level compiler capability context');
if (capabilities.buildDslReference !== undefined) throw new Error('Capability catalog must not export low-level DSL references');
